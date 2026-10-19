/**
 * Linux tray + notifications over the D-Bus session bus, in-process via the
 * pure-JS `dbus-next` client: no compiled helper, so it runs on every CPU the
 * distro runs on (x86_64, ARM64 Kunpeng/Phytium, LoongArch, MIPS).
 *
 * Tray: StatusNotifierItem (org.kde.StatusNotifierItem) + com.canonical.dbusmenu,
 * the protocol shared by KDE, DDE (UOS / Deepin), UKUI (Kylin), GNOME with the
 * AppIndicator extension, XFCE and LXQt.
 * Notifications: org.freedesktop.Notifications, with click-to-open actions.
 */
import { createRequire } from 'node:module'
import { glyphOf, renderIcon } from '../icon.js'

const require = createRequire(import.meta.url)

const ITEM_PATH = '/StatusNotifierItem'
const MENU_PATH = '/MenuBar'
const ICON_SIZES = [22, 32, 48]

let shared
/** Lazily open one session-bus connection for tray and notifications. */
function connect() {
  if (shared) return shared
  if (!process.env.DBUS_SESSION_BUS_ADDRESS && !process.env.XDG_RUNTIME_DIR) {
    throw new Error('没有 D-Bus 会话总线（不在图形桌面会话里？）')
  }
  const dbus = require('dbus-next')
  const bus = dbus.sessionBus()
  shared = { dbus, bus }
  bus.on('error', () => { shared = undefined })
  return shared
}

function pixmaps(view) {
  return ICON_SIZES.map(size => [size, size, renderIcon(size, view.state, glyphOf(view))])
}

export async function startLinuxTray({ onAction, logger }) {
  const { dbus, bus } = connect()
  const { Interface, ACCESS_READ } = dbus.interface
  const Variant = dbus.Variant
  let view = { state: 'idle', title: 'DSH', tooltip: 'DeepSeek Harness', menu: [], badge: '' }
  let revision = 1

  class Item extends Interface {
    get Category() { return 'ApplicationStatus' }
    get Id() { return 'dsh-notify-tray' }
    get Title() { return 'DeepSeek Harness' }
    get Status() { return view.state === 'attention' ? 'NeedsAttention' : 'Active' }
    get WindowId() { return 0 }
    get IconName() { return '' }
    get IconPixmap() { return pixmaps(view) }
    get AttentionIconName() { return '' }
    get AttentionIconPixmap() { return pixmaps(view) }
    get OverlayIconName() { return '' }
    get OverlayIconPixmap() { return [] }
    get ToolTip() {
      const [head, ...rest] = view.tooltip.split('\n')
      return ['', pixmaps(view), head, rest.join('\n')]
    }
    get ItemIsMenu() { return false }
    get Menu() { return MENU_PATH }
    Activate() { onAction('show-app') }
    SecondaryActivate() { onAction('show-app') }
    ContextMenu() {}
    Scroll() {}
    NewIcon() {}
    NewAttentionIcon() {}
    NewToolTip() {}
    NewTitle() {}
    NewStatus(status) { return status }
  }
  const ro = signature => ({ signature, access: ACCESS_READ })
  Item.configureMembers({
    properties: {
      Category: ro('s'), Id: ro('s'), Title: ro('s'), Status: ro('s'), WindowId: ro('i'),
      IconName: ro('s'), IconPixmap: ro('a(iiay)'), AttentionIconName: ro('s'),
      AttentionIconPixmap: ro('a(iiay)'), OverlayIconName: ro('s'), OverlayIconPixmap: ro('a(iiay)'),
      ToolTip: ro('(sa(iiay)ss)'), ItemIsMenu: ro('b'), Menu: ro('o'),
    },
    methods: {
      Activate: { inSignature: 'ii' },
      SecondaryActivate: { inSignature: 'ii' },
      ContextMenu: { inSignature: 'ii' },
      Scroll: { inSignature: 'is' },
    },
    signals: {
      NewIcon: { signature: '' },
      NewAttentionIcon: { signature: '' },
      NewToolTip: { signature: '' },
      NewTitle: { signature: '' },
      NewStatus: { signature: 's' },
    },
  })

  // dbusmenu: item 0 is the root; rows are 1..n in view.menu order.
  const props = (row, index) => {
    if (row === undefined) return { 'children-display': new Variant('s', 'submenu') }
    if (row.separator) return { type: new Variant('s', 'separator') }
    return {
      label: new Variant('s', row.label.replace(/_/gu, '__')),
      enabled: new Variant('b', row.enabled !== false),
      visible: new Variant('b', true),
    }
  }
  const node = index => [index + 1, props(view.menu[index], index), []]

  class Menu extends Interface {
    get Version() { return 3 }
    get TextDirection() { return 'ltr' }
    get Status() { return 'normal' }
    get IconThemePath() { return [] }
    GetLayout(parentId) {
      if (parentId !== 0) {
        const index = parentId - 1
        return [revision, view.menu[index] ? node(index) : [parentId, {}, []]]
      }
      const children = view.menu.map((_, i) => new Variant('(ia{sv}av)', node(i)))
      return [revision, [0, props(undefined), children]]
    }
    GetGroupProperties(ids) {
      return ids.map(id => [id, id === 0 ? props(undefined) : props(view.menu[id - 1])])
    }
    GetProperty(id, name) {
      const all = id === 0 ? props(undefined) : props(view.menu[id - 1] ?? {})
      return all[name] ?? new Variant('s', '')
    }
    Event(id, eventId) {
      if (eventId !== 'clicked') return
      const row = view.menu[id - 1]
      if (row && !row.separator && row.enabled !== false) onAction(row.id)
    }
    EventGroup(events) {
      for (const [id, eventId] of events) this.Event(id, eventId)
      return []
    }
    AboutToShow() { return false }
    AboutToShowGroup() { return [[], []] }
    LayoutUpdated(rev, parent) { return [rev, parent] }
    ItemsPropertiesUpdated() { return [[], []] }
  }
  Menu.configureMembers({
    properties: { Version: ro('u'), TextDirection: ro('s'), Status: ro('s'), IconThemePath: ro('as') },
    methods: {
      GetLayout: { inSignature: 'iias', outSignature: 'u(ia{sv}av)' },
      GetGroupProperties: { inSignature: 'aias', outSignature: 'a(ia{sv})' },
      GetProperty: { inSignature: 'is', outSignature: 'v' },
      Event: { inSignature: 'isvu' },
      EventGroup: { inSignature: 'a(isvu)', outSignature: 'ai' },
      AboutToShow: { inSignature: 'i', outSignature: 'b' },
      AboutToShowGroup: { inSignature: 'ai', outSignature: 'aiai' },
    },
    signals: {
      LayoutUpdated: { signature: 'ui' },
      ItemsPropertiesUpdated: { signature: 'a(ia{sv})a(ias)' },
    },
  })

  const item = new Item('org.kde.StatusNotifierItem')
  const menu = new Menu('com.canonical.dbusmenu')
  const name = `org.kde.StatusNotifierItem-${process.pid}-1`
  bus.export(ITEM_PATH, item)
  bus.export(MENU_PATH, menu)
  await bus.requestName(name, 0)

  const register = async () => {
    const watcher = await bus.getProxyObject('org.kde.StatusNotifierWatcher', '/StatusNotifierWatcher')
    await watcher.getInterface('org.kde.StatusNotifierWatcher').RegisterStatusNotifierItem(name)
  }
  try {
    await register()
  } catch (error) {
    logger?.warn?.('没有找到状态栏宿主（StatusNotifierWatcher），等待桌面环境提供', error?.message ?? error)
  }
  // Re-register when a tray host (re)appears, e.g. after the panel restarts.
  try {
    const dbusObj = await bus.getProxyObject('org.freedesktop.DBus', '/org/freedesktop/DBus')
    dbusObj.getInterface('org.freedesktop.DBus').on('NameOwnerChanged', (owner, _old, now) => {
      if (owner === 'org.kde.StatusNotifierWatcher' && now) register().catch(() => {})
    })
  } catch {}

  return {
    update(next) {
      const statusChanged = next.state !== view.state
      view = next
      revision += 1
      item.NewIcon()
      item.NewToolTip()
      if (statusChanged) item.NewStatus(item.Status)
      menu.LayoutUpdated(revision, 0)
    },
    async stop() {
      try {
        bus.unexport(ITEM_PATH, item)
        bus.unexport(MENU_PATH, menu)
        await bus.releaseName(name)
      } catch {}
    },
  }
}

const notifyActions = new Map()
let notifyListening = false

/** Show one freedesktop notification; `onClick` runs when its default action is invoked. */
export async function linuxNotify({ title, body, onClick }) {
  const { dbus, bus } = connect()
  const obj = await bus.getProxyObject('org.freedesktop.Notifications', '/org/freedesktop/Notifications')
  const iface = obj.getInterface('org.freedesktop.Notifications')
  if (!notifyListening) {
    notifyListening = true
    iface.on('ActionInvoked', (id, key) => {
      if (key === 'default') notifyActions.get(id)?.()
    })
    iface.on('NotificationClosed', id => notifyActions.delete(id))
  }
  const hints = { urgency: new dbus.Variant('y', 1), 'desktop-entry': new dbus.Variant('s', 'deepseek-harness') }
  const id = await iface.Notify('DeepSeek Harness', 0, 'dialog-information', title, body, ['default', '打开'], hints, -1)
  if (onClick) notifyActions.set(id, onClick)
  return id
}
