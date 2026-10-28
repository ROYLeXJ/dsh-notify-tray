/**
 * Daily spend ledger.
 *
 * Two independent sources, both kept per local day:
 * - tokens: folded from `assistant/message` / `assistant/attempt` usage
 *   samples with token-meter's dedupe rule (each (turn, step) slot keeps its
 *   last sample; `llm/retry-started` opens a new slot), filed under the
 *   `provider/model` route the session's latest `request/header` announced
 *   and priced by a resolver (see pricing.js) per million tokens; DeepSeek
 *   tokens used off-peak are also counted apart (`offPeak`), so the
 *   resolver's `offPeakFactor` can discount them;
 * - balance: polled DeepSeek account balance; the day's spend is the sum of
 *   balance drops, so a top-up never reads as negative spend.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { isDeepseekOffPeak, providerForRoute } from './catalog.js'
import { localDate } from './tracker.js'

/** Days of history kept on disk. */
const KEEP_DAYS = 31

const zero = () => ({ input: 0, cacheRead: 0, cacheWrite: 0, output: 0 })

/** The usage one assistant settlement reports, if any. */
export function usageOf(event) {
  if (event.type === 'assistant/message' && event.data?.usage !== undefined) return event.data.usage
  if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') return undefined
  const stream = event.data?.stream
  if (!Array.isArray(stream)) return undefined
  for (let i = stream.length - 1; i >= 0; i -= 1) {
    const record = stream[i]
    if (record?.type === 'chunk' && record.chunk?.type === 'usage') return record.chunk.usage
  }
  return undefined
}

const bucketsOf = usage => ({
  input: usage.inputTokens ?? 0,
  cacheRead: usage.cacheReadTokens ?? 0,
  cacheWrite: usage.cacheWriteTokens ?? 0,
  output: usage.outputTokens ?? 0,
})

/** `provider/model` route key the ledger files usage under; the bare model when the provider is unknown. */
export function routeKey(provider, model) {
  return provider ? `${provider}/${model}` : model
}

/** Split a route key back into its halves. */
export function splitRoute(key) {
  const slash = key.indexOf('/')
  return slash === -1 ? { provider: undefined, model: key } : { provider: key.slice(0, slash), model: key.slice(slash + 1) }
}

/** The provider/model a `request/header` event announces, if any (DSH nests it under `header.config`). */
export function routeOf(event) {
  const config = event.data?.header?.config ?? event.data?.config
  const model = config?.model
  if (!model) return undefined
  return { provider: config.provider, model }
}

/**
 * Find a price row in a user table for a route key (`provider/model`) or a
 * bare model id: exact route, exact model, then the longest prefix of either.
 */
export function priceFor(table, key) {
  if (!table || !key) return undefined
  const { model } = splitRoute(key)
  if (table[key]) return table[key]
  if (table[model]) return table[model]
  let best
  for (const candidate of Object.keys(table)) {
    if ((key.startsWith(candidate) || model.startsWith(candidate)) && (best === undefined || candidate.length > best.length)) best = candidate
  }
  return best === undefined ? undefined : table[best]
}

export function costOf(buckets, price) {
  if (!price) return 0
  const m = 1e6
  return (buckets.input * (price.input ?? 0)
    + buckets.cacheRead * (price.cacheRead ?? price.input ?? 0)
    + buckets.cacheWrite * (price.cacheWrite ?? price.input ?? 0)
    + buckets.output * (price.output ?? 0)) / m
}

export class Ledger {
  constructor({ file, now = () => Date.now() } = {}) {
    this.file = file
    this.now = now
    /** @type {Record<string, any>} date → day record */
    this.days = {}
    /** session id → { turn, step, buckets } of the open replacement slot */
    this.slots = new Map()
    /** session id → route key from the latest request header */
    this.routes = new Map()
    /** The route the most recent request header anywhere announced: "the current model". */
    this.lastRoute = undefined
    this.dirty = false
    this.listeners = new Set()
  }

  onChange(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  changed() {
    this.dirty = true
    for (const listener of this.listeners) listener()
  }

  today() {
    const date = localDate(this.now())
    let day = this.days[date]
    if (day === undefined) {
      day = { date, tokens: zero(), byModel: {}, offPeak: {}, balanceSpend: {}, balanceLast: {} }
      // Carry the last known balance across midnight so the first poll of the day diffs against it.
      const previous = Object.keys(this.days).sort().pop()
      if (previous !== undefined) day.balanceLast = { ...this.days[previous].balanceLast }
      this.days[date] = day
    }
    return day
  }

  async load() {
    if (!this.file) return
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8'))
      if (parsed && typeof parsed.days === 'object') this.days = parsed.days
      if (typeof parsed?.lastRoute === 'object' && parsed.lastRoute?.model) this.lastRoute = parsed.lastRoute
    } catch {
      // first run or unreadable file: start fresh
    }
  }

  async save() {
    if (!this.file || !this.dirty) return
    this.dirty = false
    const dates = Object.keys(this.days).sort()
    for (const date of dates.slice(0, Math.max(0, dates.length - KEEP_DAYS))) delete this.days[date]
    await mkdir(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    await writeFile(tmp, JSON.stringify({ version: 1, days: this.days, lastRoute: this.lastRoute }))
    await rename(tmp, this.file)
  }

  sessionEvent(session, event) {
    const id = session.id
    if (event.type === 'request/header') {
      const route = routeOf(event)
      if (route) {
        this.routes.set(id, routeKey(route.provider, route.model))
        if (this.lastRoute?.provider !== route.provider || this.lastRoute?.model !== route.model) {
          this.lastRoute = route
          this.changed()
        }
      }
      return
    }
    if (event.type === 'llm/retry-started') {
      const slot = this.slots.get(id)
      if (slot && slot.turn === event.data?.turn && slot.step === event.data?.step) this.slots.delete(id)
      return
    }
    const usage = usageOf(event)
    if (usage === undefined) return
    const { turn, step } = event.data
    const next = bucketsOf(usage)
    const key = this.routes.get(id) ?? 'unknown'
    const slot = this.slots.get(id)
    const previous = slot && slot.turn === turn && slot.step === step ? slot : undefined
    const day = this.today()
    const byModel = (day.byModel[key] ??= zero())
    // Days recorded before off-peak tracking have no `offPeak` map.
    const offPeak = billedToDeepseek(key) && isDeepseekOffPeak(this.now()) ? ((day.offPeak ??= {})[key] ??= zero()) : undefined
    for (const bucket of Object.keys(next)) {
      const delta = next[bucket] - (previous?.buckets[bucket] ?? 0)
      day.tokens[bucket] += delta
      byModel[bucket] += delta
      if (offPeak) offPeak[bucket] += delta
    }
    this.slots.set(id, { turn, step, buckets: next })
    this.changed()
  }

  /** Record one balance reading; returns true when it changed the ledger. */
  balance(wallets) {
    const day = this.today()
    let changed = false
    for (const wallet of wallets) {
      const value = Number(wallet.balance)
      if (!Number.isFinite(value)) continue
      const last = day.balanceLast[wallet.currency]
      if (last !== undefined && value < last) {
        day.balanceSpend[wallet.currency] = round((day.balanceSpend[wallet.currency] ?? 0) + last - value)
      }
      if (last !== value) changed = true
      day.balanceLast[wallet.currency] = value
    }
    if (changed) this.changed()
    return changed
  }

  forgetSession(id) {
    this.slots.delete(id)
    this.routes.delete(id)
  }

  /**
   * Today's totals. `pricing` is either a user price table (per million tokens,
   * keyed by route / model id / prefix) or a resolver
   * `(routeKey) => { price, source } | undefined` whose price is already in the
   * display currency. A hit with `offPeakFactor` bills the route's off-peak
   * tokens at that fraction of its price. The estimate is undefined until at
   * least one route priced.
   */
  summary(pricing, currency) {
    const day = this.today()
    const resolve = typeof pricing === 'function' ? pricing : key => {
      const price = priceFor(pricing, key)
      return price ? { price, source: 'table' } : undefined
    }
    let estimate = 0
    let deepseekEstimate = 0
    let priced = false
    const sources = new Set()
    const byModel = []
    for (const [key, buckets] of Object.entries(day.byModel)) {
      const hit = resolve(key)
      const offPeak = hit?.offPeakFactor !== undefined ? day.offPeak?.[key] : undefined
      const cost = hit
        ? round(costOf(buckets, hit.price) - (offPeak ? costOf(offPeak, hit.price) * (1 - hit.offPeakFactor) : 0))
        : undefined
      if (hit) {
        priced = true
        sources.add(hit.source)
        estimate += cost
        if (billedToDeepseek(key)) deepseekEstimate += cost
      }
      byModel.push({ ...splitRoute(key), key, tokens: buckets, cost, source: hit?.source })
    }
    byModel.sort((a, b) => sumOf(b.tokens) - sumOf(a.tokens))
    const totalTokens = sumOf(day.tokens)
    return {
      date: day.date,
      tokens: { ...day.tokens, total: totalTokens },
      byModel,
      estimate: priced ? round(estimate) : undefined,
      estimateSources: [...sources],
      // The part of the estimate the DeepSeek account balance also pays for (DeepSeek routes).
      estimateDeepseek: priced ? round(deepseekEstimate) : undefined,
      balance: day.balanceLast[currency],
      balanceSpend: day.balanceSpend[currency],
      currency,
      route: this.lastRoute,
    }
  }
}

/** Does usage filed under this route key come out of the DeepSeek account balance? */
export function billedToDeepseek(key) {
  const { provider, model } = splitRoute(key)
  if (provider) return providerForRoute(provider) === 'deepseek'
  return /^deepseek/iu.test(model)
}

const sumOf = t => t.input + t.cacheRead + t.cacheWrite + t.output

function round(value) {
  return Math.round(value * 10000) / 10000
}
