/**
 * Notice queue: turns the tracker's per-session events into what the user is
 * actually shown, on both channels (the DSH window and the OS).
 *
 * - One notification per session: every notice carries `key` (the session
 *   id), and each channel replaces the session's previous notification with
 *   the new one (freedesktop replaces_id, terminal-notifier -group, toast Tag,
 *   web Notification tag).
 * - A "needs you" notification (approval / choice / input) is taken back
 *   once the session no longer waits on anything: `settle()` emits a
 *   `withdraw` notice for it.
 * - A burst of completions does not ring once per task: the first one shows
 *   at once, the ones that follow within `windowMs` fold into a single
 *   "n more finished" notice at the end of the window. Failures and anything
 *   that needs you are never held back.
 *
 * Pure logic (timers injectable), no DSH imports.
 */

/** How long completions after the first are gathered into one notice. */
export const BURST_MS = 4000
/** Notices kept for windows that poll late. */
const KEEP = 50
/** Event types that ask something of the user. */
export const ATTENTION = new Set(['approval', 'choice', 'input'])

export class Notices {
  constructor({ windowMs = BURST_MS, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    this.windowMs = windowMs
    this.now = now
    this.setTimer = setTimer
    this.clearTimer = clearTimer
    this.seq = 0
    this.list = []
    this.listeners = new Set()
    /** Keys whose latest shown notice asks something of the user. */
    this.attention = new Set()
    /** Open completion window: { timer, extra: event[] } */
    this.burst = undefined
  }

  onNotice(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emit(notice) {
    const full = { seq: ++this.seq, at: this.now(), ...notice }
    this.list.push(full)
    if (this.list.length > KEEP) this.list.shift()
    for (const listener of this.listeners) listener(full)
    return full
  }

  show(event, extra = {}) {
    const key = event.sessionId
    if (ATTENTION.has(event.type)) this.attention.add(key)
    else this.attention.delete(key)
    return this.emit({ kind: 'show', key, type: event.type, sessionId: event.sessionId, title: event.title, body: event.body, ...extra })
  }

  /** Feed one tracker event (already filtered by the user's per-type switches). */
  push(event) {
    if (event.type !== 'completed' || this.windowMs <= 0) return void this.show(event)
    if (this.burst) {
      this.burst.extra.push(event)
      return
    }
    this.show(event)
    this.openWindow()
  }

  openWindow() {
    const burst = { extra: [] }
    burst.timer = this.setTimer(() => this.closeWindow(burst), this.windowMs)
    burst.timer?.unref?.()
    this.burst = burst
  }

  closeWindow(burst) {
    if (this.burst !== burst) return
    this.burst = undefined
    const { extra } = burst
    if (extra.length === 0) return
    if (extra.length === 1) this.show(extra[0])
    else {
      const last = extra[extra.length - 1]
      // Newest first, one entry per session.
      const sessions = []
      for (const e of [...extra].reverse()) {
        if (!sessions.some(s => s.sessionId === e.sessionId)) sessions.push({ sessionId: e.sessionId, title: e.title })
      }
      this.show(last, { count: extra.length, sessions })
    }
    // Completions keep coming: gather the next ones too instead of ringing for each.
    this.openWindow()
  }

  /**
   * Take back "needs you" notifications of sessions that no longer wait.
   * @param {Set<string>} waiting - session ids that still wait on the user.
   */
  settle(waiting) {
    for (const key of [...this.attention]) {
      if (waiting.has(key)) continue
      this.attention.delete(key)
      this.emit({ kind: 'withdraw', key, sessionId: key })
    }
  }

  after(seq) {
    return this.list.filter(notice => notice.seq > seq)
  }

  dispose() {
    if (this.burst) this.clearTimer(this.burst.timer)
    this.burst = undefined
  }
}
