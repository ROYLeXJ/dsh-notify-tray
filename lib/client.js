// dsh-notify-tray, browser half (hand-written in DSH's client module format,
// so no build step is needed).
//
// Polls the host's `notify-tray/state` route, shows a native Notification for
// each new event (completed / failed / approval / choice / input) and opens
// the session when a notification — or a tray menu row — is clicked. In the
// desktop app these notifications are OS-native and attributed to
// "DeepSeek Harness".
window.__ModuleLoader__.load({
  id: 'dsh-notify-tray',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var ROUTE = 'notify-tray/state'
    var POLL_MS = 2000
    var SEEN_KEY = 'dsh-notify-tray:seen'

    function mainSessionId(sessions) {
      try {
        var byId = sessions.list.getSnapshot().byId
        for (var id in byId) {
          var row = byId[id]
          if (row && row.retainedBy && (row.retainedBy.mainView || 0) > 0) return row.id
        }
      } catch (e) {}
      return undefined
    }

    // Cross-tab dedupe: one notification per host event, whichever page sees it first.
    function claim(boot, seq) {
      try {
        var raw = localStorage.getItem(SEEN_KEY)
        var seen = raw ? JSON.parse(raw) : {}
        if (seen.boot === boot && seen.seq >= seq) return false
        localStorage.setItem(SEEN_KEY, JSON.stringify({ boot: boot, seq: seq }))
      } catch (e) {}
      return true
    }

    var inject = ['uiWorkspace', 'sessions']

    function apply(ctx) {
      var cursor = -1
      var boot
      var stopped = false
      var timer

      function open(sessionId) {
        try { window.focus() } catch (e) {}
        try { ctx.uiWorkspace.openSession(sessionId) } catch (e) {
          console.warn('[dsh-notify-tray] 打开会话失败', e)
        }
      }

      function show(event, state) {
        if (typeof Notification === 'undefined') return
        if (state.suppressWhenFocused && document.hasFocus() && mainSessionId(ctx.sessions) === event.sessionId) return
        // Without permission the host is not told we listen, so it notifies itself.
        if (Notification.permission !== 'granted') return
        if (!claim(boot, event.seq)) return
        var title = (state.titles[event.type] || 'DeepSeek Harness') + ' · ' + event.title
        var n = new Notification(title, { body: event.body, tag: 'dsh-notify-tray:' + event.seq })
        n.onclick = function () { n.close(); open(event.sessionId) }
      }

      function poll() {
        var granted = typeof Notification !== 'undefined' && Notification.permission === 'granted'
        fetch(ROUTE + '?after=' + cursor + (granted ? '&notify=1' : ''), { headers: { accept: 'application/json' }, cache: 'no-store' })
          .then(function (res) { return res.ok ? res.json() : undefined })
          .then(function (state) {
            if (!state || stopped) return
            // Tray clicks first: the host hands each one out once, even on our first poll.
            for (var j = 0; j < state.focus.length; j += 1) open(state.focus[j])
            // First poll, or the host restarted (new boot id): adopt its cursor without replaying history.
            if (state.boot !== boot) { boot = state.boot; cursor = state.seq; return }
            for (var i = 0; i < state.events.length; i += 1) show(state.events[i], state)
            cursor = Math.max(cursor, state.seq)
          })
          .catch(function () {})
          .then(function () { if (!stopped) timer = setTimeout(poll, POLL_MS) })
      }

      // Browsers only show the permission prompt from a user gesture.
      if (typeof Notification !== 'undefined' && Notification.permission === 'default' && typeof document.addEventListener === 'function') {
        document.addEventListener('click', function () { Notification.requestPermission() }, { once: true })
      }

      poll()
      ctx.effect(function () {
        return function () { stopped = true; clearTimeout(timer) }
      }, 'notify-tray: poll')
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
