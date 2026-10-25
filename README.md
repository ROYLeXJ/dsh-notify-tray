# dsh-notify-tray

DeepSeek Harness（DSH）的通知 + 状态栏插件，支持 macOS、Windows、Linux。

- **系统通知**：任务完成、任务失败、需要批准、需要你选择、需要你输入时弹系统通知，文案是大肥鱼的口吻（比如「🐳 搞定啦～『写周报』做完了！快来验收」）。点击通知会跳到对应会话。
- **状态栏大肥鱼**：状态栏常驻一只大肥鱼，用姿态告诉你现在的状态；下拉菜单里是正在运行的任务、等你处理的事项、今日用量和最近结束的任务，点一下就能跳到对应会话。
- **插件设置页**：所有选项都能在 DSH「插件」页里直接改，包括当前模型的 API 价格和你买的套餐（Kimi / GLM / OpenCode / MiMo / Gemini / Grok / Claude / GPT / MiniMax / Groq / DeepSeek 或自定义），能从接口拿到的余额 / 剩余额度自动拿，拿不到的手填。

![四种状态](assets/preview.svg)

| 大肥鱼的样子 | 含义 |
|---|---|
| 安静地待着 | 空闲 |
| 鼻子前冒泡泡（会动） | 有任务在运行 |
| 鼻子前冒出 `!` | 有事等你处理（批准 / 选择 / 输入） |
| 鼻子前冒出 `×` | 刚有任务失败（默认保持 10 分钟） |

macOS 上大肥鱼是菜单栏图标，颜色自动跟随菜单栏，旁边显示 `待处理 1` / `运行中 2` 这样的文字；Windows / Linux 上用颜色区分状态（🔵 空闲/运行中、🟠 等你处理、🔴 刚失败）。Windows 桌面版自带托盘图标，插件不再额外加一个，只提供通知。

## 安装

**前提：本机要装有 Git。** 安装时 DSH 会用 Git 拉取仓库，没有 Git 会报 `ERR_PNPM_GIT_RESOLVE_FAILED … 'git' 不是内部或外部命令`。

- Windows：先到 <https://git-scm.com/download/win> 下载安装 Git（一路默认即可），装完重启 DSH。
- macOS：终端里运行一次 `git --version`，按提示安装命令行工具即可。

**方式一：在 DSH 里装（推荐）**
打开 DSH「插件 → 添加插件」，输入框里填 `https://github.com/ROYLeXJ/dsh-notify-tray.git`，点「安装」。

**方式二：命令行**

```sh
# 桌面版（App 内置的 dsh 命令）
dsh plugin --profile desktop add https://github.com/ROYLeXJ/dsh-notify-tray.git
# 或者 Web / 命令行 profile
dsh plugin --profile web add https://github.com/ROYLeXJ/dsh-notify-tray.git
# 也可以先下载 / 克隆仓库，再从本地目录安装
dsh plugin --profile desktop add /path/to/dsh-notify-tray
```

装好后重启 DSH。卸载：`dsh plugin --profile desktop remove dsh-notify-tray`。

## 设置

所有选项都可以在 DSH「插件 → 大肥鱼通知站 → 配置」里修改，也可以写在 profile 的 `cordis.patch.yml` 里：

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
| `tray` | `true` | 是否显示状态栏图标（修改后重启生效） |
| `titleStyle` | `text` | macOS 菜单栏大肥鱼旁边显示什么：`text`（待处理 1 / 运行中 2）、`count`（只有数字）、`icon`（只有大肥鱼） |
| `showSpendInTitle` | `false` | macOS 菜单栏文字里附带今日花费 |
| `errorHoldMinutes` | `10` | 任务失败后图标保持红色的分钟数 |

### 花费与价格

| 选项 | 默认值 | 说明 |
|---|---|---|
| `spendSource` | `auto` | 有 DeepSeek 账户余额时用余额扣费，否则按价格估算 |
| `currency` | `CNY` | 显示币种 |
| `balancePollMinutes` | `5` | DeepSeek 账户余额刷新间隔（分钟） |
| `priceSource` | `auto` | 估算用哪个价：`auto`（价格表 → 自定义价 → DSH 自带的模型目录价 → 插件内置价）、`catalog`、`custom` |
| `customInput` / `customCacheRead` / `customOutput` | 空 | 自定义价，每百万 token；留空不用 |
| `customPriceCurrency` | `CNY` | 自定义价的币种 |
| `exchangeRate` | `7.2` | 1 美元 = ? 人民币；目录价是美元，显示人民币时按它换算 |
| `prices` | `{}` | 按模型的价格表，优先级最高 |

「当前 API 价格」区域会显示你正在用的模型（provider / model）和它的目录价：DSH 的 pi-ai 适配器自带一份模型目录（Claude、GPT、Gemini、Grok、Groq、Kimi、GLM、MiMo、MiniMax、OpenCode Go、DeepSeek 等），插件直接读它，拿不到的再用内置价或你填的自定义价。一键「把目录价填进自定义价」可以在目录价的基础上改。

### 套餐

| 选项 | 默认值 | 说明 |
|---|---|---|
| `planProvider` | `none` | `none` / `custom` / `deepseek` / `kimi` / `glm` / `opencode` / `mimo` / `gemini` / `grok` / `claude` / `gpt` / `minimax` / `groq` |
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
| Groq | Free / Developer | 无（只在响应头里） |

拿不到的信息就手填；留空也可以，留空的项不显示。状态栏菜单里会多一行「套餐 · 名称 · 价格 · 剩余」，子菜单里有余额、剩余额度、重置时间、接口返回的明细、「刷新额度」和用量页 / 价格页链接。

## 说明

- **通知的触发时机**：任务跑完算「完成」；出错、超出 Token 上限、被拦截算「失败」；你自己点停止不弹通知。调用 `ask_user_question` 时，带选项的问题和计划审批算「需要选择」，不带选项的算「需要输入」；工具审批算「需要批准」。只跟踪顶层会话，子 agent 不单独弹通知。
- **花费怎么算**：用 DeepSeek 账户登录时，按账户余额的下降累计当天花费（充值不算负花费，会受平台扣费延迟影响）；同时按当天各「provider/model」的 Token 乘以单价估算（单价来源见上面的 `priceSource`），「今日用量」子菜单里按模型分行显示。账本存在 `~/.dsh/storages/dsh-notify-tray/ledger.json`，保留 31 天。
- **点击托盘图标 / 通知 / 菜单里的「打开 DeepSeek Harness」**：有桌面版时唤起桌面版，没有时（`dsh web`）在浏览器里打开 Web 界面。浏览器里的通知需要先允许通知权限。

## 已知限制

- 只在 macOS 和 Windows 上完成了验证，Linux 上还没有完成验证。
