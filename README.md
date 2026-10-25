# dsh-notify-tray

**English** | [简体中文](README.zh-CN.md)

A notification + status-bar plugin for DeepSeek Harness (DSH). Works on macOS, Windows and Linux. It is one npm package that adapts to the OS it is installed on: macOS / Linux get notifications plus the status-bar whale; Windows has no status bar, so it gets notifications only, and its settings page shows no status-bar options.

- **System notifications** — when a task finishes, fails, needs approval, needs you to pick an option, or waits for your input, you get a native notification written in the voice of a little whale (e.g. *"🐳 All done! 'Write the weekly report' is finished — come check it out"*). Clicking a notification jumps straight to the session.
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

**Option 1 — from inside DSH (recommended)**
Open DSH **Plugins → Add plugin**, type `dsh-notify-tray` into the input box and click **Install**.

**Option 2 — command line**

```sh
# Desktop app (the dsh command bundled with the app)
dsh plugin --profile desktop add dsh-notify-tray
# Or the web / CLI profile
dsh plugin --profile web add dsh-notify-tray
# Pin a specific version
dsh plugin --profile desktop add dsh-notify-tray@0.1.3
```

**Option 3 — from the Git repository** (latest unreleased code)

Paste `https://github.com/ROYLeXJ/dsh-notify-tray.git` into **Plugins → Add plugin**, or run `dsh plugin --profile desktop add https://github.com/ROYLeXJ/dsh-notify-tray.git`. You can also clone the repo and install from a local directory: `dsh plugin --profile desktop add /path/to/dsh-notify-tray`.

This route **requires Git**; without it you'll see `ERR_PNPM_GIT_RESOLVE_FAILED … 'git' is not recognized as an internal or external command`. On Windows install Git from <https://git-scm.com/download/win> (the defaults are fine) and restart DSH; on macOS run `git --version` once in Terminal and follow the prompt to install the command-line tools.

Restart DSH after installing. The version on the plugin page is the one installed; the latest is listed on [npm](https://www.npmjs.com/package/dsh-notify-tray).

> **Got an older version?** When the official npm registry is unreachable, DSH falls back to the npmmirror registry, which syncs a little later, so a just-published release may not be there yet. Update again in a few minutes, or pin the version: `dsh plugin --profile desktop add dsh-notify-tray@0.1.3`.

To update: `dsh plugin --profile desktop update dsh-notify-tray`. To uninstall: `dsh plugin --profile desktop remove dsh-notify-tray`.

## Configuration

Every option can be changed under DSH **Plugins → Whale Notify Station → Configure**, or written into the profile's `cordis.patch.yml`:

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
| `tray` | `true` | Show the status-bar icon (macOS / Linux, takes effect after a restart; ignored on Windows) |
| `titleStyle` | `text` | What to show next to the whale in the macOS menu bar: `text` (Pending 1 / Running 2), `count` (numbers only), `icon` (whale only) |
| `showSpendInTitle` | `false` | Append today's spend to the macOS menu-bar label |
| `errorHoldMinutes` | `10` | How many minutes the icon stays red / shows the `×` after a task fails (macOS / Linux) |

### Spend & pricing

| Option | Default | Description |
|---|---|---|
| `spendSource` | `auto` | Use the DeepSeek account balance when available, otherwise estimate from prices |
| `currency` | `CNY` | Display currency |
| `balancePollMinutes` | `5` | How often (minutes) to refresh the DeepSeek account balance |
| `priceSource` | `auto` | Which price to estimate with: `auto` (price table → custom price → DSH's built-in model catalog → plugin's built-in prices), `catalog`, `custom` |
| `customInput` / `customCacheRead` / `customOutput` | empty | Custom price per million tokens; leave empty to disable |
| `customPriceCurrency` | `CNY` | Currency of the custom price |
| `exchangeRate` | `7.2` | 1 USD = ? CNY; catalog prices are in USD and converted when displaying CNY |
| `prices` | `{}` | Per-model price table, highest priority |

The **Current API price** section shows the model you're using (provider / model) and its catalog price. DSH's pi-ai adapter ships a model catalog (Claude, GPT, Gemini, Grok, Groq, Kimi, GLM, MiMo, MiniMax, OpenCode Go, DeepSeek, …); the plugin reads it directly and falls back to its built-in prices or your custom price when a model is missing. A one-click **Copy catalog price into custom price** lets you tweak from the catalog value.

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

Anything that can't be fetched can be typed in by hand; empty fields are simply hidden. On macOS / Linux the status-bar menu gains a **Plan · name · price · remaining** row whose submenu shows balance, remaining quota, reset time, the raw details returned by the endpoint, a **Refresh quota** action and links to the usage / pricing pages.

## Notes

- **When notifications fire** — a task that runs to completion counts as *completed*; an error, hitting the token limit or being blocked counts as *failed*; stopping a task yourself doesn't notify. For `ask_user_question`, questions with options and plan approvals count as *needs a choice*, questions without options as *needs input*; tool approvals count as *needs approval*. Only top-level sessions are tracked — sub-agents don't get their own notifications.
- **How spend is computed** — when signed in with a DeepSeek account, today's spend is accumulated from drops in the account balance (top-ups don't count as negative spend; subject to the platform's billing delay). In parallel, it's estimated from each `provider/model` route's tokens × unit price (price sources described under `priceSource` above); the **Today's usage** submenu breaks it down per model. The ledger lives in `~/.dsh/storages/dsh-notify-tray/ledger.json` and keeps 31 days.
- **Clicking a notification / the status-bar icon / "Open DeepSeek Harness" in the menu** — brings up the desktop app when there is one, otherwise (`dsh web`) opens the web UI in the browser. Browser notifications require granting notification permission first.

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

- Verified on macOS and Windows only; Linux has not been fully verified yet.

## License

MIT © ROYLeXJ
