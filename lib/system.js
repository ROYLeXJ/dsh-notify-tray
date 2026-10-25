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
const xmlEscape = text => String(text).replace(/[&<>"']/gu, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c])

function powershell() {
  const root = process.env.SystemRoot ?? 'C:\\Windows'
  return `${root}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
}

/**
 * Is this host running inside the DSH desktop app? Desktop spawns the host as
 * Electron in Node mode, so the Electron version is present and the
 * run-as-node flag is set; a plain `dsh web` under node.exe has neither.
 */
export function desktopHosted() {
  return Boolean(process.versions.electron && process.env.ELECTRON_RUN_AS_NODE)
}

/**
 * Windows 10/11 toast XML. The desktop app registers the `dsh://` protocol,
 * so a protocol-activated toast brings its window forward without any process
 * of ours staying alive to listen for the click; without the desktop app the
 * launch target is the web GUI's URL (or nothing).
 */
export function toastXml({ title, body, launch, sound = true }) {
  const activation = launch ? ` activationType="protocol" launch="${xmlEscape(launch)}"` : ''
  const audio = sound ? '<audio src="ms-winsoundevent:Notification.Default"/>' : '<audio silent="true"/>'
  return `<toast${activation}><visual><binding template="ToastGeneric">`
    + `<text>${xmlEscape(title)}</text><text>${xmlEscape(body)}</text></binding></visual>${audio}</toast>`
}

/**
 * Every Windows 10/11 install registers this AppUserModelID for the Start
 * menu's "Windows PowerShell" shortcut, so toasts sent under it always show;
 * the desktop app's own id is not registered in a way a helper could reuse.
 */
const POWERSHELL_AUMID = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'

/** Show one toast through WinRT from a short-lived PowerShell; no tray icon involved. */
function windowsToast(xml) {
  const script = [
    `$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]`,
    `$null = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]`,
    `$doc = New-Object Windows.Data.Xml.Dom.XmlDocument`,
    `$doc.LoadXml(${ps(xml)})`,
    `$toast = New-Object Windows.UI.Notifications.ToastNotification $doc`,
    `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier(${ps(POWERSHELL_AUMID)}).Show($toast)`,
  ].join('; ')
  // -EncodedCommand sidesteps every command-line quoting rule (emoji, quotes, newlines).
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  return run(powershell(), ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded])
}

/**
 * Show one native notification.
 * @param {{title: string, body: string, sound?: boolean, onClick?: () => void, tray?: any, action?: string, seq?: number, webOrigin?: () => string | undefined}} n
 */
export async function systemNotify(n) {
  if (process.platform === 'darwin') {
    const sound = n.sound ? ' sound name "Glass"' : ''
    return run('/usr/bin/osascript', ['-e', `display notification ${as(n.body)} with title ${as(n.title)}${sound}`])
  }
  if (process.platform === 'win32') {
    // With our own tray icon up (dsh web), its balloon is a toast that can open the exact session.
    if (n.tray?.toast && n.tray.alive) {
      await n.tray.toast({ seq: n.seq ?? Date.now(), title: n.title, body: n.body, action: n.action })
      return true
    }
    // Otherwise (the desktop app, which has its own tray icon) a plain toast:
    // clicking it launches dsh://open, which the app answers by focusing its window.
    const launch = desktopHosted() ? 'dsh://open' : safeOrigin(n.webOrigin)
    return windowsToast(toastXml({ title: n.title, body: n.body, launch, sound: n.sound !== false }))
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

/**
 * The DSH desktop executable when this host runs inside it. Desktop spawns
 * the host as Electron in Node mode (ELECTRON_RUN_AS_NODE), so the binary is
 * our own `process.execPath`; `DSH_DESKTOP_NODE_EXECUTABLE` is honoured when
 * a launcher sets it explicitly.
 */
function desktopExecutable() {
  const explicit = process.env.DSH_DESKTOP_NODE_EXECUTABLE
  if (explicit) return explicit
  if (desktopHosted()) return process.execPath
  return undefined
}

/**
 * Bring the DSH window to the front.
 *
 * Desktop app: relaunching the executable hits Electron's single-instance
 * lock and DSH focuses its existing window on `second-instance` (Windows);
 * on macOS `open -b` activates the app. With `dsh web` (every Linux user, and
 * anyone on the CLI profile) there is no app window: the browser is opened on
 * the web GUI instead, when the caller knows its origin.
 * @param {{webOrigin?: () => string | undefined}} [options]
 */
export async function showApp({ webOrigin } = {}) {
  if (process.platform === 'darwin') {
    if (await run('/usr/bin/open', ['-b', 'com.deepseek.dsh'])) return true
  } else if (process.platform === 'win32') {
    const exe = desktopExecutable()
    if (exe) {
      const env = { ...process.env }
      delete env.ELECTRON_RUN_AS_NODE
      return run(exe, [], { detached: true, env })
    }
  }
  const origin = safeOrigin(webOrigin)
  if (origin) return openUrl(origin)
  return false
}

function safeOrigin(webOrigin) {
  try {
    return webOrigin?.()
  } catch {
    return undefined
  }
}

export function openUrl(url) {
  if (!/^https?:\/\//u.test(url)) return Promise.resolve(false)
  if (process.platform === 'darwin') return run('/usr/bin/open', [url])
  if (process.platform === 'win32') return run('rundll32', ['url.dll,FileProtocolHandler', url], { detached: true })
  return run('xdg-open', [url], { detached: true })
}
