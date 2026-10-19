# dsh-notify-tray

DeepSeek Harness（DSH）的通知 + 状态栏插件，支持 macOS、Windows、Linux（含 UOS、Deepin、银河麒麟）。

- **系统通知**：任务完成、任务失败、需要批准、需要你选择、需要你输入时弹系统通知。点击通知会跳到对应会话。
- **状态栏小图标**：常驻显示运行中的任务数、等你处理的任务数、今日完成/失败数、今日花费、账户余额和今日 Token 用量。点击菜单里的会话可以直接跳过去。

不需要编译任何原生程序，三个平台都只用系统自带的能力：

| 平台 | 状态栏 | 系统通知 |
|---|---|---|
| macOS | JXA 脚本（`osascript`）驱动 NSStatusItem。菜单栏直接显示文字，例如 `⚠1 ▶2 ¥1.23` | DSH 窗口内的原生通知；没有窗口时用 `osascript` |
| Windows | 系统自带的 PowerShell 5.1 + WinForms NotifyIcon。图标颜色和数字表示状态，悬停显示摘要 | DSH 窗口内的原生通知；没有窗口时用托盘气泡（在 Win10/11 上显示为 Toast） |
| Linux | 纯 JS 的 D-Bus（`dbus-next`）实现 StatusNotifierItem 协议。适用于 x86_64、ARM64（鲲鹏、飞腾）、LoongArch 等各种 CPU | `org.freedesktop.Notifications`（可点击），没有时退回 `notify-send` |

> Windows 和 Linux 的系统托盘图标只能显示图标，不能显示文字，这是操作系统的限制。所以这两个平台用颜色和数字表示状态，详细信息在悬停提示和右键菜单里。
>
> 图标颜色：🟠 等你处理　🔴 刚失败　🔵 运行中　🟢 空闲

## 安装

```sh
# 桌面版（App 内置的 dsh 命令）
dsh plugin --profile desktop add /path/to/dsh-notify-tray
# 或者 Web / 命令行 profile
dsh plugin --profile web add /path/to/dsh-notify-tray
```

装好后重启 DSH。卸载：`dsh plugin --profile desktop remove dsh-notify-tray`。

## 设置

所有选项都可以在 DSH 设置页修改，也可以写在 profile 的 `cordis.patch.yml` 里：

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
| `suppressWhenFocused` | `true` | 你正在看这个会话时不弹通知 |
| `tray` | `true` | 是否显示状态栏图标（修改后重启生效） |
| `showSpendInTitle` | `true` | macOS 菜单栏文字里显示今日花费 |
| `spendSource` | `auto` | 有 DeepSeek 账户余额时用余额扣费，否则用价格表估算 |
| `currency` | `CNY` | 显示币种 |
| `balancePollMinutes` | `5` | 账户余额刷新间隔（分钟）。每轮任务结束后 5 秒也会额外刷新一次 |
| `prices` | `{}` | 价格表，只在估算模式下使用 |
| `errorHoldMinutes` | `10` | 任务失败后图标保持红色的分钟数 |

### 花费怎么算

- **余额扣费**（推荐，需要用 DeepSeek 账户登录）：定时读取账户余额，把当天所有的余额下降累加起来。充值不会被算成负花费。这是真实扣费，但会受平台扣费延迟影响。
- **价格表估算**：按模型统计当天的 Token（未命中缓存输入、缓存命中、输出），再乘以你在 `prices` 里填的单价。DSH 没有内置价格表，所以需要你自己填写。

账本存在 `~/.dsh/storages/dsh-notify-tray/ledger.json`，保留 31 天。

## 工作原理

```
DSH 宿主进程（lib/index.js）
 ├─ agent/status、session/event ──► Tracker（任务状态）+ Ledger（Token/花费）
 ├─ deepseekAccount.getBalance ───► Ledger（余额扣费）
 ├─ 状态栏：macOS osascript / Windows powershell 子进程（读 view.json，点击结果写到 stdout）
 │         Linux 在宿主进程内通过 D-Bus 导出 SNI
 ├─ GET notify-tray/state ◄────── DSH 窗口（lib/client.js，每 2 秒轮询一次）→ new Notification
 └─ 没有窗口在轮询时 ──────────► 系统通知兜底（lib/system.js）
```

- **需要选择 / 需要输入**：调用 `ask_user_question` 工具时，带 `options` 的问题算"需要选择"，计划审批也算"需要选择"；不带 `options` 的问题算"需要输入"。
- **需要批准**：对应 `approval/asked` 事件。
- **完成 / 失败**：按 `turn/end` 的 `reason.kind` 区分。`completed` 算完成；`error`、`max-tokens`、`blocked` 算失败；用户主动停止只计数，不弹通知。
- **子 agent**：只跟踪顶层会话，子 agent 不会单独弹通知。

## 开发

```sh
npm install
npm test                         # 单元测试 + 宿主端到窗口端的集成测试
DBUS_CONFIG=... node scripts/sni-smoke.mjs   # Linux 托盘协议冒烟测试（macOS 需先 brew install dbus）
DSH_NOTIFY_TRAY_DEBUG=1 dsh ...  # 把收到的事件记到 storages/dsh-notify-tray/debug.log
```

`reference/` 目录里是 DSH 0.2.1-rc.2 的类型定义和参考插件，只供开发时查阅，运行时不会用到。

## 已知限制

- Linux 上目前没有 DSH 桌面版，Linux 用户一般是用 `dsh web` 加浏览器。浏览器里的通知需要你先在浏览器里允许通知权限。
- 银河麒麟、UOS 的任务栏都支持 StatusNotifierItem。纯 GNOME 需要装 AppIndicator 扩展才能显示托盘图标。没有托盘宿主时插件只会记一条警告，通知功能照常工作。
- 如果开启了 timed 模式的 `ask_user_question`，问题超时后托盘上的"待选择 / 待输入"可能会提前消失，但通知不受影响。
