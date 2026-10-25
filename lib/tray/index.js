/**
 * Tray front door: starts the right per-platform helper and feeds it views.
 *
 * - macOS:   `osascript -l JavaScript assets/tray-darwin.js` (NSStatusItem)
 * - Linux:   in-process StatusNotifierItem over D-Bus (lib/tray/linux.js)
 * - Windows: none. Windows has no status bar of this kind (and the desktop
 *            app keeps a tray icon of its own); lib/index.js never asks.
 *
 * The macOS helper reads the whale geometry from icon.json once, then an
 * atomically rewritten view.json for state, and reports menu clicks as JSON
 * lines on stdout. It also watches the host pid, so a crashed host never
 * leaves an orphan icon behind. `{"quit": true}` in the view asks it to take
 * its icon down and exit on its own.
 */
import { spawn } from 'node:child_process'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets')
/** Give up restarting a helper that keeps dying this many times in a row. */
const MAX_RESTARTS = 5
/** How long a helper gets to exit on its own after `quit` before it is killed. */
const QUIT_GRACE_MS = 1500

function helperCommand(viewFile) {
  const pid = String(process.pid)
  if (process.platform === 'darwin') {
    return ['/usr/bin/osascript', ['-l', 'JavaScript', join(ASSETS, 'tray-darwin.js'), viewFile, pid]]
  }
  return undefined
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Replace `file` with `tmp`, retrying the transient EPERM/EBUSY a rename can
 * hit while the helper has the file open for its (sub-millisecond) read.
 */
async function replaceFile(tmp, file) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(tmp, file)
      return
    } catch (error) {
      if (attempt >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(error?.code)) throw error
      await sleep(20 * (attempt + 1))
    }
  }
}

/**
 * @param {object} options
 * @param {string} options.stateDir - directory for view.json / icon.json.
 * @param {object} [options.icon] - lib/whale.js iconSpec(), written to icon.json.
 * @param {(action: string) => void} options.onAction - menu click handler.
 * @param {object} [options.logger]
 */
export async function startTray({ stateDir, icon, onAction, logger }) {
  if (process.platform === 'linux' || process.platform === 'freebsd') {
    const { startLinuxTray } = await import('./linux.js')
    const tray = await startLinuxTray({ onAction, logger })
    return { ...tray, kind: 'sni', get alive() { return true } }
  }

  const viewFile = join(stateDir, 'view.json')
  const command = helperCommand(viewFile)
  if (command === undefined) throw new Error(`不支持的平台：${process.platform}`)
  await mkdir(dirname(viewFile), { recursive: true })
  // The geometry (a few hundred KB of frames) is written once, next to the view.
  if (icon) await writeFile(join(stateDir, 'icon.json'), JSON.stringify(icon))

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
      await replaceFile(tmp, viewFile)
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
    child.on('error', error => {
      child = undefined
      logger?.warn?.('托盘进程启动失败', error)
    })
    // 'close' (not 'exit') fires only after stdout has drained, so a final
    // {"action":"hide-tray"} line is handled before we decide to restart.
    child.on('close', code => {
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
      return write(view)
    },
    get alive() { return child !== undefined },
    async stop() {
      stopped = true
      const running = child
      if (!running) return
      // Ask nicely first: the helper hides its icon and exits by itself.
      const exited = new Promise(resolve => running.once('close', resolve))
      const timer = setTimeout(() => running.kill(), QUIT_GRACE_MS)
      await write({ ...lastView, quit: true })
      await exited
      clearTimeout(timer)
    },
  }
}
