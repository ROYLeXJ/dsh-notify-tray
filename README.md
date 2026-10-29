# dsh-notify-tray

**English** | [简体中文](README.zh-CN.md)

A notification + status-bar plugin for DeepSeek Harness (DSH). Works on macOS, Windows and Linux. It is one npm package that adapts to the OS it is installed on: macOS / Linux get notifications plus the status-bar whale; Windows has no status bar, so it gets notifications only, and its settings page shows no status-bar options.

- **System notifications** — when a task finishes, fails, needs approval, needs you to pick an option, or waits for your input, you get a native notification written in the voice of a little whale (e.g. *"🐳 All done! 'Write the weekly report' is finished — come check it out"*). Clicking a notification jumps straight to the session. Each session keeps a single notification (a new one replaces the old); a "needs you" notification is taken back once you answer or approve; and when several tasks finish within a few seconds, the first shows at once and the rest fold into one "n more done".
- **Status-bar whale** (macOS / Linux) — a small whale lives in your status bar and tells you what's going on through its posture. The drop-down menu lists running tasks, items waiting for you, today's usage and recently finished tasks; click any entry to open that session.
- **Settings page** — every option can be changed directly on the DSH **Plugins** page (only the options your OS can use are shown), including the API price of the model you're currently using and the plan you subscribe to (Kimi / GLM / OpenCode / MiMo / Gemini / Grok / Claude / GPT / MiniMax / DeepSeek or custom). Balance and remaining quota are fetched automatically where the provider exposes an API; anything else can be filled in by hand.

![The four whale states](assets/preview.svg)

| What the whale is doing | Meaning |
|---|---|
| Resting quietly | Idle |
| Blowing bubbles (animated) | A task is running |
| A `!` bubble | Something is waiting for you (approval / choice / input) |
| A `×` bubble | A task just failed (shown for 10 minutes by default) |

| OS | Notifications | Status-bar whale | Status-bar options on the settings page |
|---|---|---|---|
| macOS | Notification Center | Menu-bar icon following the menu-bar colour, with a label such as `Pending 1` / `Running 2` | All (show/hide, label style, today's spend in the label, failure hold time) |
| Linux (UOS / Deepin / Kylin / KDE …) | freedesktop notifications | System-tray icon, colour-coded (🔵 idle / running, 🟠 waiting for you, 🔴 just failed) | Show/hide, failure hold time |
| Windows | Toast notifications | None (Windows has no status bar) | None |

## Installation

The plugin is published on npm as [`dsh-notify-tray`](https://www.npmjs.com/package/dsh-notify-tray). Installing from npm needs nothing beyond DSH itself — no Git required.

> **⚠️ To get the latest release, include the version number**, e.g. `dsh-notify-tray@0.1.7` (the latest version is listed on [npm](https://www.npmjs.com/package/dsh-notify-tray)).
> DSH installs plugins with pnpm, whose supply-chain policy (`minimumReleaseAge`) won't auto-install a release that is still inside its waiting period. With a bare `dsh-notify-tray` you may get an older version (e.g. 0.1.0). If an older version is already installed, remove it first, then install with the version number.

**Option 1 — from inside DSH (recommended)**
Open DSH **Plugins → Add plugin**, type `dsh-notify-tray@0.1.7` (with the version number) into the input box and click **Install**.

**Option 2 — command line**

```sh
# Desktop app (the dsh command bundled with the app); include the version to get the latest
dsh plugin --profile desktop add dsh-notify-tray@0.1.7
# Or the web / CLI profile
dsh plugin --profile web add dsh-notify-tray@0.1.7
```

**Option 3 — from the Git repository** (latest unreleased code)

Paste `https://github.com/ROYLeXJ/dsh-notify-tray.git` into **Plugins → Add plugin**, or run `dsh plugin --profile desktop add https://github.com/ROYLeXJ/dsh-notify-tray.git`. You can also clone the repo and install from a local directory: `dsh plugin --profile desktop add /path/to/dsh-notify-tray`.

This route **requires Git**; without it you'll see `ERR_PNPM_GIT_RESOLVE_FAILED … 'git' is not recognized as an internal or external command`. On Windows install Git from <https://git-scm.com/download/win> (the defaults are fine) and restart DSH; on macOS run `git --version` once in Terminal and follow the prompt to install the command-line tools.

Restart DSH after installing. The version on the plugin page is the one installed; the latest is listed on [npm](https://www.npmjs.com/package/dsh-notify-tray).

> **Got an older version?** Most often this is pnpm's `minimumReleaseAge` described above: a new release is only auto-installed after a waiting period, and the install message says releases younger than the required age are not installed automatically. Remove the plugin, then install with the version number:
>
> ```sh
> dsh plugin --profile desktop remove dsh-notify-tray
> dsh plugin --profile desktop add dsh-notify-tray@0.1.7
> ```
>
> Also, when the official npm registry is unreachable, DSH falls back to the npmmirror registry, which syncs a little later, so a just-published release may take a few minutes to appear there.

To update: include the version here too — `dsh plugin --profile desktop remove dsh-notify-tray`, then `dsh plugin --profile desktop add dsh-notify-tray@<new version>`. To uninstall: `dsh plugin --profile desktop remove dsh-notify-tray`.

## Configuration

Every option can be changed on DSH's **Plugins → Whale Notify Station** page, or written into the profile's `cordis.patch.yml`. The page's first screen holds only the everyday options (which events notify, sound, the status-bar whale, a today's-spend card, your plan and its quota lookup); notification channel, spend method, custom prices, exchange rate and refresh intervals sit under a folded **Advanced** section at the bottom, tagged with how many of them you have changed.

```yaml
- id: notify-tray
  config:
    channel: auto            # auto | client | system | both | off
    notifyInput: true
    spendSource: auto        # auto | balance | estimate
    planProvider: kimi       # provider of your plan, see the table below
    planId: cn-pro           # preset plan ID; leave empty for "manual"
    planApiKeyEnv: KIMI_CODE_TOKEN
    prices:                  # optional: price per million tokens, keyed by "provider/model", model ID or prefix
      deepseek-flash: { input: 2, cacheRead: 0.04, output: 8 }
```

### Notifications & status bar

| Option | Default | Description |
|---|---|---|
| `notifyCompleted` / `notifyFailed` / `notifyApproval` / `notifyChoice` / `notifyInput` | all on | Toggle each of the five notification kinds |
| `channel` | `auto` | `auto`: the DSH window shows the notification when one is open, otherwise the OS does |
| `suppressWhenFocused` | `true` | Don't notify while you're looking at that session (switch to another app and you will be) |
| `sound` | `true` | Play a sound with system notifications (macOS chime, Windows toast sound, Linux where the desktop supports it) |
| `tray` | `true` | Show the status-bar icon (macOS / Linux, takes effect as soon as you save; ignored on Windows). After **Hide status-bar icon** in the tray menu, **Show the status-bar icon again** on the settings page brings it back without restarting DSH |
| `titleStyle` | `text` | What to show next to the whale in the macOS menu bar: `text` (Pending 1 / Running 2), `count` (numbers only), `icon` (whale only) |
| `showSpendInTitle` | `false` | Append today's spend to the macOS menu-bar label |
| `errorHoldMinutes` | `10` | How many minutes the icon stays red / shows the `×` after a task fails (macOS / Linux) |

### Spend & pricing

| Option | Default | Description |
|---|---|---|
| `spendSource` | `auto` | Use the DeepSeek account balance when available, otherwise estimate from prices. In `auto`, while balance drops lag behind the DeepSeek models' estimate (the platform bills with a delay) the estimate is shown until the balance catches up; other providers' models are always added as an estimate |
| `currency` | `CNY` | Display currency |
| `balancePollMinutes` | `5` | How often (minutes) to refresh the DeepSeek account balance |
| `priceSource` | `auto` | Which price to estimate with: `auto` (price table → custom price → DSH's built-in model catalog → plugin's built-in prices → a bundled [models.dev](https://models.dev) snapshot), `catalog`, `custom` |
| `customInput` / `customCacheRead` / `customOutput` | empty | Custom price per million tokens; leave empty to disable |
| `customPriceCurrency` | `CNY` | Currency of the custom price |
| `exchangeRate` | `7.2` | 1 USD = ? CNY; catalog prices are in USD and converted when displaying CNY |
| `prices` | `{}` | Per-model price table, highest priority |

The **Current API price** section shows the model you're using (provider / model) and its catalog price. DSH's pi-ai adapter ships a model catalog (Claude, GPT, Gemini, Grok, Groq, Kimi, GLM, MiMo, MiniMax, OpenCode Go, DeepSeek, …); the plugin reads it directly and falls back to its built-in prices, then a [models.dev](https://models.dev) price snapshot bundled with each release, or your custom price when a model is missing. It is found automatically for the desktop app and for `dsh web` (global npm installs such as `~/.npm-global` or `%APPDATA%\npm` on Windows, pnpm, and nodes installed by nvm / fnm / volta; as a last resort the plugin asks `npm root -g`). If it isn't there at startup, the plugin looks again every 10 minutes. If the settings page still says it wasn't found, set the `DSH_NOTIFY_TRAY_PI_AI` environment variable to the DSH install directory (e.g. `~/.npm-global/lib/node_modules/@deepseek-ai/dsh`) and restart. A one-click **Copy catalog price into custom price** lets you tweak from the catalog value.

### Plans

| Option | Default | Description |
|---|---|---|
| `planProvider` | `none` | `none` / `custom` / `deepseek` / `kimi` / `glm` / `opencode` / `mimo` / `gemini` / `grok` / `claude` / `gpt` / `minimax` |
| `planId` | empty | Preset plan ID (pick it from the drop-down on the settings page; name, price, period, currency and quota description are filled in automatically) |
| `planName` / `planPrice` / `planPeriod` / `planCurrency` / `planQuota` | preset | Each can be overridden; leave empty to use the preset |
| `planBalance` | empty | Plan / prepaid balance (manual; leave empty when it can be fetched) |
| `planRemaining` | empty | Remaining quota, e.g. `68%` or `1200 requests` (a manual value takes precedence over the API) |
| `planResetAt` | empty | Next reset time (manual) |
| `planApiKeyEnv` | empty | API key reference used for quota lookups — an environment-variable name, the same one DSH's **Models** page uses when it saves a key. The plugin only reads it when querying quota |
| `planQuotaUrl` | preset | Quota endpoint; leave empty for the preset |
| `planAutoQuota` | `true` | Poll the endpoint automatically when there is one |
| `quotaPollMinutes` | `10` | Quota refresh interval (minutes) |

Built-in plan presets (prices are the list prices at the time of writing and may change — all editable):

| Provider | Presets | Fetched automatically |
|---|---|---|
| DeepSeek | Pay-as-you-go | Account balance `GET /user/balance` |
| Kimi | Membership Go / Plus / Pro / Max / Ultra (CN ¥49–1399, intl. $19–199), legacy Kimi Code, Moonshot pay-as-you-go | Kimi Code quota `GET api.kimi.com/coding/v1/usages` (needs the Kimi Code OAuth token, not a Moonshot API key); Moonshot balance |
| GLM | Coding Plan Lite / Pro / Max (CN ¥118 / 538 / 1078, Z.ai $18 / 80 / 168) | 5-hour and weekly credits `GET /api/monitor/usage/quota/limit` |
| OpenCode | Go $10, Go Plus $40, Zen pay-as-you-go | No public endpoint |
| MiMo | Token Plan Lite / Standard / Pro / Max (¥39 / 99 / 329 / 659) | No API-key endpoint (console cookie only) |
| Gemini | Google AI Plus / Pro / Ultra, API pay-as-you-go | None |
| Grok | SuperGrok Lite / Standard / Plus / Heavy, API pay-as-you-go | Key validation only (`GET /v1/api-key`), no balance |
| Claude | Pro / Max 5x / Max 20x / Team, API pay-as-you-go | No endpoint for regular keys |
| GPT | ChatGPT Go / Plus / Pro 5x / Pro 20x / Business, API pay-as-you-go | No endpoint for regular keys |
| MiniMax | M Plan Go / Explore / Build (CN ¥49 / 119 / 469, intl. $22 / 55 / 132), legacy Coding Plan | 5-hour window remaining `GET /v1/coding_plan/remains` |

Anything that can't be fetched can be typed in by hand; empty fields are simply hidden. On macOS / Linux the status-bar menu shows balance and plan on one row (**余额 ¥… · provider 剩 …**); its submenu lists the DeepSeek balance, plan name and price, remaining quota and reset time, a **Refresh quota** action and the usage page. The full details returned by the endpoint are on the settings page. The menu has one level of submenus, at most 6 rows each and 24 characters per row, so Windows / Linux trays no longer cut it off at the screen edge.

## Notes

- **When notifications fire** — a task that runs to completion counts as *completed*; an error, hitting the token limit or being blocked counts as *failed*; stopping a task yourself doesn't notify. For `ask_user_question`, questions with options and plan approvals count as *needs a choice*, questions without options as *needs input*; tool approvals count as *needs approval*. Only top-level sessions are tracked — sub-agents don't get their own notifications.
- **How spend is computed** — when signed in with a DeepSeek account, today's spend is accumulated from drops in the account balance (top-ups don't count as negative spend; the platform bills with a delay, so in `auto` the estimate stands in until the balance catches up). In parallel, it's estimated from each `provider/model` route's tokens × unit price (price sources described under `priceSource` above); the **Today** submenu breaks it down per model (top 3). The ledger lives in `~/.dsh/storages/dsh-notify-tray/ledger.json` and keeps 31 days.
- **DeepSeek off-peak prices** — DeepSeek's listed prices are peak prices (Beijing time, weekdays 9–12 and 14–18). Tokens used outside those hours are estimated at half price; prices you type yourself (price table or custom price) are used as they are.
- **Clicking a notification / the status-bar icon / "Open DeepSeek Harness" in the menu** — brings up the desktop app when there is one, otherwise (`dsh web`) opens the web UI in the browser. Browser notifications require granting notification permission first.
  - With the default `channel: auto` and a DSH window open, notifications come from the window, and clicking one jumps to its session on every OS.
  - **macOS system notifications** (`dsh web`, or `channel: system`) are sent with `osascript`, which can't tell DSH which session was clicked. Install [terminal-notifier](https://github.com/julienXX/terminal-notifier) (`brew install terminal-notifier`) and the plugin uses it automatically: clicking the notification opens the session, and an answered question's notification is taken back.
  - **Windows toasts** can only launch the app, so the window that comes forward within a minute of a toast opens that toast's session. Windows won't let a background process pull a *visible* window that is behind another one to the front (see [#4](https://github.com/ROYLeXJ/dsh-notify-tray/issues/4)); a minimized window is restored.

## Development

```sh
npm install
npm test                      # node --test
node scripts/demo.mjs         # walk a demo-only whale through every state (macOS menu bar)
node scripts/demo.mjs --live  # drive the real whale (DSH must be idle); restored afterwards
node scripts/demo.mjs --all   # also show "needs approval" / "failed"
```

Layout:

| Path | Purpose |
|---|---|
| `lib/index.js` | Host half: session tracking, spend ledger, plan / quota polling, tray driver, OS-notification fallback, `GET notify-tray/state` API |
| `lib/client.js` | Browser half: native notifications from the DSH window and the settings page |
| `lib/tray/` | Status-bar drivers (macOS helper via `assets/tray-darwin.js`, Linux StatusNotifierItem over D-Bus) |
| `lib/catalog.js` / `lib/pricing.js` / `lib/quota.js` | Plan presets, price resolution, provider quota endpoints |
| `lib/voice.js` / `lib/whale.js` | Notification copy in the whale's voice; icon rendering |
| `locale/` | Plugin title / description in `en` and `zh` |
| `reference/` | DSH type declarations and example bundles used while developing |

Requires Node ≥ 20. Linux uses [`dbus-next`](https://www.npmjs.com/package/dbus-next) for the tray.

## Known limitations

- Verified on macOS, Windows and Linux (Linux verified under the web profile: notifications and the system tray).

## License

MIT © ROYLeXJ
