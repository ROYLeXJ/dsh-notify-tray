# dsh-notify-tray

[English](README.md) | **简体中文**

DeepSeek Harness（DSH）的通知 + 状态栏插件，支持 macOS、Windows、Linux。同一个 npm 包，装上后按系统自动区分：macOS / Linux 有通知 + 状态栏小鲸鱼；Windows 没有状态栏，只有通知，设置页里也不会出现状态栏相关的选项。

- **系统通知**：任务完成、任务失败、需要批准、需要你选择、需要你输入时弹系统通知，文案是小鲸鱼的口吻（比如「🐳 搞定啦～『写周报』做完了！快来验收」）。点击通知会跳到对应会话。
- **状态栏小鲸鱼**（macOS / Linux）：状态栏常驻一只小鲸鱼，用姿态告诉你现在的状态；下拉菜单里是正在运行的任务、等你处理的事项、今日用量和最近结束的任务，点一下就能跳到对应会话。
- **插件设置页**：所有选项都能在 DSH「插件」页里直接改（只显示当前系统用得上的选项），包括当前模型的 API 价格和你买的套餐（Kimi / GLM / OpenCode / MiMo / Gemini / Grok / Claude / GPT / MiniMax / DeepSeek 或自定义），能从接口拿到的余额 / 剩余额度自动拿，拿不到的手填。

![四种状态](assets/preview.svg)

| 鲸鱼的样子 | 含义 |
|---|---|
| 安静地待着 | 空闲 |
| 鼻子前冒泡泡（会动） | 有任务在运行 |
| 鼻子前冒出 `!` | 有事等你处理（批准 / 选择 / 输入） |
| 鼻子前冒出 `×` | 刚有任务失败（默认保持 10 分钟） |

| 系统 | 通知 | 状态栏小鲸鱼 | 设置页里的状态栏选项 |
|---|---|---|---|
| macOS | 系统通知中心 | 菜单栏图标，颜色跟随菜单栏，旁边显示 `待处理 1` / `运行中 2` | 全部（显示开关、旁边显示什么、带上今日花费、失败保持时间） |
| Linux（UOS / Deepin / 麒麟 / KDE 等） | freedesktop 通知 | 系统托盘图标，用颜色区分状态（🔵 空闲/运行中、🟠 等你处理、🔴 刚失败） | 显示开关、失败保持时间 |
| Windows | 系统通知（右下角弹窗） | 无（Windows 没有状态栏） | 无 |

## 安装

插件已发布到 npm：[`dsh-notify-tray`](https://www.npmjs.com/package/dsh-notify-tray)。从 npm 安装只需要 DSH 本身，**不需要装 Git**。

> **⚠️ 想装最新版，请带上版本号**，例如 `dsh-notify-tray@0.1.6`（最新版本号见 [npm](https://www.npmjs.com/package/dsh-notify-tray)）。
> DSH 用 pnpm 安装插件，pnpm 的供应链安全策略（`minimumReleaseAge`）不会自动安装刚发布、还没过观察期的版本，只写 `dsh-notify-tray` 时会退回装一个旧版本（例如 0.1.0）。已经装了旧版的，先卸载，再带版本号安装。

**方式一：在 DSH 里装（推荐）**
打开 DSH「插件 → 添加插件」，输入框里填 `dsh-notify-tray@0.1.6`（带上版本号），点「安装」。

**方式二：命令行**

```sh
# 桌面版（App 内置的 dsh 命令），带上版本号才能装到最新版
dsh plugin --profile desktop add dsh-notify-tray@0.1.6
# 或者 Web / 命令行 profile
dsh plugin --profile web add dsh-notify-tray@0.1.6
```

**方式三：从 Git 仓库装**（想用还没发版的最新代码时）

在「插件 → 添加插件」里填 `https://github.com/ROYLeXJ/dsh-notify-tray.git`，或运行 `dsh plugin --profile desktop add https://github.com/ROYLeXJ/dsh-notify-tray.git`；也可以先克隆仓库再从本地目录安装：`dsh plugin --profile desktop add /path/to/dsh-notify-tray`。

这条路**需要本机装有 Git**，没有 Git 会报 `ERR_PNPM_GIT_RESOLVE_FAILED … 'git' 不是内部或外部命令`。Windows 先到 <https://git-scm.com/download/win> 下载安装（一路默认即可），装完重启 DSH；macOS 在终端里运行一次 `git --version`，按提示安装命令行工具即可。

装好后重启 DSH。插件页上显示的版本号就是装上的版本，最新版见 [npm](https://www.npmjs.com/package/dsh-notify-tray)。

> **装到的不是最新版？** 最常见的原因是上面说的 pnpm `minimumReleaseAge`：新版本发布后要过一段观察期才会被自动安装，安装提示里会写「发布时间未满规定时长的版本不会被自动安装」。解决办法是先卸载，再带版本号安装：
>
> ```sh
> dsh plugin --profile desktop remove dsh-notify-tray
> dsh plugin --profile desktop add dsh-notify-tray@0.1.6
> ```
>
> 另外，官方 npm 源连不上时 DSH 会退到 npmmirror（淘宝镜像），镜像比官方源晚一点同步，刚发的新版可能要等几分钟才到。

更新：同样建议带版本号，先 `dsh plugin --profile desktop remove dsh-notify-tray`，再 `dsh plugin --profile desktop add dsh-notify-tray@<新版本号>`。卸载：`dsh plugin --profile desktop remove dsh-notify-tray`。

## 设置

所有选项都可以在 DSH「插件 → 小鲸鱼通知站」页里修改，也可以写在 profile 的 `cordis.patch.yml` 里。设置页首屏只有常用的几项（通知勾选、提示音、状态栏小鲸鱼、今日花费卡片、我的套餐和额度查询）；通知通道、花费算法、自定义单价、汇率、各种刷新间隔都在页面底部的「高级设置」里，默认折叠，改过的项会标「已改 n 项」。

```yaml
- id: notify-tray
  config:
    channel: auto            # auto | client | system | both | off
    notifyInput: true
    spendSource: auto        # auto | balance | estimate
    planProvider: kimi       # 套餐所属平台，见下表
    planId: cn-pro           # 预设套餐 ID；选「手填」留空
    planApiKeyEnv: KIMI_CODE_TOKEN
    prices:                  # 可选：每百万 token 价格，键是「provider/model」、模型 ID 或前缀
      deepseek-flash: { input: 2, cacheRead: 0.04, output: 8 }
```

### 通知与状态栏

| 选项 | 默认值 | 说明 |
|---|---|---|
| `notifyCompleted` / `notifyFailed` / `notifyApproval` / `notifyChoice` / `notifyInput` | 全部开启 | 分别控制五类通知 |
| `channel` | `auto` | `auto`：有 DSH 窗口时由窗口弹，没有窗口时由系统弹 |
| `suppressWhenFocused` | `true` | 你正在看这个会话时不弹通知（切到别的应用去就有了） |
| `sound` | `true` | 系统通知带提示音（macOS「叮」一声、Windows 通知音、Linux 视桌面环境而定） |
| `tray` | `true` | 是否显示状态栏图标（macOS / Linux，保存后立即生效；Windows 忽略）。在状态栏菜单里点「隐藏状态栏图标」后，可在插件设置页点「重新显示状态栏图标」把它找回来，不用重启 DSH |
| `titleStyle` | `text` | macOS 菜单栏鲸鱼旁边显示什么：`text`（待处理 1 / 运行中 2）、`count`（只有数字）、`icon`（只有鲸鱼） |
| `showSpendInTitle` | `false` | macOS 菜单栏文字里附带今日花费 |
| `errorHoldMinutes` | `10` | 任务失败后图标保持红色 / 挂「×」的分钟数（macOS / Linux） |

### 花费与价格

| 选项 | 默认值 | 说明 |
|---|---|---|
| `spendSource` | `auto` | 有 DeepSeek 账户余额时用余额扣费，否则按价格估算。`auto` 下余额扣费落后于 DeepSeek 模型的估算时（平台扣费有延迟），先按估算显示，余额追上后再改回余额；其它平台模型的花费始终按估算加上 |
| `currency` | `CNY` | 显示币种 |
| `balancePollMinutes` | `5` | DeepSeek 账户余额刷新间隔（分钟） |
| `priceSource` | `auto` | 估算用哪个价：`auto`（价格表 → 自定义价 → DSH 自带的模型目录价 → 插件内置价）、`catalog`、`custom` |
| `customInput` / `customCacheRead` / `customOutput` | 空 | 自定义价，每百万 token；留空不用 |
| `customPriceCurrency` | `CNY` | 自定义价的币种 |
| `exchangeRate` | `7.2` | 1 美元 = ? 人民币；目录价是美元，显示人民币时按它换算 |
| `prices` | `{}` | 按模型的价格表，优先级最高 |

「当前 API 价格」区域会显示你正在用的模型（provider / model）和它的目录价：DSH 的 pi-ai 适配器自带一份模型目录（Claude、GPT、Gemini、Grok、Groq、Kimi、GLM、MiMo、MiniMax、OpenCode Go、DeepSeek 等），插件直接读它，拿不到的再用内置价或你填的自定义价。桌面版和 `dsh web` 都会自动找到这份目录（全局 npm 安装如 `~/.npm-global`、Windows 的 `%APPDATA%\npm`，pnpm，以及 nvm / fnm / volta 装的 node；实在找不到时会问一次 `npm root -g`）。启动时没找到的话，插件每 10 分钟再找一次。如果设置页仍提示没找到，可以设置环境变量 `DSH_NOTIFY_TRAY_PI_AI` 指向 DSH 的安装目录（例如 `~/.npm-global/lib/node_modules/@deepseek-ai/dsh`）后重启。一键「把目录价填进自定义价」可以在目录价的基础上改。

### 套餐

| 选项 | 默认值 | 说明 |
|---|---|---|
| `planProvider` | `none` | `none` / `custom` / `deepseek` / `kimi` / `glm` / `opencode` / `mimo` / `gemini` / `grok` / `claude` / `gpt` / `minimax` |
| `planId` | 空 | 预设套餐 ID（在设置页的下拉框里选，会自动填好名称、价格、周期、币种、额度说明） |
| `planName` / `planPrice` / `planPeriod` / `planCurrency` / `planQuota` | 预设 | 每一项都可以改；留空用预设 |
| `planBalance` | 空 | 套餐余额 / 预付费余额（手填；能从接口拿到时留空） |
| `planRemaining` | 空 | 剩余额度，例如「68%」「1200 次」（手填优先于接口） |
| `planResetAt` | 空 | 下次重置时间（手填） |
| `planApiKeyEnv` | 空 | 查询额度用的 API Key 引用（环境变量名，和 DSH「模型」页保存密钥时用的名字一样；插件只在查询额度时读取） |
| `planQuotaUrl` | 预设 | 额度查询地址，留空用预设 |
| `planAutoQuota` | `true` | 有接口时定时自动获取 |
| `quotaPollMinutes` | `10` | 额度刷新间隔（分钟） |

内置套餐预设（价格是写入时的官网标价，随时可能变，都能改）：

| 平台 | 预设 | 能自动获取的 |
|---|---|---|
| DeepSeek | 按量付费 | 账户余额 `GET /user/balance` |
| Kimi | 会员 Go / Plus / Pro / Max / Ultra（国内 ¥49–1399、国际 $19–199）、旧版 Kimi Code、Moonshot 按量 | Kimi Code 额度 `GET api.kimi.com/coding/v1/usages`（要 Kimi Code 的 OAuth token，不是 Moonshot API Key）；Moonshot 余额 |
| GLM | Coding Plan Lite / Pro / Max（国内 ¥118 / 538 / 1078，Z.ai $18 / 80 / 168） | 5 小时与每周积分 `GET /api/monitor/usage/quota/limit` |
| OpenCode | Go $10、Go Plus $40、Zen 按量 | 无公开接口 |
| MiMo | Token Plan Lite / Standard / Pro / Max（¥39 / 99 / 329 / 659） | 无 API Key 可用的接口（只认控制台 Cookie） |
| Gemini | Google AI Plus / Pro / Ultra、API 按量 | 无 |
| Grok | SuperGrok Lite / 标准 / Plus / Heavy、API 按量 | 只能验证 Key 有效（`GET /v1/api-key`），无余额 |
| Claude | Pro / Max 5x / Max 20x / Team、API 按量 | 普通 Key 无接口 |
| GPT | ChatGPT Go / Plus / Pro 5x / Pro 20x / Business、API 按量 | 普通 Key 无接口 |
| MiniMax | M Plan Go / Explore / Build（国内 ¥49 / 119 / 469，国际 $22 / 55 / 132）、旧版 Coding Plan | 5 小时窗口剩余 `GET /v1/coding_plan/remains` |

拿不到的信息就手填；留空也可以，留空的项不显示。macOS / Linux 的状态栏菜单里，余额和套餐合在一行「余额 ¥… · 平台 剩 …」，子菜单里有 DeepSeek 余额、套餐名和价格、剩余额度和重置时间、「刷新额度」和用量页链接；接口返回的完整明细在设置页里看。状态栏菜单只有一层子菜单，每个最多 6 行、每行不超过 24 个字，在 Windows / Linux 托盘里也不会被屏幕边缘截断。

## 说明

- **通知的触发时机**：任务跑完算「完成」；出错、超出 Token 上限、被拦截算「失败」；你自己点停止不弹通知。调用 `ask_user_question` 时，带选项的问题和计划审批算「需要选择」，不带选项的算「需要输入」；工具审批算「需要批准」。只跟踪顶层会话，子 agent 不单独弹通知。
- **花费怎么算**：用 DeepSeek 账户登录时，按账户余额的下降累计当天花费（充值不算负花费；平台扣费有延迟，`auto` 下余额没跟上时先按估算显示）；同时按当天各「provider/model」的 Token 乘以单价估算（单价来源见上面的 `priceSource`），「今日」子菜单里按模型分行显示（最多 3 个模型）。账本存在 `~/.dsh/storages/dsh-notify-tray/ledger.json`，保留 31 天。
- **DeepSeek 空闲时段价格**：DeepSeek 的标价是高峰价（北京时间工作日 9–12、14–18 点），其余时间用的 token 按半价估算；你自己填的价（价格表或自定义价）按原样算。
- **点击通知 / 状态栏图标 / 菜单里的「打开 DeepSeek Harness」**：有桌面版时唤起桌面版，没有时（`dsh web`）在浏览器里打开 Web 界面。浏览器里的通知需要先允许通知权限。
  - 默认的 `channel: auto` 下，只要开着 DSH 窗口，通知就由窗口弹，三个系统上点击都能跳到对应会话。
  - **macOS 系统通知**（`dsh web` 或 `channel: system`）用 `osascript` 发，点击时没法告诉 DSH 是哪个会话。装上 [terminal-notifier](https://github.com/julienXX/terminal-notifier)（`brew install terminal-notifier`）后插件会自动改用它，点通知就能打开对应会话。
  - **Windows 系统通知**只能唤起应用，所以通知弹出后一分钟内被拉到前面的窗口，会打开这条通知对应的会话。Windows 不允许后台进程把被别的窗口挡住的*可见*窗口拉到最前（见 [#4](https://github.com/ROYLeXJ/dsh-notify-tray/issues/4)）；最小化的窗口会被恢复。

## 已知限制

- macOS、Windows、Linux 均已完成验证（Linux 在 web profile 下验证了通知与系统托盘）。
