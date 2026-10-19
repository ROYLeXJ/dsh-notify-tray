// macOS menu bar helper for dsh-notify-tray, run with `osascript -l JavaScript`.
// No compiled binary: JXA's Objective-C bridge drives NSStatusItem directly, so
// it works on any Mac (Apple Silicon or Intel) without Rosetta or Xcode.
//
// argv: <view.json path> <host pid>
// The host rewrites view.json atomically; this script polls its mtime. Menu
// clicks are written to stdout as one JSON line each: {"action":"<id>"}.
ObjC.import('Cocoa')
ObjC.import('stdlib')
ObjC.import('signal')

function run(argv) {
  var viewPath = argv[0]
  var hostPid = Number(argv[1] || 0)
  var app = $.NSApplication.sharedApplication
  app.setActivationPolicy($.NSApplicationActivationPolicyAccessory)

  var item = $.NSStatusBar.systemStatusBar.statusItemWithLength(-1) // NSVariableStatusItemLength
  var stdout = $.NSFileHandle.fileHandleWithStandardOutput
  var fm = $.NSFileManager.defaultManager
  var lastStamp = ''
  var colors = {
    attention: $.NSColor.systemOrangeColor,
    error: $.NSColor.systemRedColor,
    running: $.NSColor.systemBlueColor,
    idle: null,
  }
  var symbols = {
    attention: 'bell.badge.fill',
    error: 'exclamationmark.triangle.fill',
    running: 'circle.dotted.circle',
    idle: 'checkmark.circle',
  }

  function send(action) {
    var line = $(JSON.stringify({ action: action }) + '\n').dataUsingEncoding($.NSUTF8StringEncoding)
    stdout.writeData(line)
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

  function apply(view) {
    var button = item.button
    button.title = $(' ' + view.title)
    var symbol = symbols[view.state] || symbols.idle
    if ($.NSImage.imageWithSystemSymbolNameAccessibilityDescription) {
      var image = $.NSImage.imageWithSystemSymbolNameAccessibilityDescription(symbol, 'DSH')
      if (image && !image.isNil()) {
        image.template = true
        button.image = image
        button.imagePosition = $.NSImageLeft
      }
    }
    var color = colors[view.state]
    button.contentTintColor = color ? color : null
    button.toolTip = $(view.tooltip)

    var menu = $.NSMenu.alloc.init
    menu.autoenablesItems = false
    view.menu.forEach(function (row) {
      if (row.separator) { menu.addItem($.NSMenuItem.separatorItem); return }
      var mi = $.NSMenuItem.alloc.initWithTitleActionKeyEquivalent($(row.label), 'menuClicked:', '')
      mi.target = target
      mi.representedObject = $(row.id)
      mi.enabled = row.enabled !== false
      menu.addItem(mi)
    })
    item.menu = menu
  }

  ObjC.registerSubclass({
    name: 'DshTrayTarget',
    methods: {
      'menuClicked:': {
        types: ['void', ['id']],
        implementation: function (sender) {
          var id = ObjC.unwrap(sender.representedObject)
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
          } catch (e) {
            // ObjC callbacks swallow exceptions silently; surface them on stderr.
            $.NSFileHandle.fileHandleWithStandardError.writeData($('tray tick failed: ' + e + '\n').dataUsingEncoding($.NSUTF8StringEncoding))
          }
        },
      },
    },
  })
  var target = $.DshTrayTarget.alloc.init

  item.button.title = $(' …')
  var first = readView()
  if (first) apply(first)
  $.NSTimer.scheduledTimerWithTimeIntervalTargetSelectorUserInfoRepeats(0.5, target, 'tick:', null, true)
  app.run
}
