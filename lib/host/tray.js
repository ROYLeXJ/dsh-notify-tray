/**
 * The status-bar whale: keeps the per-platform tray helper running while the
 * `tray` setting asks for it, feeds it views, and turns its menu clicks into
 * actions. Windows has no status bar to live in (and the desktop app keeps a
 * tray icon of its own): there the plugin is notifications only.
 */
import { openUrl, showApp } from '../system.js'
import { startTray } from '../tray/index.js'
import { iconSpec } from '../whale.js'

/** Platforms with a status bar the whale can live in. */
export const TRAY_PLATFORMS = new Set(['darwin', 'linux', 'freebsd'])

export function setupTray(ctx, host) {
  const { cfg, logger, tracker, ledger } = host
  let tray
  let refreshTimer
  host.refresh = () => {
    if (refreshTimer) return
    // Coalesce bursts (streaming usage samples) into one tray update.
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined
      try { tray?.update(host.view()) } catch (error) { logger.warn('更新状态栏失败', error) }
    }, 300)
  }
  tracker.onChange(host.refresh)
  ledger.onChange(host.refresh)
  // "已运行 n 分钟" in the menu ticks even when nothing else changes.
  ctx.effect(() => {
    const timer = setInterval(() => { if (tracker.summary().running > 0) host.refresh() }, 60_000)
    return () => clearInterval(timer)
  }, 'notify-tray: minute tick')

  host.open = () => showApp({ webOrigin: host.webOrigin }).catch(() => false)
  host.onAction = action => {
    if (action === 'show-app') return void host.open()
    if (action === 'usage-page' && host.account.usageUrl) return void openUrl(host.account.usageUrl)
    if (action === 'refresh-quota') return void host.pollQuota(true)
    if (action.startsWith('url:')) return void openUrl(action.slice(4))
    if (action === 'hide-tray') {
      // Hidden for this run only: the settings page offers to bring it back.
      trayHidden = true
      host.syncTray()
      return
    }
    if (action.startsWith('open:')) {
      host.focusQueue.push(action.slice(5))
      host.open()
    }
  }

  // The icon follows the `tray` setting live, and "隐藏状态栏图标" in its menu
  // hides it until the settings page (or a restart) brings it back.
  let trayHidden = false
  let trayStarting
  let trayDisposed = false
  /** A start that failed (no D-Bus, no tray host…) is not retried until the setting or the page asks again. */
  let trayFailed = false
  const trayWanted = () => Boolean(cfg.tray) && !trayHidden && !trayDisposed && TRAY_PLATFORMS.has(process.platform)
  const stopTray = () => {
    const t = tray
    tray = undefined
    return t?.stop()
  }
  host.syncTray = () => {
    if (trayStarting) return trayStarting
    if (!trayWanted()) return stopTray()
    if (tray) return undefined
    trayStarting = startTray({ stateDir: host.dir, icon: iconSpec(), onAction: host.onAction, logger })
      .then(t => {
        if (!trayWanted()) return void t.stop()
        tray = t
        tray.update(host.view())
      })
      .catch(error => {
        trayFailed = true
        logger.warn('状态栏图标启动失败，只保留通知功能', error)
      })
      .finally(() => {
        trayStarting = undefined
        // The setting may have flipped while the helper was starting.
        if (!trayFailed && Boolean(tray) !== trayWanted()) host.syncTray()
      })
    return trayStarting
  }
  /** The settings page's "show the whale again": undoes the tray menu's hide. */
  host.showTrayAgain = () => {
    trayHidden = false
    trayFailed = false
    return host.syncTray()
  }
  host.trayStatus = () => ({
    supported: TRAY_PLATFORMS.has(process.platform),
    enabled: Boolean(cfg.tray),
    hidden: trayHidden,
    shown: Boolean(tray),
    failed: trayFailed,
  })
  ctx.effect(() => {
    trayDisposed = false
    host.syncTray()
    // Settings fields are read live; a cheap check picks up a flipped toggle without a restart.
    let enabled = Boolean(cfg.tray)
    const timer = setInterval(() => {
      if (Boolean(cfg.tray) !== enabled) {
        enabled = Boolean(cfg.tray)
        trayFailed = false
        // Switching the setting back on also undoes a hide from the tray menu.
        if (enabled) trayHidden = false
      }
      if (!trayFailed && !trayStarting && Boolean(tray) !== trayWanted()) host.syncTray()
    }, 2000)
    return () => {
      trayDisposed = true
      clearInterval(timer)
      clearTimeout(refreshTimer)
      stopTray()
    }
  }, 'notify-tray: tray')
}
