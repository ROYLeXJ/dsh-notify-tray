// Price chain, pi-ai catalog discovery, plan presets and quota parsers.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { isDeepseekOffPeak, kindForUrl, planView, PROVIDERS, providerForRoute, quotaSpecFor, staticPriceFor } from '../lib/catalog.js'
import { Ledger, routeOf } from '../lib/ledger.js'
import { catalogCost, convert, describeRoute, findDshVersion, findPiCatalogFile, globalDshDirs, loadPiCatalog, makeResolver, npmGlobalDshDir } from '../lib/pricing.js'
import { fetchQuota, PARSERS } from '../lib/quota.js'

const PI = {
  anthropic: { 'claude-fable-5-1': { name: 'Claude Fable 5.1', provider: 'anthropic', cost: { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 } } },
  'kimi-coding': { 'kimi-for-coding': { name: 'Kimi For Coding', provider: 'kimi-coding', cost: { input: 0.95, output: 4, cacheRead: 0.19, cacheWrite: 0 } } },
}

test('catalog: every provider has plans, prices in a known currency, and a usable quota spec or none', () => {
  assert.ok(PROVIDERS.length >= 10)
  for (const p of PROVIDERS) {
    assert.ok(p.plans.length > 0, p.id)
    for (const row of Object.values(p.prices)) assert.ok(['CNY', 'USD'].includes(row.currency), `${p.id} price currency`)
    for (const plan of p.plans) assert.ok(['CNY', 'USD'].includes(plan.currency) && typeof plan.price === 'number', `${p.id}/${plan.id}`)
    if (p.quota) assert.ok(PARSERS[p.quota.kind], `${p.id} parser ${p.quota.kind}`)
    for (const plan of p.plans) if (plan.quotaApi) assert.ok(PARSERS[plan.quotaApi.kind], `${p.id}/${plan.id} parser`)
  }
  assert.equal(providerForRoute('kimi-coding'), 'kimi')
  assert.equal(providerForRoute('zai-coding-cn'), 'glm')
  assert.equal(providerForRoute('my-gateway'), undefined)
  assert.equal(staticPriceFor('anthropic', 'claude-fable-5-1').input, 10)
  assert.equal(staticPriceFor('acme', 'glm-5.3').provider, 'glm', 'unknown route still finds the model somewhere')
  assert.equal(staticPriceFor('acme', 'nope'), undefined)
})

test('catalog: quota spec picks the plan endpoint, then the provider one, then a typed override', () => {
  assert.equal(quotaSpecFor('glm', 'pro-cny').url, 'https://open.bigmodel.cn/api/monitor/usage/quota/limit')
  assert.equal(quotaSpecFor('glm', 'pro-usd').url, 'https://api.z.ai/api/monitor/usage/quota/limit')
  assert.equal(quotaSpecFor('claude', 'pro'), undefined)
  const typed = quotaSpecFor('custom', '', 'https://api.minimaxi.com/v1/coding_plan/remains')
  assert.equal(typed.kind, 'minimax-remains')
  assert.equal(kindForUrl('https://example.com/x'), 'generic')
})

test('catalog: planView merges preset, overrides and a fetched reading', () => {
  const cfg = { planProvider: 'minimax', planId: 'm-explore', planPeriod: 'month', planCurrency: 'CNY', planPrice: 88, planApiKeyEnv: 'MINIMAX_API_KEY' }
  const view = planView(cfg, { ok: true, at: 1, data: { remaining: 420, total: 600, percent: 70, resetAt: '2026-10-25T08:00:00.000Z', lines: ['M3 剩余 420 / 600'] } })
  assert.equal(view.name, 'MiniMax M Plan · Explore（国际）')
  assert.equal(view.priceText, '¥88/月', 'typed price wins, typed currency too')
  assert.equal(view.remaining, '70%')
  assert.equal(view.remainingSource, 'api')
  assert.equal(view.canFetch, true)
  assert.deepEqual(view.lines, ['M3 剩余 420 / 600'])
  const manual = planView({ ...cfg, planRemaining: '3 次', planResetAt: '今晚' }, undefined)
  assert.equal(manual.remaining, '3 次')
  assert.equal(manual.remainingSource, 'manual')
  assert.equal(manual.resetAt, '今晚')
  assert.equal(planView({ planProvider: 'none' }), undefined)
  const custom = planView({ planProvider: 'custom', planName: '公司内部', planPrice: 0, planPeriod: 'free', planCurrency: 'USD' })
  assert.equal(custom.priceText, '按量付费')
  assert.equal(custom.canFetch, false)
})

test('pricing: chain is table → custom → catalog → static, converted to the display currency', () => {
  const base = { currency: 'CNY', exchangeRate: 7, prices: {} }
  const resolve = makeResolver({ cfg: base, models: PI })
  assert.deepEqual(resolve('anthropic/claude-fable-5-1'), { price: { input: 70, cacheRead: 1.75, cacheWrite: 87.5, output: 350 }, source: 'catalog' })
  assert.equal(resolve('acme/glm-5.3').source, 'static', 'unknown route falls back to the built-in list')
  assert.equal(resolve('acme/mystery'), undefined)
  assert.equal(resolve('unknown'), undefined)

  const custom = makeResolver({ cfg: { ...base, customInput: 1, customOutput: 4, customPriceCurrency: 'USD' }, models: PI })
  assert.deepEqual(custom('anthropic/claude-fable-5-1'), { price: { input: 7, cacheRead: 7, cacheWrite: 7, output: 28 }, source: 'custom' })
  assert.equal(custom('unknown').source, 'custom', 'unattributed usage still gets the custom price')

  const table = makeResolver({ cfg: { ...base, customInput: 1, prices: { 'claude-': { input: 3, cacheRead: 1, output: 9 } } }, models: PI })
  assert.equal(table('anthropic/claude-fable-5-1').source, 'table')
  assert.equal(makeResolver({ cfg: { ...base, customInput: 1, priceSource: 'catalog' }, models: PI })('anthropic/claude-fable-5-1').source, 'catalog')
  assert.equal(makeResolver({ cfg: { ...base, priceSource: 'custom' }, models: PI })('anthropic/claude-fable-5-1'), undefined, 'custom only, nothing typed')

  assert.deepEqual(convert({ input: 7.2, output: 72 }, 'CNY', 'USD', 7.2), { input: 1, output: 10 })
  assert.equal(catalogCost(PI, 'other-route', 'kimi-for-coding').provider, 'kimi-coding', 'model id found under another provider')
  const described = describeRoute({ cfg: base, models: PI, route: { provider: 'anthropic', model: 'claude-fable-5-1' } })
  assert.equal(described.listed.currency, 'USD')
  assert.equal(described.effective.source, 'catalog')
  assert.equal(described.effective.input, 70)
})

test('pricing: finds pi-ai inside a flat or pnpm node_modules tree and loads its MODELS', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pi-ai-'))
  const flat = join(root, 'app', 'node_modules', '@earendil-works', 'pi-ai', 'dist')
  mkdirSync(flat, { recursive: true })
  writeFileSync(join(flat, 'models.generated.js'), 'export const MODELS = { x: { m: { cost: { input: 1, output: 2 } } } }\n')
  const pnpmDir = join(root, 'cli', 'node_modules', '.pnpm', '@earendil-works+pi-ai@1.0.0', 'node_modules', '@earendil-works', 'pi-ai', 'dist')
  mkdirSync(pnpmDir, { recursive: true })
  writeFileSync(join(pnpmDir, 'models.generated.js'), 'export const MODELS = {}\n')
  assert.equal(findPiCatalogFile([join(root, 'app', 'lib', 'deep')]), join(flat, 'models.generated.js'))
  assert.equal(findPiCatalogFile([join(root, 'cli', 'bin')]), join(pnpmDir, 'models.generated.js'))
  assert.equal(findPiCatalogFile([join(root, 'nowhere')]), undefined)
  const loaded = await loadPiCatalog({ file: join(flat, 'models.generated.js') })
  assert.equal(loaded.models.x.m.cost.input, 1)
  assert.equal(await loadPiCatalog({ file: undefined }), undefined)
})

test('ledger: files usage under provider/model from the nested request header and remembers the current route', () => {
  const l = new Ledger({ now: () => Date.parse('2026-10-25T10:00:00+08:00') })
  const session = { id: 's1' }
  assert.deepEqual(routeOf({ type: 'request/header', data: { header: { config: { provider: 'anthropic', model: 'claude-fable-5-1' } } } }), { provider: 'anthropic', model: 'claude-fable-5-1' })
  l.sessionEvent(session, { type: 'request/header', data: { header: { config: { provider: 'anthropic', model: 'claude-fable-5-1' } }, reason: 'initial' } })
  l.sessionEvent(session, { type: 'assistant/message', data: { turn: 1, step: 0, usage: { inputTokens: 100, outputTokens: 10 } } })
  const summary = l.summary(key => (key === 'anthropic/claude-fable-5-1' ? { price: { input: 10, output: 50 }, source: 'catalog' } : undefined), 'USD')
  assert.equal(summary.byModel[0].key, 'anthropic/claude-fable-5-1')
  assert.equal(summary.byModel[0].cost, 0.0015)
  assert.equal(summary.estimate, 0.0015)
  assert.deepEqual(summary.estimateSources, ['catalog'])
  assert.deepEqual(summary.route, { provider: 'anthropic', model: 'claude-fable-5-1' })
})

test('quota: parsers normalize each provider shape and fetchQuota reports errors instead of throwing', async () => {
  const ds = PARSERS['deepseek-balance']({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '193.91', granted_balance: '0', topped_up_balance: '193.91' }] })
  assert.equal(ds.balance, 193.91)
  assert.equal(ds.lines[0], '账户余额 ¥193.9')

  const moon = PARSERS['moonshot-balance']({ code: 0, data: { available_balance: 49.5, voucher_balance: 10, cash_balance: 39.5 }, status: true })
  assert.equal(moon.balance, 49.5)
  assert.equal(moon.lines.length, 2)

  const kimi = PARSERS['kimi-usage']({ user: { membership: 'allegro' }, usage: { limit: 1000, used: 320, resetTime: '2026-10-25T06:00:00Z' } })
  assert.equal(kimi.remaining, 680)
  assert.equal(kimi.percent, 68)
  assert.ok(kimi.lines[0].startsWith('总额度 剩余 680 / 1000'))

  const zai = PARSERS['zai-quota']({ code: 200, data: { limits: [{ type: 'TOKENS_LIMIT', usage: 600, currentValue: 150, remaining: 450, percentage: 25, nextResetTime: 1792900647261, unit: 'prompts' }, { type: 'TIME_LIMIT', percentage: 40 }] } })
  assert.equal(zai.remaining, 450)
  assert.equal(zai.percent, 75)
  assert.equal(zai.lines.length, 2)
  assert.ok(zai.lines[0].includes('5 小时额度 已用 25%'))
  assert.ok(zai.lines[1].startsWith('MCP 用量'))

  const mm = PARSERS['minimax-remains']({ model_remains: [{ model_name: 'MiniMax-M3', current_interval_total_count: 600, current_interval_usage_count: 100, remains_count: 500, end_time: 1792900647261 }] })
  assert.equal(mm.remaining, 500)
  assert.equal(mm.percent, 83)

  assert.ok(PARSERS['xai-key']({ api_key_id: 'k1', name: 'dev' }).lines[0].includes('有效'))
  assert.equal(PARSERS.generic({ data: { credit_balance: 12 } }).lines[0], 'credit_balance 12')
  assert.throws(() => PARSERS['zai-quota']({ code: 401, msg: 'bad key' }), /bad key/u)

  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, auth: init.headers.authorization })
    return { ok: true, status: 200, text: async () => JSON.stringify({ balance_infos: [{ currency: 'CNY', total_balance: '1.5' }] }) }
  }
  const ok = await fetchQuota({ kind: 'deepseek-balance', url: 'https://api.deepseek.com/user/balance' }, 'sk-x', { fetchImpl, now: () => 5 })
  assert.equal(ok.ok, true)
  assert.equal(ok.data.balance, 1.5)
  assert.equal(calls[0].auth, 'Bearer sk-x')
  const denied = await fetchQuota({ kind: 'deepseek-balance', url: 'https://x' }, 'sk-x', { fetchImpl: async () => ({ ok: false, status: 401, text: async () => '{"error":{"message":"invalid key"}}' }) })
  assert.equal(denied.ok, false)
  assert.equal(denied.error, 'HTTP 401：invalid key')
  const crashed = await fetchQuota({ kind: 'generic', url: 'https://x' }, 'k', { fetchImpl: async () => { throw new Error('offline') } })
  assert.equal(crashed.error, 'offline')
})

test('pricing: web profile finds pi-ai under a global npm prefix such as ~/.npm-global', () => {
  const home = mkdtempSync(join(tmpdir(), 'home-'))
  const dsh = join(home, '.npm-global', 'lib', 'node_modules', '@deepseek-ai', 'dsh')
  const dist = join(dsh, 'node_modules', '@earendil-works', 'pi-ai', 'dist')
  mkdirSync(dist, { recursive: true })
  writeFileSync(join(dist, 'models.generated.js'), 'export const MODELS = {}\n')
  const dirs = globalDshDirs({}, home, '/usr/bin/node')
  assert.ok(dirs.includes(dsh))
  assert.equal(findPiCatalogFile(dirs), join(dist, 'models.generated.js'))
  // npm_config_prefix wins the order.
  assert.equal(globalDshDirs({ npm_config_prefix: '/opt/npm' }, home, '/usr/bin/node')[0], join('/opt/npm', 'lib', 'node_modules', '@deepseek-ai', 'dsh'))
})

test('pricing: a pi-ai hoisted next to the dsh package is found too', () => {
  const root = mkdtempSync(join(tmpdir(), 'hoist-'))
  const dist = join(root, 'lib', 'node_modules', '@earendil-works', 'pi-ai', 'dist')
  mkdirSync(dist, { recursive: true })
  mkdirSync(join(root, 'lib', 'node_modules', '@deepseek-ai', 'dsh'), { recursive: true })
  writeFileSync(join(dist, 'models.generated.js'), 'export const MODELS = {}\n')
  assert.equal(findPiCatalogFile([join(root, 'lib', 'node_modules', '@deepseek-ai', 'dsh')]), join(dist, 'models.generated.js'))
})

test('deepseek: off-peak is outside 9–12 and 14–18 Beijing time on weekdays, weekends all day', () => {
  // 2026-10-28 is a Wednesday. Beijing = UTC+8.
  const at = (iso) => Date.parse(iso)
  assert.equal(isDeepseekOffPeak(at('2026-10-28T01:30:00Z')), false, '09:30 Beijing, peak')
  assert.equal(isDeepseekOffPeak(at('2026-10-28T04:30:00Z')), true, '12:30 Beijing, lunch')
  assert.equal(isDeepseekOffPeak(at('2026-10-28T09:59:00Z')), false, '17:59 Beijing, peak')
  assert.equal(isDeepseekOffPeak(at('2026-10-28T10:00:00Z')), true, '18:00 Beijing, evening')
  assert.equal(isDeepseekOffPeak(at('2026-10-27T17:00:00Z')), true, '01:00 Beijing')
  assert.equal(isDeepseekOffPeak(at('2026-10-31T02:00:00Z')), true, 'Saturday 10:00 Beijing')
})

test('deepseek: listed prices are discounted for off-peak tokens, typed prices are not', () => {
  let now = Date.parse('2026-10-28T02:00:00Z') // 10:00 Beijing, peak
  const l = new Ledger({ now: () => now })
  const s = { id: 's1', header: {} }
  const ev = (type, data) => ({ type, data })
  l.sessionEvent(s, ev('request/header', { header: { config: { provider: 'deepseek-account', model: 'deepseek-flash' } } }))
  l.sessionEvent(s, ev('assistant/message', { turn: 1, step: 0, usage: { inputTokens: 1_000_000, outputTokens: 0 } }))
  now = Date.parse('2026-10-28T12:00:00Z') // 20:00 Beijing, off-peak
  l.sessionEvent(s, ev('assistant/message', { turn: 2, step: 0, usage: { inputTokens: 1_000_000, outputTokens: 0 } }))
  const cfg = { currency: 'CNY', prices: {} }
  const listed = l.summary(makeResolver({ cfg }), 'CNY')
  assert.equal(listed.byModel[0].source, 'static')
  assert.equal(listed.estimate, 2 + 1, '¥2 peak + ¥1 off-peak')
  const typed = l.summary(makeResolver({ cfg: { ...cfg, customInput: 2, customOutput: 8 } }), 'CNY')
  assert.equal(typed.estimate, 4, 'a price the user typed is taken as it is')
  const kimi = makeResolver({ cfg })('kimi-coding/kimi-for-coding')
  assert.equal(kimi.offPeakFactor, undefined, 'only DeepSeek routes')
  const described = describeRoute({ cfg, route: { provider: 'deepseek-account', model: 'deepseek-flash' }, now })
  assert.deepEqual([described.effective.offPeakFactor, described.effective.offPeakNow], [0.5, true])
})

test('pricing: global dirs cover Windows npm, nvm, fnm, volta and pnpm homes', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-vm-'))
  const home = join(root, 'home')
  mkdirSync(join(home, '.nvm', 'versions', 'node', 'v22.1.0'), { recursive: true })
  mkdirSync(join(home, '.local', 'share', 'fnm', 'node-versions', 'v20.9.0'), { recursive: true })
  const dsh = join('@deepseek-ai', 'dsh')
  const dirs = globalDshDirs({ APPDATA: join(root, 'AppData', 'Roaming') }, home, '/usr/bin/node')
  assert.ok(dirs.includes(join(root, 'AppData', 'Roaming', 'npm', 'node_modules', dsh)), 'npm on Windows')
  assert.ok(dirs.includes(join(home, '.nvm', 'versions', 'node', 'v22.1.0', 'lib', 'node_modules', dsh)), 'nvm')
  assert.ok(dirs.includes(join(home, '.local', 'share', 'fnm', 'node-versions', 'v20.9.0', 'installation', 'lib', 'node_modules', dsh)), 'fnm')
  assert.ok(dirs.includes(join(home, '.volta', 'tools', 'image', 'packages', dsh, 'lib', 'node_modules', dsh)), 'volta')
})

test('pricing: npm root -g is the last resort, and the dsh version is read from its package.json', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-npmroot-'))
  const fake = (out, error) => (file, args, options, done) => done(error, out)
  assert.equal(await npmGlobalDshDir({ run: fake(`${root}\n`) }), join(root, '@deepseek-ai', 'dsh'))
  assert.equal(await npmGlobalDshDir({ run: fake('', new Error('no npm')) }), undefined)
  const pkg = join(root, 'node_modules', '@deepseek-ai', 'dsh')
  mkdirSync(join(pkg, 'dist'), { recursive: true })
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.3.0' }))
  assert.equal(findDshVersion([join(pkg, 'dist')]), '0.3.0', 'from inside the package')
  assert.equal(findDshVersion([join(root, 'project')]), '0.3.0', 'from a node_modules on the way up')
  assert.equal(findDshVersion([mkdtempSync(join(tmpdir(), 'dsh-none-'))]), undefined)
})

test('pricing: models.dev snapshot prices models neither pi-ai nor the static catalog know', async () => {
  const { modelsDevCost, modelsDevModels } = await import('../lib/pricing.js')
  const models = modelsDevModels()
  assert.ok(Object.keys(models).includes('anthropic'), 'the snapshot ships with the plugin')
  const fake = { groq: { 'llama-x': { name: 'Llama X', input: 0.5, output: 1 } } }
  assert.deepEqual(modelsDevCost('groq', 'llama-x', fake), { input: 0.5, cacheRead: 0.5, cacheWrite: 0.5, output: 1, currency: 'USD', name: 'Llama X', provider: 'groq' })
  assert.equal(modelsDevCost('some-router', 'llama-x', fake).input, 0.5, 'a model id is found under any provider')
  assert.equal(modelsDevCost('groq', 'nope', fake), undefined)
  // Through the resolver: pi-ai absent, static catalog silent → models.dev, converted to CNY.
  const [provider, model] = Object.entries(models)
    .flatMap(([p, rows]) => Object.keys(rows).map(m => [p, m]))
    .find(([p, m]) => !staticPriceFor(p, m))
  const hit = makeResolver({ cfg: { currency: 'CNY', exchangeRate: 7 }, models: undefined })(`${provider}/${model}`)
  assert.equal(hit.source, 'modelsDev')
  assert.equal(hit.price.input, Math.round(models[provider][model].input * 7 * 1e6) / 1e6)
})

test('quota: a fetch plan falls back from the saved key to the env var and records every attempt', async () => {
  const { failureHint, runQuotaPlan } = await import('../lib/quota.js')
  const calls = []
  const reading = await runQuotaPlan([
    { id: 'saved', label: 'DSH 保存的 Key', available: async () => true, fetch: async () => { calls.push('saved'); return { ok: false, at: 1, error: 'HTTP 401：invalid', status: 401 } } },
    { id: 'env', label: '环境变量', available: () => true, fetch: async () => { calls.push('env'); return { ok: true, at: 2, data: { percent: 40 } } } },
  ])
  assert.deepEqual(calls, ['saved', 'env'])
  assert.equal(reading.ok, true)
  assert.deepEqual(reading.attempts.map(a => [a.id, a.outcome]), [['saved', 'failed'], ['env', 'ok']])
  assert.match(reading.attempts[0].hint, /Key 不对/)

  const none = await runQuotaPlan([
    { id: 'saved', label: 'DSH 保存的 Key', available: async () => '没有保存 KIMI', fetch: async () => assert.fail('not available') },
    { id: 'env', label: '环境变量', available: () => '没有设置 KIMI', fetch: async () => assert.fail('not available') },
  ], { now: () => 5, noneError: '没找到 API Key' })
  assert.deepEqual([none.ok, none.at, none.error], [false, 5, '没找到 API Key'])
  assert.deepEqual(none.attempts.map(a => a.outcome), ['skipped', 'skipped'])

  const stop = await runQuotaPlan([
    { id: 'a', label: 'A', available: () => true, fetch: async () => ({ ok: false, at: 1, error: 'x' }), fallback: () => false },
    { id: 'b', label: 'B', available: () => true, fetch: async () => assert.fail('a said not to fall back') },
  ])
  assert.equal(stop.attempts.length, 1)
  assert.equal(failureHint({ error: '请求超时' }), '连不上查询接口，检查网络或代理')
  assert.equal(failureHint({ error: 'weird' }), undefined)
})

test('quota: fetchQuota keeps the HTTP status of a failure', async () => {
  const fetchImpl = async () => ({ ok: false, status: 403, text: async () => '{"message":"forbidden"}' })
  const reading = await fetchQuota({ url: 'https://x', kind: 'generic' }, 'k', { fetchImpl, now: () => 1 })
  assert.deepEqual(reading, { ok: false, at: 1, error: 'HTTP 403：forbidden', status: 403 })
})
