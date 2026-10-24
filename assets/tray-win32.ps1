# Windows notification-area helper for dsh-notify-tray.
# Runs on the stock Windows PowerShell 5.1 (WinForms NotifyIcon); no binary to ship.
#
# Usage: powershell -NoProfile -STA -ExecutionPolicy Bypass -File tray-win32.ps1 <view.json> <host pid>
# The host rewrites view.json atomically; this script polls it. Menu clicks and
# balloon clicks are written to stdout as one JSON line each: {"action":"<id>"}.
param(
  [Parameter(Mandatory = $true)][string]$ViewPath,
  [int]$HostPid = 0
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
$stdout = [Console]::Out

function Send-Action([string]$Id) {
  $line = (@{ action = $Id } | ConvertTo-Json -Compress)
  $stdout.WriteLine($line)
  $stdout.Flush()
}

# The icon is the whale from lib/whale.js, shipped inside view.json as bezier
# paths (`view.icon`) and drawn here with GDI+ in the state colour.
$script:iconSpec = $null
$script:iconCache = @{}

function New-WhalePath($Paths, $Spec, [int]$W, [int]$H) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.FillMode = [System.Drawing.Drawing2D.FillMode]::Winding
  $b = $Spec.bounds
  if ($null -eq $b) { $b = @{ x = 0; y = 0; w = $Spec.box; h = $Spec.box } }
  $s = [Math]::Min($W / [double]$b.w, $H / [double]$b.h)
  $ox = ($W - $b.w * $s) / 2
  $oy = ($H - $b.h * $s) / 2
  foreach ($sub in $Paths) {
    $cur = $null
    $path.StartFigure()
    foreach ($cmd in $sub) {
      switch ($cmd[0]) {
        'M' { $cur = New-Object System.Drawing.PointF(($ox + ($cmd[1] - $b.x) * $s), ($oy + ($cmd[2] - $b.y) * $s)) }
        'L' {
          $to = New-Object System.Drawing.PointF(($ox + ($cmd[1] - $b.x) * $s), ($oy + ($cmd[2] - $b.y) * $s))
          $path.AddLine($cur, $to); $cur = $to
        }
        'C' {
          $c1 = New-Object System.Drawing.PointF(($ox + ($cmd[1] - $b.x) * $s), ($oy + ($cmd[2] - $b.y) * $s))
          $c2 = New-Object System.Drawing.PointF(($ox + ($cmd[3] - $b.x) * $s), ($oy + ($cmd[4] - $b.y) * $s))
          $to = New-Object System.Drawing.PointF(($ox + ($cmd[5] - $b.x) * $s), ($oy + ($cmd[6] - $b.y) * $s))
          $path.AddBezier($cur, $c1, $c2, $to); $cur = $to
        }
        'Z' { $path.CloseFigure() }
      }
    }
  }
  return $path
}

function New-StateIcon([string]$State, [int]$Frame) {
  $size = [System.Windows.Forms.SystemInformation]::SmallIconSize.Width
  if ($size -lt 16) { $size = 16 }
  $spec = $script:iconSpec
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)
  $rgb = $null
  if ($spec -and $spec.rgb.$State) { $rgb = $spec.rgb.$State }
  if ($null -eq $rgb) { $rgb = @(59, 83, 170) }
  $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, [int]$rgb[0], [int]$rgb[1], [int]$rgb[2]))
  if ($spec -and $spec.frames.$State) {
    $frames = $spec.frames.$State
    $paths = $frames[$Frame % $frames.Count]
    $path = New-WhalePath $paths $spec $size $size
    $g.FillPath($brush, $path)
    $path.Dispose()
  } else {
    # No geometry yet (first view): a plain disc keeps the icon visible.
    $g.FillEllipse($brush, 1, 1, $size - 3, $size - 3)
  }
  $brush.Dispose()
  $g.Dispose()
  $handle = $bmp.GetHicon()
  $icon = [System.Drawing.Icon]::FromHandle($handle).Clone()
  [void][DshTray.Win32Icon]::DestroyIcon($handle)
  $bmp.Dispose()
  return $icon
}

function Get-StateIcon([string]$State, [int]$Frame) {
  $key = "$State`:$Frame"
  if (-not $script:iconCache.ContainsKey($key)) { $script:iconCache[$key] = New-StateIcon $State $Frame }
  return $script:iconCache[$key]
}

Add-Type -Namespace 'DshTray' -Name 'Win32Icon' -MemberDefinition '[DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr handle);'

$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Text = 'DeepSeek Harness'
$notify.Icon = Get-StateIcon 'idle' 0
$notify.Visible = $true
$menu = New-Object System.Windows.Forms.ContextMenuStrip
$notify.ContextMenuStrip = $menu
$script:balloonAction = $null

$notify.add_MouseClick({
  param($sender, $e)
  if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) { Send-Action 'show-app' }
})
$notify.add_BalloonTipClicked({
  if ($script:balloonAction) { Send-Action $script:balloonAction }
})

$menuClick = {
  param($sender, $e)
  $id = [string]$sender.Tag
  if ($id -eq '') { return }
  Send-Action $id
  if ($id -eq 'hide-tray') { $notify.Visible = $false; [System.Windows.Forms.Application]::Exit() }
}

function Add-MenuRows($items, $rows) {
  foreach ($row in $rows) {
    if ($row.separator) {
      [void]$items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
      continue
    }
    $mi = New-Object System.Windows.Forms.ToolStripMenuItem($row.label)
    if ($row.children -and $row.children.Count -gt 0) {
      Add-MenuRows $mi.DropDownItems $row.children
    } else {
      $mi.Tag = $row.id
      if ($row.enabled -eq $false) { $mi.Enabled = $false }
      $mi.add_Click($menuClick)
    }
    [void]$items.Add($mi)
  }
}

function Set-Menu($rows) {
  $menu.Items.Clear()
  Add-MenuRows $menu.Items $rows
}

$script:lastStamp = ''
$script:lastToast = 0
$script:state = 'idle'
$script:frame = 0
$script:frameCount = 1

function Update-FromView {
  if (-not (Test-Path -LiteralPath $ViewPath)) { return }
  $info = Get-Item -LiteralPath $ViewPath
  $stamp = "$($info.LastWriteTimeUtc.Ticks):$($info.Length)"
  if ($stamp -eq $script:lastStamp) { return }
  $script:lastStamp = $stamp
  try {
    $view = [System.IO.File]::ReadAllText($ViewPath, $utf8) | ConvertFrom-Json
  } catch { return }

  if ($view.icon) {
    $script:iconSpec = $view.icon
    $script:iconCache = @{}
  }
  $script:state = [string]$view.state
  $script:frame = 0
  $script:frameCount = 1
  if ($script:iconSpec -and $script:iconSpec.frames.($script:state)) {
    $script:frameCount = $script:iconSpec.frames.($script:state).Count
  }
  $notify.Icon = Get-StateIcon $script:state 0
  # .NET Framework caps NotifyIcon.Text at 63 characters.
  $tip = [string]$view.tooltip
  if ($tip.Length -gt 63) { $tip = $tip.Substring(0, 62) + [char]0x2026 }
  $notify.Text = $tip
  Set-Menu $view.menu

  # Host-side notifications on Windows ride the tray icon's balloon, which
  # Windows 10/11 renders as a native toast.
  if ($view.toast -and [int]$view.toast.seq -gt $script:lastToast) {
    $script:lastToast = [int]$view.toast.seq
    $script:balloonAction = [string]$view.toast.action
    $notify.ShowBalloonTip(8000, [string]$view.toast.title, [string]$view.toast.body, [System.Windows.Forms.ToolTipIcon]::Info)
  }
}

function Test-HostAlive {
  if ($HostPid -le 0) { return $true }
  return $null -ne (Get-Process -Id $HostPid -ErrorAction SilentlyContinue)
}

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 600
$timer.add_Tick({
  try {
    if (-not (Test-HostAlive)) {
      $notify.Visible = $false
      [System.Windows.Forms.Application]::Exit()
      return
    }
    Update-FromView
    # Spout animation: swap frames every tick (600 ms) while the state animates.
    if ($script:frameCount -gt 1) {
      $script:frame = ($script:frame + 1) % $script:frameCount
      $notify.Icon = Get-StateIcon $script:state $script:frame
    }
  } catch {
    [Console]::Error.WriteLine($_.Exception.Message)
  }
})
$timer.Start()
Update-FromView

$context = New-Object System.Windows.Forms.ApplicationContext
[System.Windows.Forms.Application]::Run($context)
$notify.Visible = $false
$notify.Dispose()
