import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

/** Minimal React stand-in: createElement returns a tree we can walk. */
const React = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }),
  // Hooks as used by the page: state never changes in this render, effects never run.
  useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
}
const named = name => Object.assign(function Component() {}, { displayName: name })
const ui = {
  Switch: named('Switch'), SegmentedControl: named('SegmentedControl'), Tag: named('Tag'),
  SettingsForm: named('SettingsForm'), SettingsValueField: named('SettingsValueField'),
  settingsNumberField: field => ({ field, format: v => (typeof v === 'number' ? String(v) : ''), parse: t => (t.trim() === '' ? { kind: 'clear' } : { kind: 'set', value: Number(t) }) }),
  settingsTextField: field => ({ field, format: v => (typeof v === 'string' ? v : ''), parse: t => (t.trim() === '' ? { kind: 'clear' } : { kind: 'set', value: t.trim() }) }),
  SettingsFormModel: class {
    constructor(scope, specs) { this.scope = scope; this.specs = new Map(specs.map(s => [s.field, s])); this.staged = new Map() }
    bind(project) { const store = { getSnapshot: () => project() }; return store }
    shell() { return { available: true, writable: true, dirty: this.staged.size > 0, invalid: false, saving: false, failed: false } }
    field(name) { const spec = this.specs.get(name); const staged = this.staged.get(name); return { text: staged ?? spec.format(this.scope.getSnapshot().value[name]), overridden: staged !== undefined, invalid: false } }
    actions() { return { edit: (f, text) => this.staged.set(f, text), resetField: f => this.staged.delete(f), save: () => {}, discard: () => {} } }
    dispose() {}
  },
}

/** Render our createElement tree by calling function components until only strings/tags remain. */
function render(node, depth = 0) {
  if (node === null || node === undefined || typeof node !== 'object') return node
  if (Array.isArray(node)) return node.map(n => render(n, depth))
  const { type, props, children } = node
  if (typeof type === 'function' && !type.displayName) return render(type({ ...props, children: children.length === 1 ? children[0] : children }), depth + 1)
  return { type: typeof type === 'function' ? type.displayName : type, props, children: children.map(c => render(c, depth + 1)) }
}
const collect = (tree, out = []) => { if (tree && typeof tree === 'object') { if (!Array.isArray(tree)) out.push(tree); for (const c of Array.isArray(tree) ? tree : tree.children ?? []) collect(c, out) } return out }

test('settings page registers into plugins.row.config and renders every field', () => {
  let factory
  const sandbox = { window: { __ModuleLoader__: { load: ({ factory: f }) => { factory = f } } }, console, fetch: () => Promise.reject(new Error('offline')), setTimeout, clearTimeout, localStorage: { getItem: () => null, setItem() {} } }
  vm.runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), sandbox)
  const client = factory(name => ({ react: React, '@deepseek-ai/dsh-client-ui-primitives': ui })[name])

  const registrations = []
  const disposers = []
  const dictionaries = {}
  const values = { notifyCompleted: true, notifyChoice: true, notifyInput: false, notifyApproval: true, notifyFailed: true, suppressWhenFocused: true, sound: true, tray: true, showSpendInTitle: false, channel: 'auto', titleStyle: 'text', spendSource: 'auto', currency: 'CNY', errorHoldMinutes: 10, balancePollMinutes: 5, priceSource: 'auto', customPriceCurrency: 'CNY', exchangeRate: 7.2, planProvider: 'none', planId: '', planPeriod: 'month', planCurrency: 'CNY', planAutoQuota: true, quotaPollMinutes: 10 }
  const cctx = {
    uiWorkspace: { openSession() {} },
    sessions: { list: { getSnapshot: () => ({ byId: {} }) } },
    effect: fn => { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose) },
    locale: { register: (ns, dict) => { dictionaries[ns] = dict; return () => {} }, bind: ns => key => dictionaries[ns]?.zh?.[key] ?? `?${key}` },
    configForms: { get: () => ({ getSnapshot: () => ({ status: 'ready', writable: true, value: values }), subscribe: () => () => {} }), whileServed: (_ns, fn) => fn() },
    slots: { inject: (_name, fn) => fn(), register: (options, Component) => { registrations.push({ options, Component }); return () => {} } },
  }
  client.apply(cctx)

  assert.equal(registrations.length, 1)
  const { options, Component } = registrations[0]
  assert.equal(options.name, 'plugins.row.config')
  assert.equal(options.key, 'dsh-notify-tray#notify-tray')
  const face = options.inject()
  const t = cctx.locale.bind(options.locale)
  const props = { t, view: 'page', useNotifyTray: select => select(face.hooks.notifyTray.getSnapshot()), ...face }

  assert.equal(Component({ ...props, view: 'summary' }), dictionaries[options.locale].zh.summary)
  const tree = render(Component(props))
  const nodes = collect(tree)
  // With no plan provider chosen the plan section only shows the provider picker.
  assert.equal(nodes.filter(n => n.type === 'Switch').length, 9, 'nine toggles')
  assert.equal(nodes.filter(n => n.type === 'SegmentedControl').length, 6, 'six segmented choices')
  assert.equal(nodes.filter(n => n.type === 'SettingsValueField').length, 6, 'six value fields')
  assert.equal(nodes.filter(n => n.type === 'select').length, 1, 'provider picker')
  assert.ok(nodes.every(n => !JSON.stringify(n.props).includes('"?')), 'every label has a translation')
  const sound = nodes.find(n => n.type === 'Switch' && n.props.label === dictionaries[options.locale].zh.sound)
  assert.equal(sound.props.checked, true)
  sound.props.onChange(false)
  assert.equal(face.hooks.notifyTray.getSnapshot().fields.sound.text, 'off')
  assert.equal(face.hooks.notifyTray.getSnapshot().dirty, true)
  for (const dispose of disposers) dispose()
})

test('settings page: choosing a provider fills the plan preset and shows quota fields', async () => {
  let factory
  const catalog = { providers: [{ id: 'kimi', name: 'Kimi', keyEnv: 'KIMI_API_KEY', pricingUrl: 'https://k/price', consoleUrl: 'https://k/console', quota: { kind: 'kimi-usage', url: 'https://api.kimi.com/coding/v1/usages' }, prices: [], plans: [{ id: 'allegro', name: 'Kimi Code · Allegro', price: 199, currency: 'CNY', period: 'month', quotaText: '每 5 小时 ≈ 1000 次' }] }] }
  const state = { pricing: { provider: 'kimi-coding', model: 'kimi-for-coding', name: 'Kimi For Coding', listed: { input: 0.95, cacheRead: 0.19, cacheWrite: 0, output: 4, currency: 'USD' }, effective: { input: 6.84, cacheRead: 1.37, output: 28.8, currency: 'CNY', source: 'catalog' } }, plan: { canFetch: true, fetchKind: 'kimi-usage', fetchUrl: 'https://api.kimi.com/coding/v1/usages', apiKeyEnv: 'KIMI_API_KEY', lines: ['额度 剩余 680 / 1000'], fetch: { ok: true, at: Date.now() }, remaining: '68%', remainingSource: 'api' }, catalogLoaded: true }
  const sandbox = {
    window: { __ModuleLoader__: { load: ({ factory: f }) => { factory = f } } }, console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    localStorage: { getItem: () => null, setItem() {} },
    fetch: url => Promise.resolve({ ok: true, json: () => Promise.resolve(url.startsWith('notify-tray/catalog') ? catalog : { ...state, boot: 'b', seq: 0, focus: [], events: [] }) }),
  }
  vm.runInNewContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), sandbox)
  const client = factory(name => ({ react: React, '@deepseek-ai/dsh-client-ui-primitives': ui })[name])
  const registrations = []
  const disposers = []
  const dictionaries = {}
  const values = { planProvider: 'kimi', planId: '', planPeriod: 'month', planCurrency: 'CNY', planAutoQuota: true, quotaPollMinutes: 10, priceSource: 'auto', customPriceCurrency: 'CNY', exchangeRate: 7.2, channel: 'auto', titleStyle: 'text', spendSource: 'auto', currency: 'CNY', errorHoldMinutes: 10, balancePollMinutes: 5 }
  const cctx = {
    uiWorkspace: { openSession() {} },
    sessions: { list: { getSnapshot: () => ({ byId: {} }) } },
    effect: fn => { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose) },
    locale: { register: (ns, dict) => { dictionaries[ns] = dict; return () => {} }, bind: ns => key => dictionaries[ns]?.zh?.[key] ?? `?${key}` },
    configForms: { get: () => ({ getSnapshot: () => ({ status: 'ready', writable: true, value: values }), subscribe: () => () => {} }), whileServed: (_ns, fn) => fn() },
    slots: { inject: (_name, fn) => fn(), register: (options, Component) => { registrations.push({ options, Component }); return () => {} } },
  }
  client.apply(cctx)
  const { options, Component } = registrations[0]
  const face = options.inject()
  const t = cctx.locale.bind(options.locale)
  const props = { t, view: 'page', useNotifyTray: select => select(face.hooks.notifyTray.getSnapshot()), ...face }
  // The page loads these from useEffect, which the React stub never runs.
  client.__settingsLive.loadCatalog()
  await client.__settingsLive.loadState()
  await new Promise(resolve => setTimeout(resolve, 0))
  const nodes = collect(render(Component(props)))
  assert.ok(nodes.every(n => !JSON.stringify(n.props).includes('"?')), 'every label has a translation')
  const selects = nodes.filter(n => n.type === 'select')
  assert.equal(selects.length, 2, 'provider + plan pickers')
  const text = JSON.stringify(nodes.map(n => n.children.filter(c => typeof c === 'string')))
  assert.ok(text.includes('kimi-coding / kimi-for-coding'), 'current model shown')
  assert.ok(text.includes('$0.95 / $0.19 / $4'), 'listed price shown')
  assert.ok(text.includes('额度 剩余 680 / 1000'), 'fetched quota lines shown')
  assert.ok(text.includes('https://api.kimi.com/coding/v1/usages'), 'quota endpoint shown')
  // Picking the preset stages its figures; every field stays editable.
  selects[1].props.onChange({ target: { value: 'allegro' } })
  const fields = () => face.hooks.notifyTray.getSnapshot().fields
  assert.equal(fields().planId.text, 'allegro')
  assert.equal(fields().planName.text, 'Kimi Code · Allegro')
  assert.equal(fields().planPrice.text, '199')
  assert.equal(fields().planQuota.text, '每 5 小时 ≈ 1000 次')
  // Switching provider clears the preset fields and suggests the provider's key reference.
  selects[0].props.onChange({ target: { value: 'kimi' } })
  assert.equal(fields().planId.text, '')
  assert.equal(fields().planName.text, '')
  assert.equal(fields().planApiKeyEnv.text, 'KIMI_API_KEY')
  // "Copy listed price" stages the custom price in the listed currency.
  const copy = nodes.find(n => n.type === 'button' && n.children.includes(dictionaries[options.locale].zh.fillCustom))
  copy.props.onClick()
  assert.equal(fields().customInput.text, '0.95')
  assert.equal(fields().customPriceCurrency.text, 'USD')
  for (const dispose of disposers) dispose()
})
