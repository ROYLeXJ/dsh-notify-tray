// macOS menu bar helper for dsh-notify-tray, run with `osascript -l JavaScript`.
// No compiled binary: JXA's Objective-C bridge drives NSStatusItem directly, so
// it works on any Mac (Apple Silicon or Intel) without Rosetta or Xcode.
//
// argv: <view.json path> <host pid>
// The host rewrites view.json atomically; this script polls its mtime. Menu
// clicks are written to stdout as one JSON line each: {"action":"<id>"}.
//
// The icon is the whale from lib/whale.js, shipped inside view.json as bezier
// paths (`view.icon`) and rasterized here into a template image at 1x and 2x.
// Template images take the menu bar's own colour (white on dark, black on
// light), exactly like the system icons next to it, so no tinting happens:
// the whale's state is told by its shape (spout / "!" / "×"), not its colour.
ObjC.import('Cocoa')
ObjC.import('stdlib')
ObjC.import('signal')

/** Icon size in points: the whale is wider than tall, so 22×16 sits like an 18 pt template icon. */
var ICON_H = 16
var ICON_W = 22
/** Seconds between animation frames while a state animates (running = spout). */
var FRAME_SECONDS = 0.6

function run(argv) {
  var viewPath = argv[0]
  var hostPid = Number(argv[1] || 0)
  var app = $.NSApplication.sharedApplication
  app.setActivationPolicy($.NSApplicationActivationPolicyAccessory)

  var item = $.NSStatusBar.systemStatusBar.statusItemWithLength(-1) // NSVariableStatusItemLength
  var stdout = $.NSFileHandle.fileHandleWithStandardOutput
  var fm = $.NSFileManager.defaultManager
  var lastStamp = ''
  var icon = null          // view.icon: { box, frames: { state: [paths...] } }
  var images = {}          // "<state>:<frame>" -> NSImage
  var symbolCache = {}
  var current = { state: 'idle', frame: 0, frames: 1 }
  var ticks = 0

  function send(action) {
    var line = $(JSON.stringify({ action: action }) + '\n').dataUsingEncoding($.NSUTF8StringEncoding)
    stdout.writeData(line)
  }

  function warn(text) {
    $.NSFileHandle.fileHandleWithStandardError.writeData($(text + '\n').dataUsingEncoding($.NSUTF8StringEncoding))
  }

  function hostAlive() {
    if (!hostPid) return true
    // kill(pid, 0) succeeds while the host process exists.
    return $.kill(hostPid, 0) === 0
  }

  function readView() {
    var attrs = fm.attributesOfItemAtPathError(viewPath, null)
    if (!attrs || attrs.isNil()) return null
    var stamp = ObjC.unwrap(attrs.fileModificationDate.description) + ':' + ObjC.unwrap(attrs.fileSize)
    if (stamp === lastStamp) return null
    lastStamp = stamp
    var text = $.NSString.stringWithContentsOfFileEncodingError(viewPath, $.NSUTF8StringEncoding, null)
    if (!text || text.isNil()) return null
    try { return JSON.parse(ObjC.unwrap(text)) } catch (e) { return null }
  }

  // ---- whale rasterizer --------------------------------------------------------

  /** Build an NSBezierPath from lib/whale.js commands, fitted into w×h pixels and flipped to AppKit's y-up. */
  function bezier(paths, spec, w, h) {
    var path = $.NSBezierPath.bezierPath
    path.windingRule = $.NSNonZeroWindingRule
    var b = spec.bounds || { x: 0, y: 0, w: spec.box, h: spec.box }
    var s = Math.min(w / b.w, h / b.h)
    var ox = (w - b.w * s) / 2
    var oy = (h - b.h * s) / 2
    var P = function (x, y) { return $.NSMakePoint(ox + (x - b.x) * s, h - oy - (y - b.y) * s) }
    paths.forEach(function (sub) {
      sub.forEach(function (cmd) {
        if (cmd[0] === 'M') path.moveToPoint(P(cmd[1], cmd[2]))
        else if (cmd[0] === 'L') path.lineToPoint(P(cmd[1], cmd[2]))
        else if (cmd[0] === 'C') path.curveToPointControlPoint1ControlPoint2(P(cmd[5], cmd[6]), P(cmd[1], cmd[2]), P(cmd[3], cmd[4]))
        else if (cmd[0] === 'Z') path.closePath
      })
    })
    return path
  }

  /** One bitmap rep of the whale at `scale` (1 or 2), black on transparent. */
  function rep(paths, spec, scale) {
    var w = ICON_W * scale
    var h = ICON_H * scale
    var bitmap = $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(
      $(), w, h, 8, 4, true, false, $.NSCalibratedRGBColorSpace, 0, 0)
    $.NSGraphicsContext.saveGraphicsState
    $.NSGraphicsContext.setCurrentContext($.NSGraphicsContext.graphicsContextWithBitmapImageRep(bitmap))
    // Fresh bitmap memory is not guaranteed to be zeroed: clear it to transparent first.
    $.NSColor.clearColor.set
    $.NSRectFill($.NSMakeRect(0, 0, w, h))
    $.NSColor.blackColor.set
    bezier(paths, spec, w, h).fill
    $.NSGraphicsContext.restoreGraphicsState
    // Set the point size only after drawing (before, the context would scale
    // pixel coordinates by it): 36 px at 18 pt is the retina 2x rep.
    bitmap.size = $.NSMakeSize(ICON_W, ICON_H)
    return bitmap
  }

  function whaleImage(state, frame) {
    var key = state + ':' + frame
    if (images[key]) return images[key]
    var frames = (icon && icon.frames[state]) || (icon && icon.frames.idle)
    if (!frames) return null
    var paths = frames[frame % frames.length]
    var image = $.NSImage.alloc.initWithSize($.NSMakeSize(ICON_W, ICON_H))
    image.addRepresentation(rep(paths, icon, 1))
    image.addRepresentation(rep(paths, icon, 2))
    image.template = true // the menu bar colours it like every other icon
    images[key] = image
    return image
  }

  function symbolImage(name) {
    if (!name) return null
    if (symbolCache[name] !== undefined) return symbolCache[name]
    var image = null
    if ($.NSImage.imageWithSystemSymbolNameAccessibilityDescription) {
      var candidate = $.NSImage.imageWithSystemSymbolNameAccessibilityDescription(name, $())
      if (candidate && !candidate.isNil()) image = candidate
    }
    symbolCache[name] = image
    return image
  }

  function showFrame() {
    var image = whaleImage(current.state, current.frame)
    if (image) item.button.image = image
  }

  // ---- view -> status item -----------------------------------------------------------

  function buildMenu(rows) {
    var menu = $.NSMenu.alloc.init
    menu.autoenablesItems = false
    rows.forEach(function (row) {
      if (row.separator) { menu.addItem($.NSMenuItem.separatorItem); return }
      var mi = $.NSMenuItem.alloc.initWithTitleActionKeyEquivalent($(row.label), 'menuClicked:', '')
      mi.target = target
      mi.representedObject = $(row.id || '')
      mi.enabled = row.enabled !== false
      var image = symbolImage(row.icon)
      if (image) mi.image = image
      if (row.children && row.children.length) {
        mi.action = $()
        mi.enabled = true
        mi.submenu = buildMenu(row.children)
      }
      menu.addItem(mi)
    })
    return menu
  }

  function apply(view) {
    if (view.icon) {
      icon = view.icon
      images = {}
    }
    var frames = (icon && icon.frames[view.state]) ? icon.frames[view.state].length : 1
    current = { state: view.state, frame: 0, frames: frames }
    var button = item.button
    button.imagePosition = $.NSImageLeft
    showFrame()
    button.title = $(view.title ? ' ' + view.title : '')
    button.toolTip = $(view.tooltip)
    item.menu = buildMenu(view.menu)
  }

  ObjC.registerSubclass({
    name: 'DshTrayTarget',
    methods: {
      'menuClicked:': {
        types: ['void', ['id']],
        implementation: function (sender) {
          var id = ObjC.unwrap(sender.representedObject)
          if (!id) return
          if (id === 'hide-tray') { send(id); app.terminate(null); return }
          send(id)
        },
      },
      'tick:': {
        types: ['void', ['id']],
        implementation: function () {
          try {
            if (!hostAlive()) { app.terminate(null); return }
            var view = readView()
            if (view) apply(view)
            ticks += 1
            if (current.frames > 1 && ticks % Math.max(1, Math.round(FRAME_SECONDS / 0.3)) === 0) {
              current.frame = (current.frame + 1) % current.frames
              showFrame()
            }
          } catch (e) {
            // ObjC callbacks swallow exceptions silently; surface them on stderr.
            warn('tray tick failed: ' + e)
          }
        },
      },
    },
  })
  var target = $.DshTrayTarget.alloc.init

  var first = readView()
  if (first) apply(first)
  else item.button.title = $(' …')
  $.NSTimer.scheduledTimerWithTimeIntervalTargetSelectorUserInfoRepeats(0.3, target, 'tick:', null, true)
  app.run
}
