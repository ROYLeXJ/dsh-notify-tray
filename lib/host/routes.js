/**
 * Routes for the browser half.
 *
 * `GET notify-tray/state` has two weights:
 * - `?lite=1` — what every DSH window polls every two seconds: new notices,
 *   the cursor, and tray clicks to open. Nothing about money is computed.
 * - the full state for the settings page, with a `rev`: a page that sends
 *   back the `rev` it holds gets `unchanged: true` instead of the same
 *   snapshot again.
 */
import { createHash } from 'node:crypto'
import { publicCatalog } from '../catalog.js'
import { spendOf, TITLES } from '../format.js'
import { desktopHosted } from '../system.js'
import { speak } from '../voice.js'

const STATE_PATH = '/notify-tray/state'
const CATALOG_PATH = '/notify-tray/catalog'
const REFRESH_PATH = '/notify-tray/refresh'
const TRAY_PATH = '/notify-tray/tray'
const RAISE_PATH = '/notify-tray/raise'
/**
 * A clicked Windows toast can only launch `dsh://open` (or the web GUI), so no
 * session travels with it: a window that comes forward within this long after
 * a toast opens the session that toast announced.
 */
const TOAST_CLAIM_MS = 60_000

/** Short content hash of a snapshot: equal snapshots, equal rev. */
export function revOf(snapshot) {
  return createHash('sha1').update(JSON.stringify(snapshot)).digest('base64url').slice(0, 12)
}

export function setupRoutes(ctx, host) {
  const { cfg, tracker } = host
  ctx.inject(['webServer', 'connection'], (ctx) => {
    host.webOrigin = () => ctx.webServer.getOrigin?.()
    const guard = (req, res, method) => {
      const rejection = ctx.connection.requestRejection(req)
      if (rejection !== undefined) {
        res.statusCode = rejection
        res.end()
        return false
      }
      if (req.method !== method) {
        res.statusCode = 405
        res.setHeader('allow', method)
        res.end()
        return false
      }
      return true
    }
    const json = (res, body) => {
      res.statusCode = 200
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.setHeader('cache-control', 'no-store')
      res.end(JSON.stringify(body))
    }
    /** Everything the settings page shows; only computed when a page asks. */
    const snapshot = () => {
      const currentUsage = host.usage()
      return {
        // The settings page shows only what this OS has (no status-bar section on Windows).
        platform: process.platform,
        summary: tracker.summary(),
        usage: currentUsage,
        // Today's figure exactly as the tray shows it, for the settings page's spend card.
        spend: spendOf(currentUsage, cfg.spendSource) ?? null,
        pricing: host.pricing(),
        plan: host.plan(),
        catalogLoaded: Boolean(host.pi),
        tray: host.trayStatus(),
      }
    }
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: STATE_PATH,
      handler: (req, res) => {
        if (!guard(req, res, 'GET')) return
        const url = new URL(String(req.url), 'http://localhost')
        // Only a window that can actually show notifications counts as listening;
        // a browser tab without permission must not silence the system channel.
        if (url.searchParams.get('notify') === '1') host.lastClientPoll = Date.now()
        const after = Number(url.searchParams.get('after') ?? '-1')
        // A window that just came forward after a toast takes that toast's session, once.
        if (url.searchParams.get('claim') === '1' && host.toastPending) {
          if (Date.now() - host.toastPending.at < TOAST_CLAIM_MS) host.focusQueue.push(host.toastPending.sessionId)
          host.toastPending = undefined
        }
        const channel = cfg.channel
        const clientSide = channel === 'auto' || channel === 'client' || channel === 'both'
        const body = {
          boot: host.boot,
          seq: host.notices.seq,
          // A first poll (after = -1) only learns the cursor; history is never replayed.
          // Each notice carries its wording, so the window shows exactly what the host would.
          events: clientSide && after >= 0
            ? host.notices.after(after).map(n => (n.kind === 'show' ? { ...n, display: speak(n) } : n))
            : [],
          titles: TITLES,
          suppressWhenFocused: cfg.suppressWhenFocused,
          focus: host.focusQueue,
        }
        host.focusQueue = []
        if (url.searchParams.get('lite') === '1') return void json(res, body)
        const snap = snapshot()
        const rev = revOf(snap)
        if (url.searchParams.get('rev') === rev) return void json(res, { ...body, rev, unchanged: true })
        json(res, { ...body, ...snap, rev })
      },
    }), `notify-tray: GET ${STATE_PATH}`)
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: CATALOG_PATH,
      handler: (req, res) => {
        if (!guard(req, res, 'GET')) return
        json(res, { providers: publicCatalog(), piLoaded: Boolean(host.pi), piFile: host.pi?.file })
      },
    }), `notify-tray: GET ${CATALOG_PATH}`)
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: REFRESH_PATH,
      handler: (req, res) => {
        if (!guard(req, res, 'POST')) return
        host.pollQuota(true)
          .then(result => json(res, { quota: result ?? null, plan: host.plan() }))
          .catch(error => json(res, { quota: { ok: false, at: Date.now(), error: String(error?.message ?? error) }, plan: host.plan() }))
      },
    }), `notify-tray: POST ${REFRESH_PATH}`)
    // A click on an in-window notification: the renderer cannot change the OS
    // foreground, so in the Windows desktop app the host relaunches it, and the
    // single-instance handler restores a minimized window (a visible window
    // behind another one stays put: Windows' foreground lock, see issue #4).
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: RAISE_PATH,
      handler: (req, res) => {
        if (!guard(req, res, 'POST')) return
        const raise = process.platform === 'win32' && desktopHosted() ? host.open() : Promise.resolve(false)
        raise.then(raised => json(res, { raised: Boolean(raised) }))
      },
    }), `notify-tray: POST ${RAISE_PATH}`)
    // The settings page's "show the whale again": undoes the tray menu's hide.
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: TRAY_PATH,
      handler: (req, res) => {
        if (!guard(req, res, 'POST')) return
        Promise.resolve(host.showTrayAgain())
          .catch(() => {})
          .then(() => json(res, { tray: host.trayStatus() }))
      },
    }), `notify-tray: POST ${TRAY_PATH}`)
  })
}
