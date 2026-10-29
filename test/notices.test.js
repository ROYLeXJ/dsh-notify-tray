import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Notices } from '../lib/notices.js'
import { speak } from '../lib/voice.js'

function harness(windowMs = 4000) {
  const timers = []
  const notices = new Notices({
    windowMs,
    now: () => 0,
    setTimer: fn => { timers.push(fn); return timers.length },
    clearTimer: () => {},
  })
  const seen = []
  notices.onNotice(n => seen.push(n))
  const fire = () => timers.shift()?.()
  return { notices, seen, fire, timers }
}
const ev = (type, sessionId, title = sessionId) => ({ type, sessionId, title, body: '' })

test('notices: one key per session; a burst of completions rings once, then once more for the rest', () => {
  const { notices, seen, fire } = harness()
  notices.push(ev('completed', 'A', '写周报'))
  assert.equal(seen.length, 1, 'the first completion shows at once')
  assert.equal(seen[0].key, 'A')
  notices.push(ev('completed', 'B', '改 bug'))
  notices.push(ev('failed', 'C'))
  notices.push(ev('completed', 'D', '翻译'))
  assert.deepEqual(seen.map(n => n.type), ['completed', 'failed'], 'failures are never held back')
  fire()
  const merged = seen[2]
  assert.equal(merged.count, 2)
  assert.equal(merged.key, 'D', 'the merged notice opens the newest session')
  assert.deepEqual(merged.sessions.map(s => s.title), ['翻译', '改 bug'])
  const said = speak(merged)
  assert.match(said.title, /2 个/)
  assert.ok(said.body.includes('『翻译』『改 bug』'))
  // A quiet window closes without a notice; the next completion shows at once again.
  fire()
  assert.equal(seen.length, 3)
  notices.push(ev('completed', 'E'))
  assert.equal(seen.length, 4)
})

test('notices: a lone completion inside the window is shown as itself, not as "1 more"', () => {
  const { notices, seen, fire } = harness()
  notices.push(ev('completed', 'A'))
  notices.push(ev('completed', 'B', '改 bug'))
  fire()
  assert.equal(seen[1].count, undefined)
  assert.equal(seen[1].key, 'B')
  assert.ok(speak(seen[1]).body.includes('『改 bug』'))
})

test('notices: "needs you" is taken back once the session stops waiting, a completion is not', () => {
  const { notices, seen } = harness(0)
  notices.push(ev('choice', 'A'))
  notices.push(ev('approval', 'B'))
  notices.settle(new Set(['A', 'B']))
  assert.equal(seen.length, 2, 'still waiting: nothing withdrawn')
  notices.settle(new Set(['B']))
  assert.deepEqual(seen.slice(2).map(n => [n.kind, n.key]), [['withdraw', 'A']])
  notices.settle(new Set(['B']))
  assert.equal(seen.length, 3, 'withdrawn once')
  // B's turn ends: the completion replaces the approval under the same key and stays up.
  notices.push(ev('completed', 'B'))
  notices.settle(new Set())
  assert.deepEqual(seen.map(n => n.kind), ['show', 'show', 'withdraw', 'show'])
  assert.deepEqual(notices.after(2).map(n => n.seq), [3, 4])
})

test('windows / macos: notification keys map to a short toast tag and a terminal-notifier group', async () => {
  const { notifierGroup, toastTag } = await import('../lib/system.js')
  const tag = toastTag('ses_01PeGWbjqE2ovW1rnuAmEnjo')
  assert.equal(tag.length, 16, 'older Windows 10 builds cap tags at 16 characters')
  assert.equal(tag, toastTag('ses_01PeGWbjqE2ovW1rnuAmEnjo'))
  assert.notEqual(tag, toastTag('ses_other'))
  assert.equal(notifierGroup('ses/../1'), 'dsh-notify-tray.ses..1')
})
