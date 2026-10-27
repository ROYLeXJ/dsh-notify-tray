/**
 * Price resolution for the spend estimate.
 *
 * Chain, in `auto` mode: the user's `prices` table (cordis.patch.yml) → the
 * custom price typed on the settings page → the price list bundled with
 * DSH's pi-ai adapter (`@earendil-works/pi-ai`, USD per million tokens, the
 * same catalog the model selector reads) → this plugin's own static catalog
 * (catalog.js). Everything comes out in the display currency.
 */
import { existsSync, readdirSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { priceFor, splitRoute } from './ledger.js'
import { staticPriceFor } from './catalog.js'

const PI_AI_REL = join('@earendil-works', 'pi-ai', 'dist', 'models.generated.js')
/** Fallback CNY-per-USD rate when the user leaves the setting blank. */
export const DEFAULT_RATE = 7.2
/** Human labels for where a price came from. */
export const SOURCE_LABEL = { table: '价格表', custom: '自定义价', catalog: '目录价', static: '内置价' }

const DSH_PACKAGE = join('@deepseek-ai', 'dsh')

/**
 * Where a globally installed `@deepseek-ai/dsh` (the web / CLI profile) may
 * live: npm's configured prefix, the common `~/.npm-global` user prefix, the
 * prefix of the node running us, and pnpm's global store.
 */
export function globalDshDirs(env = process.env, home = safeHome(), execPath = process.execPath) {
  const prefixes = [env.npm_config_prefix, env.NPM_CONFIG_PREFIX, env.PREFIX]
  if (home) prefixes.push(join(home, '.npm-global'), join(home, '.npm-packages'), join(home, '.local'))
  if (execPath) prefixes.push(dirname(dirname(execPath)))
  prefixes.push('/usr/local', '/usr', '/opt/homebrew')
  const dirs = []
  for (const prefix of prefixes) {
    if (!prefix) continue
    // POSIX prefixes keep packages under lib/; Windows prefixes keep them at the top.
    dirs.push(join(prefix, 'lib', 'node_modules', DSH_PACKAGE), join(prefix, 'node_modules', DSH_PACKAGE))
  }
  const pnpmHome = env.PNPM_HOME || (home ? join(home, '.local', 'share', 'pnpm') : undefined)
  if (pnpmHome) {
    for (const store of safeReaddir(join(pnpmHome, 'global'))) dirs.push(join(pnpmHome, 'global', store, 'node_modules', DSH_PACKAGE))
  }
  return dirs
}

function safeHome() {
  try { return homedir() } catch { return undefined }
}

function safeRealpath(path) {
  try { return realpathSync(path) } catch { return undefined }
}

/** Directories worth walking up from to find the pi-ai package DSH ships. */
function defaultBases() {
  const bases = []
  if (process.env.DSH_NOTIFY_TRAY_PI_AI) bases.push(process.env.DSH_NOTIFY_TRAY_PI_AI)
  // Desktop host: argv[2] is the DSH runtime dir; CLI: argv[1] is the dsh entry script,
  // usually a bin symlink (~/.npm-global/bin/dsh) whose real path sits inside the package.
  for (const arg of [process.argv[2], process.argv[1]]) {
    if (!arg) continue
    const real = safeRealpath(arg)
    if (real && real !== arg) bases.push(real)
    bases.push(arg)
  }
  // `dsh web` started from a global install leaves neither argv entry pointing into the package.
  bases.push(...globalDshDirs())
  bases.push(dirname(process.execPath), process.cwd())
  return bases
}

/** Locate `models.generated.js` of the pi-ai package DSH runs with, or undefined. */
export function findPiCatalogFile(bases = defaultBases()) {
  const seen = new Set()
  for (const base of bases) {
    let dir = base
    for (let depth = 0; depth < 8 && dir; depth += 1) {
      if (seen.has(dir)) break
      seen.add(dir)
      const direct = join(dir, 'node_modules', PI_AI_REL)
      if (safeExists(direct)) return direct
      // A hoisted copy next to the package (global node_modules, pi-ai as a sibling).
      const sibling = join(dir, PI_AI_REL)
      if (safeExists(sibling)) return sibling
      const pnpm = join(dir, 'node_modules', '.pnpm')
      if (safeExists(pnpm)) {
        for (const entry of safeReaddir(pnpm)) {
          if (!entry.startsWith('@earendil-works+pi-ai@')) continue
          const nested = join(pnpm, entry, 'node_modules', PI_AI_REL)
          if (safeExists(nested)) return nested
        }
      }
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  return undefined
}

function safeExists(path) {
  try { return existsSync(path) } catch { return false }
}

function safeReaddir(path) {
  try { return readdirSync(path) } catch { return [] }
}

/**
 * Load pi-ai's model catalog: `{ models: { [provider]: { [id]: { cost, name, … } } }, file }`
 * or undefined when DSH's copy cannot be found (e.g. a non-pi-ai deployment).
 */
export async function loadPiCatalog({ file = findPiCatalogFile(), importer = f => import(pathToFileURL(f).href) } = {}) {
  if (!file) return undefined
  try {
    const mod = await importer(file)
    const models = mod?.MODELS ?? mod?.default?.MODELS
    if (!models || typeof models !== 'object') return undefined
    return { models, file }
  } catch {
    return undefined
  }
}

/** The catalog's cost row for a route: the provider's own entry first, then any provider listing that model id. */
export function catalogCost(models, provider, model) {
  if (!models || !model) return undefined
  const own = provider ? models[provider]?.[model] : undefined
  const hit = own ?? Object.values(models).map(list => list?.[model]).find(entry => entry?.cost)
  if (!hit?.cost) return undefined
  const { input = 0, cacheRead = 0, cacheWrite = 0, output = 0 } = hit.cost
  return { input, cacheRead, cacheWrite, output, currency: 'USD', name: hit.name ?? model, provider: hit.provider ?? provider }
}

/** Convert a per-million price row between CNY and USD with `rate` CNY per USD. */
export function convert(price, from, to, rate = DEFAULT_RATE) {
  if (!price || from === to) return price
  const k = from === 'USD' && to === 'CNY' ? rate : from === 'CNY' && to === 'USD' ? 1 / rate : 1
  const out = {}
  for (const key of ['input', 'cacheRead', 'cacheWrite', 'output']) {
    if (typeof price[key] === 'number') out[key] = Math.round(price[key] * k * 1e6) / 1e6
  }
  return out
}

/** The custom price typed on the settings page, or undefined when all three fields are blank. */
export function customPrice(cfg) {
  const row = { input: cfg.customInput, cacheRead: cfg.customCacheRead, output: cfg.customOutput }
  if (Object.values(row).every(v => typeof v !== 'number')) return undefined
  return { input: row.input ?? 0, cacheRead: row.cacheRead ?? row.input ?? 0, cacheWrite: row.input ?? 0, output: row.output ?? 0, currency: cfg.customPriceCurrency ?? 'CNY' }
}

/**
 * Build the resolver the ledger prices each `provider/model` route with.
 * Returns rows already converted to `currency`, tagged with their source.
 */
export function makeResolver({ cfg, models, currency = cfg.currency ?? 'CNY' }) {
  const rate = typeof cfg.exchangeRate === 'number' && cfg.exchangeRate > 0 ? cfg.exchangeRate : DEFAULT_RATE
  const mode = cfg.priceSource ?? 'auto'
  const custom = customPrice(cfg)
  const toDisplay = (row, from) => convert(row, from, currency, rate)
  return key => {
    if (!key || key === 'unknown') {
      // Usage the ledger could not attribute to a route still gets the custom price when there is one.
      return custom && mode !== 'catalog' ? { price: toDisplay(custom, custom.currency), source: 'custom' } : undefined
    }
    const { provider, model } = splitRoute(key)
    const table = priceFor(cfg.prices, key)
    if (table && mode === 'auto') return { price: table, source: 'table' }
    if (custom && (mode === 'auto' || mode === 'custom')) return { price: toDisplay(custom, custom.currency), source: 'custom' }
    if (mode === 'custom') return undefined
    const fromCatalog = catalogCost(models, provider, model)
    if (fromCatalog) return { price: toDisplay(fromCatalog, 'USD'), source: 'catalog' }
    const fallback = staticPriceFor(provider, model)
    if (fallback) return { price: toDisplay(fallback, fallback.currency), source: 'static' }
    return undefined
  }
}

/** What the settings page shows about the route in use: the listed price and where it comes from. */
export function describeRoute({ cfg, models, route }) {
  if (!route?.model) return undefined
  const resolve = makeResolver({ cfg, models })
  const hit = resolve(`${route.provider ?? ''}/${route.model}`.replace(/^\//u, ''))
  const listed = catalogCost(models, route.provider, route.model) ?? staticPriceFor(route.provider, route.model)
  return {
    provider: route.provider,
    model: route.model,
    name: listed?.name,
    listed: listed ? { input: listed.input, cacheRead: listed.cacheRead, cacheWrite: listed.cacheWrite, output: listed.output, currency: listed.currency } : undefined,
    effective: hit ? { ...hit.price, currency: cfg.currency ?? 'CNY', source: hit.source } : undefined,
  }
}
