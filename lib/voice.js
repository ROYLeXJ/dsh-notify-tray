/**
 * The whale's voice: notification wording in the mascot's own tone — a
 * plump blue whale girl who is cheerful, a little proud, and very fond of
 * you. One line per event type, several variants each; the variant is picked
 * from the event's seq so the same event reads the same on every screen.
 *
 * Returns { title, body }. `title` is the short headline shown in bold by the
 * OS; `body` carries the session name (in 『』) and the question / reason.
 */

const LINES = {
  completed: [
    { title: '🐳 搞定啦～', body: '『{s}』做完了！快来验收，本鲸可是很能干的哦' },
    { title: '🐳 任务完成！', body: '『{s}』已经办妥～ 要不要摸摸鲸鱼头奖励一下？' },
    { title: '🐳 哗啦～浮出水面', body: '『{s}』收工！结果都整理好了，等你来看' },
    { title: '🐳 嘿嘿，做完了', body: '『{s}』顺利完成～ 下一个任务也放心交给我吧' },
  ],
  choice: [
    { title: '🐳 该你拍板啦', body: '『{s}』遇到岔路口了：{q}　选一个嘛～' },
    { title: '🐳 选哪个呀？', body: '『{s}』需要你做个决定：{q}' },
    { title: '🐳 鲸鱼举棋不定中…', body: '『{s}』有几个方案等你挑：{q}' },
  ],
  input: [
    { title: '🐳 等你说话呢', body: '『{s}』想听听你的想法：{q}' },
    { title: '🐳 请你写几个字～', body: '『{s}』卡在这里啦：{q}' },
    { title: '🐳 戳戳，需要你回答', body: '『{s}』有个问题只有你能答：{q}' },
  ],
  approval: [
    { title: '🐳 要不要放行？', body: '『{s}』想执行一个操作，等你点头：{q}' },
    { title: '🐳 这个可以做吗？', body: '『{s}』在等你的批准：{q}' },
  ],
  // Several tasks finished within a few seconds of the first one: one notice for all of them.
  completedMany: [
    { title: '🐳 又搞定 {n} 个！', body: '{list}也都做完啦，一起来验收吧' },
    { title: '🐳 连着做完 {n} 个～', body: '{list}都收工了，本鲸今天状态超好' },
  ],
  failed: [
    { title: '🐳 呜…翻车了', body: '『{s}』没做完：{q}　要不要再试一次？' },
    { title: '🐳 沉下去了一下下', body: '『{s}』出了点状况：{q}　鲸鱼在等你救援' },
  ],
}

const FALLBACK = { title: '🐳 DeepSeek Harness', body: '『{s}』{q}' }
/** Session names a merged notice spells out before saying "等 n 个". */
const LIST_MAX = 3

function listOf(sessions, count) {
  const names = sessions.slice(0, LIST_MAX).map(s => `『${s.title || '会话'}』`).join('')
  return sessions.length > LIST_MAX ? `${names}等 ${count} 个任务` : names
}

/**
 * @param {{type: string, seq?: number, title: string, body?: string, count?: number, sessions?: {title: string}[]}} event
 *   `count` + `sessions`: a merged notice for several completions (lib/notices.js).
 * @returns {{title: string, body: string}}
 */
export function speak(event) {
  if (event.type === 'completed' && event.count > 1 && Array.isArray(event.sessions)) {
    const variants = LINES.completedMany
    const line = variants[Math.abs(event.seq ?? 0) % variants.length]
    return { title: line.title.replace('{n}', event.count), body: line.body.replace('{list}', listOf(event.sessions, event.count)) }
  }
  const variants = LINES[event.type] ?? [FALLBACK]
  const line = variants[Math.abs(event.seq ?? 0) % variants.length]
  const session = event.title || '这个会话'
  const detail = (event.body ?? '').trim()
  const body = line.body.replace('{s}', session).replace('{q}', detail)
  // No detail to show: drop a dangling "：" or "　" left behind by the template.
  return { title: line.title, body: body.replace(/[：:]\s*$/u, '').replace(/[：:]\s*　/u, '　').replace(/\s+$/u, '') }
}

/** The same wording as a one-line string (tray tooltips, Windows balloons). */
export function speakLine(event) {
  const { title, body } = speak(event)
  return `${title} ${body}`
}
