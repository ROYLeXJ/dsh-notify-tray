/**
 * dsh-notify-tray, host half.
 *
 * - Tracks every top-level session (running / waiting for approval, a choice
 *   or text input / last result) from `agent/status` and `session/event`.
 * - Keeps a per-day spend ledger (tokens per provider/model route + priced
 *   estimate + DeepSeek account balance drops) under
 *   ~/.dsh/storages/dsh-notify-tray/.
 * - Knows the user's plan (Kimi / GLM / OpenCode / MiMo / Gemini / Grok /
 *   Claude / GPT / MiniMax / DeepSeek or custom), its price list, and
 *   polls the provider's quota endpoint when it has one and an API key.
 * - Drives a status-bar icon on macOS (menu bar) and Linux (StatusNotifierItem).
 *   Windows has no status bar of the kind: there the plugin only notifies.
 * - Serves `GET notify-tray/state` (+ `/catalog`, `POST /refresh`, `POST /tray`) to the
 *   browser half, which shows native notifications from the DSH window and
 *   renders the settings page; when no window is polling, the host falls
 *   back to OS notifications itself.
 *
 * Each concern lives in lib/host/ and shares one `host` object (context.js):
 * tray.js, notify.js, spend.js, routes.js.
 */
import z from '@deepseek-ai/schemastery'
import { createHost } from './host/context.js'
import { setupNotifications } from './host/notify.js'
import { setupRoutes } from './host/routes.js'
import { setupSpend } from './host/spend.js'
import { setupTray } from './host/tray.js'

export { TRAY_PLATFORMS } from './host/tray.js'

export const name = 'notify-tray'
export const inject = ['agents']

const price = z.object({
  input: z.number().min(0).description('未命中缓存输入，每百万 token 价格'),
  cacheRead: z.number().min(0).description('缓存命中输入，每百万 token 价格'),
  output: z.number().min(0).description('输出，每百万 token 价格'),
})

const currency = () => z.union([z.const('CNY'), z.const('USD')])

export const Config = z.object({
  notifyCompleted: z.boolean().default(true).description('任务完成时通知').volatile(),
  notifyFailed: z.boolean().default(true).description('任务失败时通知').volatile(),
  notifyApproval: z.boolean().default(true).description('需要批准工具调用时通知').volatile(),
  notifyChoice: z.boolean().default(true).description('需要你做选择时通知').volatile(),
  notifyInput: z.boolean().default(true).description('需要你输入文字时通知').volatile(),
  channel: z.union([
    z.const('auto').description('自动：有 DSH 窗口时由窗口弹，没有窗口时由系统弹'),
    z.const('client').description('只由 DSH 窗口弹'),
    z.const('system').description('只由系统弹（适合 dsh web / 命令行）'),
    z.const('both').description('两边都弹'),
    z.const('off').description('不弹通知（macOS / Linux 上只看状态栏）'),
  ]).default('auto').description('通知通道').volatile(),
  suppressWhenFocused: z.boolean().default(true).description('正在看这个会话时不弹').volatile(),
  sound: z.boolean().default(true).description('系统通知带提示音').volatile(),
  tray: z.boolean().default(true).description('显示状态栏图标（macOS / Linux，立即生效；Windows 没有状态栏，忽略此项）').volatile(),
  titleStyle: z.union([
    z.const('text').description('文字：待处理 1 / 运行中 2'),
    z.const('count').description('只显示数字'),
    z.const('icon').description('只显示鲸鱼图标'),
  ]).default('text').description('macOS 菜单栏鲸鱼旁边显示什么').volatile(),
  showSpendInTitle: z.boolean().default(false).description('macOS 菜单栏文字里显示今日花费').volatile(),
  spendSource: z.union([
    z.const('auto').description('自动：有账户余额用余额，否则用价格估算'),
    z.const('balance').description('账户余额扣费'),
    z.const('estimate').description('按价格估算'),
  ]).default('auto').description('花费数据来源').volatile(),
  currency: currency().default('CNY').description('显示币种').volatile(),
  balancePollMinutes: z.number().min(1).max(120).default(5).description('账户余额刷新间隔（分钟）').volatile(),
  prices: z.dict(price).default({}).description('价格表：键是「provider/model」、模型 ID 或前缀，用于估算花费').volatile(),
  errorHoldMinutes: z.number().min(0).max(240).default(10).description('失败后图标保持红色的分钟数').volatile(),

  // ---- 价格 --------------------------------------------------------------
  priceSource: z.union([
    z.const('auto').description('自动：价格表 → 自定义价 → DSH 自带的模型目录价 → 插件内置价'),
    z.const('catalog').description('只用模型目录价 / 内置价'),
    z.const('custom').description('只用自定义价'),
  ]).default('auto').description('估算用哪个价').volatile(),
  customInput: z.number().min(0).description('自定义价：未命中缓存输入，每百万 token').volatile(),
  customCacheRead: z.number().min(0).description('自定义价：缓存命中输入，每百万 token').volatile(),
  customOutput: z.number().min(0).description('自定义价：输出，每百万 token').volatile(),
  customPriceCurrency: currency().default('CNY').description('自定义价的币种').volatile(),
  exchangeRate: z.number().min(0.01).max(1000).default(7.2).description('汇率：1 美元 = ? 人民币（目录价是美元）').volatile(),

  // ---- 套餐 --------------------------------------------------------------
  planProvider: z.string().default('none').description('套餐所属平台：none / custom / deepseek / kimi / glm / opencode / mimo / gemini / grok / claude / gpt / minimax').volatile(),
  planId: z.string().default('').description('预设套餐 ID（空 = 按量付费 / 未选）').volatile(),
  planName: z.string().description('套餐名称（留空用预设）').volatile(),
  planPrice: z.number().min(0).description('套餐价格（留空用预设）').volatile(),
  planPeriod: z.union([z.const('month'), z.const('year'), z.const('week'), z.const('once'), z.const('free')]).default('month').description('计费周期').volatile(),
  planCurrency: currency().default('CNY').description('套餐币种').volatile(),
  planQuota: z.string().description('套餐额度说明（留空用预设）').volatile(),
  planBalance: z.number().description('套餐余额 / 预付费余额（手填）').volatile(),
  planRemaining: z.string().description('套餐剩余额度（手填，例如「68%」「1200 次」）').volatile(),
  planResetAt: z.string().description('下次重置时间（手填）').volatile(),
  planApiKeyEnv: z.string().description('查询额度用的 API Key 引用（环境变量名，例如 KIMI_API_KEY）').volatile(),
  planQuotaUrl: z.string().description('额度查询地址（留空用预设）').volatile(),
  planAutoQuota: z.boolean().default(true).description('有接口时自动获取剩余额度 / 余额').volatile(),
  quotaPollMinutes: z.number().min(1).max(240).default(10).description('额度刷新间隔（分钟）').volatile(),
})

export function apply(ctx, config) {
  const host = createHost(ctx, config)
  setupTray(ctx, host)
  setupNotifications(ctx, host)

  // ---- DSH events -------------------------------------------------------
  const { tracker, ledger, logger, debug } = host
  tracker.seed(ctx.agents.list())
  ctx.on('agent/status', ({ agent, status }) => tracker.agentStatus(agent, status))
  ctx.on('agent/disposed', ({ agent }) => {
    tracker.agentDisposed(agent)
    ledger.forgetSession(agent.id)
  })
  ctx.on('session/event', (session, event) => {
    debug('session/event', session.id, event.type)
    try {
      tracker.sessionEvent(session, event)
      ledger.sessionEvent(session, event)
    } catch (error) {
      logger.warn('处理会话事件失败', event?.type, error)
    }
  })

  setupSpend(ctx, host)
  setupRoutes(ctx, host)
}
