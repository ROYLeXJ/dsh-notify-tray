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

$colors = @{
  attention = [System.Drawing.Color]::FromArgb(255, 245, 140, 30)
  error     = [System.Drawing.Color]::FromArgb(255, 224, 49, 49)
  running   = [System.Drawing.Color]::FromArgb(255, 77, 107, 254)
  idle      = [System.Drawing.Color]::FromArgb(255, 46, 160, 90)
}

$script:lastIcon = $null
function New-StateIcon([string]$State, [string]$Badge) {
  $size = [System.Windows.Forms.SystemInformation]::SmallIconSize.Width
  if ($size -lt 16) { $size = 16 }
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $color = $colors[$State]
  if ($null -eq $color) { $color = $colors['idle'] }
  $brush = New-Object System.Drawing.SolidBrush($color)
  $g.FillEllipse($brush, 0, 0, $size - 1, $size - 1)
  $glyph = $Badge
  if ([string]::IsNullOrEmpty($glyph)) {
    if ($State -eq 'error') { $glyph = '!' } else { $glyph = '' }
  }
  if ($glyph -ne '') {
    $font = New-Object System.Drawing.Font('Segoe UI', [single]($size * 0.62), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment = [System.Drawing.StringAlignment]::Center
    $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
    $g.DrawString($glyph, $font, [System.Drawing.Brushes]::White, $rect, $fmt)
    $font.Dispose()
  } else {
    # Idle: a small white tick-like dot so the icon is not a blank disc.
    $g.FillEllipse([System.Drawing.Brushes]::White, [int]($size * 0.35), [int]($size * 0.35), [int]($size * 0.3), [int]($size * 0.3))
  }
  $brush.Dispose()
  $g.Dispose()
  $handle = $bmp.GetHicon()
  $icon = [System.Drawing.Icon]::FromHandle($handle).Clone()
  [void][DshTray.Win32Icon]::DestroyIcon($handle)
  $bmp.Dispose()
  return $icon
}

Add-Type -Namespace 'DshTray' -Name 'Win32Icon' -MemberDefinition '[DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr handle);'

$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Text = 'DeepSeek Harness'
$notify.Icon = New-StateIcon 'idle' ''
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

function Set-Menu($rows) {
  $menu.Items.Clear()
  foreach ($row in $rows) {
    if ($row.separator) {
      [void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
      continue
    }
    $mi = New-Object System.Windows.Forms.ToolStripMenuItem($row.label)
    $mi.Tag = $row.id
    if ($row.enabled -eq $false) { $mi.Enabled = $false }
    $mi.add_Click({
      param($sender, $e)
      $id = [string]$sender.Tag
      Send-Action $id
      if ($id -eq 'hide-tray') { $notify.Visible = $false; [System.Windows.Forms.Application]::Exit() }
    })
    [void]$menu.Items.Add($mi)
  }
}

$script:lastStamp = ''
$script:lastToast = 0
$script:lastIconKey = ''

function Update-FromView {
  if (-not (Test-Path -LiteralPath $ViewPath)) { return }
  $info = Get-Item -LiteralPath $ViewPath
  $stamp = "$($info.LastWriteTimeUtc.Ticks):$($info.Length)"
  if ($stamp -eq $script:lastStamp) { return }
  $script:lastStamp = $stamp
  try {
    $view = [System.IO.File]::ReadAllText($ViewPath, $utf8) | ConvertFrom-Json
  } catch { return }

  $iconKey = "$($view.state):$($view.badge)"
  if ($iconKey -ne $script:lastIconKey) {
    $old = $notify.Icon
    $notify.Icon = New-StateIcon ([string]$view.state) ([string]$view.badge)
    if ($old) { $old.Dispose() }
    $script:lastIconKey = $iconKey
  }
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
$timer.Interval = 500
$timer.add_Tick({
  try {
    if (-not (Test-HostAlive)) {
      $notify.Visible = $false
      [System.Windows.Forms.Application]::Exit()
      return
    }
    Update-FromView
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
