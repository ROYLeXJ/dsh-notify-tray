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

    // slots / locale / configForms carry the settings page; the poller only needs the first two.
    var inject = ['uiWorkspace', 'sessions', 'slots', 'locale', 'configForms']

    // ------------------------------------------------------------------------
    // Settings page: the plugin's own page inside DSH's Plugins screen, in the
    // same frame the official "子智能体 / Agent 循环" pages use — a SettingsForm
    // over the `notify-tray` settings namespace (the `.volatile()` fields of
    // lib/index.js Config, served by @deepseek-ai/dsh-settings), grouped into
    // sections with toggles, segmented choices and number fields, one Save.
    // Plain React.createElement, so no build step is needed.
    // ------------------------------------------------------------------------
    function mountSettingsPage(ctx, require) {
      const React = require('react')
      const ui = require('@deepseek-ai/dsh-client-ui-primitives')
      const h = React.createElement

      /** Settings namespace = this plugin's profile entry id (cordis.patch.yml). */
      const NS = 'notify-tray'
      /** Dictionary namespace owned by this page. */
      const LOCALE_NS = 'notify-tray.settings'
      /** The row this page configures: `<package name>#<entry id>`. */
      const ROW_KEY = 'dsh-notify-tray#notify-tray'

      const zh = {
        summary: '小鲸鱼什么时候来找你、状态栏里显示什么、今天的花费怎么算，都在这里调。',
        sectionNotify: '什么时候来找你',
        sectionNotifyHint: '五种事情，每种都可以单独关掉。',
        notifyCompleted: '任务做完了',
        notifyCompletedHint: '「🐳 搞定啦～」',
        notifyChoice: '需要你选一个',
        notifyChoiceHint: '「🐳 该你拍板啦」',
        notifyInput: '需要你写几个字',
        notifyInputHint: '「🐳 等你说话呢」',
        notifyApproval: '需要你点头批准',
        notifyApprovalHint: '「🐳 要不要放行？」',
        notifyFailed: '翻车了',
        notifyFailedHint: '「🐳 呜…翻车了」',
        sectionHow: '怎么来找你',
        channel: '通知从哪里弹',
        channelAuto: '自动',
        channelClient: '只用窗口',
        channelSystem: '只用系统',
        channelBoth: '都弹',
        channelOff: '不弹',
        channelHint: '自动：有 DSH 窗口时由窗口弹（图标是 DSH 的），没有窗口时由系统弹。',
        suppressWhenFocused: '我正盯着这个会话时就别弹了',
        suppressWhenFocusedHint: '关掉后，哪怕你正看着它跑完也会弹一条。',
        sound: '带提示音',
        soundHint: 'macOS 系统通道的「叮」一声。',
        sectionTray: '状态栏里的小鲸鱼',
        tray: '显示状态栏小鲸鱼',
        trayHint: '改了要重启 DSH 才生效。',
        titleStyle: '鲸鱼旁边显示什么',
        titleText: '文字',
        titleCount: '只有数字',
        titleIcon: '只有鲸鱼',
        titleStyleHint: '文字：待处理 1 / 运行中 2；空闲时什么都不显示。',
        showSpendInTitle: '旁边也带上今日花费',
        showSpendInTitleHint: '例如「运行中 1 · ¥1.82」。',
        errorHoldMinutes: '失败后「×」保持几分钟',
        errorHoldMinutesHint: '0 表示任务一失败就只记在菜单里，鲸鱼脸上不挂「×」。',
        sectionSpend: '今天花了多少钱',
        spendSource: '花费怎么算',
        spendAuto: '自动',
        spendBalance: '余额扣费',
        spendEstimate: '价格表估算',
        spendSourceHint: '自动：登录了 DeepSeek 账户就看余额的真实扣费，否则按 cordis.patch.yml 里的 prices 价格表估算。',
        currency: '币种',
        balancePollMinutes: '余额几分钟刷新一次',
        balancePollMinutesHint: '每轮任务结束后 5 秒也会额外刷新一次。',
        overridden: '已修改',
        reset: '恢复默认',
        readOnly: '本部署的设置为只读。',
        unavailable: '小鲸鱼还没加载好，暂时不能配置。',
        save: '保存',
        saving: '保存中…',
        saveFailed: '没保存成功，值还留着，改改再试。',
        invalidNumber: '请填数字；留空表示用默认值。',
      }
      const en = {
        summary: 'When the whale comes to find you, what the status bar shows, and how today\'s spend is counted.',
        sectionNotify: 'When to notify you',
        sectionNotifyHint: 'Five kinds of events, each can be switched off.',
        notifyCompleted: 'A task finished',
        notifyCompletedHint: '"🐳 All done~"',
        notifyChoice: 'A choice is needed',
        notifyChoiceHint: '"🐳 Your call"',
        notifyInput: 'Some text is needed',
        notifyInputHint: '"🐳 Waiting for your words"',
        notifyApproval: 'An approval is needed',
        notifyApprovalHint: '"🐳 May I?"',
        notifyFailed: 'A task failed',
        notifyFailedHint: '"🐳 Oops…"',
        sectionHow: 'How to notify you',
        channel: 'Notification channel',
        channelAuto: 'Auto',
        channelClient: 'Window only',
        channelSystem: 'System only',
        channelBoth: 'Both',
        channelOff: 'Off',
        channelHint: 'Auto: the DSH window notifies while it is open (with the DSH icon); the OS does when no window is around.',
        suppressWhenFocused: 'Stay quiet while I am looking at that session',
        suppressWhenFocusedHint: 'Off: notify even when you watch it finish.',
        sound: 'Play a sound',
        soundHint: 'The macOS system channel\'s chime.',
        sectionTray: 'The whale in the status bar',
        tray: 'Show the status-bar whale',
        trayHint: 'Takes effect after restarting DSH.',
        titleStyle: 'Text beside the whale',
        titleText: 'Words',
        titleCount: 'Count only',
        titleIcon: 'Whale only',
        titleStyleHint: 'Words: 待处理 1 / 运行中 2; nothing while idle.',
        showSpendInTitle: 'Append today\'s spend',
        showSpendInTitleHint: 'e.g. "运行中 1 · ¥1.82".',
        errorHoldMinutes: 'Minutes the "×" stays after a failure',
        errorHoldMinutesHint: '0: failures are only listed in the menu.',
        sectionSpend: 'Today\'s spend',
        spendSource: 'How spend is counted',
        spendAuto: 'Auto',
        spendBalance: 'Balance drops',
        spendEstimate: 'Price table',
        spendSourceHint: 'Auto: real balance drops when signed in to DeepSeek, otherwise the `prices` table in cordis.patch.yml.',
        currency: 'Currency',
        balancePollMinutes: 'Balance refresh interval (minutes)',
        balancePollMinutesHint: 'Also refreshed 5 s after every finished turn.',
        overridden: 'Changed',
        reset: 'Reset to default',
        readOnly: 'This deployment stores settings read-only.',
        unavailable: 'The whale is not loaded yet, so it cannot be configured right now.',
        save: 'Save',
        saving: 'Saving…',
        saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
        invalidNumber: 'Enter a number, or leave blank to use the default.',
      }

      // ---- field specs for SettingsFormModel ---------------------------------------
      // The model stages text; these say how a field's value becomes text and back.
      const boolField = field => ({
        field,
        format: v => (v === true ? 'on' : v === false ? 'off' : ''),
        parse: text => (text === '' ? { kind: 'clear' } : { kind: 'set', value: text === 'on' }),
      })
      const choiceField = field => ({
        field,
        format: v => (typeof v === 'string' ? v : ''),
        parse: text => (text === '' ? { kind: 'clear' } : { kind: 'set', value: text }),
      })
      const BOOLS = ['notifyCompleted', 'notifyChoice', 'notifyInput', 'notifyApproval', 'notifyFailed', 'suppressWhenFocused', 'sound', 'tray', 'showSpendInTitle']
      const CHOICES = ['channel', 'titleStyle', 'spendSource', 'currency']
      const NUMBERS = ['errorHoldMinutes', 'balancePollMinutes']
      const FIELDS = [...BOOLS, ...CHOICES, ...NUMBERS]

      class Controller {
        constructor(scope) {
          this.form = new ui.SettingsFormModel(scope, [
            ...BOOLS.map(boolField),
            ...CHOICES.map(choiceField),
            ...NUMBERS.map(f => ui.settingsNumberField(f)),
          ])
          this.store = this.form.bind(() => this.projection())
        }

        projection() {
          const fields = {}
          for (const f of FIELDS) fields[f] = this.form.field(f)
          return { ...this.form.shell(), fields }
        }

        inject() {
          return { hooks: { notifyTray: this.store }, ...this.form.actions() }
        }

        dispose() { this.form.dispose() }
      }

      // ---- presentation -------------------------------------------------------------------
      const S = {
        section: { marginTop: 28 },
        sectionTitle: { fontSize: 15, fontWeight: 600, margin: '0 0 4px' },
        sectionHint: { margin: '0 0 12px', opacity: 0.65, fontSize: 13 },
        row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '10px 0', borderBottom: '1px solid color-mix(in srgb, currentColor 10%, transparent)' },
        rowText: { minWidth: 0 },
        label: { fontSize: 14 },
        hint: { margin: '2px 0 0', opacity: 0.6, fontSize: 12 },
        badges: { display: 'inline-flex', alignItems: 'center', gap: 8, marginLeft: 8, fontSize: 12 },
        reset: { background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'inherit', textDecoration: 'underline', opacity: 0.7, fontSize: 12 },
        control: { flex: 'none' },
        grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0 32px' },
      }

      function Overridden({ t, field, disabled, onReset }) {
        if (!field.overridden) return null
        return h('span', { style: S.badges },
          h(ui.Tag, { tone: 'neutral' }, t('overridden')),
          h('button', { type: 'button', style: S.reset, disabled, onClick: onReset }, t('reset')))
      }

      function ToggleRow({ t, name, field, disabled, edit, resetField }) {
        return h('div', { style: S.row },
          h('div', { style: S.rowText },
            h('div', { style: S.label }, t(name), h(Overridden, { t, field, disabled, onReset: () => resetField(name) })),
            h('p', { style: S.hint }, t(`${name}Hint`))),
          h('div', { style: S.control },
            h(ui.Switch, { checked: field.text === 'on', disabled, label: t(name), onChange: next => edit(name, next ? 'on' : 'off') })))
      }

      function ChoiceRow({ t, name, field, options, disabled, edit, resetField, hint }) {
        return h('div', { style: { ...S.row, flexWrap: 'wrap' } },
          h('div', { style: S.rowText },
            h('div', { style: S.label }, t(name), h(Overridden, { t, field, disabled, onReset: () => resetField(name) })),
            hint ? h('p', { style: S.hint }, t(hint)) : null),
          h('div', { style: S.control },
            h(ui.SegmentedControl, {
              id: `notify-tray-${name}`,
              label: t(name),
              value: field.text,
              disabled,
              options: options.map(([value, key]) => ({ value, label: t(key) })),
              onChange: value => edit(name, value),
            })))
      }

      function NumberField({ t, name, field, disabled, edit, resetField }) {
        return h(ui.SettingsValueField, {
          id: `notify-tray-${name}`,
          label: t(name),
          hint: t(`${name}Hint`),
          overriddenLabel: t('overridden'),
          resetLabel: t('reset'),
          invalidLabel: t('invalidNumber'),
          numeric: true,
          disabled,
          text: field.text,
          overridden: field.overridden,
          invalid: field.invalid,
          onEdit: text => edit(name, text),
          onReset: () => resetField(name),
        })
      }

      function Section({ title, hint, children }) {
        return h('section', { style: S.section },
          h('h4', { style: S.sectionTitle }, title),
          hint ? h('p', { style: S.sectionHint }, hint) : null,
          children)
      }

      function Page(props) {
        const { t } = props
        const state = props.useNotifyTray(snapshot => snapshot)
        if (props.view === 'summary') return t('summary')
        const disabled = !state.writable
        const common = { t, disabled, edit: props.edit, resetField: props.resetField }
        const f = state.fields
        const toggle = name => h(ToggleRow, { key: name, name, field: f[name], ...common })
        return h(ui.SettingsForm, {
          labels: { unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') },
          state,
          onSave: props.save,
          onDiscard: props.discard,
        },
        h(Section, { title: t('sectionNotify'), hint: t('sectionNotifyHint') },
          ['notifyCompleted', 'notifyChoice', 'notifyInput', 'notifyApproval', 'notifyFailed'].map(toggle)),
        h(Section, { title: t('sectionHow') },
          h(ChoiceRow, { name: 'channel', field: f.channel, hint: 'channelHint', ...common, options: [['auto', 'channelAuto'], ['client', 'channelClient'], ['system', 'channelSystem'], ['both', 'channelBoth'], ['off', 'channelOff']] }),
          toggle('suppressWhenFocused'),
          toggle('sound')),
        h(Section, { title: t('sectionTray') },
          toggle('tray'),
          h(ChoiceRow, { name: 'titleStyle', field: f.titleStyle, hint: 'titleStyleHint', ...common, options: [['text', 'titleText'], ['count', 'titleCount'], ['icon', 'titleIcon']] }),
          toggle('showSpendInTitle'),
          h('div', { style: { marginTop: 12 } }, h(NumberField, { name: 'errorHoldMinutes', field: f.errorHoldMinutes, ...common }))),
        h(Section, { title: t('sectionSpend') },
          h(ChoiceRow, { name: 'spendSource', field: f.spendSource, hint: 'spendSourceHint', ...common, options: [['auto', 'spendAuto'], ['balance', 'spendBalance'], ['estimate', 'spendEstimate']] }),
          h(ChoiceRow, { name: 'currency', field: f.currency, ...common, options: [['CNY', 'CNY'], ['USD', 'USD']] }),
          h('div', { style: { marginTop: 12 } }, h(NumberField, { name: 'balancePollMinutes', field: f.balancePollMinutes, ...common }))))
      }

      // ---- mount ------------------------------------------------------------------------------
      const t = ctx.locale.bind(LOCALE_NS)
      ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh: { ...zh, CNY: '¥ 人民币', USD: '$ 美元' }, en: { ...en, CNY: '¥ CNY', USD: '$ USD' } }), 'notify-tray: settings dictionaries')
      const card = new Controller(ctx.configForms.get(NS))
      ctx.effect(() => () => card.dispose(), 'notify-tray: settings form')
      ctx.effect(() => ctx.configForms.whileServed([NS], () => ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
        name: 'plugins.row.config',
        key: ROW_KEY,
        locale: LOCALE_NS,
        inject: () => card.inject(),
      }, Page))), 'notify-tray: settings page')
      void t
    }


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
        var display = event.display || { title: (state.titles[event.type] || 'DeepSeek Harness') + ' · ' + event.title, body: event.body }
        var n = new Notification(display.title, { body: display.body, tag: 'dsh-notify-tray:' + event.seq })
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

      if (ctx.slots && ctx.locale && ctx.configForms) {
        try { mountSettingsPage(ctx, require) } catch (e) { console.warn('[dsh-notify-tray] 设置页挂载失败', e) }
      }
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
