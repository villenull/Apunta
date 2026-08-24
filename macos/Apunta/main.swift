import AppKit

/// The entry point.
///
/// `.accessory` rather than `.regular`: Apunta lives in the menu bar and its
/// interface is a browser tab, so a Dock icon would be an icon that does
/// nothing but bounce. The first-run window still comes to the front, because
/// `NSApp.activate(ignoringOtherApps:)` works for an accessory app.
let application = NSApplication.shared
let delegate = AppDelegate()
application.delegate = delegate
application.setActivationPolicy(.accessory)
application.run()
