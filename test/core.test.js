import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildView, elapsed, money, spendOf, wrapText } from '../lib/format.js'
import { asciiIcon, renderIcon } from '../lib/icon.js'
import { flatten, iconSpec, whaleFrames, whalePaths, whaleSvg } from '../lib/whale.js'
import { billedToDeepseek, Ledger, priceFor } from '../lib/ledger.js'
import { classifyQuestion, Tracker } from '../lib/tracker.js'

const session = (id, header = {}) => ({ id, header: { cwd: '/work/demo', ...header } })
const agent = (id, header) => ({ id, session: session(id, header), status: 'idle' })
const ev = (type, data) => ({ type, data, seq: 0, time: Date.now() })
/** `tool/result` data exactly as DSH appends it (ToolResultMessage: `toolCallId` + `source.callId`, no `callId`). */
const toolResult = callId => ({
  turn: 1,
  step: 1,
  message: { role: 'tool', source: { kind: 'tool', callId }, toolCallId: callId, content: [{ type: 'text', text: '{"answers":[]}' }], isError: false, id: `m-${callId}` },
})

test('answering a question mid-turn clears it while the turn keeps running', () => {
  const t = new Tracker()
  const s = session('s1')
  t.agentStatus(agent('s1'), 'running')
  t.sessionEvent(s, ev('tool/call', { callId: 'q1', name: 'ask_user_question', arguments: JSON.stringify({ questions: [{ question: '上传？', options: [{ label: '好' }] }] }) }))
  t.sessionEvent(s, ev('tool/call', { callId: 'q2', name: 'ask_user_question', arguments: JSON.stringify({ questions: [{ question: '标题？' }] }) }))
  assert.equal(t.summary().waiting.length, 2)
  t.sessionEvent(s, ev('tool/result', toolResult('q1')))
  assert.deepEqual(t.summary().waiting.map(w => w.kind), ['input'])
  t.sessionEvent(s, ev('tool/result', toolResult('q2')))
  assert.equal(t.summary().waiting.length, 0)
  assert.equal(t.summary().running, 1)
  // An approval tied to a call is settled by that call's result even without `approval/decided`.
  t.sessionEvent(s, ev('approval/asked', { id: 'ap1', toolName: 'bash', callId: 'b1' }))
  assert.equal(t.summary().waiting.length, 1)
  t.sessionEvent(s, ev('tool/result', toolResult('b1')))
  assert.equal(t.summary().waiting.length, 0)
})

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
  t.sessionEvent(s, ev('tool/call', { callId: 't0', name: 'bash', arguments: '{}' }))
  assert.equal(t.summary().runningList[0].tool, 'bash')
  assert.equal(typeof t.summary().runningList[0].since, 'number')
  t.sessionEvent(s, ev('approval/asked', { id: 'ap1', toolName: 'bash', reason: '运行 rm -rf build' }))
  assert.equal(t.summary().waiting.length, 1)
  t.sessionEvent(s, ev('approval/decided', { id: 'ap1', outcome: 'allowed-once' }))
  t.sessionEvent(s, ev('tool/call', { callId: 'q1', name: 'ask_user_question', arguments: JSON.stringify({ questions: [{ question: '用哪个库？', options: [{ label: 'a' }] }] }) }))
  assert.equal(t.summary().waiting[0].kind, 'choice')
  t.sessionEvent(s, ev('tool/result', toolResult('q1')))
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

test('view: attention beats running; title says what needs you, never money', () => {
  const now = 1_000_000
  const tasks = {
    running: 2,
    runningList: [{ sessionId: 'a', title: 'A', since: now - 7 * 60_000, tool: 'bash' }, { sessionId: 'b', title: 'B', since: now }],
    waiting: [{ sessionId: 'a', title: 'A', kind: 'input', text: '名字？', since: 1 }],
    recent: [{ sessionId: 'c', title: 'C', kind: 'completed', at: now - 60_000 }],
    today: { completed: 3, failed: 0, aborted: 0 },
  }
  const usage = { tokens: { input: 1, cacheRead: 0, cacheWrite: 0, output: 1, total: 2 }, balance: 98.7, balanceSpend: 1.234, currency: 'CNY', usageUrl: 'https://x' }
  const v = buildView(tasks, usage, { spendSource: 'auto' }, now)
  assert.equal(v.state, 'attention')
  assert.equal(v.title, '待处理 1')
  assert.equal(v.badge, '1')
  assert.equal(v.menu[0].label, '有 1 件事等你处理')
  assert.ok(v.tooltip.includes('账户余额 ¥98.7'))
  const labels = v.menu.filter(r => !r.separator).map(r => r.label)
  assert.ok(labels.some(l => l.startsWith('待输入 · A：名字？')))
  assert.ok(labels.includes('B · 刚开始'))
  assert.ok(!labels.some(l => l.includes('A · 7 分钟')), 'a waiting session is not listed twice')
  const today = v.menu.find(r => r.id === 'today')
  assert.equal(today.label, '今日用量 · ¥1.23')
  assert.ok(v.menu.some(r => r.id === 'usage-page' && r.label === '查看账户用量…'), 'usage page button on the first level')
  assert.ok(!today.children.some(r => r.id === 'usage-page'))
  const balance = v.menu.find(r => r.label === '账户余额 ¥98.7')
  assert.ok(balance, 'balance sits on the first level')
  assert.ok(!today.children.some(r => r.label?.startsWith('账户余额')))
  assert.ok(v.menu.find(r => r.id === 'recent').children.some(r => r.id === 'open:c'))
  assert.ok(!v.tooltip.includes('undefined'))

  // Title styles.
  const running = { ...tasks, waiting: [] }
  assert.equal(buildView(running, usage, {}, now).title, '运行中 2')
  assert.equal(buildView(running, usage, { titleStyle: 'count' }, now).title, '2')
  assert.equal(buildView(running, usage, { titleStyle: 'icon' }, now).title, '')
  assert.equal(buildView(running, usage, { showSpendInTitle: true }, now).title, '运行中 2 · ¥1.23')
  assert.equal(buildView({ ...running, running: 0, runningList: [] }, usage, {}, now).title, '')
  assert.equal(elapsed(now - 90 * 60_000, now), '1 小时 30 分')
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

test('whale: every state has geometry, running animates, holes cut through', () => {
  const spec = iconSpec()
  assert.deepEqual(Object.keys(spec.frames), ['idle', 'running', 'attention', 'error', 'done'])
  assert.ok(whaleFrames('running').length >= 8, 'running is a real animation')
  assert.equal(spec.anim.running.loop, true)
  assert.equal(spec.anim.done.loop, false, 'the celebration plays once')
  assert.equal(whaleFrames('idle').length, 1)
  assert.ok(whalePaths('attention').length > whalePaths('idle').length)
  // Every frame of every state stays inside the crop box.
  for (const state of Object.keys(spec.frames)) {
    for (const frame of spec.frames[state]) {
      for (const sub of frame) for (const cmd of sub) for (let i = 1; i < cmd.length; i += 2) {
        assert.ok(cmd[i] >= spec.bounds.x - 0.5 && cmd[i] <= spec.bounds.x + spec.bounds.w + 0.5, `${state} x in bounds`)
        assert.ok(cmd[i + 1] >= spec.bounds.y - 0.5 && cmd[i + 1] <= spec.bounds.y + spec.bounds.h + 0.5, `${state} y ${cmd[i + 1]} in bounds`)
      }
    }
  }
  assert.ok(flatten(whalePaths('idle')).every(poly => poly.length > 2))
  assert.ok(whaleSvg({ state: 'error' }).startsWith('<svg'))

  const size = 32
  const px = renderIcon(size, 'running')
  assert.equal(px.length, size * size * 4)
  assert.equal(px[0], 0, 'corner is transparent')
  const art = asciiIcon(size, 'idle').split('\n')
  assert.equal(art.length, size)
  assert.ok(art.some(row => row.includes('#')), 'body is filled')
  // The eye is a hole: a transparent pixel surrounded by opaque ones inside the head.
  const eyeRow = art.find(row => /#+ {2,}#+/u.test(row))
  assert.ok(eyeRow, 'eye hole present')
  // Unknown states fall back to the idle whale instead of throwing.
  assert.equal(renderIcon(16, 'nope').length, 16 * 16 * 4)
})

test('linux: session bus address covers dbus-launch abstract sockets and the systemd user bus', async () => {
  const { sessionBusAddress } = await import('../lib/tray/linux.js')
  const { mkdtempSync, writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  assert.equal(sessionBusAddress({ DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus' }), 'unix:path=/run/user/1000/bus')
  // dbus-next needs a native module for abstract sockets; Node's net takes a NUL-prefixed path instead.
  assert.equal(sessionBusAddress({ DBUS_SESSION_BUS_ADDRESS: 'unix:abstract=/tmp/dbus-AbC123,guid=9f' }), 'unix:path=\0/tmp/dbus-AbC123,guid=9f')
  const runtime = mkdtempSync(join(tmpdir(), 'xdg-'))
  assert.throws(() => sessionBusAddress({ XDG_RUNTIME_DIR: runtime }), /D-Bus/u)
  writeFileSync(join(runtime, 'bus'), '')
  assert.equal(sessionBusAddress({ XDG_RUNTIME_DIR: runtime }), `unix:path=${join(runtime, 'bus')}`)
  assert.throws(() => sessionBusAddress({}), /D-Bus/u)
})

test('linux: the rasterizer draws the whole crop box, not just the 100-box', () => {
  // The leaping "done" whale and the tail tip live outside the 100×100 box but inside BOUNDS.
  const size = 48
  const px = renderIcon(size, 'done', 3)
  let topRows = 0
  for (let y = 0; y < 7; y += 1) for (let x = 0; x < size; x += 1) if (px[(y * size + x) * 4] > 0) topRows += 1
  assert.ok(topRows > 0, 'pixels above the box are drawn')
  const t = performance.now()
  for (let f = 0; f < 12; f += 1) for (const s of [22, 32, 48]) renderIcon(s, 'running', f)
  assert.ok(performance.now() - t < 500, 'a full running cycle renders well under a second (it runs on the host thread)')
})

test('windows: toast XML escapes text and launches dsh://open only when asked', async () => {
  const { toastXml } = await import('../lib/system.js')
  const xml = toastXml({ title: '🐳 搞定啦～ <a&b>', body: 'it\'s "done"', launch: 'dsh://open' })
  assert.ok(xml.startsWith('<toast activationType="protocol" launch="dsh://open">'))
  assert.ok(xml.includes('<text>🐳 搞定啦～ &lt;a&amp;b&gt;</text><text>it&apos;s &quot;done&quot;</text>'))
  assert.ok(xml.includes('ms-winsoundevent:Notification.Default'))
  const quiet = toastXml({ title: 't', body: 'b', sound: false })
  assert.ok(quiet.startsWith('<toast><visual>'), 'no activation without a launch target')
  assert.ok(quiet.includes('<audio silent="true"/>'))
})

test('spend: auto follows the estimate while balance drops lag, and adds other providers on top', () => {
  const base = { currency: 'CNY', balance: 50, estimateSources: ['static'] }
  // First day: the platform has booked ¥0.28 of ¥0.77 worth of DeepSeek usage so far.
  const lag = spendOf({ ...base, balanceSpend: 0.28, estimate: 0.77, estimateDeepseek: 0.77 }, 'auto')
  assert.equal(lag.value, 0.77)
  assert.match(lag.label, /未到账/)
  // Caught up: the balance wins.
  const caught = spendOf({ ...base, balanceSpend: 0.8, estimate: 0.77, estimateDeepseek: 0.77 }, 'auto')
  assert.deepEqual([caught.value, caught.label], [0.8, '余额扣费'])
  // Kimi usage never shows up in the DeepSeek balance.
  const mixed = spendOf({ ...base, balanceSpend: 1, estimate: 1.5, estimateDeepseek: 0.9 }, 'auto')
  assert.equal(mixed.value, 1.6)
  assert.match(mixed.label, /其它平台估算/)
  assert.equal(spendOf({ ...base, balanceSpend: 0.28, estimate: 0.77, estimateDeepseek: 0.77 }, 'balance').value, 0.28)
  assert.equal(spendOf({ ...base, balanceSpend: 0.28, estimate: 0.77, estimateDeepseek: 0.77 }, 'estimate').value, 0.77)
})

test('ledger: estimateDeepseek counts only routes billed to the DeepSeek balance', () => {
  assert.equal(billedToDeepseek('deepseek-account/deepseek-flash'), true)
  assert.equal(billedToDeepseek('kimi-coding/kimi-for-coding'), false)
  assert.equal(billedToDeepseek('deepseek-v4-pro'), true)
  assert.equal(billedToDeepseek('unknown'), false)
})

test('view: submenu rows stay short enough not to run off the screen edge', () => {
  const now = 1_000_000
  const tasks = { running: 0, runningList: [], waiting: [], recent: [], today: { completed: 0, failed: 0, aborted: 0 } }
  const usage = {
    tokens: { input: 7_900_000, cacheRead: 0, cacheWrite: 0, output: 49_000, total: 7_949_000 },
    byModel: [{ key: 'deepseek-official/deepseek-flash', provider: 'deepseek-official', model: 'deepseek-flash', tokens: { input: 7_900_000, cacheRead: 0, cacheWrite: 0, output: 26_000 }, cost: 0.94, source: 'static' }],
    estimate: 0.94, estimateDeepseek: 0.94, estimateSources: ['static'], balance: 189.4, balanceSpend: 0.94, currency: 'CNY',
    route: { provider: 'deepseek-official', model: 'deepseek-flash' },
  }
  const plan = { name: 'Kimi', lines: [], quotaText: 'Kimi Code 5 小时滚动窗口 + 月度共享额度池；年付 ¥948；含 1M 上下文与 HighSpeed 以及更多更多说明文字', links: {}, providerName: 'Kimi' }
  const v = buildView(tasks, usage, { spendSource: 'auto' }, now, plan)
  const subRows = v.menu.filter(r => r.children).flatMap(r => r.children)
  for (const row of subRows) assert.ok(row.label.length <= 36, `too long: ${row.label}`)
  const today = v.menu.find(r => r.id === 'today').children.map(r => r.label)
  assert.ok(today.includes('deepseek-flash · 792.6万 · ¥0.94 内置价'))
  assert.ok(today.includes('当前模型 deepseek-flash'))
  assert.ok(!today.some(l => l.startsWith('按价格估算')), 'no duplicate estimate row when it equals the spend')
  assert.deepEqual(wrapText('a；b', 36), ['a；b'])
})
