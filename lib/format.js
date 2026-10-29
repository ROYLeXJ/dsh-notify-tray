/**
 * Turn tracker + ledger summaries into the tray view model every platform
 * helper consumes: the menu-bar text, a tooltip, the icon state, and menu
 * rows (with optional SF Symbol names and nested children).
 *
 * The whale itself carries the state (idle / spouting / "!" / "×"); the
 * menu-bar text only ever says what needs you, never money.
 */

/** Notification titles per event type (shared by the host, the window and the demo). */
export const TITLES = {
  completed: '✅ 任务完成',
  failed: '❌ 任务失败',
  approval: '🔐 需要你批准',
  choice: '🔘 需要你选择',
  input: '✏️ 需要你输入',
}

const SYMBOL = { CNY: '¥', USD: '$' }
/** Where an estimate's price came from (mirrors pricing.js, kept here so this file stays DSH-free). */
const SOURCE_LABEL = { table: '价格表', custom: '自定义价', catalog: '目录价', static: '内置价', modelsDev: 'models.dev 价' }
const KIND_LABEL = {
  approval: '待批准',
  choice: '待选择',
  input: '待输入',
  completed: '完成',
  failed: '失败',
  aborted: '已停止',
}
const KIND_ICON = {
  approval: 'lock.shield',
  choice: 'questionmark.circle',
  input: 'pencil.line',
  completed: 'checkmark.circle',
  failed: 'xmark.circle',
  aborted: 'stop.circle',
}
/** First-level rows. */
const LABEL_MAX = 28
/** Submenu rows: kept short so a submenu opened toward the screen edge stays readable. */
const SUB_MAX = 24
/** Task rows on the first level; the rest are one "还有 n 个…" row. */
const TASK_ROWS = 5
/** Rows per submenu, separators included. */
const SUB_ROWS = 6

/** Long text as several short menu rows, broken at its own separators where it can be. */
export function wrapText(text, max = SUB_MAX) {
  const pieces = String(text).split(/(?<=[；;，,。])|(?= · )/u).map(p => p.replace(/^ · /u, ''))
  const rows = []
  let current = ''
  for (const piece of pieces) {
    if (current && current.length + piece.length > max) {
      rows.push(current)
      current = ''
    }
    current += piece
    while (current.length > max) {
      rows.push(current.slice(0, max))
      current = current.slice(max)
    }
  }
  if (current.trim()) rows.push(current)
  return rows.map(row => row.trim()).filter(Boolean)
}

export function money(value, currency) {
  if (value === undefined || value === null) return undefined
  const symbol = SYMBOL[currency] ?? `${currency} `
  return `${symbol}${value < 10 ? value.toFixed(2) : value.toFixed(1)}`
}

export function compactTokens(n) {
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)}亿`
  if (n >= 1e4) return `${(n / 1e4).toFixed(1)}万`
  return String(n)
}

/** "刚开始" / "3 分钟" / "1 小时 20 分". */
export function elapsed(since, now) {
  if (since === undefined) return ''
  const minutes = Math.floor((now - since) / 60_000)
  if (minutes < 1) return '刚开始'
  if (minutes < 60) return `${minutes} 分钟`
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`
}

function clock(time) {
  const d = new Date(time)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const trim = (text, max = LABEL_MAX) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)
/** "<name> <amount>" within SUB_MAX, shortening the name so the amount always shows. */
const trimEnd = (name, amount) => `${trim(name, Math.max(4, SUB_MAX - amount.length - 1))} ${amount}`
/** The spend figure's source, in a word or two. */
const spendHow = spend => (spend.mixed ? '含估算' : spend.label.startsWith('估算') ? '估算' : '余额扣费')

/** A reset time: ISO strings become a clock, anything the user typed stays as typed. */
function resetText(value) {
  const ms = Date.parse(value)
  if (!Number.isFinite(ms) || !/\d{4}-\d{2}-\d{2}T/u.test(value)) return value
  const d = new Date(ms)
  const sameDay = d.toDateString() === new Date().toDateString()
  return `${sameDay ? '' : `${d.getMonth() + 1}/${d.getDate()} `}${clock(ms)}`
}

/**
 * Pick which spend figure to show: real balance drops when available, else the
 * price-table estimate.
 *
 * In `auto` the balance only stands for what it actually pays for (DeepSeek
 * routes), and the platform books charges a while after a turn ends: when the
 * DeepSeek routes' estimate is ahead of the balance drops, the estimate is
 * shown until the balance catches up. Other providers' routes are always
 * added on as an estimate.
 */
export function spendOf(usage, source) {
  const hasBalance = usage.balanceSpend !== undefined || usage.balance !== undefined
  const fromBalance = hasBalance ? { value: usage.balanceSpend ?? 0, label: '余额扣费' } : undefined
  const sources = (usage.estimateSources ?? []).map(key => SOURCE_LABEL[key] ?? key)
  const estimateLabel = sources.length ? `估算 · ${sources.join('+')}` : '估算'
  const fromEstimate = usage.estimate !== undefined ? { value: usage.estimate, label: estimateLabel } : undefined
  if (source === 'balance') return fromBalance
  if (source === 'estimate') return fromEstimate
  if (!fromBalance) return fromEstimate
  if (!fromEstimate) return fromBalance
  const deepseek = usage.estimateDeepseek ?? 0
  const others = Math.max(0, round4(usage.estimate - deepseek))
  const lagging = deepseek > fromBalance.value
  const value = round4((lagging ? deepseek : fromBalance.value) + others)
  const parts = [lagging ? '余额未到账，暂按估算' : '余额扣费']
  if (others > 0) parts.push('含其它平台估算')
  return { value, label: parts.join('，'), mixed: lagging || others > 0 }
}

const round4 = value => Math.round(value * 10000) / 10000

/** How long the whale celebrates after a finish before going back to idle. */
export const DONE_HOLD_MS = 6000

/** 'attention' | 'error' | 'running' | 'done' | 'idle' — picks the whale's animation. */
export function stateOf(tasks, now, errorWindowMs, doneWindowMs = DONE_HOLD_MS) {
  if (tasks.waiting.length > 0) return 'attention'
  const lastFailed = tasks.recent.find(item => item.kind === 'failed')
  if (lastFailed && now - lastFailed.at < errorWindowMs && tasks.recent[0] === lastFailed) return 'error'
  if (tasks.running > 0) return 'running'
  const latest = tasks.recent[0]
  if (latest && latest.kind === 'completed' && now - latest.at < doneWindowMs) return 'done'
  return 'idle'
}

/** Menu-bar text next to the whale. */
export function titleOf(tasks, config, spendText) {
  const style = config.titleStyle ?? 'text'
  const parts = []
  if (style !== 'icon') {
    if (tasks.waiting.length > 0) parts.push(style === 'count' ? String(tasks.waiting.length) : `待处理 ${tasks.waiting.length}`)
    else if (tasks.running > 0) parts.push(style === 'count' ? String(tasks.running) : `运行中 ${tasks.running}`)
  }
  if (config.showSpendInTitle === true && spendText) parts.push(spendText)
  return parts.join(' · ')
}

export function buildView(tasks, usage, config, now = Date.now(), plan = undefined) {
  const state = stateOf(tasks, now, (config.errorHoldMinutes ?? 10) * 60_000)
  const spend = spendOf(usage, config.spendSource)
  const spendText = spend ? money(spend.value, usage.currency) : undefined
  const title = titleOf(tasks, config, spendText)
  const today = tasks.today

  // ---- headline: what the whale is up to -----------------------------------
  let headline
  let headIcon
  if (tasks.waiting.length > 0) {
    const others = tasks.runningList.filter(item => !tasks.waiting.some(wait => wait.sessionId === item.sessionId)).length
    headline = `${tasks.waiting.length} 件事等你${others > 0 ? ` · ${others} 个在跑` : ''}`
    headIcon = 'bell.badge'
  } else if (tasks.running > 0) {
    headline = `正在运行 ${tasks.running} 个任务`
    headIcon = 'bolt.horizontal.circle'
  } else if (state === 'error') {
    headline = '刚才有任务失败了'
    headIcon = 'exclamationmark.triangle'
  } else if (state === 'done') {
    headline = '搞定啦～ 刚完成一个任务'
    headIcon = 'sparkles'
  } else {
    headline = today.completed + today.failed > 0 ? `空闲 · 今天完成 ${today.completed} 个` : '空闲，等你派活'
    headIcon = 'moon.zzz'
  }

  // The menu is kept short and shallow: Windows / Linux trays open submenus
  // beside the panel, and long rows or deep submenus run off the screen edge.
  // At most TASK_ROWS task rows, one level of submenus, SUB_ROWS rows each.
  const menu = []
  menu.push({ id: 'headline', label: headline, icon: headIcon, enabled: false })

  // ---- the tasks themselves --------------------------------------------------
  const taskRows = []
  for (const wait of tasks.waiting) {
    const detail = wait.text ? `：${wait.text}` : ''
    taskRows.push({ id: `open:${wait.sessionId}`, icon: KIND_ICON[wait.kind], label: trim(`${KIND_LABEL[wait.kind]} · ${wait.title}${detail}`) })
  }
  for (const item of tasks.runningList) {
    if (tasks.waiting.some(wait => wait.sessionId === item.sessionId)) continue
    const age = elapsed(item.since, now)
    taskRows.push({ id: `open:${item.sessionId}`, icon: 'play.circle', label: trim([item.title, age].filter(Boolean).join(' · ')) })
  }
  menu.push(...taskRows.slice(0, TASK_ROWS))
  if (taskRows.length > TASK_ROWS) menu.push({ id: 'show-app', icon: 'ellipsis.circle', label: `还有 ${taskRows.length - TASK_ROWS} 个…` })
  menu.push({ separator: true })

  // ---- today -------------------------------------------------------------------
  const todayRows = []
  todayRows.push({ id: 'info', enabled: false, icon: 'checkmark.circle', label: `完成 ${today.completed} · 失败 ${today.failed}${today.aborted ? ` · 停止 ${today.aborted}` : ''}` })
  if (spend) todayRows.push({ id: 'info', enabled: false, icon: 'yensign.circle', label: `花费 ${spendText} · ${spendHow(spend)}` })
  todayRows.push({ id: 'info', enabled: false, icon: 'number', label: `Token ${compactTokens(usage.tokens.total)}` })
  // The biggest routes used today; the provider only shows when two routes share a model id.
  const routes = (usage.byModel ?? []).slice(0, SUB_ROWS - todayRows.length)
  const modelCount = {}
  for (const row of routes) modelCount[row.model] = (modelCount[row.model] ?? 0) + 1
  for (const row of routes) {
    const name = row.key === 'unknown' ? '未知模型' : modelCount[row.model] > 1 ? row.key : row.model
    const amount = row.cost !== undefined ? money(row.cost, usage.currency) : compactTokens(row.tokens.input + row.tokens.cacheRead + row.tokens.cacheWrite + row.tokens.output)
    todayRows.push({ id: 'info', enabled: false, icon: 'cpu', label: trimEnd(name, amount) })
  }
  const todayBits = ['今日']
  if (spendText) todayBits.push(spendText)
  menu.push({ id: 'today', icon: 'chart.bar', label: `${todayBits.join(' ')} · 完成 ${today.completed}`, children: todayRows })

  // ---- balance and plan: one submenu -------------------------------------------------
  const accountRows = []
  if (usage.balance !== undefined) accountRows.push({ id: 'info', enabled: false, icon: 'creditcard', label: `DeepSeek 余额 ${money(usage.balance, usage.currency)}` })
  if (plan) {
    accountRows.push({ id: 'info', enabled: false, icon: 'creditcard.circle', label: trim([plan.name, plan.priceText].filter(Boolean).join(' · '), SUB_MAX) })
    const left = [plan.remaining !== undefined ? `剩余 ${plan.remaining}${plan.remainingSource === 'manual' ? '（手填）' : ''}` : undefined, plan.resetAt ? `${resetText(plan.resetAt)} 重置` : undefined].filter(Boolean)
    if (left.length) accountRows.push({ id: 'info', enabled: false, icon: 'gauge.with.dots.needle.33percent', label: trim(left.join(' · '), SUB_MAX) })
    if (plan.balance !== undefined) accountRows.push({ id: 'info', enabled: false, icon: 'wallet.pass', label: `套餐余额 ${money(plan.balance, plan.balanceCurrency)}` })
    if (plan.fetch && !plan.fetch.ok) accountRows.push({ id: 'info', enabled: false, icon: 'exclamationmark.icloud', label: '额度获取失败，详见设置页' })
    else if (plan.canFetch && !plan.apiKeyEnv) accountRows.push({ id: 'info', enabled: false, icon: 'key', label: '设置页填 API Key 后可查额度' })
  }
  const actions = []
  if (plan?.canFetch && plan.apiKeyEnv) actions.push({ id: 'refresh-quota', icon: 'arrow.triangle.2.circlepath', label: '刷新额度' })
  const consoles = [usage.usageUrl ? ['usage-page', 'DeepSeek'] : undefined, plan?.links.console ? [`url:${plan.links.console}`, plan.providerName] : undefined].filter(Boolean)
  for (const [id, name] of consoles) actions.push({ id, icon: 'safari', label: consoles.length > 1 ? trim(`${name} 用量页…`, SUB_MAX) : '打开用量页…' })
  if (accountRows.length || actions.length) {
    const accountBits = []
    if (usage.balance !== undefined) accountBits.push(`余额 ${money(usage.balance, usage.currency)}`)
    if (plan?.remaining !== undefined) accountBits.push(`${plan.providerName ?? plan.name} 剩 ${plan.remaining}`)
    else if (plan && usage.balance === undefined) accountBits.push(`套餐 · ${plan.name}`)
    const children = [...accountRows.slice(0, SUB_ROWS - actions.length), ...(accountRows.length && actions.length ? [{ separator: true }] : []), ...actions]
    menu.push({ id: 'account', icon: 'creditcard', label: trim(accountBits.join(' · ') || '账户与套餐'), children })
  }

  if (tasks.recent.length > 0) {
    const rows = tasks.recent.slice(0, SUB_ROWS).map(item => ({
      id: `open:${item.sessionId}`,
      icon: KIND_ICON[item.kind],
      label: trim(`${clock(item.at)} ${KIND_LABEL[item.kind]} · ${item.title}`, SUB_MAX),
    }))
    menu.push({ id: 'recent', icon: 'clock.arrow.circlepath', label: '最近结束', children: rows })
  }
  menu.push({ separator: true })
  menu.push({ id: 'show-app', icon: 'macwindow', label: '打开 DeepSeek Harness' })
  menu.push({ id: 'hide-tray', icon: 'eye.slash', label: '隐藏状态栏图标' })

  // ---- tooltip (Windows / Linux hover) ------------------------------------------
  const lines = [headline]
  lines.push(`今日 完成 ${today.completed} · 失败 ${today.failed}`)
  if (spend) lines.push(`今日花费 ${spendText}（${spend.label}）`)
  if (usage.balance !== undefined) lines.push(`账户余额 ${money(usage.balance, usage.currency)}`)
  if (plan) {
    const bits = [plan.name, plan.priceText, plan.remaining !== undefined ? `剩余 ${plan.remaining}` : undefined, plan.balance !== undefined ? `余额 ${money(plan.balance, plan.balanceCurrency)}` : undefined].filter(Boolean)
    lines.push(`套餐 ${bits.join(' · ')}`)
  }
  const tooltip = ['DeepSeek Harness', ...lines].join('\n')

  // Single glyph drawn into the Windows/Linux icon badge.
  const badge = tasks.waiting.length > 0 ? String(Math.min(tasks.waiting.length, 9))
    : tasks.running > 0 ? String(Math.min(tasks.running, 9)) : ''

  return { state, title, tooltip, menu, badge, headline }
}
