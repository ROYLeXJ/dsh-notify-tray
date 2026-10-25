# dsh-notify-tray

DeepSeek Harness（DSH）的通知 + 状态栏插件，支持 macOS、Windows、Linux（含 UOS、Deepin、银河麒麟）。

- **插件页**：DSH 的「插件」页里有小鲸鱼自己的设置页（和官方插件同款的表单：开关、分段选择、数字框、保存按钮），列表里的名字、介绍、图标来自 `locale/*.json` 的 `meta` 和 `icon.svg`。
- **系统通知**：任务完成、任务失败、需要批准、需要你选择、需要你输入时弹系统通知，文案是小鲸鱼自己的口吻（`lib/voice.js`，每类好几句轮换，比如「🐳 搞定啦～『写周报』做完了！快来验收」「🐳 该你拍板啦 『重构登录』遇到岔路口了：用哪个库？」）。点击通知会跳到对应会话。
- **状态栏小鲸鱼**：常驻一只 DeepSeek Harness 的小鲸鱼（和 App 图标同款，蜷成一圈、尾巴扬在脑后），用姿态告诉你现在的状态；下拉菜单里是正在运行的任务（标题、已运行多久、正在用什么工具）、等你处理的事项，以及今日用量和最近结束的任务，点一下就能跳到对应会话。

![四种状态](assets/preview.svg)

| 鲸鱼的样子 | 含义 |
|---|---|
| 安静地待着 | 空闲 |
| 鼻子前冒泡泡（会动） | 有任务在运行 |
| 鼻子前冒出 `!` | 有事等你处理（批准 / 选择 / 输入） |
| 鼻子前冒出 `×` | 刚有任务失败（默认保持 10 分钟） |

鲸鱼完全由代码画出来（`lib/whale.js` 里手工描摹的曲线，经 Catmull-Rom 样条平滑成贝塞尔），三个平台都用同一份几何数据渲染，没有任何图片文件。macOS 上它是菜单栏模板图标，颜色自动跟随菜单栏（深色壁纸上是白色，浅色上是黑色），旁边只显示 `待处理 1` / `运行中 2` 这样的文字，不显示金额；Windows / Linux 的托盘图标用颜色区分状态（🔵 空闲/运行中、🟠 等你处理、🔴 刚失败）。

不需要编译任何原生程序，三个平台都只用系统自带的能力：

| 平台 | 状态栏 | 系统通知 |
|---|---|---|
| macOS | JXA 脚本（`osascript`）驱动 NSStatusItem，用 NSBezierPath 画鲸鱼，菜单带 SF Symbols 图标和子菜单 | DSH 窗口内的原生通知；没有窗口时用 `osascript` |
| Windows 桌面版 | **不加图标**：桌面版自带一个托盘图标，并排两个不像话；而那个图标的右键菜单是 Electron 主进程里写死的「打开 / 退出」，插件没有通道往里加项 | DSH 窗口内的原生通知；窗口不在时用系统 Toast（WinRT，不依赖托盘图标），点击通过 `dsh://open` 唤起窗口 |
| Windows `dsh web` | 没有桌面版图标时才显示小鲸鱼：系统自带的 PowerShell 5.1 + WinForms NotifyIcon，用 GDI+ 画鲸鱼（按系统 DPI 画，高分屏不发虚），悬停显示摘要 | 浏览器通知；没有页面时用托盘气泡（Win10/11 显示为 Toast，点击跳到对应会话） |
| Linux | 纯 JS 的 D-Bus（`dbus-next`）实现 StatusNotifierItem 协议，鲸鱼由内置的软件光栅器（扫描线、非零环绕）画成像素图，一帧约 1 毫秒。适用于 x86_64、ARM64（鲲鹏、飞腾）、LoongArch 等各种 CPU | `org.freedesktop.Notifications`（可点击），没有时退回 `notify-send` |

点击托盘图标 / 通知 / 菜单里的「打开 DeepSeek Harness」：macOS 激活桌面版；Windows 重新拉起桌面版可执行文件，由 Electron 的单实例锁把已有窗口带到前台；没有桌面版（`dsh web`，Linux 都是这种情况）时在浏览器里打开 Web 界面。

## 安装

```sh
# 桌面版（App 内置的 dsh 命令）
dsh plugin --profile desktop add /path/to/dsh-notify-tray
# 或者 Web / 命令行 profile
dsh plugin --profile web add /path/to/dsh-notify-tray
```

装好后重启 DSH。卸载：`dsh plugin --profile desktop remove dsh-notify-tray`。

## 设置

所有选项都可以在 DSH「插件 → 小鲸鱼通知站 → notify-tray → 配置」里修改（价格表除外），也可以写在 profile 的 `cordis.patch.yml` 里：

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
| `suppressWhenFocused` | `true` | 你正在看这个会话时不弹通知（所以盯着窗口等它跑完是看不到通知的，切到别的应用去就有了） |
| `tray` | `true` | 是否显示状态栏图标（修改后重启生效） |
| `titleStyle` | `text` | macOS 菜单栏鲸鱼旁边显示什么：`text`（待处理 1 / 运行中 2）、`count`（只有数字）、`icon`（只有鲸鱼） |
| `showSpendInTitle` | `false` | macOS 菜单栏文字里附带今日花费 |
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
node scripts/render-icons.mjs    # 改过 lib/whale.js 后重新生成 icon.svg 和 assets/preview.svg
node scripts/demo.mjs            # 演示：空闲 → 工作中 → 完成（含通知）→ 空闲；--all 再加 等你处理 / 失败；--live 驱动真实鲸鱼
node scripts/sni-smoke.mjs       # Linux 托盘协议冒烟测试：起一个私有 dbus-daemon 扮演任务栏（macOS 需先 brew install dbus）
DSH_NOTIFY_TRAY_DEBUG=1 dsh ...  # 把收到的事件记到 storages/dsh-notify-tray/debug.log
```

`reference/` 目录里是 DSH 0.2.1-rc.2 的类型定义和参考插件，只供开发时查阅，运行时不会用到。

## 已知限制

- 目前只在 macOS 上实际跑过；Windows / Linux 的代码经过静态检查和协议层冒烟测试（`scripts/sni-smoke.mjs` 用私有 dbus-daemon 扮演任务栏），但还没有在真机上验证过。
- Linux 上目前没有 DSH 桌面版，Linux 用户一般是用 `dsh web` 加浏览器。浏览器里的通知需要你先在浏览器里允许通知权限。
- 银河麒麟、UOS 的任务栏都支持 StatusNotifierItem。纯 GNOME 需要装 AppIndicator 扩展才能显示托盘图标。没有托盘宿主时插件只会记一条警告，通知功能照常工作。
- Linux 会话总线地址取自 `DBUS_SESSION_BUS_ADDRESS`（支持 dbus-launch 的 `unix:abstract=` 地址，不需要原生模块），没有时用 systemd 的 `$XDG_RUNTIME_DIR/bus`；从 ssh 或 systemd 服务里启动 `dsh web` 时要自己把这些环境变量带上。
- Windows 桌面版里没有状态栏图标，账户余额、今日用量这些只能在 macOS / Linux 的菜单里看（要进桌面版自己的托盘菜单得改 DSH 本身）。系统 Toast 以「Windows PowerShell」的名义发出（它的 AppUserModelID 每台 Win10/11 都注册了，DSH 自己的插件拿不到），标题和正文还是小鲸鱼的。
- Windows `dsh web` 的托盘助手要求能运行 PowerShell 5.1 脚本并加载 WinForms（AppLocker / 受限语言模式会挡住它，那时只剩通知功能）。
- 如果开启了 timed 模式的 `ask_user_question`，问题超时后托盘上的"待选择 / 待输入"可能会提前消失，但通知不受影响。
