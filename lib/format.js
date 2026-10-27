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
const SOURCE_LABEL = { table: '价格表', custom: '自定义价', catalog: '目录价', static: '内置价' }
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
const LABEL_MAX = 44
/** Submenu rows: kept short so a submenu opened toward the screen edge stays readable. */
const SUB_MAX = 36

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
    headline = `有 ${tasks.waiting.length} 件事等你处理`
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
    headline = today.completed + today.failed > 0 ? `空闲 · 今日已完成 ${today.completed} 个任务` : '空闲，等你派活'
    headIcon = 'moon.zzz'
  }

  const menu = []
  menu.push({ id: 'headline', label: headline, icon: headIcon, enabled: false })

  // ---- the tasks themselves --------------------------------------------------
  for (const wait of tasks.waiting.slice(0, 6)) {
    const detail = wait.text ? `：${wait.text}` : ''
    menu.push({ id: `open:${wait.sessionId}`, icon: KIND_ICON[wait.kind], label: trim(`${KIND_LABEL[wait.kind]} · ${wait.title}${detail}`) })
  }
  for (const item of tasks.runningList.slice(0, 6)) {
    if (tasks.waiting.some(wait => wait.sessionId === item.sessionId)) continue
    const bits = [item.title]
    const age = elapsed(item.since, now)
    if (age) bits.push(age)
    if (item.tool) bits.push(item.tool)
    menu.push({ id: `open:${item.sessionId}`, icon: 'play.circle', label: trim(bits.join(' · ')) })
  }
  menu.push({ separator: true })

  // ---- today ---------------------------------------------------------------------
  // Balance is the number people glance at most, and the official usage page
  // the link they reach for: both on the first level, one click away.
  if (usage.balance !== undefined) {
    menu.push({ id: 'info', enabled: false, icon: 'creditcard', label: `账户余额 ${money(usage.balance, usage.currency)}` })
  }
  if (usage.usageUrl) menu.push({ id: 'usage-page', icon: 'safari', label: '查看账户用量…' })
  const usageRows = []
  usageRows.push({ id: 'info', enabled: false, icon: 'checkmark.circle', label: `完成 ${today.completed} · 失败 ${today.failed}${today.aborted ? ` · 停止 ${today.aborted}` : ''}` })
  if (spend) usageRows.push({ id: 'info', enabled: false, icon: 'yensign.circle', label: `花费 ${spendText}（${spend.label}）` })
  if (usage.estimate !== undefined && spend?.label !== undefined && !spend.label.startsWith('估算') && spend.value !== usage.estimate) {
    usageRows.push({ id: 'info', enabled: false, icon: 'function', label: `按价格估算 ${money(usage.estimate, usage.currency)}` })
  }
  if (spend?.mixed || (spend && usage.balanceSpend !== undefined && spend.label.startsWith('估算'))) {
    usageRows.push({ id: 'info', enabled: false, icon: 'creditcard', label: `余额已扣 ${money(usage.balanceSpend ?? 0, usage.currency)}` })
  }
  usageRows.push({ id: 'info', enabled: false, icon: 'number', label: `Token ${compactTokens(usage.tokens.total)}（输出 ${compactTokens(usage.tokens.output)}）` })
  // One row per provider/model route used today, biggest first. Rows stay
  // short: Windows / Linux trays open submenus beside the panel and long rows
  // run off the screen edge, so the provider only shows when two routes share
  // a model id, and the route in use is split into model + provider rows.
  const routes = (usage.byModel ?? []).slice(0, 6)
  const modelCount = {}
  for (const row of routes) modelCount[row.model] = (modelCount[row.model] ?? 0) + 1
  for (const row of routes) {
    const name = row.key === 'unknown' ? '未知模型' : modelCount[row.model] > 1 ? row.key : row.model
    const bits = [name, compactTokens(row.tokens.input + row.tokens.cacheRead + row.tokens.cacheWrite + row.tokens.output)]
    if (row.cost !== undefined) bits.push(`${money(row.cost, usage.currency)} ${SOURCE_LABEL[row.source] ?? row.source}`)
    usageRows.push({ id: 'info', enabled: false, icon: 'cpu', label: trim(bits.join(' · '), SUB_MAX) })
  }
  if (usage.route?.model) {
    usageRows.push({ id: 'info', enabled: false, icon: 'point.3.connected.trianglepath.dotted', label: trim(`当前模型 ${usage.route.model}`, SUB_MAX) })
    if (usage.route.provider) usageRows.push({ id: 'info', enabled: false, icon: 'network', label: trim(`通道 ${usage.route.provider}`, SUB_MAX) })
  }
  const todayLabel = spendText ? `今日用量 · ${spendText}` : '今日用量'
  menu.push({ id: 'today', icon: 'chart.bar', label: todayLabel, children: usageRows })

  // ---- the plan ------------------------------------------------------------------
  if (plan) {
    const planRows = []
    const headBits = [plan.name]
    if (plan.priceText) headBits.push(plan.priceText)
    if (plan.remaining !== undefined) headBits.push(`剩余 ${plan.remaining}`)
    if (plan.balance !== undefined) planRows.push({ id: 'info', enabled: false, icon: 'wallet.pass', label: `套餐余额 ${money(plan.balance, plan.balanceCurrency)}` })
    if (plan.remaining !== undefined) planRows.push({ id: 'info', enabled: false, icon: 'gauge.with.dots.needle.33percent', label: `剩余额度 ${plan.remaining}${plan.remainingSource === 'manual' ? '（手填）' : ''}` })
    if (plan.resetAt) planRows.push({ id: 'info', enabled: false, icon: 'arrow.clockwise.circle', label: `重置 ${resetText(plan.resetAt)}` })
    const textRows = (text, icon) => wrapText(text).slice(0, 4).forEach(label => planRows.push({ id: 'info', enabled: false, icon, label }))
    for (const line of plan.lines.slice(0, 4)) textRows(line, 'line.3.horizontal.decrease.circle')
    if (plan.quotaText) textRows(plan.quotaText, 'text.bubble')
    if (plan.fetch) {
      if (plan.fetch.ok) planRows.push({ id: 'info', enabled: false, icon: 'checkmark.icloud', label: `额度更新于 ${clock(plan.fetch.at)}` })
      else textRows(`获取失败：${plan.fetch.error}`, 'exclamationmark.icloud')
    } else if (plan.canFetch && !plan.apiKeyEnv) {
      planRows.push({ id: 'info', enabled: false, icon: 'key', label: '填入 API Key 引用后可自动获取额度' })
    }
    if (plan.canFetch && plan.apiKeyEnv) planRows.push({ id: 'refresh-quota', icon: 'arrow.triangle.2.circlepath', label: '刷新额度' })
    if (plan.links.console) planRows.push({ id: `url:${plan.links.console}`, icon: 'safari', label: `${plan.providerName} 用量页…` })
    if (plan.links.pricing) planRows.push({ id: `url:${plan.links.pricing}`, icon: 'tag', label: '价格页…' })
    menu.push({ id: 'plan', icon: 'creditcard.circle', label: trim(`套餐 · ${headBits.join(' · ')}`, 72), children: planRows })
  }

  if (tasks.recent.length > 0) {
    const rows = tasks.recent.map(item => ({
      id: `open:${item.sessionId}`,
      icon: KIND_ICON[item.kind],
      label: trim(`${clock(item.at)}  ${KIND_LABEL[item.kind]} · ${item.title}`, SUB_MAX),
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
