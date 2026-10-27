/**
 * dsh-notify-tray, host half.
 *
 * - Tracks every top-level session (running / waiting for approval, a choice
 *   or text input / last result) from `agent/status` and `session/event`.
 * - Keeps a per-day spend ledger (tokens per provider/model route + priced
 *   estimate + DeepSeek account balance drops) under
 *   ~/.dsh/storages/dsh-notify-tray/.
 * - Knows the user's plan (Kimi / GLM / OpenCode / MiMo / Gemini / Grok /
 *   Claude / GPT / MiniMax / DeepSeek or custom), its price list, and
 *   polls the provider's quota endpoint when it has one and an API key.
 * - Drives a status-bar icon on macOS (menu bar) and Linux (StatusNotifierItem).
 *   Windows has no status bar of the kind: there the plugin only notifies.
 * - Serves `GET notify-tray/state` (+ `/catalog`, `POST /refresh`, `POST /tray`) to the
 *   browser half, which shows native notifications from the DSH window and
 *   renders the settings page; when no window is polling, the host falls
 *   back to OS notifications itself.
 */
import z from '@deepseek-ai/schemastery'
import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { planView, publicCatalog, quotaSpecFor } from './catalog.js'
import { buildView, DONE_HOLD_MS, spendOf, TITLES } from './format.js'
import { Ledger } from './ledger.js'
import { describeRoute, loadPiCatalog, makeResolver } from './pricing.js'
import { fetchQuota } from './quota.js'
import { openUrl, showApp, systemNotify } from './system.js'
import { startTray } from './tray/index.js'
import { Tracker } from './tracker.js'
import { speak } from './voice.js'
import { iconSpec } from './whale.js'

export const name = 'notify-tray'
export const inject = ['agents']

const STATE_PATH = '/notify-tray/state'
const CATALOG_PATH = '/notify-tray/catalog'
const REFRESH_PATH = '/notify-tray/refresh'
const TRAY_PATH = '/notify-tray/tray'
/** Harness version sent as account client metadata (what the built-in settings page sends). */
const DSH_VERSION = '0.2.1-rc.2'
/** A window that polled within this window counts as "listening". */
const CLIENT_FRESH_MS = 8000
/** Platforms with a status bar the whale can live in. */
export const TRAY_PLATFORMS = new Set(['darwin', 'linux', 'freebsd'])
/** The whale's colour on a notification of each kind. */
const EVENT_STATE = { completed: 'done', failed: 'error', approval: 'attention', choice: 'attention', input: 'attention' }
const EVENT_SWITCH = {
  completed: 'notifyCompleted',
  failed: 'notifyFailed',
  approval: 'notifyApproval',
  choice: 'notifyChoice',
  input: 'notifyInput',
}

const price = z.object({
  input: z.number().min(0).description('未命中缓存输入，每百万 token 价格'),
  cacheRead: z.number().min(0).description('缓存命中输入，每百万 token 价格'),
  output: z.number().min(0).description('输出，每百万 token 价格'),
})

const currency = () => z.union([z.const('CNY'), z.const('USD')])

export const Config = z.object({
  notifyCompleted: z.boolean().default(true).description('任务完成时通知').volatile(),
  notifyFailed: z.boolean().default(true).description('任务失败时通知').volatile(),
  notifyApproval: z.boolean().default(true).description('需要批准工具调用时通知').volatile(),
  notifyChoice: z.boolean().default(true).description('需要你做选择时通知').volatile(),
  notifyInput: z.boolean().default(true).description('需要你输入文字时通知').volatile(),
  channel: z.union([
    z.const('auto').description('自动：有 DSH 窗口时由窗口弹，没有窗口时由系统弹'),
    z.const('client').description('只由 DSH 窗口弹'),
    z.const('system').description('只由系统弹（适合 dsh web / 命令行）'),
    z.const('both').description('两边都弹'),
    z.const('off').description('不弹通知（macOS / Linux 上只看状态栏）'),
  ]).default('auto').description('通知通道').volatile(),
  suppressWhenFocused: z.boolean().default(true).description('正在看这个会话时不弹').volatile(),
  sound: z.boolean().default(true).description('系统通知带提示音').volatile(),
  tray: z.boolean().default(true).description('显示状态栏图标（macOS / Linux，立即生效；Windows 没有状态栏，忽略此项）').volatile(),
  titleStyle: z.union([
    z.const('text').description('文字：待处理 1 / 运行中 2'),
    z.const('count').description('只显示数字'),
    z.const('icon').description('只显示鲸鱼图标'),
  ]).default('text').description('macOS 菜单栏鲸鱼旁边显示什么').volatile(),
  showSpendInTitle: z.boolean().default(false).description('macOS 菜单栏文字里显示今日花费').volatile(),
  spendSource: z.union([
    z.const('auto').description('自动：有账户余额用余额，否则用价格估算'),
    z.const('balance').description('账户余额扣费'),
    z.const('estimate').description('按价格估算'),
  ]).default('auto').description('花费数据来源').volatile(),
  currency: currency().default('CNY').description('显示币种').volatile(),
  balancePollMinutes: z.number().min(1).max(120).default(5).description('账户余额刷新间隔（分钟）').volatile(),
  prices: z.dict(price).default({}).description('价格表：键是「provider/model」、模型 ID 或前缀，用于估算花费').volatile(),
  errorHoldMinutes: z.number().min(0).max(240).default(10).description('失败后图标保持红色的分钟数').volatile(),

  // ---- 价格 --------------------------------------------------------------
  priceSource: z.union([
    z.const('auto').description('自动：价格表 → 自定义价 → DSH 自带的模型目录价 → 插件内置价'),
    z.const('catalog').description('只用模型目录价 / 内置价'),
    z.const('custom').description('只用自定义价'),
  ]).default('auto').description('估算用哪个价').volatile(),
  customInput: z.number().min(0).description('自定义价：未命中缓存输入，每百万 token').volatile(),
  customCacheRead: z.number().min(0).description('自定义价：缓存命中输入，每百万 token').volatile(),
  customOutput: z.number().min(0).description('自定义价：输出，每百万 token').volatile(),
  customPriceCurrency: currency().default('CNY').description('自定义价的币种').volatile(),
  exchangeRate: z.number().min(0.01).max(1000).default(7.2).description('汇率：1 美元 = ? 人民币（目录价是美元）').volatile(),

  // ---- 套餐 --------------------------------------------------------------
  planProvider: z.string().default('none').description('套餐所属平台：none / custom / deepseek / kimi / glm / opencode / mimo / gemini / grok / claude / gpt / minimax').volatile(),
  planId: z.string().default('').description('预设套餐 ID（空 = 按量付费 / 未选）').volatile(),
  planName: z.string().description('套餐名称（留空用预设）').volatile(),
  planPrice: z.number().min(0).description('套餐价格（留空用预设）').volatile(),
  planPeriod: z.union([z.const('month'), z.const('year'), z.const('week'), z.const('once'), z.const('free')]).default('month').description('计费周期').volatile(),
  planCurrency: currency().default('CNY').description('套餐币种').volatile(),
  planQuota: z.string().description('套餐额度说明（留空用预设）').volatile(),
  planBalance: z.number().description('套餐余额 / 预付费余额（手填）').volatile(),
  planRemaining: z.string().description('套餐剩余额度（手填，例如「68%」「1200 次」）').volatile(),
  planResetAt: z.string().description('下次重置时间（手填）').volatile(),
  planApiKeyEnv: z.string().description('查询额度用的 API Key 引用（环境变量名，例如 KIMI_API_KEY）').volatile(),
  planQuotaUrl: z.string().description('额度查询地址（留空用预设）').volatile(),
  planAutoQuota: z.boolean().default(true).description('有接口时自动获取剩余额度 / 余额').volatile(),
  quotaPollMinutes: z.number().min(1).max(240).default(10).description('额度刷新间隔（分钟）').volatile(),
})

function storageDir() {
  const home = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
  return join(home, 'storages', 'dsh-notify-tray')
}

export function apply(ctx, config) {
  // Settings-page fields are volatile references (read with `.get()`) so edits
  // apply live; this proxy reads the current value of every field.
  const cfg = new Proxy({}, {
    get: (_, key) => {
      const value = config?.[key]
      return value !== null && typeof value === 'object' && typeof value.get === 'function' ? value.get() : value
    },
  })
  const logger = ctx.logger?.('notify-tray') ?? console
  const dir = storageDir()
  const tracker = new Tracker()
  const ledger = new Ledger({ file: join(dir, 'ledger.json') })
  const account = { usageUrl: undefined }
  /** pi-ai's model catalog (prices), once loaded. */
  let pi
  /** Latest plan quota reading: { ok, at, data | error, signature }. */
  let quota
  /** The web GUI's origin, once the web server is up: where "open DSH" goes when there is no desktop window. */
  let webOrigin = () => undefined
  let tray
  /** Identifies this host run, so clients reset their cursor after a restart. */
  const boot = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  let lastClientPoll = 0
  /** Session ids a tray click asked the window to open, consumed by the next poll. */
  let focusQueue = []

  /** Set DSH_NOTIFY_TRAY_DEBUG=1 to trace tracked events into storages/dsh-notify-tray/debug.log. */
  const debug = process.env.DSH_NOTIFY_TRAY_DEBUG
    ? (...parts) => {
      try {
        mkdirSync(dir, { recursive: true })
        appendFileSync(join(dir, 'debug.log'), `${new Date().toISOString()} ${parts.map(p => typeof p === 'string' ? p : JSON.stringify(p)).join(' ')}\n`)
      } catch {}
    }
    : () => {}

  /** Which endpoint the plan's quota comes from, and what identifies one reading as current. */
  const quotaSpec = () => quotaSpecFor(cfg.planProvider, cfg.planId, cfg.planQuotaUrl)
  const quotaSignature = () => `${cfg.planProvider}|${cfg.planId}|${cfg.planApiKeyEnv ?? ''}|${cfg.planQuotaUrl ?? ''}`
  /** The route in use: the latest request header anywhere, else DSH's default model selection. */
  const currentRoute = () => {
    if (ledger.lastRoute) return ledger.lastRoute
    try {
      const selection = ctx.get('agentDefaultModel')?.currentSelection?.()
      if (selection?.model) return { provider: selection.provider, model: selection.model }
    } catch {}
    return undefined
  }
  const usage = () => ({
    ...ledger.summary(makeResolver({ cfg, models: pi?.models }), cfg.currency),
    usageUrl: account.usageUrl,
    route: currentRoute(),
  })
  // A reading taken for another provider / key is never shown as this one's.
  const plan = () => planView(cfg, quota && quota.signature === quotaSignature() ? quota : undefined)
  const pricing = () => describeRoute({ cfg, models: pi?.models, route: currentRoute() })
  const view = () => buildView(tracker.summary(), usage(), cfg, Date.now(), plan())

  // ---- tray -------------------------------------------------------------
  let refreshTimer
  const refresh = () => {
    if (refreshTimer) return
    // Coalesce bursts (streaming usage samples) into one tray update.
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined
      try { tray?.update(view()) } catch (error) { logger.warn('更新状态栏失败', error) }
    }, 300)
  }
  tracker.onChange(refresh)
  ledger.onChange(refresh)
  // "已运行 n 分钟" in the menu ticks even when nothing else changes.
  ctx.effect(() => {
    const timer = setInterval(() => { if (tracker.summary().running > 0) refresh() }, 60_000)
    return () => clearInterval(timer)
  }, 'notify-tray: minute tick')

  const open = () => showApp({ webOrigin }).catch(() => false)
  const onAction = action => {
    if (action === 'show-app') return void open()
    if (action === 'usage-page' && account.usageUrl) return void openUrl(account.usageUrl)
    if (action === 'refresh-quota') return void pollQuota(true)
    if (action.startsWith('url:')) return void openUrl(action.slice(4))
    if (action === 'hide-tray') {
      // Hidden for this run only: the settings page offers to bring it back.
      trayHidden = true
      syncTray()
      return
    }
    if (action.startsWith('open:')) {
      focusQueue.push(action.slice(5))
      open()
    }
  }

  // Windows has no status bar to live in (and the desktop app keeps a tray
  // icon of its own): there the plugin is notifications only.
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
  const syncTray = () => {
    if (trayStarting) return trayStarting
    if (!trayWanted()) return stopTray()
    if (tray) return undefined
    trayStarting = startTray({ stateDir: dir, icon: iconSpec(), onAction, logger })
      .then(t => {
        if (!trayWanted()) return void t.stop()
        tray = t
        tray.update(view())
      })
      .catch(error => {
        trayFailed = true
        logger.warn('状态栏图标启动失败，只保留通知功能', error)
      })
      .finally(() => {
        trayStarting = undefined
        // The setting may have flipped while the helper was starting.
        if (!trayFailed && Boolean(tray) !== trayWanted()) syncTray()
      })
    return trayStarting
  }
  const trayStatus = () => ({
    supported: TRAY_PLATFORMS.has(process.platform),
    enabled: Boolean(cfg.tray),
    hidden: trayHidden,
    shown: Boolean(tray),
    failed: trayFailed,
  })
  ctx.effect(() => {
    trayDisposed = false
    syncTray()
    // Settings fields are read live; a cheap check picks up a flipped toggle without a restart.
    let enabled = Boolean(cfg.tray)
    const timer = setInterval(() => {
      if (Boolean(cfg.tray) !== enabled) {
        enabled = Boolean(cfg.tray)
        trayFailed = false
        // Switching the setting back on also undoes a hide from the tray menu.
        if (enabled) trayHidden = false
      }
      if (!trayFailed && !trayStarting && Boolean(tray) !== trayWanted()) syncTray()
    }, 2000)
    return () => {
      trayDisposed = true
      clearInterval(timer)
      clearTimeout(refreshTimer)
      stopTray()
    }
  }, 'notify-tray: tray')

  // ---- notifications ----------------------------------------------------
  tracker.onEvent(event => {
    debug('event', event)
    // The celebration / error pose expires on its own: refresh once it does.
    if (event.type === 'completed') setTimeout(refresh, DONE_HOLD_MS + 200).unref?.()
    if (event.type === 'failed') setTimeout(refresh, Math.max(0, cfg.errorHoldMinutes) * 60_000 + 200).unref?.()
    if (!cfg[EVENT_SWITCH[event.type]]) return
    const clientListening = Date.now() - lastClientPoll < CLIENT_FRESH_MS
    const channel = cfg.channel
    const systemSide = channel === 'system' || channel === 'both' || (channel === 'auto' && !clientListening)
    debug('deliver', { channel, clientListening, systemSide })
    if (!systemSide) return // the window picks it up from the event queue
    const said = speak(event)
    systemNotify({
      title: said.title,
      body: said.body,
      sound: cfg.sound,
      webOrigin,
      state: EVENT_STATE[event.type],
      iconDir: join(dir, 'icons'),
      onClick: () => onAction(`open:${event.sessionId}`),
    }).then(ok => debug('system notify', ok)).catch(error => logger.warn('系统通知失败', error))
  })

  // ---- DSH events -------------------------------------------------------
  tracker.seed(ctx.agents.list())
  ctx.on('agent/status', ({ agent, status }) => tracker.agentStatus(agent, status))
  ctx.on('agent/disposed', ({ agent }) => {
    tracker.agentDisposed(agent)
    ledger.forgetSession(agent.id)
  })
  ctx.on('session/event', (session, event) => {
    debug('session/event', session.id, event.type)
    try {
      tracker.sessionEvent(session, event)
      ledger.sessionEvent(session, event)
    } catch (error) {
      logger.warn('处理会话事件失败', event?.type, error)
    }
  })

  // ---- ledger persistence -------------------------------------------------
  ctx.effect(() => {
    ledger.load().then(refresh)
    const timer = setInterval(() => ledger.save().catch(() => {}), 30_000)
    return () => {
      clearInterval(timer)
      ledger.save().catch(() => {})
    }
  }, 'notify-tray: ledger')

  // ---- pi-ai price catalog (the one DSH's model selector reads) -------------
  ctx.effect(() => {
    let disposed = false
    loadPiCatalog().then(loaded => {
      if (disposed || !loaded) return
      pi = loaded
      debug('pi catalog', loaded.file)
      refresh()
    }).catch(() => {})
    return () => { disposed = true }
  }, 'notify-tray: price catalog')

  // ---- plan quota polling ---------------------------------------------------
  let polling
  const pollQuota = async (force = false) => {
    const spec = quotaSpec()
    const ref = (cfg.planApiKeyEnv ?? '').trim()
    const signature = quotaSignature()
    if (!spec || !ref || (!force && !cfg.planAutoQuota)) {
      if (quota !== undefined) { quota = undefined; refresh() }
      return undefined
    }
    if (polling) return polling
    polling = (async () => {
      let key
      try {
        const credentials = ctx.get('credentials')
        key = credentials ? (await credentials.resolve(ref))?.value : undefined
        if (!key) key = process.env[ref]
      } catch (error) {
        key = process.env[ref]
        debug('credential', String(error))
      }
      const at = Date.now()
      const reading = key
        ? await fetchQuota(spec, key)
        : { ok: false, at, error: `没找到 API Key：${ref} 没有保存，也没有设置为环境变量` }
      quota = { ...reading, signature, spec: { kind: spec.kind, url: spec.url } }
      debug('quota', quota)
      refresh()
      return quota
    })().finally(() => { polling = undefined })
    return polling
  }
  ctx.effect(() => {
    let timer
    let lastSignature = quotaSignature()
    let lastPoll = 0
    const tick = () => {
      const signature = quotaSignature()
      const due = Date.now() - lastPoll >= Math.max(1, cfg.quotaPollMinutes) * 60_000
      if (signature !== lastSignature || due) {
        lastSignature = signature
        lastPoll = Date.now()
        pollQuota().catch(() => {})
      }
      timer = setTimeout(tick, 15_000)
    }
    tick()
    return () => clearTimeout(timer)
  }, 'notify-tray: quota poll')

  // ---- DeepSeek account balance (optional service) ------------------------
  ctx.inject(['deepseekAccount'], (ctx) => {
    const client = {
      // Mirrors DSH's own settings page: the harness version and the UI locale.
      version: DSH_VERSION,
      locale: 'zh-CN',
      timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
    }
    const poll = async () => {
      try {
        const balance = await ctx.deepseekAccount.getBalance(client)
        if (balance?.status === 'ready') ledger.balance(balance.value)
        if (account.usageUrl === undefined) {
          const state = await ctx.deepseekAccount.getState?.()
          account.usageUrl = state?.links?.usageUrl
        }
      } catch (error) {
        logger.debug?.('读取账户余额失败', error)
      }
    }
    ctx.effect(() => {
      let timer
      const loop = () => {
        poll()
        timer = setTimeout(loop, Math.max(1, cfg.balancePollMinutes) * 60_000)
      }
      loop()
      return () => clearTimeout(timer)
    }, 'notify-tray: balance poll')
    // A finished turn is when spend lands; refresh shortly after.
    ctx.on('agent/status', ({ status }) => {
      if (status === 'idle') setTimeout(poll, 5000)
    })
  })

  // ---- routes for the browser half ------------------------------------------
  ctx.inject(['webServer', 'connection'], (ctx) => {
    webOrigin = () => ctx.webServer.getOrigin?.()
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
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: STATE_PATH,
      handler: (req, res) => {
        if (!guard(req, res, 'GET')) return
        const url = new URL(String(req.url), 'http://localhost')
        // Only a window that can actually show notifications counts as listening;
        // a browser tab without permission must not silence the system channel.
        if (url.searchParams.get('notify') === '1') lastClientPoll = Date.now()
        const after = Number(url.searchParams.get('after') ?? '-1')
        const channel = cfg.channel
        const clientSide = channel === 'auto' || channel === 'client' || channel === 'both'
        const currentUsage = usage()
        const enabled = Object.fromEntries(Object.entries(EVENT_SWITCH).map(([type, key]) => [type, Boolean(cfg[key])]))
        const body = {
          boot,
          // The settings page shows only what this OS has (no status-bar section on Windows).
          platform: process.platform,
          seq: tracker.seq,
          // A first poll (after = -1) only learns the cursor; history is never replayed.
          // Each event carries its wording, so the window shows exactly what the host would.
          events: clientSide && after >= 0
            ? tracker.eventsAfter(after).filter(e => enabled[e.type]).map(e => ({ ...e, display: speak(e) }))
            : [],
          titles: TITLES,
          suppressWhenFocused: cfg.suppressWhenFocused,
          focus: focusQueue,
          summary: tracker.summary(),
          usage: currentUsage,
          // Today's figure exactly as the tray shows it, for the settings page's spend card.
          spend: spendOf(currentUsage, cfg.spendSource) ?? null,
          pricing: pricing(),
          plan: plan(),
          catalogLoaded: Boolean(pi),
          tray: trayStatus(),
        }
        focusQueue = []
        json(res, body)
      },
    }), `notify-tray: GET ${STATE_PATH}`)
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: CATALOG_PATH,
      handler: (req, res) => {
        if (!guard(req, res, 'GET')) return
        json(res, { providers: publicCatalog(), piLoaded: Boolean(pi), piFile: pi?.file })
      },
    }), `notify-tray: GET ${CATALOG_PATH}`)
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: REFRESH_PATH,
      handler: (req, res) => {
        if (!guard(req, res, 'POST')) return
        pollQuota(true)
          .then(result => json(res, { quota: result ?? null, plan: plan() }))
          .catch(error => json(res, { quota: { ok: false, at: Date.now(), error: String(error?.message ?? error) }, plan: plan() }))
      },
    }), `notify-tray: POST ${REFRESH_PATH}`)
    // The settings page's "show the whale again": undoes the tray menu's hide.
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: TRAY_PATH,
      handler: (req, res) => {
        if (!guard(req, res, 'POST')) return
        trayHidden = false
        trayFailed = false
        Promise.resolve(syncTray())
          .catch(() => {})
          .then(() => json(res, { tray: trayStatus() }))
      },
    }), `notify-tray: POST ${TRAY_PATH}`)
  })
}
