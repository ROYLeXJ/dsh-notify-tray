/**
 * Notifications: the user's per-type switches, then the notice queue
 * (lib/notices.js: one notification per session, "needs you" taken back once
 * answered, bursts of completions folded), then the channel. The DSH window
 * picks notices up from `GET notify-tray/state`; when no window is listening
 * (or the channel says so) the host shows them through the OS.
 */
import { join } from 'node:path'
import { DONE_HOLD_MS } from '../format.js'
import { Notices } from '../notices.js'
import { consumeClicks, systemNotify, systemWithdraw, terminalNotifier } from '../system.js'
import { speak } from '../voice.js'

/** A window that polled within this window counts as "listening". */
export const CLIENT_FRESH_MS = 8000
/** The whale's colour on a notification of each kind. */
const EVENT_STATE = { completed: 'done', failed: 'error', approval: 'attention', choice: 'attention', input: 'attention' }
export const EVENT_SWITCH = {
  completed: 'notifyCompleted',
  failed: 'notifyFailed',
  approval: 'notifyApproval',
  choice: 'notifyChoice',
  input: 'notifyInput',
}

export function setupNotifications(ctx, host) {
  const { cfg, logger, tracker, debug } = host
  const burstMs = Number(process.env.DSH_NOTIFY_TRAY_BURST_MS)
  const notices = new Notices(Number.isFinite(burstMs) && burstMs >= 0 ? { windowMs: burstMs } : {})
  host.notices = notices
  ctx.effect(() => () => notices.dispose(), 'notify-tray: notice queue')

  // A clicked macOS notification (sent through terminal-notifier) drops a file
  // named after its session here; the host opens that session.
  const clickDir = join(host.dir, 'clicks')
  if (process.platform === 'darwin') {
    ctx.effect(() => {
      consumeClicks(clickDir) // stale clicks from an earlier run open nothing
      const timer = setInterval(() => {
        if (!terminalNotifier()) return
        for (const id of consumeClicks(clickDir)) host.onAction(`open:${id}`)
      }, 1000)
      return () => clearInterval(timer)
    }, 'notify-tray: notification clicks')
  }

  tracker.onEvent(event => {
    debug('event', event)
    // The celebration / error pose expires on its own: refresh once it does.
    if (event.type === 'completed') setTimeout(host.refresh, DONE_HOLD_MS + 200).unref?.()
    if (event.type === 'failed') setTimeout(host.refresh, Math.max(0, cfg.errorHoldMinutes) * 60_000 + 200).unref?.()
    if (cfg[EVENT_SWITCH[event.type]]) notices.push(event)
  })
  // A question answered, an approval decided, a turn over: its "needs you" notification goes.
  tracker.onChange(() => notices.settle(tracker.waitingSessions()))

  /** Keys the OS currently shows a notification of ours for. */
  const shownBySystem = new Set()
  const systemSide = () => {
    const clientListening = Date.now() - host.lastClientPoll < CLIENT_FRESH_MS
    const channel = cfg.channel
    return channel === 'system' || channel === 'both' || (channel === 'auto' && !clientListening)
  }
  notices.onNotice(notice => {
    if (notice.kind === 'withdraw') {
      if (!shownBySystem.delete(notice.key)) return
      systemWithdraw(notice.key).then(ok => debug('system withdraw', notice.key, ok)).catch(() => {})
      return
    }
    const side = systemSide()
    debug('deliver', { channel: cfg.channel, systemSide: side })
    if (!side) return // the window picks it up from the notice queue
    const said = speak(notice)
    if (process.platform === 'win32') host.toastPending = { sessionId: notice.sessionId, at: Date.now() }
    shownBySystem.add(notice.key)
    systemNotify({
      title: said.title,
      body: said.body,
      sound: cfg.sound,
      webOrigin: host.webOrigin,
      state: EVENT_STATE[notice.type],
      iconDir: join(host.dir, 'icons'),
      sessionId: notice.sessionId,
      key: notice.key,
      clickDir,
      onClick: () => host.onAction(`open:${notice.sessionId}`),
    }).then(ok => debug('system notify', ok)).catch(error => logger.warn('系统通知失败', error))
  })
}
