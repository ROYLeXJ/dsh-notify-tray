# dsh-notify-tray

DeepSeek Harness（DSH）的通知 + 状态栏插件，支持 macOS、Windows、Linux。

- **系统通知**：任务完成、任务失败、需要批准、需要你选择、需要你输入时弹系统通知，文案是小鲸鱼的口吻（比如「🐳 搞定啦～『写周报』做完了！快来验收」）。点击通知会跳到对应会话。
- **状态栏小鲸鱼**：状态栏常驻一只小鲸鱼，用姿态告诉你现在的状态；下拉菜单里是正在运行的任务、等你处理的事项、今日用量和最近结束的任务，点一下就能跳到对应会话。
- **插件设置页**：所有选项都能在 DSH「插件」页里直接改。

![四种状态](assets/preview.svg)

| 鲸鱼的样子 | 含义 |
|---|---|
| 安静地待着 | 空闲 |
| 鼻子前冒泡泡（会动） | 有任务在运行 |
| 鼻子前冒出 `!` | 有事等你处理（批准 / 选择 / 输入） |
| 鼻子前冒出 `×` | 刚有任务失败（默认保持 10 分钟） |

macOS 上鲸鱼是菜单栏图标，颜色自动跟随菜单栏，旁边显示 `待处理 1` / `运行中 2` 这样的文字；Windows / Linux 上用颜色区分状态（🔵 空闲/运行中、🟠 等你处理、🔴 刚失败）。Windows 桌面版自带托盘图标，插件不再额外加一个，只提供通知。

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

所有选项都可以在 DSH「插件 → 小鲸鱼通知站 → 配置」里修改（价格表除外），也可以写在 profile 的 `cordis.patch.yml` 里：

```yaml
- id: notify-tray
  config:
    channel: auto            # auto | client | system | both | off
    notifyInput: true
    spendSource: auto        # auto | balance | estimate
    prices:                  # 可选：每百万 token 价格，键是模型 ID 或前缀
      deepseek-flash: { input: 1, cacheRead: 0.1, output: 4 }
```

| 选项 | 默认值 | 说明 |
|---|---|---|
| `notifyCompleted` / `notifyFailed` / `notifyApproval` / `notifyChoice` / `notifyInput` | 全部开启 | 分别控制五类通知 |
| `channel` | `auto` | `auto`：有 DSH 窗口时由窗口弹，没有窗口时由系统弹 |
| `suppressWhenFocused` | `true` | 你正在看这个会话时不弹通知（切到别的应用去就有了） |
| `tray` | `true` | 是否显示状态栏图标（修改后重启生效） |
| `titleStyle` | `text` | macOS 菜单栏鲸鱼旁边显示什么：`text`（待处理 1 / 运行中 2）、`count`（只有数字）、`icon`（只有鲸鱼） |
| `showSpendInTitle` | `false` | macOS 菜单栏文字里附带今日花费 |
| `spendSource` | `auto` | 有 DeepSeek 账户余额时用余额扣费，否则用价格表估算 |
| `currency` | `CNY` | 显示币种 |
| `balancePollMinutes` | `5` | 账户余额刷新间隔（分钟） |
| `prices` | `{}` | 价格表，只在估算模式下使用 |
| `errorHoldMinutes` | `10` | 任务失败后图标保持红色的分钟数 |

## 说明

- **通知的触发时机**：任务跑完算「完成」；出错、超出 Token 上限、被拦截算「失败」；你自己点停止不弹通知。调用 `ask_user_question` 时，带选项的问题和计划审批算「需要选择」，不带选项的算「需要输入」；工具审批算「需要批准」。只跟踪顶层会话，子 agent 不单独弹通知。
- **花费怎么算**：用 DeepSeek 账户登录时，按账户余额的下降累计当天花费（充值不算负花费，会受平台扣费延迟影响）；否则按当天各模型的 Token 乘以你在 `prices` 里填的单价估算。DSH 没有内置价格表，需要自己填。账本存在 `~/.dsh/storages/dsh-notify-tray/ledger.json`，保留 31 天。
- **点击托盘图标 / 通知 / 菜单里的「打开 DeepSeek Harness」**：有桌面版时唤起桌面版，没有时（`dsh web`）在浏览器里打开 Web 界面。浏览器里的通知需要先允许通知权限。

## 已知限制

- 只在 macOS 和 Windows 上完成了验证，Linux 上还没有完成验证。
