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
      /** The package page (`plugins.bundle.config` is keyed by package name). */
      const PACKAGE_KEY = 'dsh-notify-tray'
      const CATALOG_ROUTE = 'notify-tray/catalog'
      const REFRESH_ROUTE = 'notify-tray/refresh'
      const TRAY_ROUTE = 'notify-tray/tray'
      /** How often the page re-reads the host's live state (current model, plan quota). */
      const LIVE_MS = 5000

      // ---- which OS this is --------------------------------------------------------
      // The host reports `process.platform` in its state (authoritative: with
      // `dsh web` the browser may run elsewhere); until that arrives the
      // browser's own platform is the guess. Each OS only gets what it has:
      // Windows has no status bar, so no status-bar section at all; only the
      // macOS menu bar shows text beside the whale.
      function normalizePlatform(p) {
        if (p === 'darwin' || p === 'win32') return p
        if (p === 'linux' || p === 'freebsd' || p === 'openbsd') return 'linux'
        return undefined
      }
      function guessPlatform() {
        try {
          const nav = window.navigator || {}
          const text = String((nav.userAgentData && nav.userAgentData.platform) || nav.platform || nav.userAgent || '')
          // Mac first: "Darwin" contains "win".
          if (/mac|iphone|ipad|darwin/iu.test(text)) return 'darwin'
          if (/win/iu.test(text)) return 'win32'
          if (/linux|x11|bsd|cros/iu.test(text)) return 'linux'
        } catch (e) {}
        return undefined
      }
      /** What each OS shows; an unknown OS shows everything. */
      const FEATURES = {
        darwin: { tray: true, menuBarTitle: true },
        linux: { tray: true, menuBarTitle: false },
        win32: { tray: false, menuBarTitle: false },
      }
      const ALL_FEATURES = { tray: true, menuBarTitle: true }
      /** A translator that prefers `<key>_<platform>` when this page defines one. */
      function platformT(t, platform) {
        if (!platform) return t
        return key => (zh[`${key}_${platform}`] !== undefined ? t(`${key}_${platform}`) : t(key))
      }

      const zh = {
        summary: '任务做完或需要你时提醒你，状态栏里看进度和花费。',
        summary_win32: '任务做完或需要你时弹通知，顺便算算今天花了多少。Windows 没有状态栏，小鲸鱼只用通知来找你。',
        sectionNotify: '提醒我',
        notifyWhen: '这些时候弹通知',
        notifyCompleted: '做完了',
        notifyChoice: '要我选',
        notifyInput: '要我写字',
        notifyApproval: '要我批准',
        notifyFailed: '翻车了',
        sound: '带提示音',
        soundHint: '系统通知响一声。',
        soundHint_darwin: 'macOS 系统通知的「叮」一声。',
        soundHint_win32: 'Windows 系统通知（右下角弹窗）的提示音。',
        soundHint_linux: '系统通知的提示音（要桌面环境支持）。',

        sectionTray: '状态栏小鲸鱼',
        tray: '显示小鲸鱼',
        trayHint: '保存后立即生效。',
        trayHint_linux: 'UOS / Deepin / 麒麟 / KDE 自带托盘；GNOME 要装 AppIndicator 扩展。保存后立即生效。',
        trayHiddenNote: '状态栏图标已从它的菜单里隐藏。',
        trayShowAgain: '重新显示状态栏图标',
        trayShowing: '正在显示…',
        trayFailedNote: '状态栏图标没能启动（没有托盘宿主或 D-Bus？），只保留通知。',
        trayRetry: '重试',
        titleStyle: '鲸鱼旁边显示',
        titleText: '文字',
        titleCount: '数字',
        titleIcon: '不显示',
        titleStyleHint_text: '例：🐳 待处理 1；空闲时什么都不显示。',
        titleStyleHint_count: '例：🐳 1',
        titleStyleHint_icon: '只有鲸鱼，状态看它的样子。',

        sectionMoney: '花费与套餐',
        today: '今天',
        spendNone: '还没有花费记录',
        currentModelNone: '还没看到请求，先聊一句就知道了。',
        perMillion: '每百万',
        noListedPrice: '目录里没有这个模型的价格，可在「高级设置」里填自定义单价。',
        catalogOff: 'DSH 自带的模型目录没找到，只有插件内置价可用。可设置环境变量 DSH_NOTIFY_TRAY_PI_AI 指向 DSH 的安装目录后重启。',
        myPlan: '我的套餐',
        myPlanHint: '选好后价格、额度自动填好。',
        planProvider: '平台',
        providerNone: '不设置',
        providerCustom: '自定义',
        planId: '套餐',
        planCustom: '手填 / 其他套餐',
        pricingPage: '价格页',
        consolePage: '用量页',
        autoQuota: '自动查剩余额度',
        autoQuotaNone: '这家平台没有公开的额度接口，剩余额度可在下面手填。',
        autoQuotaCustom: '自定义平台：在「高级设置」里填一个返回 JSON 的额度查询地址。',
        planApiKeyEnv: 'API Key 引用',
        planApiKeyEnvHint: '填 DSH「模型」页里保存密钥时用的名字（或同名环境变量），只在查额度时读取。',
        refreshNow: '刷新',
        refreshing: '刷新中…',
        updatedAt: '更新',
        fetchFailed: '获取失败',
        noFetchYet: '还没获取过',
        resetsAt: '重置',
        remainingShort: '剩余',
        planDetails: '手动改套餐信息',
        planDetailsHint: '名称、价格、周期、余额、重置时间',
        planName: '套餐名',
        planNameHint: '留空用预设名。',
        planPrice: '价格',
        planPriceHint: '留空用预设价；0 表示按量付费。',
        planPeriod: '周期',
        periodMonth: '每月',
        periodYear: '每年',
        periodWeek: '每周',
        periodOnce: '一次性',
        periodFree: '按量',
        planCurrency: '套餐币种',
        planQuota: '额度说明',
        planQuotaHint: '例如「每 5 小时 ≈ 1000 次」，留空用预设。',
        planBalance: '套餐余额（手填）',
        planBalanceHint: '预付费 / 充值余额；能从接口拿到时留空即可。',
        planRemaining: '剩余额度（手填）',
        planRemainingHint: '例如「68%」「1200 次」，手填优先于接口。',
        planResetAt: '下次重置',
        planResetAtHint: '例如「今晚 20:00」「每周一」。',

        advanced: '高级设置',
        advancedHint: '通知通道、花费算法、自定义单价、刷新间隔等，一般不用改。',
        advancedChanged: '已改 {n} 项',
        groupNotify: '通知',
        channel: '通知从哪里弹',
        channelAuto: '自动',
        channelClient: '只用窗口',
        channelSystem: '只用系统',
        channelBoth: '都弹',
        channelOff: '不弹',
        channelHint: '自动：开着 DSH 窗口就由窗口弹，否则由系统弹。',
        suppressWhenFocused: '正看着这个会话时不弹',
        suppressWhenFocusedHint: '关掉后，哪怕你正看着它跑完也会弹一条。',
        groupTray: '状态栏',
        showSpendInTitle: '鲸鱼旁边带上今日花费',
        showSpendInTitleHint: '例：运行中 1 · ¥1.82',
        errorHoldMinutes: '失败后鲸鱼保持「×」几分钟',
        errorHoldMinutesHint: '0 表示只记在菜单里。',
        errorHoldMinutes_linux: '失败后鲸鱼保持红色几分钟',
        groupSpend: '花费',
        spendSource: '花费怎么算',
        spendAuto: '自动',
        spendBalance: '余额扣费',
        spendEstimate: '按单价估算',
        spendSourceHint: '自动：登录了 DeepSeek 账户看余额扣费，否则按单价估算。',
        currency: '显示币种',
        balancePollMinutes: '账户余额几分钟刷新一次',
        balancePollMinutesHint: '每轮任务结束后 5 秒也会刷新一次。',
        groupPrice: '单价（估算用）',
        priceSource: '估算用哪个价',
        priceAuto: '自动',
        priceCatalog: '只用目录价',
        priceCustom: '只用自定义价',
        priceSourceHint: '自动：价格表 → 自定义价 → 目录价 → 内置价。',
        fillCustom: '填入目录价',
        customInput: '输入（未命中缓存）',
        customInputHint: '每百万 token，留空不用',
        customCacheRead: '输入（缓存命中）',
        customCacheReadHint: '留空按输入价',
        customOutput: '输出',
        customOutputHint: '每百万 token',
        customPriceCurrency: '自定义单价币种',
        exchangeRate: '汇率：1 美元 = ? 人民币',
        exchangeRateHint: '目录价是美元，显示人民币时按这个换算。',
        groupQuota: '额度刷新',
        planAutoQuota: '自动刷新套餐额度',
        planAutoQuotaHint: '按下面的间隔定时查询；状态栏菜单里也能手动刷新。',
        planAutoQuotaHint_win32: '按下面的间隔定时查询；上面的「刷新」可以手动查。',
        quotaPollMinutes: '额度几分钟刷新一次',
        quotaPollMinutesHint: '',
        planQuotaUrl: '额度查询地址',
        planQuotaUrlHint: '留空用预设地址。',

        srcTable: '价格表',
        srcCustom: '自定义价',
        srcCatalog: '目录价',
        srcStatic: '内置价',
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
        summary: 'Notifies you when a task finishes or needs you; the status bar shows progress and spend.',
        summary_win32: 'Notifies you when a task finishes or needs you, and keeps count of today\'s spend. Windows has no status bar, so the whale reaches you through notifications only.',
        sectionNotify: 'Notify me',
        notifyWhen: 'Send a notification when',
        notifyCompleted: 'A task finished',
        notifyChoice: 'A choice is needed',
        notifyInput: 'Text is needed',
        notifyApproval: 'Approval is needed',
        notifyFailed: 'A task failed',
        sound: 'Play a sound',
        soundHint: 'System notifications make a sound.',
        soundHint_darwin: 'The macOS notification chime.',
        soundHint_win32: 'The Windows notification (toast) sound.',
        soundHint_linux: 'The notification sound, where the desktop supports one.',

        sectionTray: 'Status-bar whale',
        tray: 'Show the whale',
        trayHint: 'Takes effect as soon as you save.',
        trayHint_linux: 'Built into UOS / Deepin / Kylin / KDE; GNOME needs the AppIndicator extension. Takes effect as soon as you save.',
        trayHiddenNote: 'The status-bar icon was hidden from its own menu.',
        trayShowAgain: 'Show the status-bar icon again',
        trayShowing: 'Showing…',
        trayFailedNote: 'The status-bar icon could not start (no tray host or D-Bus?); notifications still work.',
        trayRetry: 'Retry',
        titleStyle: 'Beside the whale',
        titleText: 'Words',
        titleCount: 'Count',
        titleIcon: 'Nothing',
        titleStyleHint_text: 'e.g. 🐳 待处理 1; nothing while idle.',
        titleStyleHint_count: 'e.g. 🐳 1',
        titleStyleHint_icon: 'Just the whale; its pose tells the state.',

        sectionMoney: 'Spend & plan',
        today: 'Today',
        spendNone: 'No spend recorded yet',
        currentModelNone: 'No request seen yet — send one message and it shows up here.',
        perMillion: 'per million',
        noListedPrice: 'No catalog price for this model; set a custom price under Advanced.',
        catalogOff: 'DSH\'s bundled model catalog was not found; only the plugin\'s built-in prices apply. Point the DSH_NOTIFY_TRAY_PI_AI environment variable at the DSH install directory and restart.',
        myPlan: 'My plan',
        myPlanHint: 'Price and quota are filled in from the preset.',
        planProvider: 'Provider',
        providerNone: 'None',
        providerCustom: 'Custom',
        planId: 'Plan',
        planCustom: 'Other / manual',
        pricingPage: 'Pricing page',
        consolePage: 'Usage page',
        autoQuota: 'Fetch remaining quota',
        autoQuotaNone: 'This provider has no public quota endpoint; type the remaining quota below.',
        autoQuotaCustom: 'Custom provider: set a JSON quota URL under Advanced.',
        planApiKeyEnv: 'API key reference',
        planApiKeyEnvHint: 'The name the key was saved under on DSH\'s Models page (or a same-named environment variable); read only to query quota.',
        refreshNow: 'Refresh',
        refreshing: 'Refreshing…',
        updatedAt: 'updated',
        fetchFailed: 'Fetch failed',
        noFetchYet: 'Not fetched yet',
        resetsAt: 'resets',
        remainingShort: 'Remaining',
        planDetails: 'Edit plan details',
        planDetailsHint: 'name, price, period, balance, reset time',
        planName: 'Plan name',
        planNameHint: 'Blank: preset name.',
        planPrice: 'Price',
        planPriceHint: 'Blank: preset price; 0 means pay-as-you-go.',
        planPeriod: 'Period',
        periodMonth: 'Monthly',
        periodYear: 'Yearly',
        periodWeek: 'Weekly',
        periodOnce: 'One-off',
        periodFree: 'Pay-as-you-go',
        planCurrency: 'Plan currency',
        planQuota: 'Quota description',
        planQuotaHint: 'e.g. "≈1000 requests per 5 h"; blank: preset.',
        planBalance: 'Plan balance (manual)',
        planBalanceHint: 'Prepaid / top-up balance; leave blank when the API supplies it.',
        planRemaining: 'Remaining quota (manual)',
        planRemainingHint: 'e.g. "68%" or "1200 requests"; a typed value wins over the API.',
        planResetAt: 'Next reset',
        planResetAtHint: 'e.g. "20:00 tonight", "Mondays".',

        advanced: 'Advanced',
        advancedHint: 'Notification channel, spend method, custom prices, refresh intervals — rarely needed.',
        advancedChanged: '{n} changed',
        groupNotify: 'Notifications',
        channel: 'Notification channel',
        channelAuto: 'Auto',
        channelClient: 'Window only',
        channelSystem: 'System only',
        channelBoth: 'Both',
        channelOff: 'Off',
        channelHint: 'Auto: the DSH window notifies while it is open; the OS does otherwise.',
        suppressWhenFocused: 'Stay quiet while I am looking at that session',
        suppressWhenFocusedHint: 'Off: notify even when you watch it finish.',
        groupTray: 'Status bar',
        showSpendInTitle: 'Add today\'s spend beside the whale',
        showSpendInTitleHint: 'e.g. 运行中 1 · ¥1.82',
        errorHoldMinutes: 'Minutes the "×" stays after a failure',
        errorHoldMinutesHint: '0: failures are only listed in the menu.',
        errorHoldMinutes_linux: 'Minutes the whale stays red after a failure',
        groupSpend: 'Spend',
        spendSource: 'How spend is counted',
        spendAuto: 'Auto',
        spendBalance: 'Balance drops',
        spendEstimate: 'Price estimate',
        spendSourceHint: 'Auto: real balance drops when signed in to DeepSeek, otherwise unit prices.',
        currency: 'Currency',
        balancePollMinutes: 'Balance refresh interval (minutes)',
        balancePollMinutesHint: 'Also refreshed 5 s after every finished turn.',
        groupPrice: 'Unit prices (for estimates)',
        priceSource: 'Which price to use',
        priceAuto: 'Auto',
        priceCatalog: 'Catalog only',
        priceCustom: 'Custom only',
        priceSourceHint: 'Auto: price table → custom price → catalog → built-in prices.',
        fillCustom: 'Copy catalog price',
        customInput: 'Input (cache miss)',
        customInputHint: 'per million tokens; blank: unused',
        customCacheRead: 'Input (cache hit)',
        customCacheReadHint: 'Blank: same as input',
        customOutput: 'Output',
        customOutputHint: 'per million tokens',
        customPriceCurrency: 'Custom price currency',
        exchangeRate: 'Rate: 1 USD = ? CNY',
        exchangeRateHint: 'Catalog prices are USD; used when displaying CNY.',
        groupQuota: 'Quota refresh',
        planAutoQuota: 'Refresh plan quota automatically',
        planAutoQuotaHint: 'Polled at the interval below; the tray menu can refresh by hand too.',
        planAutoQuotaHint_win32: 'Polled at the interval below; "Refresh" above fetches by hand.',
        quotaPollMinutes: 'Quota refresh interval (minutes)',
        quotaPollMinutesHint: '',
        planQuotaUrl: 'Quota URL',
        planQuotaUrlHint: 'Blank: preset URL.',

        srcTable: 'price table',
        srcCustom: 'custom',
        srcCatalog: 'catalog',
        srcStatic: 'built-in',
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
      const textField = field => (typeof ui.settingsTextField === 'function' ? ui.settingsTextField(field) : {
        field,
        format: v => (typeof v === 'string' ? v : ''),
        parse: text => (text.trim() === '' ? { kind: 'clear' } : { kind: 'set', value: text.trim() }),
      })
      const BOOLS = ['notifyCompleted', 'notifyChoice', 'notifyInput', 'notifyApproval', 'notifyFailed', 'suppressWhenFocused', 'sound', 'tray', 'showSpendInTitle', 'planAutoQuota']
      const CHOICES = ['channel', 'titleStyle', 'spendSource', 'currency', 'priceSource', 'customPriceCurrency', 'planPeriod', 'planCurrency']
      const NUMBERS = ['errorHoldMinutes', 'balancePollMinutes', 'customInput', 'customCacheRead', 'customOutput', 'exchangeRate', 'planPrice', 'planBalance', 'quotaPollMinutes']
      const TEXTS = ['planProvider', 'planId', 'planName', 'planQuota', 'planRemaining', 'planResetAt', 'planApiKeyEnv', 'planQuotaUrl']
      const FIELDS = [...BOOLS, ...CHOICES, ...NUMBERS, ...TEXTS]
      /** The five "notify me when" switches, shown as one row of checkboxes. */
      const NOTIFY_FIELDS = ['notifyCompleted', 'notifyChoice', 'notifyInput', 'notifyApproval', 'notifyFailed']
      /** Fields behind the "Advanced" fold (counted for its "n changed" tag). */
      const ADVANCED_FIELDS = ['channel', 'suppressWhenFocused', 'showSpendInTitle', 'errorHoldMinutes', 'spendSource', 'currency', 'balancePollMinutes', 'priceSource', 'customInput', 'customCacheRead', 'customOutput', 'customPriceCurrency', 'exchangeRate', 'planAutoQuota', 'quotaPollMinutes', 'planQuotaUrl']
      const TRAY_FIELDS = ['showSpendInTitle', 'errorHoldMinutes']
      /** Plan fields a preset fills in; switching provider clears them. */
      const PRESET_FIELDS = ['planId', 'planName', 'planPrice', 'planCurrency', 'planPeriod', 'planQuota', 'planQuotaUrl']

      class Controller {
        constructor(scope) {
          this.form = new ui.SettingsFormModel(scope, [
            ...BOOLS.map(boolField),
            ...CHOICES.map(choiceField),
            ...NUMBERS.map(f => ui.settingsNumberField(f)),
            ...TEXTS.map(textField),
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

      // ---- live data: catalog once, host state while the page is open ------------------
      const live = { catalog: undefined, state: undefined, listeners: new Set() }
      /** Which folds are open; kept while the page is closed and reopened. */
      const open = { plan: false, advanced: false }
      function useOpen(key) {
        const [, bump] = React.useState(0)
        return [open[key], () => { open[key] = !open[key]; bump(n => n + 1) }]
      }
      function publishLive() { for (const fn of live.listeners) fn() }
      function fetchJson(url, init) {
        return fetch(url, { headers: { accept: 'application/json' }, cache: 'no-store', ...init }).then(res => (res.ok ? res.json() : undefined))
      }
      function loadCatalog() {
        if (live.catalog) return
        fetchJson(CATALOG_ROUTE).then(body => { if (body) { live.catalog = body; publishLive() } }).catch(() => {})
      }
      function loadState() {
        return fetchJson(ROUTE + '?after=-2').then(body => { if (body) { live.state = body; publishLive() } }).catch(() => {})
      }
      // Test seam: lets a test drive the loaders without React effects.
      const currentPlatform = () => normalizePlatform(live.state && live.state.platform) || guessPlatform()
      exports.__settingsLive = { live, open, loadCatalog, loadState, currentPlatform }
      function useLive() {
        const [, bump] = React.useState(0)
        React.useEffect(() => {
          const fn = () => bump(n => n + 1)
          live.listeners.add(fn)
          loadCatalog()
          loadState()
          const timer = setInterval(loadState, LIVE_MS)
          return () => { live.listeners.delete(fn); clearInterval(timer) }
        }, [])
        return live
      }

      // ---- presentation -------------------------------------------------------------------
      const S = {
        section: { marginTop: 28 },
        sectionTitle: { fontSize: 15, fontWeight: 600, margin: '0 0 4px' },
        row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '10px 0', borderBottom: '1px solid color-mix(in srgb, currentColor 10%, transparent)' },
        rowText: { minWidth: 0 },
        label: { fontSize: 14 },
        hint: { margin: '2px 0 0', opacity: 0.6, fontSize: 12 },
        badges: { display: 'inline-flex', alignItems: 'center', gap: 8, marginLeft: 8, fontSize: 12 },
        reset: { background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'inherit', textDecoration: 'underline', opacity: 0.7, fontSize: 12 },
        control: { flex: 'none' },
        grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px 16px', marginTop: 12 },
        card: { border: '1px solid var(--dsw-alias-border-l3, color-mix(in srgb, currentColor 12%, transparent))', borderRadius: 'var(--dsw-radius-lg, 10px)', padding: '12px 14px', margin: '12px 0', fontSize: 13, lineHeight: '20px' },
        cardTitle: { fontSize: 12, fontWeight: 500, opacity: 0.65, marginBottom: 4 },
        mono: { fontFamily: 'var(--ds-font-family-code, ui-monospace, monospace)', fontSize: 13 },
        muted: { opacity: 0.65 },
        error: { color: 'var(--dsw-alias-state-error-primary, #d33)' },
        select: { boxSizing: 'border-box', border: '.5px solid var(--dsw-alias-border-l4, color-mix(in srgb, currentColor 25%, transparent))', borderRadius: 'var(--dsw-radius-md, 6px)', width: 180, maxWidth: '100%', height: 32, font: 'inherit', background: 'var(--dsw-alias-bg-layer-1, transparent)', color: 'var(--dsw-alias-label-primary, inherit)', padding: '0 10px', fontSize: 14, lineHeight: '22px', cursor: 'pointer' },
        link: { color: 'inherit', textDecoration: 'underline', opacity: 0.75 },
        button: { font: 'inherit', fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '.5px solid var(--dsw-alias-border-l4, color-mix(in srgb, currentColor 25%, transparent))', background: 'transparent', color: 'inherit', cursor: 'pointer' },
        lines: { margin: '6px 0 0', paddingLeft: 18, fontSize: 12, opacity: 0.75 },
        checks: { display: 'flex', flexWrap: 'wrap', gap: '8px 18px', marginTop: 10 },
        check: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 },
        spendCard: { display: 'flex', alignItems: 'center', gap: 16, border: '1px solid var(--dsw-alias-border-l3, color-mix(in srgb, currentColor 12%, transparent))', borderRadius: 'var(--dsw-radius-lg, 10px)', padding: '12px 14px', margin: '4px 0' },
        spendValue: { fontSize: 22, fontWeight: 600, lineHeight: '28px' },
        keyRow: { display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' },
        disclosure: { display: 'flex', alignItems: 'center', gap: 6, width: '100%', font: 'inherit', fontSize: 13, color: 'inherit', background: 'none', border: 0, padding: '10px 0', cursor: 'pointer', textAlign: 'left' },
        disclosureBig: { fontSize: 15, fontWeight: 600, padding: '14px 0' },
        disclosureHint: { fontSize: 12, fontWeight: 400, opacity: 0.6, minWidth: 0 },
        chevron: { width: 14, flex: 'none', opacity: 0.6 },
        disclosureBody: { paddingLeft: 20, paddingBottom: 8 },
        groupTitle: { fontSize: 12, fontWeight: 600, opacity: 0.65, margin: '16px 0 2px' },
        advanced: { marginTop: 28, borderTop: '1px solid color-mix(in srgb, currentColor 10%, transparent)' },
        fieldGap: { marginTop: 12 },
      }

      function Overridden({ t, field, disabled, onReset }) {
        if (!field.overridden) return null
        return h('span', { style: S.badges },
          h(ui.Tag, { tone: 'neutral' }, t('overridden')),
          h('button', { type: 'button', style: S.reset, disabled, onClick: onReset }, t('reset')))
      }

      function ToggleRow({ t, name, field, disabled, edit, resetField }) {
        const hint = t(`${name}Hint`)
        return h('div', { style: S.row },
          h('div', { style: S.rowText },
            h('div', { style: S.label }, t(name), h(Overridden, { t, field, disabled, onReset: () => resetField(name) })),
            hint ? h('p', { style: S.hint }, hint) : null),
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

      /** Several on/off fields as one row of checkboxes (a Switch per field where the host has no Checkbox). */
      function CheckRow({ t, label, names, f, disabled, edit, resetField }) {
        const Box = ui.Checkbox || ui.Switch
        const changed = names.filter(name => f[name].overridden)
        return h('div', { style: { ...S.row, display: 'block' } },
          h('div', { style: S.label }, t(label), changed.length ? h('span', { style: S.badges },
            h(ui.Tag, { tone: 'neutral' }, t('overridden')),
            h('button', { type: 'button', style: S.reset, disabled, onClick: () => changed.forEach(resetField) }, t('reset'))) : null),
          h('div', { style: S.checks }, names.map(name => h('span', { key: name, style: S.check },
            h(Box, { checked: f[name].text === 'on', disabled, label: t(name), onChange: next => edit(name, next ? 'on' : 'off') }),
            ui.Checkbox ? null : h('span', null, t(name))))))
      }

      function ValueField({ t, name, field, disabled, edit, resetField, numeric, placeholder, hint }) {
        return h(ui.SettingsValueField, {
          id: `notify-tray-${name}`,
          label: t(name),
          hint: hint === undefined ? t(`${name}Hint`) : hint,
          overriddenLabel: t('overridden'),
          resetLabel: t('reset'),
          invalidLabel: t('invalidNumber'),
          numeric: numeric !== false,
          placeholder,
          disabled,
          text: field.text,
          overridden: field.overridden,
          invalid: field.invalid,
          onEdit: text => edit(name, text),
          onReset: () => resetField(name),
        })
      }
      const NumberField = props => h(ValueField, { numeric: true, ...props })
      const TextField = props => h(ValueField, { ...props, numeric: false })

      /** A bare dropdown (its row carries the label). */
      function Select({ t, name, field, options, disabled, onChange }) {
        return h('select', {
          id: `notify-tray-${name}`,
          style: S.select,
          value: field.text,
          disabled,
          'aria-label': t(name),
          onChange: event => onChange(event.target.value),
        }, options.map(([value, label]) => h('option', { key: value, value }, label)))
      }

      function Section({ title, children }) {
        return h('section', { style: S.section },
          h('h4', { style: S.sectionTitle }, title),
          children)
      }

      /** A collapsible block: a ▸ / ▾ button, its content only while open. */
      function Disclosure({ id, title, hint, badge, big, children }) {
        const [isOpen, toggle] = useOpen(id)
        return h('div', null,
          h('button', { type: 'button', style: big ? { ...S.disclosure, ...S.disclosureBig } : S.disclosure, 'aria-expanded': isOpen, onClick: toggle },
            h('span', { 'aria-hidden': true, style: S.chevron }, isOpen ? '▾' : '▸'),
            h('span', null, title),
            badge ? h(ui.Tag, { tone: 'neutral' }, badge) : null,
            hint ? h('span', { style: S.disclosureHint }, hint) : null),
          isOpen ? h('div', { style: S.disclosureBody }, children) : null)
      }

      function Group({ title, children }) {
        return h('div', null, h('div', { style: S.groupTitle }, title), children)
      }

      const SYM = { CNY: '¥', USD: '$' }
      const fmt = (n, currency) => (typeof n === 'number' ? `${SYM[currency] ?? ''}${Number.isInteger(n) ? n : (n < 1 ? n.toFixed(4).replace(/0+$/u, '').replace(/\.$/u, '') : n.toFixed(2))}` : '—')
      const priceLine = (p, currency) => `${fmt(p.input, currency)} / ${fmt(p.cacheRead, currency)} / ${fmt(p.output, currency)}`
      const SOURCE_KEY = { table: 'srcTable', custom: 'srcCustom', catalog: 'srcCatalog', static: 'srcStatic' }
      const clock = at => {
        const d = new Date(at)
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      }

      /** Read-only: today's spend, the model in use and the unit price behind the estimate. */
      function SpendCard({ t, state }) {
        const spend = state && state.spend
        const currency = (state && state.usage && state.usage.currency) || 'CNY'
        const pricing = state && state.pricing
        const detail = []
        if (!pricing) {
          detail.push(h('div', { key: 'none', style: S.muted }, t('currentModelNone')))
        } else {
          detail.push(h('div', { key: 'route', style: S.mono }, `${pricing.provider ? `${pricing.provider} / ` : ''}${pricing.model}`))
          const price = pricing.effective
          if (price) {
            const source = SOURCE_KEY[price.source] ? t(SOURCE_KEY[price.source]) : price.source
            detail.push(h('div', { key: 'price', style: S.muted }, `${priceLine(price, price.currency)} ${t('perMillion')} · ${source}`))
          } else if (!pricing.listed) {
            detail.push(h('div', { key: 'nolisted', style: S.muted }, t('noListedPrice')))
          }
        }
        if (spend && spend.label) detail.push(h('div', { key: 'how', style: S.muted }, spend.label))
        return h('div', null,
          h('div', { style: S.spendCard },
            h('div', { style: { flex: '1 1 0', minWidth: 0 } },
              h('div', { style: S.cardTitle }, t('today')),
              spend ? h('div', { style: S.spendValue }, `${SYM[currency] ?? ''}${spend.value.toFixed(2)}`) : h('div', { style: S.muted }, t('spendNone'))),
            h('div', { style: { flex: '2 1 0', minWidth: 0, fontSize: 12, lineHeight: '19px' } }, detail)),
          state && state.catalogLoaded === false ? h('p', { style: S.hint }, t('catalogOff')) : null)
      }

      /** One line on the last quota fetch, plus the fetched lines. */
      function QuotaStatus({ t, plan }) {
        if (!plan || !plan.fetch) return h('p', { style: S.hint }, t('noFetchYet'))
        if (!plan.fetch.ok) return h('p', { style: { ...S.hint, ...S.error } }, `${t('fetchFailed')}（${clock(plan.fetch.at)}）：${plan.fetch.error}`)
        const bits = []
        if (plan.remaining !== undefined) bits.push(`${t('remainingShort')} ${plan.remaining}`)
        if (plan.resetAt) bits.push(`${String(plan.resetAt)} ${t('resetsAt')}`)
        bits.push(`${clock(plan.fetch.at)} ${t('updatedAt')}`)
        return h('div', null,
          h('p', { style: S.hint }, bits.join(' · ')),
          plan.lines && plan.lines.length ? h('ul', { style: S.lines }, plan.lines.slice(0, 4).map((line, i) => h('li', { key: i }, line))) : null)
      }

      /** Brings back a status-bar icon hidden from its own menu (or one that failed to start). */
      function TrayStatus({ t, state }) {
        const tray = state && state.tray
        const [busy, setBusy] = React.useState(false)
        if (!tray || !tray.supported || !tray.enabled || tray.shown || !(tray.hidden || tray.failed)) return null
        const show = () => {
          setBusy(true)
          fetchJson(TRAY_ROUTE, { method: 'POST' }).then(() => loadState()).catch(() => {}).then(() => setBusy(false))
        }
        return h('div', { style: S.card },
          h('div', { style: tray.failed && !tray.hidden ? S.error : S.muted }, t(tray.hidden ? 'trayHiddenNote' : 'trayFailedNote')),
          h('div', { style: { marginTop: 8 } }, h('button', { type: 'button', style: S.button, disabled: busy, onClick: show }, busy ? t('trayShowing') : t(tray.hidden ? 'trayShowAgain' : 'trayRetry'))))
      }

      /** What the plan section and the advanced section both need to know about the chosen plan. */
      function planContext(f, state, catalog) {
        const providers = (catalog && catalog.providers) || []
        const providerId = f.planProvider.text || 'none'
        const provider = providers.find(p => p.id === providerId)
        const plans = (provider && provider.plans) || []
        const preset = plans.find(p => p.id === f.planId.text)
        const livePlan = state && state.plan
        const quotaSpec = livePlan && livePlan.canFetch ? { kind: livePlan.fetchKind, url: livePlan.fetchUrl } : ((preset && preset.quotaApi) || (provider && provider.quota))
        return { providers, providerId, provider, plans, preset, livePlan, quotaSpec }
      }

      function PlanSection({ t, f, common, state, catalog }) {
        const { edit, resetField, disabled } = common
        const { providers, providerId, provider, plans, preset, livePlan, quotaSpec } = planContext(f, state, catalog)
        const [busy, setBusy] = React.useState(false)
        const refresh = () => {
          setBusy(true)
          fetchJson(REFRESH_ROUTE, { method: 'POST' }).then(() => loadState()).catch(() => {}).then(() => setBusy(false))
        }
        const choosePlan = id => {
          edit('planId', id)
          const next = plans.find(p => p.id === id)
          if (!next) return
          edit('planName', next.name)
          edit('planPrice', String(next.price))
          edit('planCurrency', next.currency)
          edit('planPeriod', next.period)
          edit('planQuota', next.quotaText ?? '')
          resetField('planQuotaUrl')
        }
        const chooseProvider = id => {
          edit('planProvider', id)
          for (const name of PRESET_FIELDS) resetField(name)
          // Suggest the provider's usual key reference, unless the user typed their own name.
          const current = f.planApiKeyEnv.text
          const suggested = !current || providers.some(p => p.keyEnv === current)
          const nextProvider = providers.find(p => p.id === id)
          if (suggested) {
            if (nextProvider?.keyEnv) edit('planApiKeyEnv', nextProvider.keyEnv)
            else resetField('planApiKeyEnv')
          }
        }
        const providerOptions = [['none', t('providerNone')], ...providers.map(p => [p.id, p.name]), ['custom', t('providerCustom')]]
        const planOptions = [...plans.map(p => [p.id, `${p.name}${p.price ? ` · ${SYM[p.currency] ?? ''}${p.price}` : ''}`]), ['', t('planCustom')]]
        const links = provider ? [['pricing', provider.pricingUrl], ['console', provider.consoleUrl]].filter(([, url]) => url) : []
        const planChanged = f.planProvider.overridden || f.planId.overridden

        const children = [h('div', { key: 'pick', style: { ...S.row, flexWrap: 'wrap' } },
          h('div', { style: S.rowText },
            h('div', { style: S.label }, t('myPlan'), planChanged ? h('span', { style: S.badges }, h(ui.Tag, { tone: 'neutral' }, t('overridden'))) : null),
            links.length
              ? h('p', { style: S.hint }, links.map(([key, url], i) => h(React.Fragment || 'span', { key }, i ? ' · ' : '', h('a', { href: url, target: '_blank', rel: 'noreferrer', style: S.link }, `${t(`${key}Page`)} ↗`))))
              : h('p', { style: S.hint }, t('myPlanHint'))),
          h('div', { style: { ...S.control, display: 'flex', gap: 8, flexWrap: 'wrap' } },
            h(Select, { t, name: 'planProvider', field: f.planProvider, options: providerOptions, disabled, onChange: chooseProvider }),
            providerId !== 'none' && plans.length ? h(Select, { t, name: 'planId', field: f.planId, options: planOptions, disabled, onChange: choosePlan }) : null))]
        if (providerId === 'none') return children

        // ---- remaining quota: the key reference and a refresh, when the provider has an endpoint ----
        const canFetch = Boolean(quotaSpec || f.planQuotaUrl.text)
        children.push(h('div', { key: 'quota', style: { ...S.row, display: 'block' } },
          h('div', { style: S.label }, t('autoQuota')),
          canFetch
            ? h('div', null,
              h(QuotaStatus, { t, plan: livePlan }),
              h('div', { style: S.keyRow },
                h('div', { style: { flex: '1 1 240px', minWidth: 0 } }, h(TextField, { name: 'planApiKeyEnv', field: f.planApiKeyEnv, placeholder: provider?.keyEnv ?? 'XXX_API_KEY', ...common })),
                livePlan && livePlan.apiKeyEnv ? h('button', { type: 'button', style: { ...S.button, marginTop: 24 }, disabled: disabled || busy, onClick: refresh }, busy ? t('refreshing') : t('refreshNow')) : null))
            : h('p', { style: S.hint }, t(providerId === 'custom' ? 'autoQuotaCustom' : 'autoQuotaNone'))))

        // ---- everything a preset fills in, folded away ----
        const detailFields = ['planName', 'planPrice', 'planPeriod', 'planCurrency', 'planQuota', 'planBalance', 'planRemaining', 'planResetAt']
        const detailsChanged = detailFields.filter(name => f[name].overridden).length
        children.push(h(Disclosure, { key: 'details', id: 'plan', title: t('planDetails'), hint: t('planDetailsHint'), badge: detailsChanged ? t('advancedChanged').replace('{n}', String(detailsChanged)) : undefined },
          h('div', { style: S.grid },
            h(TextField, { name: 'planName', field: f.planName, placeholder: preset?.name ?? '', ...common }),
            h(NumberField, { name: 'planPrice', field: f.planPrice, placeholder: preset ? String(preset.price) : '', ...common }),
            h(TextField, { name: 'planQuota', field: f.planQuota, placeholder: preset?.quotaText ?? '', ...common })),
          h(ChoiceRow, { name: 'planPeriod', field: f.planPeriod, ...common, options: [['month', 'periodMonth'], ['year', 'periodYear'], ['week', 'periodWeek'], ['once', 'periodOnce'], ['free', 'periodFree']] }),
          h(ChoiceRow, { name: 'planCurrency', field: f.planCurrency, ...common, options: [['CNY', 'CNY'], ['USD', 'USD']] }),
          h('div', { style: S.grid },
            h(NumberField, { name: 'planBalance', field: f.planBalance, placeholder: livePlan?.balance !== undefined && livePlan.remainingSource !== 'manual' ? fmt(livePlan.balance, livePlan.balanceCurrency) : '', ...common }),
            h(TextField, { name: 'planRemaining', field: f.planRemaining, placeholder: livePlan?.remaining && livePlan.remainingSource === 'api' ? String(livePlan.remaining) : '', ...common }),
            h(TextField, { name: 'planResetAt', field: f.planResetAt, placeholder: livePlan?.resetAt && !f.planResetAt.text ? String(livePlan.resetAt) : '', ...common }))))
        return children
      }

      /** Everything most people never touch, behind one fold. */
      function AdvancedSection({ t, f, common, features, state, catalog }) {
        const { disabled, edit } = common
        const toggle = name => h(ToggleRow, { key: name, name, field: f[name], ...common })
        const { providerId, quotaSpec } = planContext(f, state, catalog)
        const pricing = state && state.pricing
        const fields = ADVANCED_FIELDS.filter(name => (features.tray || !TRAY_FIELDS.includes(name)) && (features.menuBarTitle || name !== 'showSpendInTitle'))
        const changed = fields.filter(name => f[name].overridden).length
        return h('section', { style: S.advanced },
          h(Disclosure, { id: 'advanced', big: true, title: t('advanced'), hint: t('advancedHint'), badge: changed ? t('advancedChanged').replace('{n}', String(changed)) : undefined },
            h(Group, { title: t('groupNotify') },
              h(ChoiceRow, { name: 'channel', field: f.channel, hint: 'channelHint', ...common, options: [['auto', 'channelAuto'], ['client', 'channelClient'], ['system', 'channelSystem'], ['both', 'channelBoth'], ['off', 'channelOff']] }),
              toggle('suppressWhenFocused')),
            features.tray ? h(Group, { title: t('groupTray') },
              features.menuBarTitle ? toggle('showSpendInTitle') : null,
              h('div', { style: S.fieldGap }, h(NumberField, { name: 'errorHoldMinutes', field: f.errorHoldMinutes, ...common }))) : null,
            h(Group, { title: t('groupSpend') },
              h(ChoiceRow, { name: 'spendSource', field: f.spendSource, hint: 'spendSourceHint', ...common, options: [['auto', 'spendAuto'], ['balance', 'spendBalance'], ['estimate', 'spendEstimate']] }),
              h(ChoiceRow, { name: 'currency', field: f.currency, ...common, options: [['CNY', 'CNY'], ['USD', 'USD']] }),
              h('div', { style: S.fieldGap }, h(NumberField, { name: 'balancePollMinutes', field: f.balancePollMinutes, ...common }))),
            h(Group, { title: t('groupPrice') },
              h(ChoiceRow, { name: 'priceSource', field: f.priceSource, hint: 'priceSourceHint', ...common, options: [['auto', 'priceAuto'], ['catalog', 'priceCatalog'], ['custom', 'priceCustom']] }),
              pricing && pricing.listed ? h('div', { style: S.fieldGap }, h('button', {
                type: 'button',
                style: S.button,
                disabled,
                onClick: () => {
                  edit('customInput', String(pricing.listed.input))
                  edit('customCacheRead', String(pricing.listed.cacheRead))
                  edit('customOutput', String(pricing.listed.output))
                  edit('customPriceCurrency', pricing.listed.currency)
                },
              }, t('fillCustom')), h('span', { style: { ...S.muted, ...S.mono, marginLeft: 8, fontSize: 12 } }, priceLine(pricing.listed, pricing.listed.currency))) : null,
              h('div', { style: S.grid },
                h(NumberField, { name: 'customInput', field: f.customInput, ...common }),
                h(NumberField, { name: 'customCacheRead', field: f.customCacheRead, ...common }),
                h(NumberField, { name: 'customOutput', field: f.customOutput, ...common })),
              h(ChoiceRow, { name: 'customPriceCurrency', field: f.customPriceCurrency, ...common, options: [['CNY', 'CNY'], ['USD', 'USD']] }),
              h('div', { style: S.fieldGap }, h(NumberField, { name: 'exchangeRate', field: f.exchangeRate, ...common }))),
            providerId !== 'none' ? h(Group, { title: t('groupQuota') },
              toggle('planAutoQuota'),
              h('div', { style: S.grid },
                h(NumberField, { name: 'quotaPollMinutes', field: f.quotaPollMinutes, ...common }),
                h(TextField, { name: 'planQuotaUrl', field: f.planQuotaUrl, placeholder: quotaSpec?.url ?? 'https://…', ...common }))) : null))
      }

      function Page(props) {
        if (props.view === 'summary') return platformT(props.t, currentPlatform())('summary')
        return h(FullPage, props)
      }

      function FullPage(props) {
        const state = props.useNotifyTray(snapshot => snapshot)
        const liveData = useLive()
        const platform = currentPlatform()
        const features = (platform && FEATURES[platform]) || ALL_FEATURES
        const t = platformT(props.t, platform)
        const disabled = !state.writable
        const common = { t, disabled, edit: props.edit, resetField: props.resetField }
        const f = state.fields
        const toggle = name => h(ToggleRow, { key: name, name, field: f[name], ...common })
        const titleStyle = f.titleStyle.text || 'text'
        return h(ui.SettingsForm, {
          labels: { unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') },
          state,
          onSave: props.save,
          onDiscard: props.discard,
        },
        h(Section, { title: t('sectionNotify') },
          h(CheckRow, { label: 'notifyWhen', names: NOTIFY_FIELDS, f, ...common }),
          toggle('sound')),
        features.tray ? h(Section, { title: t('sectionTray') },
          toggle('tray'),
          h(TrayStatus, { t, state: liveData.state }),
          features.menuBarTitle ? h(ChoiceRow, { name: 'titleStyle', field: f.titleStyle, hint: `titleStyleHint_${titleStyle}`, ...common, options: [['text', 'titleText'], ['count', 'titleCount'], ['icon', 'titleIcon']] }) : null) : null,
        h(Section, { title: t('sectionMoney') },
          h(SpendCard, { t, state: liveData.state }),
          h(PlanSection, { t, f, common, state: liveData.state, catalog: liveData.catalog })),
        h(AdvancedSection, { t, f, common, features, state: liveData.state, catalog: liveData.catalog }))
      }

      // ---- mount ------------------------------------------------------------------------------
      const t = ctx.locale.bind(LOCALE_NS)
      ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh: { ...zh, CNY: '¥ 人民币', USD: '$ 美元' }, en: { ...en, CNY: '¥ CNY', USD: '$ USD' } }), 'notify-tray: settings dictionaries')
      const card = new Controller(ctx.configForms.get(NS))
      ctx.effect(() => () => card.dispose(), 'notify-tray: settings form')
      // One door only: the package page itself (what "插件 → 小鲸鱼通知站" opens,
      // keyed by package name). The component row deliberately gets no
      // `plugins.row.config` entry, so there is no second, identical page
      // behind the row's "›".
      ctx.effect(() => ctx.configForms.whileServed([NS], () => ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
        name: 'plugins.bundle.config',
        key: PACKAGE_KEY,
        locale: LOCALE_NS,
        inject: () => card.inject(),
      }, Page))), 'notify-tray: settings on the package page')
      void t
    }


    function apply(ctx) {
      var cursor = -1
      var boot
      var stopped = false
      var timer

      // A renderer cannot take the OS foreground: `window.focus()` only focuses
      // this web contents. The desktop app can, through the shell, so ask the host.
      function raise() {
        fetch(ROUTE + '?after=-1&raise=1', { headers: { accept: 'application/json' }, cache: 'no-store' }).catch(function () {})
      }

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
        n.onclick = function () { n.close(); raise(); open(event.sessionId) }
      }

      // A click on a native toast comes back as the window regaining focus: the
      // host then hands over the session that toast meant, once.
      var focusAt = 0
      function takePending(state) {
        var p = state.pending
        if (!p) return
        if (Date.now() - focusAt > 5000) return
        focusAt = 0
        fetch(ROUTE + '?after=-1&ack=' + p.seq, { headers: { accept: 'application/json' }, cache: 'no-store' }).catch(function () {})
        open(p.sessionId)
      }

      function poll() {
        var granted = typeof Notification !== 'undefined' && Notification.permission === 'granted'
        fetch(ROUTE + '?after=' + cursor + (granted ? '&notify=1' : ''), { headers: { accept: 'application/json' }, cache: 'no-store' })
          .then(function (res) { return res.ok ? res.json() : undefined })
          .then(function (state) {
            if (!state || stopped) return
            // Tray clicks first: the host hands each one out once, even on our first poll.
            for (var j = 0; j < state.focus.length; j += 1) open(state.focus[j])
            takePending(state)
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

      // Poll right away when the window comes forward, so takePending can claim a
      // toast's session inside its short window instead of a poll later on.
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('focus', function () {
          focusAt = Date.now()
          clearTimeout(timer)
          if (!stopped) poll()
        })
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
