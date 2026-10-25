// End-to-end over a fake cordis context: host apply() → route → client.js poll → Notification.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'dsh-notify-tray-'))

function fakeCtx() {
  const handlers = {}
  const services = {}
  const ctx = {
    handlers,
    services,
    on: (name, fn) => { (handlers[name] ??= []).push(fn) },
    emit: (name, ...args) => (handlers[name] ?? []).forEach(fn => fn(...args)),
    effect: (fn) => { const dispose = fn(); (ctx.disposers ??= []).push(dispose) },
    inject: (names, fn) => { if (names.every(n => services[n])) fn(Object.assign(Object.create(ctx), services)) },
    agents: { list: () => [] },
    logger: () => ({ warn: () => {}, debug: () => {} }),
  }
  return ctx
}

const vol = value => ({ get: () => value })

test('host route feeds client notifications and click opens the session', async () => {
  const { apply } = await import('../lib/index.js')
  const ctx = fakeCtx()
  let route
  ctx.services.webServer = { register: r => { route = r; return () => {} } }
  ctx.services.connection = { requestRejection: () => undefined }
  apply(ctx, {
    notifyCompleted: vol(true), notifyFailed: vol(true), notifyApproval: vol(true), notifyChoice: vol(true), notifyInput: vol(false),
    channel: vol('auto'), suppressWhenFocused: vol(true), sound: vol(false), tray: vol(false),
    showSpendInTitle: vol(true), spendSource: vol('auto'), currency: vol('CNY'), balancePollMinutes: vol(5), prices: vol({}), errorHoldMinutes: vol(10),
  })
  assert.equal(route.path, '/notify-tray/state')

  const call = (url) => new Promise(resolve => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v }, end(body) { resolve({ status: this.statusCode, body: JSON.parse(body) }) } }
    route.handler({ method: 'GET', url }, res)
  })

  // Load the hand-written client module in a sandbox with browser stubs.
  const shown = []
  const opened = []
  let factory
  let timer
  const store = new Map()
  const sandbox = {
    window: { __ModuleLoader__: { load: ({ factory: f }) => { factory = f } }, focus() {} },
    localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    document: { hasFocus: () => false },
    Notification: class { constructor(title, opts) { this.title = title; this.opts = opts; shown.push(this) } close() {} static permission = 'granted' },
    fetch: async (url) => { const { body } = await call(`/${url}`); return { ok: true, json: async () => body } },
    setTimeout: fn => { timer = fn; return 1 }, clearTimeout() {}, console,
  }
  const flush = () => new Promise(r => setTimeout(r, 10))
  const tick = async () => { const fn = timer; timer = undefined; fn(); await flush() }
  sandbox.window.window = sandbox.window
  const file = join(fileURLToPath(new URL('..', import.meta.url)), 'lib', 'client.js')
  vm.runInNewContext(readFileSync(file, 'utf8'), sandbox)
  const client = factory(() => { throw new Error('no require expected') })
  assert.equal(client.inject.join(','), 'uiWorkspace,sessions')
  const cctx = {
    uiWorkspace: { openSession: id => opened.push(id) },
    sessions: { list: { getSnapshot: () => ({ byId: {} }) } },
    effect() {},
  }

  client.apply(cctx)
  await flush() // first poll: learns the cursor only
  assert.equal(shown.length, 0)

  const session = { id: 'S1', header: { cwd: '/w/demo' } }
  ctx.emit('session/event', session, { type: 'session/title', data: { title: '写周报' } })
  ctx.emit('session/event', session, { type: 'tool/call', data: { callId: 'c1', name: 'ask_user_question', arguments: JSON.stringify({ questions: [{ question: '发给谁？', options: [{ label: '老板' }] }] }) } })
  ctx.emit('session/event', session, { type: 'tool/call', data: { callId: 'c2', name: 'ask_user_question', arguments: JSON.stringify({ questions: [{ question: '标题？' }] }) } })
  ctx.emit('session/event', session, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
  ctx.emit('session/event', session, { type: 'turn/end', data: { turn: 2, reason: { kind: 'error', error: { message: '网络错误' } } } })

  await tick()
  // Wording comes from lib/voice.js (the whale speaks); every line names the session.
  assert.deepEqual(shown.map(n => n.title.startsWith('🐳 ')), [true, true, true], 'input disabled by config')
  assert.ok(shown.every(n => n.opts.body.includes('『写周报』')))
  assert.equal(shown.length, 3)
  assert.ok(shown[2].opts.body.includes('网络错误'))

  // No duplicates on the next poll; a click opens the session.
  await tick()
  assert.equal(shown.length, 3)
  shown[0].onclick()
  assert.deepEqual(opened, ['S1'])

  // Tray click → focus queue → the window opens that session.
  const state = await call('/notify-tray/state?after=999')
  assert.equal(state.body.summary.today.completed, 1)
  assert.equal(state.body.summary.today.failed, 1)
})

test.after(() => {
  // Host effects keep timers alive (ledger flush); dispose like cordis would.
  setTimeout(() => process.exit(0), 50).unref()
})
