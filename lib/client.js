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
        summary: '小鲸鱼什么时候来找你、状态栏里显示什么、今天的花费怎么算、你在用哪家的套餐，都在这里调。',
        summary_win32: '小鲸鱼什么时候来找你、今天的花费怎么算、你在用哪家的套餐，都在这里调。Windows 没有状态栏，小鲸鱼只用通知来找你。',
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
        soundHint: '系统通知响一声。',
        soundHint_darwin: 'macOS 系统通知的「叮」一声。',
        soundHint_win32: 'Windows 系统通知（右下角弹窗）的提示音。',
        soundHint_linux: '系统通知的提示音（要桌面环境支持）。',
        sectionTray: '状态栏里的小鲸鱼',
        tray: '显示状态栏小鲸鱼',
        trayHint: '保存后立即生效。',
        trayHint_linux: '显示在系统托盘里（UOS / Deepin / 麒麟 / KDE 自带；GNOME 要装 AppIndicator 扩展）。保存后立即生效。',
        trayHiddenNote: '状态栏图标已从它的菜单里隐藏。',
        trayShowAgain: '重新显示状态栏图标',
        trayShowing: '正在显示…',
        trayFailedNote: '状态栏图标没能启动（没有托盘宿主或 D-Bus？），只保留通知。',
        trayRetry: '重试',
        titleStyle: '鲸鱼旁边显示什么',
        titleText: '文字',
        titleCount: '只有数字',
        titleIcon: '只有鲸鱼',
        titleStyleHint: '文字：待处理 1 / 运行中 2；空闲时什么都不显示。',
        showSpendInTitle: '旁边也带上今日花费',
        showSpendInTitleHint: '例如「运行中 1 · ¥1.82」。',
        errorHoldMinutes: '失败后「×」保持几分钟',
        errorHoldMinutesHint: '0 表示任务一失败就只记在菜单里，鲸鱼脸上不挂「×」。',
        errorHoldMinutes_linux: '失败后鲸鱼保持红色几分钟',
        errorHoldMinutesHint_linux: '0 表示任务一失败就只记在菜单里，鲸鱼不变红。',
        sectionSpend: '今天花了多少钱',
        spendSource: '花费怎么算',
        spendAuto: '自动',
        spendBalance: '余额扣费',
        spendEstimate: '按价格估算',
        spendSourceHint: '自动：登录了 DeepSeek 账户就看余额的真实扣费，否则按下面的价格估算。',
        currency: '币种',
        balancePollMinutes: '余额几分钟刷新一次',
        balancePollMinutesHint: '每轮任务结束后 5 秒也会额外刷新一次。',

        sectionPrice: '当前 API 价格',
        sectionPriceHint: '估算今日花费用的单价。能从 DSH 自带的模型目录里拿到的会自动拿，拿不到的你来填，留空也行。',
        currentModel: '现在用的模型',
        currentModelNone: '还没看到请求，先聊一句就知道了。',
        listedPrice: '目录价',
        effectivePrice: '实际按',
        perMillion: '每百万 token · 输入 / 缓存命中 / 输出',
        noListedPrice: '目录里没有这个模型的价格，请在下面填自定义价。',
        catalogOff: 'DSH 自带的模型目录没找到，只有插件内置价可用。可设置环境变量 DSH_NOTIFY_TRAY_PI_AI 指向 DSH 的安装目录后重启。',
        fillCustom: '把目录价填进自定义价',
        priceSource: '估算用哪个价',
        priceAuto: '自动',
        priceCatalog: '只用目录价',
        priceCustom: '只用自定义价',
        priceSourceHint: '自动：cordis.patch.yml 价格表 → 自定义价 → 模型目录价 → 插件内置价。',
        customInput: '输入（未命中缓存）',
        customInputHint: '每百万 token',
        customCacheRead: '输入（缓存命中）',
        customCacheReadHint: '留空按输入价',
        customOutput: '输出',
        customOutputHint: '每百万 token',
        customPriceCurrency: '自定义价币种',
        exchangeRate: '汇率：1 美元 = ? 人民币',
        exchangeRateHint: '目录价是美元，显示人民币时按这个换算。',

        sectionPlan: '你的套餐',
        sectionPlanHint: '选一家平台和套餐，价格、额度会按预设填好，每一项都能改；选「自定义」就全部自己填。留空的项不显示。',
        planProvider: '平台',
        providerNone: '不设置',
        providerCustom: '自定义',
        planId: '套餐',
        planCustom: '手填 / 其他套餐',
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
        planBalance: '套餐余额',
        planBalanceHint: '预付费 / 充值余额，手填；能从接口拿到时留空即可。',
        planRemaining: '剩余额度',
        planRemainingHint: '例如「68%」「1200 次」，手填优先于接口。',
        planResetAt: '下次重置',
        planResetAtHint: '例如「今晚 20:00」「每周一」。',
        sectionQuota: '自动获取额度',
        quotaAvailable: '这家平台有额度 / 余额接口：',
        quotaUnavailable: '这家平台没有公开的额度接口，剩余额度和余额请手填。',
        quotaUnavailableCustom: '自定义平台：填一个返回 JSON 的额度地址，插件会尽量读出 balance / remaining 字段。',
        planApiKeyEnv: 'API Key 引用（环境变量名）',
        planApiKeyEnvHint: '填 DSH「模型」页里保存密钥时用的名字，插件只在查询额度时读取它；也可以直接设置同名环境变量。',
        planQuotaUrl: '额度查询地址',
        planQuotaUrlHint: '留空用预设地址。',
        planAutoQuota: '自动刷新',
        planAutoQuotaHint: '按下面的间隔定时查询，菜单里也能手动刷新。',
        planAutoQuotaHint_win32: '按下面的间隔定时查询，也可以点下面的「立即刷新」。',
        quotaPollMinutes: '几分钟刷新一次',
        quotaPollMinutesHint: '',
        refreshNow: '立即刷新',
        refreshing: '刷新中…',
        lastFetch: '上次获取',
        fetchFailed: '获取失败',
        noFetchYet: '还没获取过。',
        pricingPage: '价格页',
        consolePage: '用量页',
        manual: '手填',
        fromApi: '接口',
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
        summary: 'When the whale comes to find you, what the status bar shows, how today\'s spend is counted, and which plan you are on.',
        summary_win32: 'When the whale comes to find you, how today\'s spend is counted, and which plan you are on. Windows has no status bar, so the whale reaches you through notifications only.',
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
        soundHint: 'System notifications make a sound.',
        soundHint_darwin: 'The macOS notification chime.',
        soundHint_win32: 'The Windows notification (toast) sound.',
        soundHint_linux: 'The notification sound, where the desktop supports one.',
        sectionTray: 'The whale in the status bar',
        tray: 'Show the status-bar whale',
        trayHint: 'Takes effect as soon as you save.',
        trayHint_linux: 'Shown in the system tray (built into UOS / Deepin / Kylin / KDE; GNOME needs the AppIndicator extension). Takes effect as soon as you save.',
        trayHiddenNote: 'The status-bar icon was hidden from its own menu.',
        trayShowAgain: 'Show the status-bar icon again',
        trayShowing: 'Showing…',
        trayFailedNote: 'The status-bar icon could not start (no tray host or D-Bus?); notifications still work.',
        trayRetry: 'Retry',
        titleStyle: 'Text beside the whale',
        titleText: 'Words',
        titleCount: 'Count only',
        titleIcon: 'Whale only',
        titleStyleHint: 'Words: 待处理 1 / 运行中 2; nothing while idle.',
        showSpendInTitle: 'Append today\'s spend',
        showSpendInTitleHint: 'e.g. "运行中 1 · ¥1.82".',
        errorHoldMinutes: 'Minutes the "×" stays after a failure',
        errorHoldMinutesHint: '0: failures are only listed in the menu.',
        errorHoldMinutes_linux: 'Minutes the whale stays red after a failure',
        errorHoldMinutesHint_linux: '0: failures are only listed in the menu; the whale never turns red.',
        sectionSpend: 'Today\'s spend',
        spendSource: 'How spend is counted',
        spendAuto: 'Auto',
        spendBalance: 'Balance drops',
        spendEstimate: 'Price estimate',
        spendSourceHint: 'Auto: real balance drops when signed in to DeepSeek, otherwise the prices below.',
        currency: 'Currency',
        balancePollMinutes: 'Balance refresh interval (minutes)',
        balancePollMinutesHint: 'Also refreshed 5 s after every finished turn.',

        sectionPrice: 'Current API price',
        sectionPriceHint: 'Unit prices behind the estimate. Whatever DSH\'s bundled model catalog knows is picked up automatically; fill in the rest yourself, or leave it blank.',
        currentModel: 'Model in use',
        currentModelNone: 'No request seen yet — send one message and it shows up here.',
        listedPrice: 'Listed',
        effectivePrice: 'Effective',
        perMillion: 'per million tokens · input / cache hit / output',
        noListedPrice: 'No catalog price for this model; enter a custom price below.',
        catalogOff: 'DSH\'s bundled model catalog was not found; only the plugin\'s built-in prices apply. Point the DSH_NOTIFY_TRAY_PI_AI environment variable at the DSH install directory and restart.',
        fillCustom: 'Copy listed price into custom price',
        priceSource: 'Which price to use',
        priceAuto: 'Auto',
        priceCatalog: 'Catalog only',
        priceCustom: 'Custom only',
        priceSourceHint: 'Auto: cordis.patch.yml table → custom price → model catalog → built-in prices.',
        customInput: 'Input (cache miss)',
        customInputHint: 'per million tokens',
        customCacheRead: 'Input (cache hit)',
        customCacheReadHint: 'Blank: same as input',
        customOutput: 'Output',
        customOutputHint: 'per million tokens',
        customPriceCurrency: 'Custom price currency',
        exchangeRate: 'Rate: 1 USD = ? CNY',
        exchangeRateHint: 'Catalog prices are USD; used when displaying CNY.',

        sectionPlan: 'Your plan',
        sectionPlanHint: 'Pick a provider and a plan: price and quota are prefilled from the preset and every field stays editable; "Custom" leaves everything to you. Blank fields are not shown.',
        planProvider: 'Provider',
        providerNone: 'None',
        providerCustom: 'Custom',
        planId: 'Plan',
        planCustom: 'Other / manual',
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
        planBalance: 'Plan balance',
        planBalanceHint: 'Prepaid / top-up balance, typed by hand; leave blank when the API supplies it.',
        planRemaining: 'Remaining quota',
        planRemainingHint: 'e.g. "68%" or "1200 requests"; a typed value wins over the API.',
        planResetAt: 'Next reset',
        planResetAtHint: 'e.g. "20:00 tonight", "Mondays".',
        sectionQuota: 'Fetch quota automatically',
        quotaAvailable: 'This provider exposes a quota / balance endpoint:',
        quotaUnavailable: 'This provider has no public quota endpoint; type the remaining quota and balance yourself.',
        quotaUnavailableCustom: 'Custom provider: give a JSON quota URL and the plugin reads balance / remaining-looking fields.',
        planApiKeyEnv: 'API key reference (environment variable name)',
        planApiKeyEnvHint: 'The name used when the key was saved on DSH\'s Models page; the plugin reads it only to query quota. A same-named environment variable works too.',
        planQuotaUrl: 'Quota URL',
        planQuotaUrlHint: 'Blank: preset URL.',
        planAutoQuota: 'Refresh automatically',
        planAutoQuotaHint: 'Polled at the interval below; the tray menu can refresh by hand too.',
        planAutoQuotaHint_win32: 'Polled at the interval below; "Refresh now" below fetches by hand.',
        quotaPollMinutes: 'Refresh interval (minutes)',
        quotaPollMinutesHint: '',
        refreshNow: 'Refresh now',
        refreshing: 'Refreshing…',
        lastFetch: 'Last fetch',
        fetchFailed: 'Fetch failed',
        noFetchYet: 'Not fetched yet.',
        pricingPage: 'Pricing page',
        consolePage: 'Usage page',
        manual: 'manual',
        fromApi: 'API',
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
      exports.__settingsLive = { live, loadCatalog, loadState, currentPlatform }
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
        sectionHint: { margin: '0 0 12px', opacity: 0.65, fontSize: 13 },
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
        select: { boxSizing: 'border-box', border: '.5px solid var(--dsw-alias-border-l4, color-mix(in srgb, currentColor 25%, transparent))', borderRadius: 'var(--dsw-radius-md, 6px)', width: '100%', maxWidth: 320, height: 32, font: 'inherit', background: 'var(--dsw-alias-bg-layer-1, transparent)', color: 'var(--dsw-alias-label-primary, inherit)', padding: '0 10px', fontSize: 14, lineHeight: '22px', cursor: 'pointer' },
        fieldLabel: { color: 'var(--dsw-alias-label-secondary, inherit)', fontSize: 12, fontWeight: 500, lineHeight: '18px', display: 'block', marginBottom: 6 },
        linkRow: { display: 'flex', gap: 14, marginTop: 8, fontSize: 12 },
        link: { color: 'inherit', textDecoration: 'underline', opacity: 0.75 },
        button: { font: 'inherit', fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '.5px solid var(--dsw-alias-border-l4, color-mix(in srgb, currentColor 25%, transparent))', background: 'transparent', color: 'inherit', cursor: 'pointer' },
        lines: { margin: '6px 0 0', paddingLeft: 18 },
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

      function SelectField({ t, name, field, options, disabled, onChange, resetField }) {
        return h('div', { style: { marginTop: 12 } },
          h('label', { style: S.fieldLabel, htmlFor: `notify-tray-${name}` }, t(name), h(Overridden, { t, field, disabled, onReset: () => resetField(name) })),
          h('select', {
            id: `notify-tray-${name}`,
            style: S.select,
            value: field.text,
            disabled,
            'aria-label': t(name),
            onChange: event => onChange(event.target.value),
          }, options.map(([value, label]) => h('option', { key: value, value }, label))))
      }

      function Section({ title, hint, children }) {
        return h('section', { style: S.section },
          h('h4', { style: S.sectionTitle }, title),
          hint ? h('p', { style: S.sectionHint }, hint) : null,
          children)
      }

      const SYM = { CNY: '¥', USD: '$' }
      const fmt = (n, currency) => (typeof n === 'number' ? `${SYM[currency] ?? ''}${Number.isInteger(n) ? n : (n < 1 ? n.toFixed(4).replace(/0+$/u, '').replace(/\.$/u, '') : n.toFixed(2))}` : '—')
      const priceLine = (p, currency) => `${fmt(p.input, currency)} / ${fmt(p.cacheRead, currency)} / ${fmt(p.output, currency)}`
      const SOURCE_KEY = { table: 'srcTable', custom: 'srcCustom', catalog: 'srcCatalog', static: 'srcStatic' }
      const clock = at => {
        const d = new Date(at)
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      }

      /** The read-only "model in use" card: listed price, effective price, and a copy button. */
      function CurrentModelCard({ t, state, disabled, edit }) {
        const pricing = state?.pricing
        const rows = [h('div', { key: 'title', style: S.cardTitle }, t('currentModel'))]
        if (!pricing) {
          rows.push(h('div', { key: 'none', style: S.muted }, t('currentModelNone')))
        } else {
          rows.push(h('div', { key: 'route', style: S.mono }, `${pricing.provider ? `${pricing.provider} / ` : ''}${pricing.model}${pricing.name && pricing.name !== pricing.model ? ` · ${pricing.name}` : ''}`))
          if (pricing.listed) {
            rows.push(h('div', { key: 'listed' }, `${t('listedPrice')}：`, h('span', { style: S.mono }, priceLine(pricing.listed, pricing.listed.currency)), h('span', { style: S.muted }, ` ${t('perMillion')}`)))
          } else {
            rows.push(h('div', { key: 'nolisted', style: S.muted }, t('noListedPrice')))
          }
          if (pricing.effective) {
            rows.push(h('div', { key: 'eff' }, `${t('effectivePrice')}：`, h('span', { style: S.mono }, priceLine(pricing.effective, pricing.effective.currency)), h('span', { style: S.muted }, `（${SOURCE_KEY[pricing.effective.source] ? t(SOURCE_KEY[pricing.effective.source]) : pricing.effective.source}）`)))
          }
          if (pricing.listed) {
            rows.push(h('div', { key: 'copy', style: { marginTop: 8 } }, h('button', {
              type: 'button',
              style: S.button,
              disabled,
              onClick: () => {
                edit('customInput', String(pricing.listed.input))
                edit('customCacheRead', String(pricing.listed.cacheRead))
                edit('customOutput', String(pricing.listed.output))
                edit('customPriceCurrency', pricing.listed.currency)
              },
            }, t('fillCustom'))))
          }
        }
        if (state && state.catalogLoaded === false) rows.push(h('div', { key: 'cat', style: { ...S.muted, marginTop: 6 } }, t('catalogOff')))
        return h('div', { style: S.card }, rows)
      }

      /** Live quota panel: what the host last fetched for the configured plan. */
      function QuotaStatus({ t, plan, disabled, busy, onRefresh }) {
        const rows = []
        if (!plan) return null
        if (plan.fetch) {
          rows.push(h('div', { key: 'at', style: plan.fetch.ok ? undefined : S.error },
            plan.fetch.ok ? `${t('lastFetch')} ${clock(plan.fetch.at)}` : `${t('fetchFailed')}（${clock(plan.fetch.at)}）：${plan.fetch.error}`))
          if (plan.fetch.ok && plan.lines.length) rows.push(h('ul', { key: 'lines', style: S.lines }, plan.lines.map((line, i) => h('li', { key: i }, line))))
        } else {
          rows.push(h('div', { key: 'none', style: S.muted }, t('noFetchYet')))
        }
        if (plan.apiKeyEnv) rows.push(h('div', { key: 'btn', style: { marginTop: 8 } }, h('button', { type: 'button', style: S.button, disabled: disabled || busy, onClick: onRefresh }, busy ? t('refreshing') : t('refreshNow'))))
        return h('div', { style: S.card }, rows)
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

      function PlanSection({ t, f, common, state, catalog }) {
        const { edit, resetField, disabled } = common
        const providers = catalog?.providers ?? []
        const providerId = f.planProvider.text || 'none'
        const provider = providers.find(p => p.id === providerId)
        const plans = provider?.plans ?? []
        const preset = plans.find(p => p.id === f.planId.text)
        const livePlan = state?.plan
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
        const quotaSpec = livePlan?.canFetch ? { kind: livePlan.fetchKind, url: livePlan.fetchUrl } : (preset?.quotaApi ?? provider?.quota)
        const links = provider ? [['pricing', provider.pricingUrl], ['console', provider.consoleUrl]].filter(([, url]) => url) : []

        const children = [
          h(SelectField, { key: 'provider', t, name: 'planProvider', field: f.planProvider, options: providerOptions, disabled, onChange: chooseProvider, resetField }),
        ]
        if (providerId === 'none') return children
        if (plans.length) children.push(h(SelectField, { key: 'plan', t, name: 'planId', field: f.planId, options: planOptions, disabled, onChange: choosePlan, resetField }))
        if (links.length) {
          children.push(h('div', { key: 'links', style: S.linkRow }, links.map(([key, url]) => h('a', { key, href: url, target: '_blank', rel: 'noreferrer', style: S.link }, `${t(`${key}Page`)} ↗`))))
        }
        children.push(h('div', { key: 'grid', style: S.grid },
          h(TextField, { name: 'planName', field: f.planName, placeholder: preset?.name ?? '', ...common }),
          h(NumberField, { name: 'planPrice', field: f.planPrice, placeholder: preset ? String(preset.price) : '', ...common }),
          h(TextField, { name: 'planQuota', field: f.planQuota, placeholder: preset?.quotaText ?? '', ...common })))
        children.push(h(ChoiceRow, { key: 'period', name: 'planPeriod', field: f.planPeriod, ...common, options: [['month', 'periodMonth'], ['year', 'periodYear'], ['week', 'periodWeek'], ['once', 'periodOnce'], ['free', 'periodFree']] }))
        children.push(h(ChoiceRow, { key: 'cur', name: 'planCurrency', field: f.planCurrency, ...common, options: [['CNY', 'CNY'], ['USD', 'USD']] }))
        children.push(h('div', { key: 'grid2', style: S.grid },
          h(NumberField, { name: 'planBalance', field: f.planBalance, placeholder: livePlan?.balance !== undefined && livePlan.remainingSource !== 'manual' ? `${t('fromApi')} ${fmt(livePlan.balance, livePlan.balanceCurrency)}` : '', ...common }),
          h(TextField, { name: 'planRemaining', field: f.planRemaining, placeholder: livePlan?.remaining && livePlan.remainingSource === 'api' ? `${t('fromApi')} ${livePlan.remaining}` : '', ...common }),
          h(TextField, { name: 'planResetAt', field: f.planResetAt, placeholder: livePlan?.resetAt && !f.planResetAt.text ? String(livePlan.resetAt) : '', ...common })))

        // ---- quota fetching ---------------------------------------------------------
        const quotaChildren = []
        if (quotaSpec) {
          quotaChildren.push(h('p', { key: 'avail', style: S.hint }, t('quotaAvailable'), ' ', h('span', { style: S.mono }, quotaSpec.url)))
        } else {
          quotaChildren.push(h('p', { key: 'unavail', style: S.hint }, t(providerId === 'custom' ? 'quotaUnavailableCustom' : 'quotaUnavailable')))
        }
        quotaChildren.push(h('div', { key: 'grid3', style: S.grid },
          h(TextField, { name: 'planApiKeyEnv', field: f.planApiKeyEnv, placeholder: provider?.keyEnv ?? 'XXX_API_KEY', ...common }),
          h(TextField, { name: 'planQuotaUrl', field: f.planQuotaUrl, placeholder: quotaSpec?.url ?? 'https://…', ...common })))
        if (quotaSpec || f.planQuotaUrl.text) {
          quotaChildren.push(h(ToggleRow, { key: 'auto', name: 'planAutoQuota', field: f.planAutoQuota, ...common }))
          quotaChildren.push(h('div', { key: 'poll', style: { marginTop: 12 } }, h(NumberField, { name: 'quotaPollMinutes', field: f.quotaPollMinutes, ...common })))
          quotaChildren.push(h(QuotaStatus, { key: 'status', t, plan: livePlan, disabled, busy, onRefresh: refresh }))
        }
        children.push(h(Section, { key: 'quota', title: t('sectionQuota') }, quotaChildren))
        return children
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
        features.tray ? h(Section, { title: t('sectionTray') },
          toggle('tray'),
          h(TrayStatus, { t, state: liveData.state }),
          features.menuBarTitle ? h(ChoiceRow, { name: 'titleStyle', field: f.titleStyle, hint: 'titleStyleHint', ...common, options: [['text', 'titleText'], ['count', 'titleCount'], ['icon', 'titleIcon']] }) : null,
          features.menuBarTitle ? toggle('showSpendInTitle') : null,
          h('div', { style: { marginTop: 12 } }, h(NumberField, { name: 'errorHoldMinutes', field: f.errorHoldMinutes, ...common }))) : null,
        h(Section, { title: t('sectionSpend') },
          h(ChoiceRow, { name: 'spendSource', field: f.spendSource, hint: 'spendSourceHint', ...common, options: [['auto', 'spendAuto'], ['balance', 'spendBalance'], ['estimate', 'spendEstimate']] }),
          h(ChoiceRow, { name: 'currency', field: f.currency, ...common, options: [['CNY', 'CNY'], ['USD', 'USD']] }),
          h('div', { style: { marginTop: 12 } }, h(NumberField, { name: 'balancePollMinutes', field: f.balancePollMinutes, ...common }))),
        h(Section, { title: t('sectionPrice'), hint: t('sectionPriceHint') },
          h(CurrentModelCard, { t, state: liveData.state, disabled, edit: props.edit }),
          h(ChoiceRow, { name: 'priceSource', field: f.priceSource, hint: 'priceSourceHint', ...common, options: [['auto', 'priceAuto'], ['catalog', 'priceCatalog'], ['custom', 'priceCustom']] }),
          h('div', { style: S.grid },
            h(NumberField, { name: 'customInput', field: f.customInput, ...common }),
            h(NumberField, { name: 'customCacheRead', field: f.customCacheRead, ...common }),
            h(NumberField, { name: 'customOutput', field: f.customOutput, ...common })),
          h(ChoiceRow, { name: 'customPriceCurrency', field: f.customPriceCurrency, ...common, options: [['CNY', 'CNY'], ['USD', 'USD']] }),
          h('div', { style: { marginTop: 12 } }, h(NumberField, { name: 'exchangeRate', field: f.exchangeRate, ...common }))),
        h(Section, { title: t('sectionPlan'), hint: t('sectionPlanHint') },
          h(PlanSection, { t, f, common, state: liveData.state, catalog: liveData.catalog })))
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
