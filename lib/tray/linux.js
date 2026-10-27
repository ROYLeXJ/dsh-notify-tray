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
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pngIcon, renderIcon, rgbaIcon } from '../icon.js'
import { iconSpec } from '../whale.js'

const require = createRequire(import.meta.url)

const ITEM_PATH = '/StatusNotifierItem'
const MENU_PATH = '/MenuBar'
const ICON_SIZES = [22, 32, 48]
/** Give up on a session bus that does not answer Hello within this long. */
const CONNECT_TIMEOUT_MS = 10_000
/** Per-state frame count and timing (fps / loop) from lib/whale.js. */
const ANIM = iconSpec().anim
const FRAME_COUNT = Object.fromEntries(Object.entries(iconSpec().frames).map(([state, frames]) => [state, frames.length]))

/**
 * Where the session bus lives. `DBUS_SESSION_BUS_ADDRESS` is what every
 * desktop session exports; without it, systemd's per-user bus at
 * `$XDG_RUNTIME_DIR/bus` is the next best guess (dbus-next would instead go
 * looking for dbus-launch's `~/.dbus/session-bus/` files and throw).
 *
 * `unix:abstract=` addresses (dbus-launch sessions, still common on older
 * X11 desktops) need the optional native `usocket` module in dbus-next, which
 * is not installed; Node's own `net` dials abstract sockets when the path
 * starts with a NUL byte, so rewrite them to `unix:path=\0…`.
 */
export function sessionBusAddress(env = process.env) {
  const address = env.DBUS_SESSION_BUS_ADDRESS?.trim()
  if (address) {
    return address.split(';').map(entry => entry.replace(/^unix:abstract=([^,]+)/u, (_, name) => `unix:path=\0${name}`)).join(';')
  }
  const runtime = env.XDG_RUNTIME_DIR?.trim()
  if (runtime && existsSync(join(runtime, 'bus'))) return `unix:path=${join(runtime, 'bus')}`
  throw new Error('没有 D-Bus 会话总线（不在图形桌面会话里？）')
}

let shared
/**
 * Lazily open one session-bus connection for tray and notifications. Resolves
 * once the bus has answered Hello; dbus-next never settles pending calls on a
 * dead socket, so a refused or hung connection is turned into a rejection here.
 */
async function connect() {
  if (shared) {
    await shared.ready
    return shared
  }
  const dbus = require('dbus-next')
  const bus = dbus.sessionBus({ busAddress: sessionBusAddress() })
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`连接 D-Bus 会话总线超时（${CONNECT_TIMEOUT_MS / 1000} 秒）`)), CONNECT_TIMEOUT_MS)
    timer.unref?.()
    bus.once('connect', () => { clearTimeout(timer); resolve() })
    bus.once('error', error => { clearTimeout(timer); reject(error) })
  })
  shared = { dbus, bus, ready }
  // A dropped connection (bus restart) is forgotten, so the next notification reconnects.
  bus.on('error', () => { if (shared?.bus === bus) shared = undefined })
  try {
    await ready
  } catch (error) {
    if (shared?.bus === bus) shared = undefined
    try { bus.disconnect() } catch {}
    throw error
  }
  return shared
}

const pixmapCache = new Map()
/** Pixmaps for one state + frame, rendered once and reused. */
function pixmaps(state, frame = 0) {
  const key = `${state}:${frame}`
  let cached = pixmapCache.get(key)
  if (cached === undefined) {
    cached = ICON_SIZES.map(size => [size, size, renderIcon(size, state, frame)])
    pixmapCache.set(key, cached)
  }
  return cached
}

/**
 * dbusmenu wants integer ids; rows (and their `children`) get them in a
 * depth-first walk so submenus work on every panel that implements the protocol.
 */
function flattenMenu(rows) {
  const byId = new Map()
  const walk = (list, parentId) => {
    const ids = []
    for (const row of list) {
      const id = byId.size + 1
      byId.set(id, { row, parentId, childIds: [] })
      ids.push(id)
      if (row.children?.length) byId.get(id).childIds = walk(row.children, id)
    }
    return ids
  }
  const rootIds = walk(rows, 0)
  return { byId, rootIds }
}

export async function startLinuxTray({ onAction, logger }) {
  const { dbus, bus } = await connect()
  const { Interface, ACCESS_READ } = dbus.interface
  const Variant = dbus.Variant
  let view = { state: 'idle', title: 'DSH', tooltip: 'DeepSeek Harness', menu: [], badge: '' }
  let layout = flattenMenu([])
  let frame = 0
  let frameTimer
  let revision = 1

  class Item extends Interface {
    get Category() { return 'ApplicationStatus' }
    get Id() { return 'dsh-notify-tray' }
    get Title() { return 'DeepSeek Harness' }
    get Status() { return view.state === 'attention' ? 'NeedsAttention' : 'Active' }
    get WindowId() { return 0 }
    get IconName() { return '' }
    get IconPixmap() { return pixmaps(view.state, frame) }
    get AttentionIconName() { return '' }
    get AttentionIconPixmap() { return pixmaps(view.state, frame) }
    get OverlayIconName() { return '' }
    get OverlayIconPixmap() { return [] }
    get ToolTip() {
      const [head, ...rest] = view.tooltip.split('\n')
      return ['', pixmaps(view.state, 0), head, rest.join('\n')]
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

  // dbusmenu: item 0 is the root; every row (nested ones too) has an id from flattenMenu.
  const props = (entry) => {
    if (entry === undefined) return { 'children-display': new Variant('s', 'submenu') }
    const { row, childIds } = entry
    if (row.separator) return { type: new Variant('s', 'separator') }
    const out = {
      label: new Variant('s', row.label.replace(/_/gu, '__')),
      enabled: new Variant('b', row.enabled !== false || childIds.length > 0),
      visible: new Variant('b', true),
    }
    if (childIds.length > 0) out['children-display'] = new Variant('s', 'submenu')
    return out
  }
  const node = (id, depth) => {
    const entry = layout.byId.get(id)
    const children = depth === 0 ? [] : entry.childIds.map(child => new Variant('(ia{sv}av)', node(child, depth - 1)))
    return [id, props(entry), children]
  }

  class Menu extends Interface {
    get Version() { return 3 }
    get TextDirection() { return 'ltr' }
    get Status() { return 'normal' }
    get IconThemePath() { return [] }
    GetLayout(parentId, recursionDepth) {
      const depth = recursionDepth < 0 ? 99 : recursionDepth
      if (parentId !== 0) {
        return [revision, layout.byId.has(parentId) ? node(parentId, depth) : [parentId, {}, []]]
      }
      const children = depth === 0 ? [] : layout.rootIds.map(id => new Variant('(ia{sv}av)', node(id, depth - 1)))
      return [revision, [0, props(undefined), children]]
    }
    GetGroupProperties(ids) {
      return ids.map(id => [id, id === 0 ? props(undefined) : props(layout.byId.get(id) ?? { row: {}, childIds: [] })])
    }
    GetProperty(id, name) {
      const all = id === 0 ? props(undefined) : props(layout.byId.get(id) ?? { row: {}, childIds: [] })
      return all[name] ?? new Variant('s', '')
    }
    Event(id, eventId) {
      if (eventId !== 'clicked') return
      const row = layout.byId.get(id)?.row
      if (row && !row.separator && row.enabled !== false && !row.children?.length) onAction(row.id)
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

  const animate = () => {
    clearInterval(frameTimer)
    frameTimer = undefined
    frame = 0
    const frames = FRAME_COUNT[view.state] ?? 1
    const { fps = 1, loop = false } = ANIM[view.state] ?? {}
    if (frames < 2) return
    frameTimer = setInterval(() => {
      if (!loop && frame >= frames - 1) { clearInterval(frameTimer); frameTimer = undefined; return }
      frame = loop ? (frame + 1) % frames : frame + 1
      item.NewIcon()
    }, Math.round(1000 / Math.max(1, fps)))
    frameTimer.unref?.()
  }

  return {
    update(next) {
      const statusChanged = next.state !== view.state
      view = next
      layout = flattenMenu(view.menu ?? [])
      revision += 1
      if (statusChanged) animate()
      item.NewIcon()
      item.NewToolTip()
      if (statusChanged) item.NewStatus(item.Status)
      menu.LayoutUpdated(revision, 0)
    },
    async stop() {
      clearInterval(frameTimer)
      try {
        bus.unexport(ITEM_PATH, item)
        bus.unexport(MENU_PATH, menu)
        await bus.releaseName(name)
      } catch {}
    },
  }
}

const notifyActions = new Map()
/** Edge of the whale drawn into notifications. */
const NOTIFY_ICON_SIZE = 64

const notifyIcons = new Map()
/**
 * The whale for a notification: inline pixels for the `image-data` hint (spec
 * 1.2; older servers read `image_data` / `icon_data`) and, when `iconDir` is
 * writable, a PNG path for `app_icon`, which servers that ignore image hints
 * (and history panes) show instead of a generic icon.
 */
export function notifyIcon(state = 'idle', iconDir) {
  const key = `${state}|${iconDir ?? ''}`
  let icon = notifyIcons.get(key)
  if (icon === undefined) {
    const size = NOTIFY_ICON_SIZE
    icon = { size, rgba: rgbaIcon(size, state), path: '' }
    if (iconDir) {
      try {
        mkdirSync(iconDir, { recursive: true })
        const file = join(iconDir, `whale-${state}.png`)
        writeFileSync(file, pngIcon(size, state))
        icon.path = file
      } catch {}
    }
    notifyIcons.set(key, icon)
  }
  return icon
}

/** Show one freedesktop notification; `onClick` runs when its default action is invoked. */
export async function linuxNotify({ title, body, sound = true, onClick, state = 'idle', iconDir }) {
  const link = await connect()
  const { dbus, bus } = link
  if (!link.notifications) {
    const obj = await bus.getProxyObject('org.freedesktop.Notifications', '/org/freedesktop/Notifications')
    const iface = obj.getInterface('org.freedesktop.Notifications')
    // One listener per connection: a reconnected bus gets a fresh proxy.
    iface.on('ActionInvoked', (id, key) => {
      if (key === 'default') notifyActions.get(id)?.()
    })
    iface.on('NotificationClosed', id => notifyActions.delete(id))
    link.notifications = iface
  }
  const iface = link.notifications
  const icon = notifyIcon(state, iconDir)
  const image = new dbus.Variant('(iiibiiay)', [icon.size, icon.size, icon.size * 4, true, 8, 4, icon.rgba])
  const hints = {
    urgency: new dbus.Variant('y', 1),
    'desktop-entry': new dbus.Variant('s', 'deepseek-harness'),
    'image-data': image,
    image_data: image,
    icon_data: image,
  }
  // freedesktop sound-naming spec; servers that play sounds honour these hints.
  if (sound) hints['sound-name'] = new dbus.Variant('s', 'message-new-instant')
  else hints['suppress-sound'] = new dbus.Variant('b', true)
  const id = await iface.Notify('DeepSeek Harness', 0, icon.path, title, body, ['default', '打开'], hints, -1)
  if (onClick) notifyActions.set(id, onClick)
  return id
}
