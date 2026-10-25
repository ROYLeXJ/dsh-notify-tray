import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

/** Minimal React stand-in: createElement returns a tree we can walk. */
const React = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }) }
const named = name => Object.assign(function Component() {}, { displayName: name })
const ui = {
  Switch: named('Switch'), SegmentedControl: named('SegmentedControl'), Tag: named('Tag'),
  SettingsForm: named('SettingsForm'), SettingsValueField: named('SettingsValueField'),
  settingsNumberField: field => ({ field, format: v => (typeof v === 'number' ? String(v) : ''), parse: t => (t.trim() === '' ? { kind: 'clear' } : { kind: 'set', value: Number(t) }) }),
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
  const values = { notifyCompleted: true, notifyChoice: true, notifyInput: false, notifyApproval: true, notifyFailed: true, suppressWhenFocused: true, sound: true, tray: true, showSpendInTitle: false, channel: 'auto', titleStyle: 'text', spendSource: 'auto', currency: 'CNY', errorHoldMinutes: 10, balancePollMinutes: 5 }
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
  assert.equal(nodes.filter(n => n.type === 'Switch').length, 9, 'nine toggles')
  assert.equal(nodes.filter(n => n.type === 'SegmentedControl').length, 4, 'four segmented choices')
  assert.equal(nodes.filter(n => n.type === 'SettingsValueField').length, 2, 'two number fields')
  assert.ok(nodes.every(n => !JSON.stringify(n.props).includes('"?')), 'every label has a translation')
  const sound = nodes.find(n => n.type === 'Switch' && n.props.label === dictionaries[options.locale].zh.sound)
  assert.equal(sound.props.checked, true)
  sound.props.onChange(false)
  assert.equal(face.hooks.notifyTray.getSnapshot().fields.sound.text, 'off')
  assert.equal(face.hooks.notifyTray.getSnapshot().dirty, true)
  for (const dispose of disposers) dispose()
})
