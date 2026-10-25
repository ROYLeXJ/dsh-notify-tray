/**
 * Plan + price catalog: the subscriptions and API list prices of the
 * providers people plug into DeepSeek Harness, plus which quota endpoint
 * each one exposes to an API key.
 *
 * Pure data + helpers, no DSH imports (shared by the host, the browser half
 * through `GET notify-tray/catalog`, and the tests). Prices are per million
 * tokens in the row's own currency. Plan prices are list prices at the time
 * of writing — the settings page lets the user overwrite every figure.
 */

/** DSH provider route names (pi-ai ids and the built-in DeepSeek routes) → catalog provider id. */
const ROUTE_MAP = {
  deepseek: 'deepseek',
  'deepseek-account': 'deepseek',
  'deepseek-api-key': 'deepseek',
  'deepseek-official': 'deepseek',
  'kimi-coding': 'kimi',
  moonshotai: 'kimi',
  'moonshotai-cn': 'kimi',
  zai: 'glm',
  'zai-coding-cn': 'glm',
  opencode: 'opencode',
  'opencode-go': 'opencode',
  xiaomi: 'mimo',
  'xiaomi-token-plan-cn': 'mimo',
  'xiaomi-token-plan-sgp': 'mimo',
  'xiaomi-token-plan-ams': 'mimo',
  google: 'gemini',
  'google-vertex': 'gemini',
  xai: 'grok',
  anthropic: 'claude',
  openai: 'gpt',
  'openai-codex': 'gpt',
  minimax: 'minimax',
  'minimax-cn': 'minimax',
}

const PERIOD_LABEL = { month: '月', year: '年', week: '周', once: '次', free: '' }
const SYMBOL = { CNY: '¥', USD: '$' }

const P = (input, cacheRead, output, name, extra = {}) => ({ input, cacheRead, output, name, ...extra })
const plan = (id, name, price, currency, period, quotaText, extra = {}) => ({ id, name, price, currency, period, quotaText, ...extra })

export const PROVIDERS = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    home: 'CNY',
    pricingUrl: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing',
    consoleUrl: 'https://platform.deepseek.com/usage',
    prices: {
      // 高峰价（北京时间工作日 9–12、14–18 点）；空闲时段减半。
      'deepseek-flash': P(2, 0.04, 8, 'DeepSeek V4.1 Flash', { currency: 'CNY' }),
      'deepseek-v4.1-flash': P(2, 0.04, 8, 'DeepSeek V4.1 Flash', { currency: 'CNY' }),
      'deepseek-v4-flash': P(2, 0.04, 8, 'DeepSeek V4 Flash', { currency: 'CNY' }),
      'deepseek-v4-pro': P(9, 0.3, 27, 'DeepSeek V4 Pro', { currency: 'CNY' }),
      'deepseek-chat': P(2, 0.04, 8, 'deepseek-chat', { currency: 'CNY' }),
      'deepseek-reasoner': P(9, 0.3, 27, 'deepseek-reasoner', { currency: 'CNY' }),
    },
    plans: [
      plan('payg', '按量付费（充值余额）', 0, 'CNY', 'free', '按 token 计费，高峰 / 空闲时段价格不同；余额用完即止'),
    ],
    quota: { kind: 'deepseek-balance', url: 'https://api.deepseek.com/user/balance', auth: 'bearer' },
    keyEnv: 'DEEPSEEK_API_KEY',
  },
  {
    id: 'kimi',
    name: 'Kimi（月之暗面）',
    home: 'CNY',
    pricingUrl: 'https://www.kimi.com/help/membership/membership-pricing',
    consoleUrl: 'https://www.kimi.com/code/console',
    prices: {
      'kimi-k3.1-pro': P(13, 1.3, 68, 'Kimi K3.1 Pro', { currency: 'CNY' }),
      'kimi-k3.1-pro-highspeed': P(26, 1.3, 136, 'Kimi K3.1 Pro HighSpeed', { currency: 'CNY' }),
      'kimi-k3': P(20, 2, 100, 'Kimi K3', { currency: 'CNY' }),
      'kimi-k2.7-code': P(6.5, 1.3, 27, 'Kimi K2.7 Code', { currency: 'CNY' }),
      'kimi-k2.7-code-highspeed': P(13, 2.6, 54, 'Kimi K2.7 Code HighSpeed', { currency: 'CNY' }),
      'kimi-for-coding': P(6.5, 1.3, 27, 'Kimi For Coding', { currency: 'CNY' }),
    },
    plans: [
      plan('cn-go', 'Kimi 会员 Go', 49, 'CNY', 'month', '不含 Kimi Code；年付 ¥468'),
      plan('cn-plus', 'Kimi 会员 Plus（含 Kimi Code）', 99, 'CNY', 'month', 'Kimi Code 5 小时滚动窗口 + 月度共享额度池；年付 ¥948'),
      plan('cn-pro', 'Kimi 会员 Pro', 199, 'CNY', 'month', 'Agent 额度 2 倍；含 1M 上下文与 HighSpeed；年付 ¥1908'),
      plan('cn-max', 'Kimi 会员 Max', 699, 'CNY', 'month', 'Agent 额度 5 倍；年付 ¥6708'),
      plan('cn-ultra', 'Kimi 会员 Ultra', 1399, 'CNY', 'month', 'Agent 额度 10 倍；年付 ¥13428'),
      plan('intl-plus', 'Kimi Plus（国际）', 19, 'USD', 'month', 'Kimi Code 5 小时滚动窗口 + 月度共享额度池；年付 $180'),
      plan('intl-pro', 'Kimi Pro（国际）', 39, 'USD', 'month', 'Agent 额度 2 倍；年付 $372'),
      plan('intl-max', 'Kimi Max（国际）', 99, 'USD', 'month', 'Agent 额度 5 倍；年付 $948'),
      plan('intl-ultra', 'Kimi Ultra（国际）', 199, 'USD', 'month', 'Agent 额度 10 倍；年付 $1908'),
      plan('legacy', '旧版 Kimi Code（Andante / Moderato / Allegretto / Allegro / Vivace）', 0, 'CNY', 'month', '每 5 小时滚动窗口 + 每 7 天周额度；价格请手填'),
      plan('payg', 'Moonshot 开放平台 按量付费', 0, 'CNY', 'free', '按 token 计费', { quotaApi: { kind: 'moonshot-balance', url: 'https://api.moonshot.cn/v1/users/me/balance', auth: 'bearer' } }),
    ],
    // Kimi Code's usage endpoint takes the Kimi Code OAuth access token (~/.kimi/credentials/kimi-code.json), not a Moonshot API key.
    quota: { kind: 'kimi-usage', url: 'https://api.kimi.com/coding/v1/usages', auth: 'bearer' },
    keyEnv: 'KIMI_CODE_TOKEN',
  },
  {
    id: 'glm',
    name: 'GLM（智谱 / Z.ai）',
    home: 'CNY',
    pricingUrl: 'https://docs.bigmodel.cn/cn/coding-plan/overview',
    consoleUrl: 'https://bigmodel.cn/usercenter/resourcepack',
    prices: {
      'glm-5.3': P(8, 2, 28, 'GLM-5.3', { currency: 'CNY' }),
      'glm-5.3-flash': P(0.8, 0.23, 2.8, 'GLM-5.3-Flash', { currency: 'CNY' }),
      'glm-5.3-flashx': P(2, 0.57, 7, 'GLM-5.3-FlashX', { currency: 'CNY' }),
      'glm-5.2': P(8, 2, 28, 'GLM-5.2', { currency: 'CNY' }),
      'glm-4.7': P(0.6, 0.11, 2.2, 'GLM-4.7', { currency: 'USD' }),
    },
    plans: [
      plan('lite-cny', 'GLM Coding Plan · Lite', 118, 'CNY', 'month', '每 5 小时 2000 积分 / 每周 10000 积分'),
      plan('pro-cny', 'GLM Coding Plan · Pro', 538, 'CNY', 'month', '每 5 小时 12000 积分 / 每周 60000 积分'),
      plan('max-cny', 'GLM Coding Plan · Max', 1078, 'CNY', 'month', '每 5 小时 28000 积分 / 每周 140000 积分'),
      plan('lite-usd', 'GLM Coding Plan · Lite（Z.ai）', 18, 'USD', 'month', '2000 credits / 5 h · 10000 credits / week', { quotaApi: { kind: 'zai-quota', url: 'https://api.z.ai/api/monitor/usage/quota/limit', auth: 'bearer' } }),
      plan('pro-usd', 'GLM Coding Plan · Pro（Z.ai）', 80, 'USD', 'month', '12000 credits / 5 h · 60000 credits / week', { quotaApi: { kind: 'zai-quota', url: 'https://api.z.ai/api/monitor/usage/quota/limit', auth: 'bearer' } }),
      plan('max-usd', 'GLM Coding Plan · Max（Z.ai）', 168, 'USD', 'month', '28000 credits / 5 h · 140000 credits / week', { quotaApi: { kind: 'zai-quota', url: 'https://api.z.ai/api/monitor/usage/quota/limit', auth: 'bearer' } }),
      plan('payg', '按量付费', 0, 'CNY', 'free', '按 token 计费'),
    ],
    quota: { kind: 'zai-quota', url: 'https://open.bigmodel.cn/api/monitor/usage/quota/limit', auth: 'bearer' },
    keyEnv: 'ZAI_API_KEY',
  },
  {
    id: 'opencode',
    name: 'OpenCode（Zen / Go）',
    home: 'USD',
    pricingUrl: 'https://opencode.ai/docs/zen/',
    consoleUrl: 'https://opencode.ai/console',
    prices: {
      'claude-opus-5-5': P(4, 0.2, 20, 'Claude Opus 5.5 (Zen)', { currency: 'USD' }),
      'gpt-6.1-sol': P(2, 0.1, 10, 'GPT 6.1 Sol (Zen)', { currency: 'USD' }),
      'kimi-k3.1-pro': P(2, 0.2, 10, 'Kimi K3.1 Pro (Zen / Go)', { currency: 'USD' }),
      'glm-5.3': P(1.4, 0.26, 4.4, 'GLM 5.3 (Zen / Go)', { currency: 'USD' }),
      'glm-5.3-flash': P(0.15, 0.03, 0.5, 'GLM 5.3 Flash (Zen / Go)', { currency: 'USD' }),
      'minimax-m3': P(0.3, 0.06, 1.2, 'MiniMax M3 (Zen / Go)', { currency: 'USD' }),
      'deepseek-v4.1-flash': P(0.3, 0.006, 1.2, 'DeepSeek V4.1 Flash (Zen / Go)', { currency: 'USD' }),
    },
    plans: [
      plan('go', 'OpenCode Go', 10, 'USD', 'month', '按模型的月度美元额度（如 Kimi K3.1 Pro $15、GLM-5.3-Flash $60、DeepSeek V4.1 Flash $80）；5 小时窗口 = 月额度 20%，每周 = 50%'),
      plan('go-plus', 'OpenCode Go Plus', 40, 'USD', 'month', '更高的月度额度（如 Kimi K3.1 Pro $60、GLM-5.3-Flash $180）'),
      plan('zen', 'OpenCode Zen / Console 按量付费', 0, 'USD', 'free', '预充值，按各模型目录价计费'),
    ],
    quota: undefined,
    keyEnv: 'OPENCODE_API_KEY',
  },
  {
    id: 'mimo',
    name: 'MiMo（小米）',
    home: 'CNY',
    pricingUrl: 'https://mimo.mi.com/docs/zh-CN/tokenplan/Token%20Plan/subscription',
    consoleUrl: 'https://platform.xiaomimimo.com/',
    prices: {
      'mimo-v2.6-pro': P(3, 0.025, 6, 'MiMo-V2.6-Pro', { currency: 'CNY' }),
      'mimo-v2.6-flash': P(1, 0.02, 2, 'MiMo-V2.6-Flash', { currency: 'CNY' }),
      'mimo-v2.6-pro-ultraspeed': P(30, 0.25, 60, 'MiMo-V2.6-Pro UltraSpeed', { currency: 'CNY' }),
      'mimo-v2.5-pro': P(3, 0.025, 6, 'MiMo-V2.5-Pro', { currency: 'CNY' }),
      'mimo-v2.5': P(1, 0.02, 2, 'MiMo-V2.5', { currency: 'CNY' }),
    },
    plans: [
      plan('lite', 'MiMo Token Plan · Lite', 39, 'CNY', 'month', '每月 41 亿 Credits（≈ 200 轮）；$6/月；夜间 0–8 点 0.8 倍计费'),
      plan('standard', 'MiMo Token Plan · Standard', 99, 'CNY', 'month', '每月 110 亿 Credits（≈ 1600 轮）；$16/月'),
      plan('pro', 'MiMo Token Plan · Pro', 329, 'CNY', 'month', '每月 380 亿 Credits（≈ 5600 轮）；$50/月'),
      plan('max', 'MiMo Token Plan · Max', 659, 'CNY', 'month', '每月 820 亿 Credits（≈ 12800 轮）；$100/月；耗尽即停'),
      plan('payg', '按量付费', 0, 'CNY', 'free', '按 token 计费'),
    ],
    // The Token Plan usage API only answers to a console session cookie, not a tp-… key.
    quota: undefined,
    keyEnv: 'XIAOMI_API_KEY',
  },
  {
    id: 'gemini',
    name: 'Gemini（Google）',
    home: 'USD',
    pricingUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
    consoleUrl: 'https://aistudio.google.com/usage',
    prices: {
      'gemini-4-argon': P(2, 0.1, 10, 'Gemini 4 Argon', { currency: 'USD' }),
      'gemini-3.1-pro-preview': P(2, 0.2, 12, 'Gemini 3.1 Pro', { currency: 'USD' }),
      'gemini-3.8-flash': P(0.75, 0.075, 3.75, 'Gemini 3.8 Flash', { currency: 'USD' }),
      'gemini-3.5-flash-lite': P(0.3, 0.03, 2.5, 'Gemini 3.5 Flash-Lite', { currency: 'USD' }),
      'gemini-3-flash-preview': P(0.5, 0.05, 3, 'Gemini 3 Flash', { currency: 'USD' }),
      'gemini-2.5-pro': P(1.25, 0.125, 10, 'Gemini 2.5 Pro', { currency: 'USD' }),
      'gemini-2.5-flash': P(0.3, 0.03, 2.5, 'Gemini 2.5 Flash', { currency: 'USD' }),
    },
    plans: [
      plan('ai-plus', 'Google AI Plus', 7.99, 'USD', 'month', 'Gemini 用量 2 倍；5 小时滚动上限 + 周上限'),
      plan('ai-pro', 'Google AI Pro', 19.99, 'USD', 'month', '用量 4 倍；Gemini 4 Argon / 3.1 Pro；AI Studio 更高限额'),
      plan('ai-ultra', 'Google AI Ultra', 99.99, 'USD', 'month', '最高 20 倍；顶配 $200/月'),
      plan('payg', 'Gemini API 按量付费', 0, 'USD', 'free', '按 token 计费（有免费层）'),
    ],
    quota: undefined,
    keyEnv: 'GEMINI_API_KEY',
  },
  {
    id: 'grok',
    name: 'Grok（xAI）',
    home: 'USD',
    pricingUrl: 'https://docs.x.ai/developers/pricing',
    consoleUrl: 'https://console.x.ai/',
    prices: {
      'grok-4.7': P(2, 0.5, 6, 'Grok 4.7', { currency: 'USD' }),
      'grok-4.6': P(2, 0.5, 6, 'Grok 4.6', { currency: 'USD' }),
      'grok-4.5': P(2, 0.3, 6, 'Grok 4.5', { currency: 'USD' }),
      'grok-4.3': P(1.25, 0.2, 2.5, 'Grok 4.3', { currency: 'USD' }),
      'grok-build-0.1': P(1, 0.2, 2, 'Grok Build 0.1', { currency: 'USD' }),
    },
    plans: [
      plan('supergrok-lite', 'SuperGrok Lite', 10, 'USD', 'month', '入门档'),
      plan('supergrok', 'SuperGrok', 30, 'USD', 'month', '标准档（X Premium+ $40 含同级权益）'),
      plan('supergrok-plus', 'SuperGrok Plus', 100, 'USD', 'month', '更大用量池'),
      plan('supergrok-heavy', 'SuperGrok Heavy', 300, 'USD', 'month', '最高额度 + Heavy 模型'),
      plan('payg', 'xAI API 按量付费', 0, 'USD', 'free', '预充值，按 token 计费'),
    ],
    quota: { kind: 'xai-key', url: 'https://api.x.ai/v1/api-key', auth: 'bearer' },
    keyEnv: 'XAI_API_KEY',
  },
  {
    id: 'claude',
    name: 'Claude（Anthropic）',
    home: 'USD',
    pricingUrl: 'https://www.anthropic.com/pricing',
    consoleUrl: 'https://platform.claude.com/usage',
    prices: {
      'claude-fable-5-1': P(10, 0.25, 50, 'Claude Fable 5.1', { currency: 'USD', cacheWrite: 12.5 }),
      'claude-fable-5': P(10, 1, 50, 'Claude Fable 5', { currency: 'USD', cacheWrite: 12.5 }),
      'claude-opus-5-5': P(4, 0.2, 20, 'Claude Opus 5.5', { currency: 'USD', cacheWrite: 5 }),
      'claude-opus-4-5': P(5, 0.5, 25, 'Claude Opus 4.5', { currency: 'USD', cacheWrite: 6.25 }),
      'claude-sonnet-5-5': P(2, 0.1, 10, 'Claude Sonnet 5.5', { currency: 'USD', cacheWrite: 2.5 }),
      'claude-haiku-5-5': P(0.1, 0.01, 0.5, 'Claude Haiku 5.5', { currency: 'USD', cacheWrite: 0.125 }),
      'claude-haiku-4-5': P(1, 0.1, 5, 'Claude Haiku 4.5', { currency: 'USD', cacheWrite: 1.25 }),
    },
    plans: [
      plan('pro', 'Claude Pro', 20, 'USD', 'month', '含 Claude Code；每 5 小时滚动额度 + 周上限；年付 $17/月'),
      plan('max-5x', 'Claude Max 5x', 100, 'USD', 'month', 'Pro 的 5 倍（每 5 小时）+ 周上限'),
      plan('max-20x', 'Claude Max 20x', 200, 'USD', 'month', 'Pro 的 20 倍（每 5 小时）+ 周上限'),
      plan('team', 'Claude Team（标准席位）', 25, 'USD', 'month', '每席位；年付 $20/席位'),
      plan('payg', 'Anthropic API 按量付费', 0, 'USD', 'free', '预充值，按 token 计费'),
    ],
    quota: undefined,
    keyEnv: 'ANTHROPIC_API_KEY',
  },
  {
    id: 'gpt',
    name: 'GPT（OpenAI）',
    home: 'USD',
    pricingUrl: 'https://developers.openai.com/api/docs/pricing',
    consoleUrl: 'https://platform.openai.com/usage',
    prices: {
      'gpt-6-astra': P(10, 1, 50, 'GPT-6 Astra', { currency: 'USD', cacheWrite: 12.5 }),
      'gpt-6.1-sol': P(2, 0.1, 10, 'GPT-6.1 Sol', { currency: 'USD', cacheWrite: 2.5 }),
      'gpt-6-sol': P(2, 0.2, 10, 'GPT-6 Sol', { currency: 'USD' }),
      'gpt-6-luna': P(0.1, 0.01, 0.5, 'GPT-6 Luna', { currency: 'USD', cacheWrite: 0.125 }),
      'gpt-5.6-sol': P(4, 0.4, 20, 'GPT-5.6 Sol', { currency: 'USD' }),
      'gpt-4.1': P(2, 0.5, 8, 'GPT-4.1', { currency: 'USD' }),
    },
    plans: [
      plan('go', 'ChatGPT Go', 8, 'USD', 'month', '轻量档，Codex 额度有限'),
      plan('plus', 'ChatGPT Plus', 20, 'USD', 'month', '含 Codex：每 5 小时约 15–160 条（GPT-6.1 Sol）+ 周上限'),
      plan('pro-5x', 'ChatGPT Pro（5x）', 100, 'USD', 'month', 'Codex 用量约 Plus 的 5 倍'),
      plan('pro-20x', 'ChatGPT Pro（20x）', 200, 'USD', 'month', 'Codex 用量约 Plus 的 20 倍'),
      plan('business', 'ChatGPT Business', 25, 'USD', 'month', '每席位（至少 2 个）；年付 $20/席位'),
      plan('payg', 'OpenAI API 按量付费', 0, 'USD', 'free', '预充值，按 token 计费'),
    ],
    quota: undefined,
    keyEnv: 'OPENAI_API_KEY',
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    home: 'CNY',
    pricingUrl: 'https://platform.minimax.cn/docs/m-plan/monthly-offer',
    consoleUrl: 'https://platform.minimax.io/console/usage',
    prices: {
      'MiniMax-M3.1-Flash': P(1, 0.1, 4, 'MiniMax M3.1 Flash', { currency: 'CNY' }),
      'MiniMax-M3': P(2.1, 0.42, 8.4, 'MiniMax M3', { currency: 'CNY' }),
      'MiniMax-M2.7': P(2.1, 0.42, 8.4, 'MiniMax M2.7', { currency: 'CNY' }),
      'minimax-m3.1-flash': P(0.15, 0.015, 0.6, 'MiniMax M3.1 Flash', { currency: 'USD' }),
      'minimax-m3': P(0.3, 0.06, 1.2, 'MiniMax M3', { currency: 'USD' }),
    },
    plans: [
      plan('m-go-cn', 'MiniMax M Plan · Go（国内）', 49, 'CNY', 'month', '基础额度 1 倍；M3.1 Flash；5 小时窗口 + 周窗口'),
      plan('m-explore-cn', 'MiniMax M Plan · Explore（国内）', 119, 'CNY', 'month', 'Go 的 3 倍；含 H3 视频'),
      plan('m-build-cn', 'MiniMax M Plan · Build（国内）', 469, 'CNY', 'month', 'Go 的 7.5 倍；超出可买 Credits 包'),
      plan('m-go', 'MiniMax M Plan · Go（国际）', 22, 'USD', 'month', '基础额度 1 倍；5 小时窗口 + 周窗口', { quotaApi: { kind: 'minimax-remains', url: 'https://api.minimax.io/v1/coding_plan/remains', auth: 'bearer' } }),
      plan('m-explore', 'MiniMax M Plan · Explore（国际）', 55, 'USD', 'month', 'Go 的 3 倍', { quotaApi: { kind: 'minimax-remains', url: 'https://api.minimax.io/v1/coding_plan/remains', auth: 'bearer' } }),
      plan('m-build', 'MiniMax M Plan · Build（国际）', 132, 'USD', 'month', 'Go 的 7.5 倍', { quotaApi: { kind: 'minimax-remains', url: 'https://api.minimax.io/v1/coding_plan/remains', auth: 'bearer' } }),
      plan('legacy', '旧版 Coding Plan / Token Plan（Starter / Plus / Max / Ultra）', 0, 'USD', 'month', '已停售；价格请手填'),
      plan('payg', '按量付费', 0, 'CNY', 'free', '按 token 计费'),
    ],
    // Subscription key (sk-cp-…); some accounts only answer to the console session.
    quota: { kind: 'minimax-remains', url: 'https://api.minimaxi.com/v1/coding_plan/remains', auth: 'bearer' },
    keyEnv: 'MINIMAX_API_KEY',
  },
]

/** Catalog provider for an id (`custom` and `none` have no catalog entry). */
export function providerOf(id) {
  return PROVIDERS.find(p => p.id === id)
}

/** Catalog provider id for a DSH route name, or undefined for hand-declared routes. */
export function providerForRoute(route) {
  if (!route) return undefined
  return ROUTE_MAP[route] ?? (providerOf(route) ? route : undefined)
}

/** The preset plan `planId` of `providerId`, if any. */
export function planOf(providerId, planId) {
  return providerOf(providerId)?.plans.find(p => p.id === planId)
}

/**
 * Static fallback price for a model: the route's catalog provider first, then
 * any provider listing that model id (exact, then prefix).
 */
export function staticPriceFor(route, model) {
  if (!model) return undefined
  const preferred = providerForRoute(route)
  const order = [preferred, ...PROVIDERS.map(p => p.id).filter(id => id !== preferred)].filter(Boolean)
  for (const id of order) {
    const table = providerOf(id)?.prices
    if (!table) continue
    const hit = table[model] ?? table[model.toLowerCase()]
    if (hit) return { ...hit, cacheWrite: hit.cacheWrite ?? hit.input, provider: id }
  }
  for (const id of order) {
    const table = providerOf(id)?.prices
    if (!table) continue
    const key = Object.keys(table).filter(k => model.startsWith(k)).sort((a, b) => b.length - a.length)[0]
    if (key) return { ...table[key], cacheWrite: table[key].cacheWrite ?? table[key].input, provider: id }
  }
  return undefined
}

/** The quota endpoint for a plan choice: a typed override URL wins, then the plan's, then the provider's. */
export function quotaSpecFor(providerId, planId, overrideUrl) {
  const provider = providerOf(providerId)
  const preset = planOf(providerId, planId)
  const base = preset?.quotaApi ?? provider?.quota
  const url = (overrideUrl ?? '').trim()
  if (url) return { kind: base?.kind ?? kindForUrl(url), url, auth: base?.auth ?? 'bearer' }
  return base ? { ...base } : undefined
}

/** Guess a parser from a hand-typed URL's host. */
export function kindForUrl(url) {
  try {
    const host = new URL(url).host
    if (host.endsWith('deepseek.com')) return 'deepseek-balance'
    if (host.endsWith('moonshot.cn') || host.endsWith('moonshot.ai')) return 'moonshot-balance'
    if (host.endsWith('kimi.com')) return 'kimi-usage'
    if (host.endsWith('z.ai') || host.endsWith('bigmodel.cn')) return 'zai-quota'
    if (host.endsWith('minimaxi.com') || host.endsWith('minimax.io')) return 'minimax-remains'
    if (host.endsWith('x.ai')) return 'xai-key'
  } catch {}
  return 'generic'
}

export function priceText(price, currency, period) {
  if (typeof price !== 'number') return undefined
  const symbol = SYMBOL[currency] ?? `${currency ?? ''} `
  if (period === 'free' || price === 0) return period === 'free' ? '按量付费' : `${symbol}0`
  const unit = PERIOD_LABEL[period] ?? ''
  return `${symbol}${Number.isInteger(price) ? price : price.toFixed(2)}${unit ? `/${unit}` : ''}`
}

/**
 * The plan as the tray and the settings page see it: preset merged with the
 * user's overrides and the latest quota reading.
 */
export function planView(cfg, quota) {
  const providerId = cfg.planProvider ?? 'none'
  if (providerId === 'none') return undefined
  const provider = providerOf(providerId)
  const preset = planOf(providerId, cfg.planId)
  const name = cfg.planName?.trim() || preset?.name || (providerId === 'custom' ? '自定义套餐' : provider?.name)
  const price = typeof cfg.planPrice === 'number' ? cfg.planPrice : preset?.price
  const currency = cfg.planCurrency ?? preset?.currency ?? 'CNY'
  const period = typeof cfg.planPrice === 'number' ? (cfg.planPeriod ?? 'month') : (preset?.period ?? cfg.planPeriod ?? 'month')
  const spec = quotaSpecFor(providerId, cfg.planId, cfg.planQuotaUrl)
  const fetched = quota?.ok ? quota.data : undefined
  const balance = typeof cfg.planBalance === 'number' ? cfg.planBalance : fetched?.balance
  const balanceCurrency = typeof cfg.planBalance === 'number' ? currency : (fetched?.currency ?? currency)
  const manualRemaining = cfg.planRemaining?.trim() || undefined
  const remaining = manualRemaining ?? (fetched?.percent !== undefined ? `${fetched.percent}%` : fetched?.remaining !== undefined ? String(fetched.remaining) : undefined)
  return {
    providerId,
    providerName: provider?.name ?? (providerId === 'custom' ? '自定义' : providerId),
    planId: preset?.id ?? cfg.planId ?? '',
    name,
    price,
    currency,
    period,
    priceText: priceText(price, currency, period),
    quotaText: cfg.planQuota?.trim() || preset?.quotaText || undefined,
    balance,
    balanceCurrency,
    remaining,
    remainingSource: manualRemaining ? 'manual' : fetched ? 'api' : undefined,
    resetAt: cfg.planResetAt?.trim() || fetched?.resetAt,
    lines: fetched?.lines ?? [],
    fetch: quota ? { ok: quota.ok, at: quota.at, error: quota.ok ? undefined : quota.error } : undefined,
    canFetch: Boolean(spec),
    fetchKind: spec?.kind,
    fetchUrl: spec?.url,
    apiKeyEnv: cfg.planApiKeyEnv?.trim() || undefined,
    suggestedKeyEnv: provider?.keyEnv,
    links: { pricing: provider?.pricingUrl, console: provider?.consoleUrl },
  }
}

/** JSON-safe catalog for the browser half. */
export function publicCatalog() {
  return PROVIDERS.map(p => ({
    id: p.id,
    name: p.name,
    home: p.home,
    pricingUrl: p.pricingUrl,
    consoleUrl: p.consoleUrl,
    keyEnv: p.keyEnv,
    quota: p.quota ? { kind: p.quota.kind, url: p.quota.url } : undefined,
    prices: Object.entries(p.prices).map(([model, row]) => ({ model, ...row })),
    plans: p.plans.map(x => ({ ...x, quotaApi: x.quotaApi ? { kind: x.quotaApi.kind, url: x.quotaApi.url } : undefined })),
  }))
}
