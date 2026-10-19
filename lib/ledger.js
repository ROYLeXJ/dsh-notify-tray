/**
 * Daily spend ledger.
 *
 * Two independent sources, both kept per local day:
 * - tokens: folded from `assistant/message` / `assistant/attempt` usage
 *   samples with token-meter's dedupe rule (each (turn, step) slot keeps its
 *   last sample; `llm/retry-started` opens a new slot), optionally priced with
 *   a user-supplied table (per million tokens);
 * - balance: polled DeepSeek account balance; the day's spend is the sum of
 *   balance drops, so a top-up never reads as negative spend.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
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

/** Find a price row: exact model id first, then the longest matching prefix. */
export function priceFor(table, model) {
  if (!table || !model) return undefined
  if (table[model]) return table[model]
  let best
  for (const key of Object.keys(table)) {
    if (model.startsWith(key) && (best === undefined || key.length > best.length)) best = key
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
    /** session id → { turn, step, model, buckets } of the open replacement slot */
    this.slots = new Map()
    /** session id → model from the latest request header */
    this.models = new Map()
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
      day = { date, tokens: zero(), byModel: {}, balanceSpend: {}, balanceLast: {} }
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
    await writeFile(tmp, JSON.stringify({ version: 1, days: this.days }))
    await rename(tmp, this.file)
  }

  sessionEvent(session, event) {
    const id = session.id
    if (event.type === 'request/header') {
      const model = event.data?.config?.model
      if (model) this.models.set(id, model)
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
    const model = this.models.get(id) ?? 'unknown'
    const slot = this.slots.get(id)
    const previous = slot && slot.turn === turn && slot.step === step ? slot : undefined
    const day = this.today()
    const byModel = (day.byModel[model] ??= zero())
    for (const key of Object.keys(next)) {
      const delta = next[key] - (previous?.buckets[key] ?? 0)
      day.tokens[key] += delta
      byModel[key] += delta
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
    this.models.delete(id)
  }

  /** Today's totals, priced with `prices` (per million tokens, keyed by model id or prefix). */
  summary(prices, currency) {
    const day = this.today()
    let estimate = 0
    let priced = false
    for (const [model, buckets] of Object.entries(day.byModel)) {
      const price = priceFor(prices, model)
      if (price) priced = true
      estimate += costOf(buckets, price)
    }
    const totalTokens = day.tokens.input + day.tokens.cacheRead + day.tokens.cacheWrite + day.tokens.output
    return {
      date: day.date,
      tokens: { ...day.tokens, total: totalTokens },
      estimate: priced ? round(estimate) : undefined,
      balance: day.balanceLast[currency],
      balanceSpend: day.balanceSpend[currency],
      currency,
    }
  }
}

function round(value) {
  return Math.round(value * 10000) / 10000
}
