/**
 * Plan quota / balance fetchers for providers that expose one to an API key.
 *
 * Each `kind` names a parser that turns the provider's JSON into one normalized
 * reading:
 *   { balance?, currency?, remaining?, total?, used?, unit?, percent?, resetAt?, lines: [] }
 * `lines` is the human summary the tray menu and the settings page print, so
 * the parsers own the wording and the callers stay provider-agnostic.
 * Parsers are pure (fixture-testable); `fetchQuota` wires them to `fetch`.
 */

/** Request timeout for one quota poll. */
const TIMEOUT_MS = 12_000

const num = v => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}

const pct = (used, total) => (total > 0 ? Math.round((used / total) * 100) : undefined)

const when = value => {
  if (value === undefined || value === null || value === '') return undefined
  const ms = typeof value === 'number' ? (value < 1e12 ? value * 1000 : value) : Date.parse(value)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined
}

export function moneyText(value, currency) {
  if (typeof value !== 'number') return undefined
  const symbol = currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : `${currency ?? ''} `
  return `${symbol}${value < 10 ? value.toFixed(2) : value.toFixed(1)}`
}

export function clockText(iso) {
  if (!iso) return undefined
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return undefined
  const pad = n => String(n).padStart(2, '0')
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  return `${sameDay ? '' : `${d.getMonth() + 1}/${d.getDate()} `}${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** `GET https://api.deepseek.com/user/balance` */
function parseDeepseekBalance(json) {
  const infos = Array.isArray(json?.balance_infos) ? json.balance_infos : []
  const first = infos.find(i => i?.currency === 'CNY') ?? infos[0]
  if (!first) throw new Error('响应里没有 balance_infos')
  const balance = num(first.total_balance)
  return {
    balance,
    currency: first.currency,
    lines: [`账户余额 ${moneyText(balance, first.currency)}${json?.is_available === false ? '（不可用）' : ''}`],
  }
}

/** `GET https://api.moonshot.cn/v1/users/me/balance` */
function parseMoonshotBalance(json) {
  const data = json?.data
  const balance = num(data?.available_balance)
  if (balance === undefined) throw new Error(json?.error?.message ?? '响应里没有 available_balance')
  const lines = [`可用余额 ${moneyText(balance, 'CNY')}`]
  const voucher = num(data?.voucher_balance)
  if (voucher) lines.push(`其中代金券 ${moneyText(voucher, 'CNY')}`)
  return { balance, currency: 'CNY', lines }
}

/**
 * Kimi Code plan usage, `GET https://api.kimi.com/coding/v1/usages` (needs the Kimi Code OAuth token):
 * `{ usage: { limit, remaining, resetTime }, limits: [{ window: { duration, timeUnit }, detail: { limit, remaining, resetTime } }], user: { membership } }`.
 * Numbers arrive as strings; older spellings (`used`, `reset_time`) are folded too.
 */
function parseKimiUsage(json) {
  const buckets = []
  const read = (obj, label) => {
    if (!obj || typeof obj !== 'object') return
    const limit = num(obj.limit ?? obj.total ?? obj.quota)
    const used = num(obj.used ?? obj.usage)
    const remaining = num(obj.remaining ?? obj.remain ?? obj.left) ?? (limit !== undefined && used !== undefined ? limit - used : undefined)
    const reset = when(obj.resetTime ?? obj.reset_time ?? obj.resetAt ?? obj.reset_at ?? obj.nextResetTime)
    if (limit !== undefined || remaining !== undefined) buckets.push({ label, limit, used: used ?? (limit !== undefined && remaining !== undefined ? limit - remaining : undefined), remaining, reset })
  }
  read(json?.usage, '总额度')
  for (const entry of Array.isArray(json?.limits) ? json.limits : []) {
    const minutes = entry?.window?.timeUnit === 'TIME_UNIT_HOUR' ? num(entry.window.duration) * 60
      : entry?.window?.timeUnit === 'TIME_UNIT_DAY' ? num(entry.window.duration) * 1440
      : num(entry?.window?.duration)
    const label = minutes === undefined ? '窗口' : minutes % 1440 === 0 ? `${minutes / 1440} 天窗口` : minutes % 60 === 0 ? `${minutes / 60} 小时窗口` : `${minutes} 分钟窗口`
    read(entry?.detail ?? entry, label)
  }
  for (const [key, value] of Object.entries(json ?? {})) {
    if (key === 'usage' || key === 'user' || key === 'limits') continue
    if (value && typeof value === 'object' && !Array.isArray(value)) read(value, key)
  }
  if (!buckets.length) throw new Error(json?.error?.message ?? json?.message ?? '响应里没有额度字段')
  const main = buckets[0]
  const lines = buckets.map(b => {
    const parts = [`${b.label} 剩余 ${b.remaining ?? '?'}${b.limit !== undefined ? ` / ${b.limit}` : ''}`]
    if (b.reset) parts.push(`重置 ${clockText(b.reset)}`)
    return parts.join(' · ')
  })
  const level = json?.user?.membership?.level ?? json?.user?.membership
  if (typeof level === 'string') lines.push(`会员 ${level.replace(/^LEVEL_/u, '').toLowerCase()}`)
  return { remaining: main.remaining, total: main.limit, used: main.used, percent: main.limit && main.remaining !== undefined ? Math.round((main.remaining / main.limit) * 100) : undefined, resetAt: main.reset, lines }
}

/**
 * Z.ai / 智谱 GLM Coding Plan: `GET /api/monitor/usage/quota/limit`
 * `{ code, data: { limits: [{ type: 'CREDIT_LIMIT'|'TOKENS_LIMIT'|'TIME_LIMIT', usage, currentValue, remaining, percentage, nextResetTime, unit, number }] } }`
 * The first credit/token limit is the 5-hour window, the second the weekly one; TIME_LIMIT rows are MCP usage.
 */
function parseZaiQuota(json) {
  const limits = Array.isArray(json?.data?.limits) ? json.data.limits : []
  if (!limits.length) throw new Error(json?.msg ?? json?.message ?? '响应里没有 limits')
  const lines = []
  let main
  let windows = 0
  for (const limit of limits) {
    const total = num(limit.usage ?? limit.total)
    const used = num(limit.currentValue ?? limit.used)
    const remaining = num(limit.remaining) ?? (total !== undefined && used !== undefined ? total - used : undefined)
    const percent = num(limit.percentage) ?? (total && used !== undefined ? pct(used, total) : undefined)
    if (percent === undefined && remaining === undefined) continue
    const reset = when(limit.nextResetTime ?? limit.resetTime)
    const isWindow = limit.type !== 'TIME_LIMIT'
    const label = isWindow ? (windows === 0 ? '5 小时额度' : windows === 1 ? '本周额度' : `额度 ${windows + 1}`) : 'MCP 用量'
    if (isWindow) windows += 1
    const parts = [`${label} 已用 ${percent ?? '?'}%`]
    if (remaining !== undefined) parts.push(`剩余 ${compact(remaining)}${total !== undefined ? ` / ${compact(total)}` : ''}`)
    if (reset) parts.push(`重置 ${clockText(reset)}`)
    lines.push(parts.join(' · '))
    if (isWindow && (!main || windows === 1)) main = { remaining, total, used, percent: percent !== undefined ? 100 - percent : undefined, resetAt: reset }
  }
  if (!lines.length) throw new Error('响应里没有可用的额度数字')
  return { ...main, lines }
}

/**
 * MiniMax Coding Plan: `GET /v1/coding_plan/remains`
 * `{ model_remains: [{ model_name, current_interval_total_count, current_interval_usage_count, remains_count, start_time, end_time }] }`
 */
function parseMinimaxRemains(json) {
  const rows = Array.isArray(json?.model_remains) ? json.model_remains : []
  if (!rows.length) throw new Error(json?.base_resp?.status_msg ?? '响应里没有 model_remains')
  const lines = []
  let main
  for (const row of rows) {
    const total = num(row.current_interval_total_count)
    const used = num(row.current_interval_usage_count)
    const remaining = num(row.remains_count) ?? (total !== undefined && used !== undefined ? total - used : undefined)
    const reset = when(row.end_time)
    const parts = [`${row.model_name ?? '额度'} 剩余 ${remaining ?? '?'}${total !== undefined ? ` / ${total}` : ''}`]
    if (reset) parts.push(`重置 ${clockText(reset)}`)
    lines.push(parts.join(' · '))
    if (!main) main = { remaining, total, used, percent: total && remaining !== undefined ? Math.round((remaining / total) * 100) : undefined, resetAt: reset }
  }
  return { ...main, lines }
}

/** xAI: `GET https://api.x.ai/v1/api-key` only tells us the key is alive; no balance is exposed. */
function parseXaiKey(json) {
  if (!json?.api_key_id && !json?.name) throw new Error(json?.error ?? '响应里没有 api_key_id')
  return { lines: [`API Key「${json.name ?? json.api_key_id}」有效${json.api_key_disabled ? '（已禁用）' : ''}；xAI 不提供余额接口`] }
}

/** OpenAI-compatible `/dashboard/billing/credit_grants`-style shapes some gateways still serve. */
function parseCreditGrants(json) {
  const total = num(json?.total_granted)
  const used = num(json?.total_used)
  const remaining = num(json?.total_available) ?? (total !== undefined && used !== undefined ? total - used : undefined)
  if (remaining === undefined) throw new Error('响应里没有 total_available')
  return { balance: remaining, currency: 'USD', total, used, lines: [`剩余额度 ${moneyText(remaining, 'USD')}${total !== undefined ? ` / ${moneyText(total, 'USD')}` : ''}`] }
}

/** Anything else: best-effort scan for balance / remaining-looking numbers. */
function parseGeneric(json) {
  const found = []
  const walk = (obj, depth) => {
    if (!obj || typeof obj !== 'object' || depth > 4) return
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object') walk(value, depth + 1)
      else if (/balance|remain|quota|credit|left/iu.test(key) && num(value) !== undefined) found.push([key, num(value)])
    }
  }
  walk(json, 0)
  if (!found.length) throw new Error('看不懂这个响应，请用自定义字段手填')
  return { lines: found.slice(0, 4).map(([k, v]) => `${k} ${v}`) }
}

export const PARSERS = {
  'deepseek-balance': parseDeepseekBalance,
  'moonshot-balance': parseMoonshotBalance,
  'kimi-usage': parseKimiUsage,
  'zai-quota': parseZaiQuota,
  'minimax-remains': parseMinimaxRemains,
  'xai-key': parseXaiKey,
  'credit-grants': parseCreditGrants,
  generic: parseGeneric,
}

function compact(n) {
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)}亿`
  if (n >= 1e4) return `${(n / 1e4).toFixed(1)}万`
  return String(Math.round(n))
}

/** Headers for one auth style. */
export function authHeaders(auth, key) {
  if (auth === 'x-api-key') return { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
  if (auth === 'x-goog-api-key') return { 'x-goog-api-key': key }
  return { authorization: `Bearer ${key}` }
}

/**
 * Fetch and parse one quota reading.
 * @param {{ url: string, kind?: string, auth?: string, method?: string }} spec
 * @param {string} key - the API key.
 * @returns {Promise<{ ok: true, at: number, data: object } | { ok: false, at: number, error: string }>}
 */
export async function fetchQuota(spec, key, { fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  const at = now()
  const parse = PARSERS[spec.kind ?? 'generic'] ?? parseGeneric
  const controller = typeof AbortController === 'function' ? new AbortController() : undefined
  const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : undefined
  timer?.unref?.()
  try {
    const res = await fetchImpl(spec.url, {
      method: spec.method ?? 'GET',
      headers: { accept: 'application/json', ...authHeaders(spec.auth, key), ...(spec.headers ?? {}) },
      signal: controller?.signal,
    })
    const text = await res.text()
    let json
    try { json = JSON.parse(text) } catch { json = undefined }
    if (!res.ok) {
      const detail = json?.error?.message ?? json?.message ?? json?.msg ?? text.slice(0, 120)
      throw new Error(`HTTP ${res.status}${detail ? `：${detail}` : ''}`)
    }
    if (json === undefined) throw new Error('响应不是 JSON')
    return { ok: true, at, data: parse(json) }
  } catch (error) {
    return { ok: false, at, error: error?.name === 'AbortError' ? '请求超时' : (error?.message ?? String(error)) }
  } finally {
    clearTimeout(timer)
  }
}
