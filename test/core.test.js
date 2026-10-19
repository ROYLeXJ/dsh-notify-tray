import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildView, money } from '../lib/format.js'
import { glyphOf, renderIcon } from '../lib/icon.js'
import { Ledger, priceFor } from '../lib/ledger.js'
import { classifyQuestion, Tracker } from '../lib/tracker.js'

const session = (id, header = {}) => ({ id, header: { cwd: '/work/demo', ...header } })
const agent = (id, header) => ({ id, session: session(id, header), status: 'idle' })
const ev = (type, data) => ({ type, data, seq: 0, time: Date.now() })

test('ask_user_question with options is a choice, without is input', () => {
  assert.equal(classifyQuestion(JSON.stringify({ questions: [{ id: 'a', question: '选哪个？', options: [{ label: 'A' }] }] })).kind, 'choice')
  assert.equal(classifyQuestion(JSON.stringify({ questions: [{ id: 'a', question: '你的名字？' }] })).kind, 'input')
  assert.equal(classifyQuestion(JSON.stringify({ questions: [{ id: 'a', question: 'ok?', intent: { kind: 'plan-review', approve: 'x' } }] })).kind, 'choice')
  assert.equal(classifyQuestion('not json').kind, 'input')
})

test('tracker emits events and counts outcomes for top-level sessions only', () => {
  const t = new Tracker()
  const events = []
  t.onEvent(e => events.push(e))
  const s = session('s1')
  const child = session('c1', { delegationDepth: 1, origin: 'subagent' })

  t.agentStatus(agent('s1'), 'running')
  t.sessionEvent(s, ev('session/title', { title: '重构登录' }))
  t.sessionEvent(s, ev('approval/asked', { id: 'ap1', toolName: 'bash', reason: '运行 rm -rf build' }))
  assert.equal(t.summary().waiting.length, 1)
  t.sessionEvent(s, ev('approval/decided', { id: 'ap1', outcome: 'allowed-once' }))
  t.sessionEvent(s, ev('tool/call', { callId: 'q1', name: 'ask_user_question', arguments: JSON.stringify({ questions: [{ question: '用哪个库？', options: [{ label: 'a' }] }] }) }))
  assert.equal(t.summary().waiting[0].kind, 'choice')
  t.sessionEvent(s, ev('tool/result', { message: { callId: 'q1' } }))
  assert.equal(t.summary().waiting.length, 0)
  t.sessionEvent(child, ev('turn/end', { turn: 1, reason: { kind: 'completed' } }))
  t.sessionEvent(s, ev('turn/end', { turn: 1, reason: { kind: 'completed' } }))
  t.agentStatus(agent('s1'), 'idle')
  t.sessionEvent(s, ev('turn/end', { turn: 2, reason: { kind: 'error', error: { message: '429 rate limit' } } }))
  t.sessionEvent(s, ev('turn/end', { turn: 3, reason: { kind: 'aborted', reason: { kind: 'user' } } }))
  t.sessionEvent(s, ev('turn/end', { turn: 4, reason: { kind: 'forked' } }))

  assert.deepEqual(events.map(e => e.type), ['approval', 'choice', 'completed', 'failed'])
  assert.equal(events[0].title, '重构登录')
  assert.equal(events[3].body, '429 rate limit')
  const sum = t.summary()
  assert.deepEqual([sum.today.completed, sum.today.failed, sum.today.aborted], [1, 1, 1])
  assert.equal(sum.running, 0)
  assert.equal(t.eventsAfter(2).length, 2)
})

test('ledger dedupes per (turn, step), counts retries, and diffs balance', () => {
  const l = new Ledger()
  const s = session('s1')
  const usage = (input, output) => ({ inputTokens: input, outputTokens: output, cacheReadTokens: 100 })
  l.sessionEvent(s, ev('request/header', { config: { provider: 'deepseek-account', model: 'deepseek-flash' } }))
  l.sessionEvent(s, ev('assistant/attempt', { turn: 1, step: 0, stream: [{ type: 'chunk', chunk: { type: 'usage', usage: usage(10, 5) } }] }))
  // Same slot, final sample replaces the attempt's.
  l.sessionEvent(s, ev('assistant/message', { turn: 1, step: 0, usage: usage(10, 20) }))
  // Retry opens a new slot.
  l.sessionEvent(s, ev('llm/retry-started', { turn: 1, step: 0 }))
  l.sessionEvent(s, ev('assistant/message', { turn: 1, step: 0, usage: usage(10, 20) }))
  const sum = l.summary({ 'deepseek-': { input: 2, cacheRead: 0.5, output: 8 } }, 'CNY')
  assert.equal(sum.tokens.input, 20)
  assert.equal(sum.tokens.output, 40)
  assert.equal(sum.tokens.cacheRead, 200)
  assert.equal(sum.estimate, (20 * 2 + 200 * 0.5 + 40 * 8) / 1e6 > 0 ? Math.round((20 * 2 + 200 * 0.5 + 40 * 8) / 1e6 * 10000) / 10000 : 0)

  l.balance([{ currency: 'CNY', balance: '50.00' }])
  l.balance([{ currency: 'CNY', balance: '48.50' }])
  l.balance([{ currency: 'CNY', balance: '100.00' }]) // top-up
  l.balance([{ currency: 'CNY', balance: '99.00' }])
  const after = l.summary({}, 'CNY')
  assert.equal(after.balanceSpend, 2.5)
  assert.equal(after.balance, 99)
  assert.equal(after.estimate, undefined)
})

test('priceFor matches exact id then longest prefix', () => {
  const table = { deepseek: { input: 1 }, 'deepseek-pro': { input: 2 }, 'deepseek-pro-x': { input: 3 } }
  assert.equal(priceFor(table, 'deepseek-pro-x').input, 3)
  assert.equal(priceFor(table, 'deepseek-pro-2').input, 2)
  assert.equal(priceFor(table, 'deepseek-flash').input, 1)
  assert.equal(priceFor(table, 'gpt'), undefined)
})

test('view: attention beats running; title carries counts and spend', () => {
  const tasks = {
    running: 2,
    runningList: [{ sessionId: 'a', title: 'A' }, { sessionId: 'b', title: 'B' }],
    waiting: [{ sessionId: 'a', title: 'A', kind: 'input', text: '名字？', since: 1 }],
    recent: [],
    today: { completed: 3, failed: 0, aborted: 0 },
  }
  const usage = { tokens: { input: 1, cacheRead: 0, cacheWrite: 0, output: 1, total: 2 }, balance: 98.7, balanceSpend: 1.234, currency: 'CNY' }
  const v = buildView(tasks, usage, { spendSource: 'auto', showSpendInTitle: true })
  assert.equal(v.state, 'attention')
  assert.equal(v.title, '⚠1 ▶2 ¥1.23')
  assert.equal(v.badge, '1')
  assert.ok(v.tooltip.includes('账户余额 ¥98.7'))
  assert.ok(v.menu.some(row => row.id === 'open:a'))
  assert.ok(v.menu.some(row => row.id === 'open:b'))
  assert.equal(money(12.345, 'USD'), '$12.3')
})

test('view: recent failure shows error, idle otherwise', () => {
  const now = 1_000_000
  const base = { running: 0, runningList: [], waiting: [], today: { completed: 0, failed: 1, aborted: 0 } }
  const usage = { tokens: { total: 0, output: 0 }, currency: 'CNY' }
  const failed = { ...base, recent: [{ sessionId: 'a', title: 'A', kind: 'failed', at: now - 1000 }] }
  assert.equal(buildView(failed, usage, { errorHoldMinutes: 10 }, now).state, 'error')
  assert.equal(buildView(failed, usage, { errorHoldMinutes: 10 }, now + 11 * 60_000).state, 'idle')
})

test('icon renders ARGB with transparent corners and white glyph', () => {
  const size = 22
  const px = renderIcon(size, 'running', '3')
  assert.equal(px.length, size * size * 4)
  assert.equal(px[0], 0) // corner alpha
  const center = (11 * size + 11) * 4
  assert.equal(px[center], 255)
  assert.equal(glyphOf({ state: 'error', badge: '' }), '!')
})
