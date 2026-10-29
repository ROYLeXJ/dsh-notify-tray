// Refreshes lib/models-dev.json: a trimmed snapshot of the models.dev price
// catalog (https://models.dev/api.json), the second price source the spend
// estimate falls back to when DSH's own pi-ai catalog cannot be found.
// Only the providers people route DSH through are kept, and only prices.
//
//   node scripts/update-models-dev.mjs            # fetch models.dev
//   node scripts/update-models-dev.mjs api.json   # or read a downloaded copy
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const PROVIDERS = [
  'anthropic', 'deepseek', 'google', 'google-vertex', 'groq', 'minimax', 'minimax-cn', 'moonshotai', 'moonshotai-cn',
  'openai', 'opencode', 'opencode-go', 'xai', 'xiaomi', 'zai', 'zai-coding-plan', 'zhipuai',
]

const source = process.argv[2]
const api = source
  ? JSON.parse(readFileSync(source, 'utf8'))
  : await (await fetch('https://models.dev/api.json')).json()

const round = n => Math.round(n * 1e6) / 1e6
const models = {}
for (const id of PROVIDERS) {
  const list = api[id]?.models
  if (!list) {
    console.warn(`models.dev has no provider "${id}"`)
    continue
  }
  const rows = {}
  for (const [modelId, model] of Object.entries(list)) {
    const cost = model?.cost
    if (typeof cost?.input !== 'number' || typeof cost?.output !== 'number') continue
    const row = { name: model.name ?? modelId, input: round(cost.input), output: round(cost.output) }
    if (typeof cost.cache_read === 'number') row.cacheRead = round(cost.cache_read)
    if (typeof cost.cache_write === 'number') row.cacheWrite = round(cost.cache_write)
    rows[modelId] = row
  }
  models[id] = Object.fromEntries(Object.entries(rows).sort(([a], [b]) => a.localeCompare(b)))
}

const out = { source: 'https://models.dev/api.json', fetchedAt: new Date().toISOString().slice(0, 10), currency: 'USD', models }
writeFileSync(join(root, 'lib', 'models-dev.json'), `${JSON.stringify(out, null, 1)}\n`)
const count = Object.values(models).reduce((n, rows) => n + Object.keys(rows).length, 0)
console.log(`lib/models-dev.json: ${count} models from ${Object.keys(models).length} providers`)
