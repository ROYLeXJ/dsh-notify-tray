// The window half of "bring DSH forward": a click on one of the window's own
// notifications asks the host to raise the app, and a click on a native toast is
// claimed through state.pending + ack once the app has the window in front.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const clientFile = join(fileURLToPath(new URL('..', import.meta.url)), 'lib', 'client.js')

/** Load the hand-written client module with browser stubs the test drives. */
function bootClient() {
  const shown = []
  const opened = []
  const requests = []
  const listeners = {}
  const feed = { seq: 0, events: [], pending: undefined }
  let factory
  let timer
  const sandbox = {
    window: {
      __ModuleLoader__: { load: ({ factory: f }) => { factory = f } },
      focus() {},
      addEventListener: (name, fn) => { (listeners[name] ??= []).push(fn) },
    },
    localStorage: { getItem: () => null, setItem: () => {} },
    document: {
      hasFocus: () => false,
      addEventListener: (name, fn) => { (listeners[name] ??= []).push(fn) },
    },
    Notification: class {
      static permission = 'granted'
      constructor(title, options) { this.title = title; this.options = options; shown.push(this) }
      close() {}
    },
    fetch: async (url) => {
      requests.push(url)
      const body = {
        boot: 'b1',
        platform: 'win32',
        seq: feed.seq,
        events: feed.events,
        titles: {},
        suppressWhenFocused: false,
        focus: [],
        pending: feed.pending,
        summary: { today: { completed: 0, failed: 0 } },
        usage: {},
        pricing: {},
        catalogLoaded: false,
        tray: {},
      }
      return { ok: true, json: async () => body }
    },
    setTimeout: (fn) => { timer = fn; return 1 },
    clearTimeout: () => {},
    console,
  }
  sandbox.window.window = sandbox.window
  vm.runInNewContext(readFileSync(clientFile, 'utf8'), sandbox)
  const client = factory(() => { throw new Error('no require expected') })
  const ctx = {
    uiWorkspace: { openSession: id => opened.push(id) },
    sessions: { list: { getSnapshot: () => ({ byId: {} }) } },
    effect() {},
  }
  const flush = () => new Promise(resolve => setTimeout(resolve, 10))
  const tick = async () => { const fn = timer; timer = undefined; fn(); await flush() }
  return { client, ctx, feed, shown, opened, requests, listeners, flush, tick }
}

test('clicking the window notification asks the host to raise the window', async () => {
  const h = bootClient()
  h.client.apply(h.ctx)
  await h.flush() // first poll only learns the cursor
  h.feed.seq = 1
  h.feed.events = [{ seq: 1, type: 'completed', sessionId: 'S1', title: '写周报', body: '干完了' }]
  await h.tick()
  assert.equal(h.shown.length, 1)

  h.shown[0].onclick()
  await h.flush()
  assert.deepEqual(h.opened, ['S1'])
  assert.ok(h.requests.some(url => url.includes('raise=1')), 'a click asks the host for the foreground')
})

test('a toast click hands its session over once the window is back in front', async () => {
  const h = bootClient()
  h.client.apply(h.ctx)
  await h.flush()
  h.feed.pending = { sessionId: 'S2', seq: 7, at: Date.now() }

  // The toast click surfaces as the window regaining focus, not as an event.
  for (const fn of h.listeners.focus ?? []) fn()
  await h.flush()

  assert.deepEqual(h.opened, ['S2'])
  assert.ok(h.requests.some(url => url.includes('ack=7')), 'the claimed session is acked so it is handed out once')
})

test('a poll that is not backed by the window coming forward claims nothing', async () => {
  const h = bootClient()
  h.feed.pending = { sessionId: 'S2', seq: 7, at: Date.now() }
  h.client.apply(h.ctx)
  await h.flush()

  assert.deepEqual(h.opened, [])
  assert.ok(!h.requests.some(url => url.includes('ack=')), 'no ack: the toast may still be clicked')
})