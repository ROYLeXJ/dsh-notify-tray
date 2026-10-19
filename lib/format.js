/**
 * Turn tracker + ledger summaries into the tray view model every platform
 * helper consumes: a short title (macOS menu bar text), a tooltip, a state
 * color for the icon, and menu rows.
 */

const SYMBOL = { CNY: '¥', USD: '$' }
const KIND_LABEL = {
  approval: '待批准',
  choice: '待选择',
  input: '待输入',
  completed: '完成',
  failed: '失败',
  aborted: '已停止',
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

function clock(time) {
  const d = new Date(time)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Pick which spend figure to show: real balance drops when available, else the price-table estimate. */
export function spendOf(usage, source) {
  const fromBalance = usage.balanceSpend !== undefined || usage.balance !== undefined
    ? { value: usage.balanceSpend ?? 0, label: '余额扣费' }
    : undefined
  const fromEstimate = usage.estimate !== undefined ? { value: usage.estimate, label: '估算' } : undefined
  if (source === 'balance') return fromBalance
  if (source === 'estimate') return fromEstimate
  return fromBalance ?? fromEstimate
}

/** 'attention' | 'error' | 'running' | 'idle' — drives the icon color. */
export function stateOf(tasks, now, errorWindowMs) {
  if (tasks.waiting.length > 0) return 'attention'
  const lastFailed = tasks.recent.find(item => item.kind === 'failed')
  if (lastFailed && now - lastFailed.at < errorWindowMs && tasks.recent[0] === lastFailed) return 'error'
  if (tasks.running > 0) return 'running'
  return 'idle'
}

export function buildView(tasks, usage, config, now = Date.now()) {
  const state = stateOf(tasks, now, (config.errorHoldMinutes ?? 10) * 60_000)
  const spend = spendOf(usage, config.spendSource)
  const spendText = spend ? money(spend.value, usage.currency) : undefined

  // macOS menu bar text, e.g. "▶2 ⚠1 ¥1.23"
  const parts = []
  if (tasks.waiting.length > 0) parts.push(`⚠${tasks.waiting.length}`)
  if (tasks.running > 0) parts.push(`▶${tasks.running}`)
  if (parts.length === 0) parts.push(state === 'error' ? '✕' : '✓')
  if (config.showSpendInTitle !== false && spendText) parts.push(spendText)
  const title = parts.join(' ')

  const today = tasks.today
  const lines = []
  lines.push(`运行中 ${tasks.running} · 等你处理 ${tasks.waiting.length}`)
  lines.push(`今日 完成 ${today.completed} · 失败 ${today.failed}${today.aborted ? ` · 停止 ${today.aborted}` : ''}`)
  if (spend) lines.push(`今日花费 ${spendText}（${spend.label}）`)
  if (usage.balance !== undefined) lines.push(`账户余额 ${money(usage.balance, usage.currency)}`)
  lines.push(`今日 Token ${compactTokens(usage.tokens.total)}（输出 ${compactTokens(usage.tokens.output)}）`)
  const tooltip = ['DeepSeek Harness', ...lines].join('\n')

  const menu = []
  menu.push({ id: 'summary', label: lines[0], enabled: false })
  for (const wait of tasks.waiting.slice(0, 6)) {
    menu.push({ id: `open:${wait.sessionId}`, label: `  ${KIND_LABEL[wait.kind]} · ${wait.title}${wait.text ? `：${wait.text}` : ''}`.slice(0, 70) })
  }
  for (const item of tasks.runningList.slice(0, 6)) {
    if (tasks.waiting.some(wait => wait.sessionId === item.sessionId)) continue
    menu.push({ id: `open:${item.sessionId}`, label: `  ▶ ${item.title}`.slice(0, 70) })
  }
  menu.push({ separator: true })
  for (const line of lines.slice(1)) menu.push({ id: 'info', label: line, enabled: false })
  if (tasks.recent.length > 0) {
    menu.push({ separator: true })
    menu.push({ id: 'info', label: '最近结束', enabled: false })
    for (const item of tasks.recent) {
      menu.push({ id: `open:${item.sessionId}`, label: `  ${clock(item.at)} ${KIND_LABEL[item.kind]} · ${item.title}`.slice(0, 70) })
    }
  }
  menu.push({ separator: true })
  menu.push({ id: 'show-app', label: '打开 DeepSeek Harness' })
  if (usage.usageUrl) menu.push({ id: 'usage-page', label: '查看账户用量…' })
  menu.push({ id: 'hide-tray', label: '隐藏状态栏图标（重启 DSH 后恢复）' })

  // Single glyph drawn into the Windows/Linux icon badge.
  const badge = tasks.waiting.length > 0 ? String(Math.min(tasks.waiting.length, 9))
    : tasks.running > 0 ? String(Math.min(tasks.running, 9)) : ''

  return { state, title, tooltip, menu, badge }
}
