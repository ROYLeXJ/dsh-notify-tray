/**
 * Session state tracker: folds `agent/status` and `session/event` into the
 * per-session facts the tray shows (running / waiting for you / last result)
 * and emits one notification event per user-relevant transition.
 *
 * Pure logic, no DSH imports, so it is unit-testable with plain objects.
 */

/** Question tool name used by dsh-tool-ask-user. */
const ASK_TOOL = 'ask_user_question'
/** Notification events kept for clients that poll late. */
const EVENT_BUFFER = 50
/** Body excerpt cap so system notifications stay compact. */
const BODY_MAX = 90

export function clip(text, max = BODY_MAX) {
  const flat = String(text ?? '').replace(/\s+/gu, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

export function localDate(time = Date.now()) {
  const d = new Date(time)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** True for top-level sessions; subagent children never notify on their own. */
export function isTopLevel(session) {
  const header = session?.header
  if (header === undefined) return true
  return !(header.delegationDepth > 0) && header.origin !== 'subagent'
}

/**
 * Classify an ask_user_question call: any question offering options (or a
 * plan review) needs a choice; free-text questions need input.
 */
export function classifyQuestion(argumentsJson) {
  let questions = []
  try {
    questions = JSON.parse(argumentsJson)?.questions ?? []
  } catch {
    return { kind: 'input', text: '' }
  }
  const first = questions[0] ?? {}
  const text = first.header ? `${first.header}：${first.question ?? ''}` : (first.question ?? '')
  if (questions.some(q => q?.intent?.kind === 'plan-review')) return { kind: 'choice', text: text || '计划待确认' }
  if (questions.some(q => Array.isArray(q?.options) && q.options.length > 0)) return { kind: 'choice', text }
  return { kind: 'input', text }
}

/** Map a TurnEndReason onto the outcome the user cares about, or undefined to stay silent. */
export function outcomeOf(reason) {
  switch (reason?.kind) {
    case 'completed': return { kind: 'completed' }
    case 'error': return { kind: 'failed', detail: reason.error?.message ?? '' }
    case 'max-tokens': return { kind: 'failed', detail: '输出达到长度上限' }
    case 'blocked': return { kind: 'failed', detail: '被拦截' }
    case 'aborted': return { kind: 'aborted' }
    default: return undefined // forked / interrupted (crash marker) / unknown
  }
}

export class Tracker {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now
    /** @type {Map<string, any>} */
    this.sessions = new Map()
    this.day = { date: localDate(now()), completed: 0, failed: 0, aborted: 0 }
    this.events = []
    this.seq = 0
    this.listeners = new Set()
    this.changeListeners = new Set()
  }

  onEvent(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  onChange(listener) {
    this.changeListeners.add(listener)
    return () => this.changeListeners.delete(listener)
  }

  entry(id, session) {
    let entry = this.sessions.get(id)
    if (entry === undefined) {
      const cwd = session?.header?.cwd
      entry = {
        id,
        title: undefined,
        cwd,
        running: false,
        pending: new Map(),
        last: undefined,
        updatedAt: this.now(),
      }
      this.sessions.set(id, entry)
    }
    return entry
  }

  labelOf(entry) {
    if (entry.title) return entry.title
    if (entry.cwd) return entry.cwd.split(/[\\/]/u).filter(Boolean).pop() ?? entry.cwd
    return '会话'
  }

  rollDay() {
    const today = localDate(this.now())
    if (this.day.date !== today) this.day = { date: today, completed: 0, failed: 0, aborted: 0 }
  }

  emit(type, entry, body) {
    const event = { seq: ++this.seq, type, sessionId: entry.id, title: this.labelOf(entry), body: clip(body), at: this.now() }
    this.events.push(event)
    if (this.events.length > EVENT_BUFFER) this.events.shift()
    for (const listener of this.listeners) listener(event)
  }

  changed() {
    for (const listener of this.changeListeners) listener()
  }

  /** Seed from agents already alive when the plugin starts. */
  seed(agents) {
    for (const agent of agents) {
      if (!isTopLevel(agent.session)) continue
      const entry = this.entry(agent.id, agent.session)
      entry.running = agent.status === 'running'
    }
    this.changed()
  }

  agentStatus(agent, status) {
    if (!isTopLevel(agent.session)) return
    const entry = this.entry(agent.id, agent.session)
    entry.running = status === 'running'
    entry.updatedAt = this.now()
    // An idle agent is waiting on nothing the tray should still count.
    if (!entry.running) entry.pending.clear()
    this.changed()
  }

  agentDisposed(agent) {
    if (this.sessions.delete(agent.id)) this.changed()
  }

  sessionEvent(session, event) {
    if (!isTopLevel(session)) return
    const entry = this.entry(session.id, session)
    const data = event.data ?? {}
    switch (event.type) {
      case 'session/title':
        entry.title = data.title
        return
      case 'approval/asked': {
        const body = data.reason || `工具 ${data.toolName} 需要你批准`
        entry.pending.set(`approval:${data.id}`, { kind: 'approval', text: body, since: this.now() })
        this.emit('approval', entry, body)
        break
      }
      case 'approval/decided':
        entry.pending.delete(`approval:${data.id}`)
        break
      case 'tool/call': {
        if (data.name !== ASK_TOOL) return
        const { kind, text } = classifyQuestion(data.arguments)
        entry.pending.set(`question:${data.callId}`, { kind, text, since: this.now() })
        this.emit(kind, entry, text)
        break
      }
      case 'tool/result': {
        const callId = data.message?.callId
        if (callId === undefined || !entry.pending.delete(`question:${callId}`)) return
        break
      }
      case 'turn/end': {
        const outcome = outcomeOf(data.reason)
        entry.pending.clear()
        if (outcome === undefined) break
        this.rollDay()
        this.day[outcome.kind] += 1
        entry.last = { kind: outcome.kind, at: this.now(), detail: outcome.detail }
        if (outcome.kind === 'completed') this.emit('completed', entry, '任务已完成')
        else if (outcome.kind === 'failed') this.emit('failed', entry, outcome.detail || '任务失败')
        break
      }
      default:
        return
    }
    entry.updatedAt = this.now()
    this.changed()
  }

  /** Aggregate view used by the tray and the client. */
  summary() {
    this.rollDay()
    let running = 0
    const waiting = []
    for (const entry of this.sessions.values()) {
      if (entry.running) running += 1
      for (const wait of entry.pending.values()) {
        waiting.push({ sessionId: entry.id, title: this.labelOf(entry), kind: wait.kind, text: clip(wait.text, 60), since: wait.since })
      }
    }
    waiting.sort((a, b) => a.since - b.since)
    const recent = [...this.sessions.values()]
      .filter(entry => entry.last !== undefined)
      .sort((a, b) => b.last.at - a.last.at)
      .slice(0, 5)
      .map(entry => ({ sessionId: entry.id, title: this.labelOf(entry), kind: entry.last.kind, at: entry.last.at }))
    const runningList = [...this.sessions.values()]
      .filter(entry => entry.running)
      .map(entry => ({ sessionId: entry.id, title: this.labelOf(entry) }))
    return { running, runningList, waiting, recent, today: { ...this.day } }
  }

  eventsAfter(seq) {
    return this.events.filter(event => event.seq > seq)
  }
}
