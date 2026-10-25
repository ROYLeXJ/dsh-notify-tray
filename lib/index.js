/**
 * dsh-notify-tray, host half.
 *
 * - Tracks every top-level session (running / waiting for approval, a choice
 *   or text input / last result) from `agent/status` and `session/event`.
 * - Keeps a per-day spend ledger (tokens + priced estimate + DeepSeek account
 *   balance drops) under ~/.dsh/storages/dsh-notify-tray/.
 * - Drives a status-bar icon on macOS / Windows / Linux.
 * - Serves `GET notify-tray/state` to the browser half, which shows native
 *   notifications from the DSH window; when no window is polling, the host
 *   falls back to OS notifications itself.
 */
import z from '@deepseek-ai/schemastery'
import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { buildView, TITLES } from './format.js'
import { Ledger } from './ledger.js'
import { openUrl, showApp, systemNotify } from './system.js'
import { startTray } from './tray/index.js'
import { Tracker } from './tracker.js'
import { speak } from './voice.js'
import { iconSpec } from './whale.js'

export const name = 'notify-tray'
export const inject = ['agents']

const STATE_PATH = '/notify-tray/state'
/** Harness version sent as account client metadata (what the built-in settings page sends). */
const DSH_VERSION = '0.2.1-rc.2'
/** A window that polled within this window counts as "listening". */
const CLIENT_FRESH_MS = 8000
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
    z.const('off').description('不弹通知（只用状态栏）'),
  ]).default('auto').description('通知通道').volatile(),
  suppressWhenFocused: z.boolean().default(true).description('正在看这个会话时不弹').volatile(),
  sound: z.boolean().default(true).description('通知带提示音（macOS）').volatile(),
  tray: z.boolean().default(true).description('显示状态栏图标（修改后重启 DSH 生效）').volatile(),
  titleStyle: z.union([
    z.const('text').description('文字：待处理 1 / 运行中 2'),
    z.const('count').description('只显示数字'),
    z.const('icon').description('只显示鲸鱼图标'),
  ]).default('text').description('macOS 菜单栏鲸鱼旁边显示什么').volatile(),
  showSpendInTitle: z.boolean().default(false).description('macOS 菜单栏文字里显示今日花费').volatile(),
  spendSource: z.union([
    z.const('auto').description('自动：有账户余额用余额，否则用价格表估算'),
    z.const('balance').description('账户余额扣费'),
    z.const('estimate').description('按价格表估算'),
  ]).default('auto').description('花费数据来源').volatile(),
  currency: z.union([z.const('CNY'), z.const('USD')]).default('CNY').description('显示币种').volatile(),
  balancePollMinutes: z.number().min(1).max(120).default(5).description('账户余额刷新间隔（分钟）').volatile(),
  prices: z.dict(price).default({}).description('价格表：键是模型 ID 或前缀，用于估算花费').volatile(),
  errorHoldMinutes: z.number().min(0).max(240).default(10).description('失败后图标保持红色的分钟数').volatile(),
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

  const usage = () => ({ ...ledger.summary(cfg.prices, cfg.currency), usageUrl: account.usageUrl })
  /** The whale geometry never changes; helpers get it with every view. */
  const icon = iconSpec()
  const view = () => ({ ...buildView(tracker.summary(), usage(), cfg), icon })

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

  const onAction = action => {
    if (action === 'show-app') return void showApp()
    if (action === 'usage-page' && account.usageUrl) return void openUrl(account.usageUrl)
    if (action === 'hide-tray') {
      const t = tray
      tray = undefined
      t?.stop()
      return
    }
    if (action.startsWith('open:')) {
      focusQueue.push(action.slice(5))
      showApp()
    }
  }

  ctx.effect(() => {
    let disposed = false
    let started
    if (cfg.tray) {
      started = startTray({ stateDir: dir, onAction, logger })
        .then(t => {
          if (disposed) return void t.stop()
          tray = t
          tray.update(view())
        })
        .catch(error => logger.warn('状态栏图标启动失败，只保留通知功能', error))
    }
    return () => {
      disposed = true
      clearTimeout(refreshTimer)
      const t = tray
      tray = undefined
      t?.stop()
    }
  }, 'notify-tray: tray')

  // ---- notifications ----------------------------------------------------
  tracker.onEvent(event => {
    debug('event', event)
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
      seq: event.seq,
      action: `open:${event.sessionId}`,
      tray,
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

  // ---- route for the browser half -----------------------------------------
  ctx.inject(['webServer', 'connection'], (ctx) => {
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: STATE_PATH,
      handler: (req, res) => {
        const rejection = ctx.connection.requestRejection(req)
        if (rejection !== undefined) {
          res.statusCode = rejection
          res.end()
          return
        }
        if (req.method !== 'GET') {
          res.statusCode = 405
          res.setHeader('allow', 'GET')
          res.end()
          return
        }
        const url = new URL(String(req.url), 'http://localhost')
        // Only a window that can actually show notifications counts as listening;
        // a browser tab without permission must not silence the system channel.
        if (url.searchParams.get('notify') === '1') lastClientPoll = Date.now()
        const after = Number(url.searchParams.get('after') ?? '-1')
        const channel = cfg.channel
        const clientSide = channel === 'auto' || channel === 'client' || channel === 'both'
        const enabled = Object.fromEntries(Object.entries(EVENT_SWITCH).map(([type, key]) => [type, Boolean(cfg[key])]))
        const body = {
          boot,
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
          usage: usage(),
        }
        focusQueue = []
        res.statusCode = 200
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.setHeader('cache-control', 'no-store')
        res.end(JSON.stringify(body))
      },
    }), `notify-tray: GET ${STATE_PATH}`)
  })
}
