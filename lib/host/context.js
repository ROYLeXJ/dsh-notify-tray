/**
 * The state every part of the host half shares: live settings, the session
 * tracker, the spend ledger, and the few mutable facts (price catalog, plan
 * quota, web origin…) one part learns and another shows. Each part
 * (tray.js, notify.js, spend.js, routes.js) gets this one object and adds
 * the functions others call on it.
 */
import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { planView, quotaSpecFor } from '../catalog.js'
import { buildView } from '../format.js'
import { Ledger } from '../ledger.js'
import { describeRoute, makeResolver } from '../pricing.js'
import { Tracker } from '../tracker.js'

export function storageDir() {
  const home = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
  return join(home, 'storages', 'dsh-notify-tray')
}

export function createHost(ctx, config) {
  // Settings-page fields are volatile references (read with `.get()`) so edits
  // apply live; this proxy reads the current value of every field.
  const cfg = new Proxy({}, {
    get: (_, key) => {
      const value = config?.[key]
      return value !== null && typeof value === 'object' && typeof value.get === 'function' ? value.get() : value
    },
  })
  const dir = storageDir()

  const host = {
    ctx,
    cfg,
    dir,
    logger: ctx.logger?.('notify-tray') ?? console,
    tracker: new Tracker(),
    ledger: new Ledger({ file: join(dir, 'ledger.json') }),
    account: { usageUrl: undefined },
    /** pi-ai's model catalog (prices), once loaded. */
    pi: undefined,
    /** Latest plan quota reading: { ok, at, data | error, attempts, signature }. */
    quota: undefined,
    /** The web GUI's origin, once the web server is up: where "open DSH" goes when there is no desktop window. */
    webOrigin: () => undefined,
    /** Identifies this host run, so clients reset their cursor after a restart. */
    boot: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    lastClientPoll: 0,
    /** Session ids a tray click asked the window to open, consumed by the next poll. */
    focusQueue: [],
    /** The session the latest Windows toast announced: { sessionId, at }. */
    toastPending: undefined,
  }

  /** Set DSH_NOTIFY_TRAY_DEBUG=1 to trace tracked events into storages/dsh-notify-tray/debug.log. */
  host.debug = process.env.DSH_NOTIFY_TRAY_DEBUG
    ? (...parts) => {
      try {
        mkdirSync(dir, { recursive: true })
        appendFileSync(join(dir, 'debug.log'), `${new Date().toISOString()} ${parts.map(p => typeof p === 'string' ? p : JSON.stringify(p)).join(' ')}\n`)
      } catch {}
    }
    : () => {}

  /** Which endpoint the plan's quota comes from, and what identifies one reading as current. */
  host.quotaSpec = () => quotaSpecFor(cfg.planProvider, cfg.planId, cfg.planQuotaUrl)
  host.quotaSignature = () => `${cfg.planProvider}|${cfg.planId}|${cfg.planApiKeyEnv ?? ''}|${cfg.planQuotaUrl ?? ''}`
  /** The route in use: the latest request header anywhere, else DSH's default model selection. */
  host.currentRoute = () => {
    if (host.ledger.lastRoute) return host.ledger.lastRoute
    try {
      const selection = ctx.get('agentDefaultModel')?.currentSelection?.()
      if (selection?.model) return { provider: selection.provider, model: selection.model }
    } catch {}
    return undefined
  }
  host.usage = () => ({
    ...host.ledger.summary(makeResolver({ cfg, models: host.pi?.models }), cfg.currency),
    usageUrl: host.account.usageUrl,
    route: host.currentRoute(),
  })
  // A reading taken for another provider / key is never shown as this one's.
  host.plan = () => planView(cfg, host.quota && host.quota.signature === host.quotaSignature() ? host.quota : undefined)
  host.pricing = () => describeRoute({ cfg, models: host.pi?.models, route: host.currentRoute() })
  host.view = () => buildView(host.tracker.summary(), host.usage(), cfg, Date.now(), host.plan())

  return host
}
