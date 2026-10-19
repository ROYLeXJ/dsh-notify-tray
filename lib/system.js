/**
 * Host-side OS integration: native notifications (the fallback channel used
 * when no DSH window is listening) and bringing the DSH window forward.
 */
import { spawn } from 'node:child_process'

function run(file, args, options = {}) {
  return new Promise(resolve => {
    try {
      const child = spawn(file, args, { stdio: 'ignore', windowsHide: true, ...options })
      child.on('error', () => resolve(false))
      child.on('exit', code => resolve(code === 0))
      if (options.detached) {
        child.unref()
        resolve(true)
      }
    } catch {
      resolve(false)
    }
  })
}

/** AppleScript string literal. */
const as = text => `"${String(text).replace(/\\/gu, '\\\\').replace(/"/gu, '\\"')}"`
/** PowerShell single-quoted literal. */
const ps = text => `'${String(text).replace(/'/gu, "''")}'`

/**
 * Show one native notification.
 * @param {{title: string, body: string, sound?: boolean, onClick?: () => void, tray?: any, action?: string, seq?: number}} n
 */
export async function systemNotify(n) {
  if (process.platform === 'darwin') {
    const sound = n.sound ? ' sound name "Glass"' : ''
    return run('/usr/bin/osascript', ['-e', `display notification ${as(n.body)} with title ${as(n.title)}${sound}`])
  }
  if (process.platform === 'win32') {
    // Prefer the running tray icon: its balloon renders as a Windows 10/11 toast and is clickable.
    if (n.tray?.toast && n.tray.alive) {
      await n.tray.toast({ seq: n.seq ?? Date.now(), title: n.title, body: n.body, action: n.action })
      return true
    }
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing;',
      '$n = New-Object System.Windows.Forms.NotifyIcon; $n.Icon = [System.Drawing.SystemIcons]::Information; $n.Visible = $true;',
      `$n.ShowBalloonTip(8000, ${ps(n.title)}, ${ps(n.body)}, [System.Windows.Forms.ToolTipIcon]::Info);`,
      'Start-Sleep -Seconds 9; $n.Dispose()',
    ].join(' ')
    const root = process.env.SystemRoot ?? 'C:\\Windows'
    return run(`${root}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script], { detached: true })
  }
  // Linux / BSD: D-Bus first (clickable), notify-send as a fallback.
  try {
    const { linuxNotify } = await import('./tray/linux.js')
    await linuxNotify({ title: n.title, body: n.body, onClick: n.onClick })
    return true
  } catch {
    return run('notify-send', ['-a', 'DeepSeek Harness', n.title, n.body])
  }
}

/** Bring the DSH desktop window to the front (no-op where there is none). */
export async function showApp() {
  if (process.platform === 'darwin') {
    return run('/usr/bin/open', ['-b', 'com.deepseek.dsh'])
  }
  if (process.platform === 'win32') {
    // Launching the desktop executable again hits Electron's single-instance
    // lock, and DSH focuses its existing window on `second-instance`.
    const exe = process.env.DSH_DESKTOP_NODE_EXECUTABLE
    if (!exe) return false
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    return run(exe, [], { detached: true, env })
  }
  return run('xdg-open', ['dsh://open'], { detached: true })
}

export function openUrl(url) {
  if (!/^https?:\/\//u.test(url)) return Promise.resolve(false)
  if (process.platform === 'darwin') return run('/usr/bin/open', [url])
  if (process.platform === 'win32') return run('rundll32', ['url.dll,FileProtocolHandler', url], { detached: true })
  return run('xdg-open', [url], { detached: true })
}
