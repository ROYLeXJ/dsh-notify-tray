/**
 * Tray front door: starts the right per-platform helper and feeds it views.
 *
 * - macOS:   `osascript -l JavaScript assets/tray-darwin.js` (NSStatusItem)
 * - Windows: `powershell -File assets/tray-win32.ps1` (WinForms NotifyIcon)
 * - Linux:   in-process StatusNotifierItem over D-Bus (lib/tray/linux.js)
 *
 * The two child-process helpers read an atomically rewritten view.json and
 * report menu clicks as JSON lines on stdout. They also watch the host pid,
 * so a crashed host never leaves an orphan icon behind.
 */
import { spawn } from 'node:child_process'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets')
/** Give up restarting a helper that keeps dying this many times in a row. */
const MAX_RESTARTS = 5

function helperCommand(viewFile) {
  const pid = String(process.pid)
  if (process.platform === 'darwin') {
    return ['/usr/bin/osascript', ['-l', 'JavaScript', join(ASSETS, 'tray-darwin.js'), viewFile, pid]]
  }
  if (process.platform === 'win32') {
    const root = process.env.SystemRoot ?? 'C:\\Windows'
    const ps = join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    return [ps, ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
      '-File', join(ASSETS, 'tray-win32.ps1'), viewFile, pid]]
  }
  return undefined
}

/**
 * @param {object} options
 * @param {string} options.stateDir - directory for view.json.
 * @param {(action: string) => void} options.onAction - menu click handler.
 * @param {object} [options.logger]
 */
export async function startTray({ stateDir, onAction, logger }) {
  if (process.platform === 'linux' || process.platform === 'freebsd') {
    const { startLinuxTray } = await import('./linux.js')
    const tray = await startLinuxTray({ onAction, logger })
    return { ...tray, kind: 'sni', toast: undefined }
  }

  const viewFile = join(stateDir, 'view.json')
  const command = helperCommand(viewFile)
  if (command === undefined) throw new Error(`不支持的平台：${process.platform}`)
  await mkdir(dirname(viewFile), { recursive: true })

  let child
  let stopped = false
  let restarts = 0
  let lastView
  let writing = Promise.resolve()

  const write = view => {
    lastView = view
    // Serialize writes so an older view never lands after a newer one.
    writing = writing.then(async () => {
      const tmp = `${viewFile}.tmp`
      await writeFile(tmp, JSON.stringify(lastView))
      await rename(tmp, viewFile)
    }).catch(error => logger?.warn?.('写入托盘状态失败', error))
    return writing
  }

  const launch = () => {
    const [file, args] = command
    child = spawn(file, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    const startedAt = Date.now()
    createInterface({ input: child.stdout }).on('line', line => {
      try {
        const { action } = JSON.parse(line)
        if (action === 'hide-tray') stopped = true
        if (typeof action === 'string') onAction(action)
      } catch {}
    })
    child.stderr.on('data', chunk => logger?.debug?.('tray helper:', String(chunk).trim()))
    child.on('error', error => logger?.warn?.('托盘进程启动失败', error))
    child.on('exit', code => {
      child = undefined
      if (stopped) return
      restarts = Date.now() - startedAt > 60_000 ? 1 : restarts + 1
      if (restarts > MAX_RESTARTS) {
        logger?.warn?.(`托盘进程连续退出 ${MAX_RESTARTS} 次，已停用（退出码 ${code}）`)
        return
      }
      setTimeout(() => { if (!stopped) launch() }, 1000 * restarts)
    })
  }

  await write({ state: 'idle', title: '…', tooltip: 'DeepSeek Harness', menu: [], badge: '' })
  launch()

  return {
    kind: process.platform,
    update(view) {
      return write({ ...view, toast: lastView?.toast })
    },
    /** Windows only: show a balloon/toast through the tray icon. */
    toast: process.platform === 'win32'
      ? (toast) => (child ? write({ ...lastView, toast }) : undefined)
      : undefined,
    get alive() { return child !== undefined },
    async stop() {
      stopped = true
      child?.kill()
    },
  }
}
