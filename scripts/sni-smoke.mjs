// Smoke-test the Linux StatusNotifierItem + dbusmenu export against a private
// dbus-daemon (works on macOS with `brew install dbus`). Plays the panel's role:
// a fake StatusNotifierWatcher, then reads the item and clicks a menu row.
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import assert from 'node:assert/strict'

const daemon = spawn('dbus-daemon', [process.env.DBUS_CONFIG ? `--config-file=${process.env.DBUS_CONFIG}` : '--session', '--nofork', '--print-address'], { stdio: ['ignore', 'pipe', 'inherit'] })
const [chunk] = await once(daemon.stdout, 'data')
process.env.DBUS_SESSION_BUS_ADDRESS = String(chunk).trim()

const dbus = (await import('dbus-next')).default
const { Interface } = dbus.interface

// Fake panel: a StatusNotifierWatcher that records registrations.
const registered = []
class Watcher extends Interface {
  RegisterStatusNotifierItem(service) { registered.push(service) }
}
Watcher.configureMembers({ methods: { RegisterStatusNotifierItem: { inSignature: 's' } } })
const panel = dbus.sessionBus()
await panel.requestName('org.kde.StatusNotifierWatcher', 0)
panel.export('/StatusNotifierWatcher', new Watcher('org.kde.StatusNotifierWatcher'))

const actions = []
const { startLinuxTray } = await import('../lib/tray/linux.js')
const tray = await startLinuxTray({ onAction: a => actions.push(a), logger: console })
assert.equal(registered.length, 1, 'item registered with the watcher')

const { buildView } = await import('../lib/format.js')
const view = buildView(
  { running: 1, runningList: [{ sessionId: 's1', title: '重构' }], waiting: [{ sessionId: 's2', title: '周报', kind: 'choice', text: '发给谁？', since: 1 }], recent: [], today: { completed: 2, failed: 0, aborted: 0 } },
  { tokens: { input: 0, cacheRead: 0, cacheWrite: 0, output: 1200, total: 52000 }, balance: 88.5, balanceSpend: 1.5, currency: 'CNY' },
  { spendSource: 'auto' },
)
tray.update(view)

const obj = await panel.getProxyObject(registered[0], '/StatusNotifierItem')
const props = obj.getInterface('org.freedesktop.DBus.Properties')
const status = await props.Get('org.kde.StatusNotifierItem', 'Status')
assert.equal(status.value, 'NeedsAttention')
const pix = await props.Get('org.kde.StatusNotifierItem', 'IconPixmap')
assert.deepEqual(pix.value.map(([w, h, data]) => [w, h, data.length]), [[22, 22, 22 * 22 * 4], [32, 32, 32 * 32 * 4], [48, 48, 48 * 48 * 4]])
const tip = await props.Get('org.kde.StatusNotifierItem', 'ToolTip')
assert.equal(tip.value[2], 'DeepSeek Harness')
assert.match(tip.value[3], /今日花费 ¥1.50/u)
const menuPath = await props.Get('org.kde.StatusNotifierItem', 'Menu')
assert.equal(menuPath.value, '/MenuBar')

const menuObj = await panel.getProxyObject(registered[0], '/MenuBar')
const menu = menuObj.getInterface('com.canonical.dbusmenu')
const [revision, layout] = await menu.GetLayout(0, -1, [])
assert.ok(revision > 1)
const rows = layout[2].map(v => v.value)
const labels = rows.map(([, p]) => p.label?.value ?? (p.type?.value === 'separator' ? '---' : ''))
console.log('menu:', labels)
const target = rows.find(([, p]) => p.label?.value?.includes('周报'))
await menu.Event(target[0], 'clicked', new dbus.Variant('s', ''), 0)
await new Promise(r => setTimeout(r, 50))
assert.deepEqual(actions, ['open:s2'])

const item = obj.getInterface('org.kde.StatusNotifierItem')
await item.Activate(0, 0)
await new Promise(r => setTimeout(r, 50))
assert.deepEqual(actions, ['open:s2', 'show-app'])

await tray.stop()
console.log('SNI smoke test passed')
daemon.kill()
process.exit(0)
