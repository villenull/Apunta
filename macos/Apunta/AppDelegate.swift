import AppKit

/// The whole shell: a status item, one child process, a progress window, and
/// `open`.
///
/// It is this small on purpose. Every decision the first run makes — how much
/// disk is needed, which model this Mac gets, whether a half-finished download
/// can be resumed, whether a file is the file it should be — happens in
/// TypeScript, in a process this class spawns and reads. What is left here is
/// sequencing and pixels, which is the part that cannot be unit-tested on
/// Linux anyway.
///
/// The process tree is two levels deep and each level owns its own children:
///
///     Apunta (this)
///       └── node (the server)         → ollama serve, whisper-cli
///       └── node (setup, transient)
///
/// so quitting is one `terminate()` and the server tears down what it started.
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem?
    private let server = ServerProcess()
    private let setup = SetupRunner()
    private var setupWindow: SetupWindow?
    private var isReady = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildStatusItem()
        startEverything()
    }

    /// Double-clicking Apunta while it is already running.
    ///
    /// LaunchServices activates the running instance rather than starting a
    /// second one, and delivers this — which for a status-item app with no
    /// windows is exactly the hook for "open the tab again". (Note for anyone
    /// tempted: `LSMultipleInstancesProhibited` is *not* what provides this.
    /// Apple defines it as being about multiple *users*, i.e. fast user
    /// switching, not a second instance in your own session.)
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows: Bool) -> Bool {
        if isReady {
            openInBrowser()
        } else if let window = setupWindow?.window {
            NSApp.activate(ignoringOtherApps: true)
            window.makeKeyAndOrderFront(nil)
        }
        return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        setup.cancel()
        server.stop()
    }

    // MARK: - Status item

    private func buildStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.image = NSImage(
            systemSymbolName: "square.and.pencil",
            accessibilityDescription: "Apunta"
        )
        item.button?.image?.isTemplate = true
        item.menu = buildMenu(running: false)
        statusItem = item
    }

    private func buildMenu(running: Bool) -> NSMenu {
        let menu = NSMenu()

        let state = NSMenuItem(title: running ? "Apunta is running" : "Apunta is starting…",
                               action: nil, keyEquivalent: "")
        state.isEnabled = false
        menu.addItem(state)
        menu.addItem(.separator())

        let open = NSMenuItem(title: "Open Apunta", action: #selector(openInBrowser), keyEquivalent: "o")
        open.target = self
        open.isEnabled = running
        menu.addItem(open)

        let reveal = NSMenuItem(title: "Show My Notes Folder in Finder",
                                action: #selector(revealDataFolder), keyEquivalent: "")
        reveal.target = self
        menu.addItem(reveal)

        menu.addItem(.separator())

        let stop = NSMenuItem(title: "Stop Apunta", action: #selector(stopServer), keyEquivalent: "")
        stop.target = self
        stop.isEnabled = running
        menu.addItem(stop)

        let quit = NSMenuItem(title: "Quit Apunta", action: #selector(quit), keyEquivalent: "q")
        quit.target = self
        menu.addItem(quit)

        // There is deliberately no "Check for updates". Hard rule 1 has no
        // exception for update checks, and a background version ping is still
        // an outbound call. New versions arrive as a new file.
        return menu
    }

    private func refreshMenu(running: Bool) {
        statusItem?.menu = buildMenu(running: running)
        statusItem?.button?.appearsDisabled = !running
    }

    // MARK: - Sequencing

    private func startEverything() {
        do {
            try server.start()
        } catch {
            showFatal(title: "Apunta could not start",
                      detail: (error as? LocalizedError)?.errorDescription
                          ?? "Something is missing from this copy of Apunta. Downloading and "
                          + "installing it again is the fix.")
            return
        }

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            let ready = self.server.waitUntilReady(timeout: 30)
            DispatchQueue.main.async {
                guard ready else {
                    self.showFatal(title: "Apunta could not start",
                                   detail: "Apunta’s own program did not answer. Quitting and "
                                       + "opening it again usually fixes this.")
                    return
                }
                self.checkSetup()
            }
        }
    }

    /// Ask the setup process what, if anything, is missing.
    private func checkSetup() {
        var planSeen = false
        setup.start(command: "plan", port: server.port, onEvent: { [weak self] event in
            guard let self else { return }
            guard case let .plan(model, steps, disk, ready, _) = event else { return }
            planSeen = true
            if ready {
                self.finishAndOpen()
            } else if !disk.ok {
                self.window().showBlocked(
                    title: "This Mac needs more free space",
                    detail: disk.message,
                    onRetry: { self.checkSetup() },
                    onQuit: { self.quit() }
                )
            } else {
                self.window().showPlan(
                    model: model, steps: steps, disk: disk,
                    onDownload: { self.runSetup() },
                    onQuit: { self.quit() }
                )
            }
        }, onExit: { [weak self] _ in
            guard let self, !planSeen else { return }
            self.showFatal(title: "Apunta could not check its setup",
                           detail: "Quitting and opening Apunta again usually fixes this.")
        })
    }

    /// Download what is missing, rendering the stream as it arrives.
    private func runSetup() {
        let window = self.window()
        window.showWorking(step: "Starting…")
        window.setPrimary(title: "Stop") { [weak self] in
            self?.setup.cancel()
        }

        var finished = false
        setup.start(command: "run", port: server.port, onEvent: { [weak self] event in
            guard let self else { return }
            switch event {
            case .plan:
                break
            case .step(_, let status, let label):
                if status == "started" || status == "verifying" { window.update(message: label) }
            case .progress(_, let percent, let detail):
                window.update(percent: percent, detail: detail)
            case .message(let text):
                window.update(message: text)
            case .done:
                finished = true
                self.finishAndOpen()
            case .failed(let title, let detail, let retryable):
                finished = true
                window.showFailure(title: title, detail: detail, retryable: retryable,
                                   onRetry: { self.runSetup() },
                                   onQuit: { self.quit() })
            }
        }, onExit: { [weak self] _ in
            guard let self, !finished else { return }
            // The process went without saying why — most often because the
            // user pressed Stop, which is not a failure and loses nothing.
            self.window().showFailure(
                title: "Setup was stopped",
                detail: "Nothing was lost. The part that had already downloaded is still there, "
                    + "so starting again continues from that point.",
                retryable: true,
                onRetry: { self.runSetup() },
                onQuit: { self.quit() }
            )
        })
    }

    private func finishAndOpen() {
        isReady = true
        setupWindow?.hide()
        refreshMenu(running: true)
        openInBrowser()
    }

    private func window() -> SetupWindow {
        if let setupWindow { return setupWindow }
        let created = SetupWindow()
        setupWindow = created
        return created
    }

    private func showFatal(title: String, detail: String) {
        window().showFailure(title: title, detail: detail, retryable: false,
                             onRetry: {}, onQuit: { [weak self] in self?.quit() })
    }

    // MARK: - Menu actions

    @objc private func openInBrowser() {
        NSWorkspace.shared.open(server.url)
    }

    /// Better than telling someone where a folder is: show it to them.
    @objc private func revealDataFolder() {
        let folder = Paths.dataDirectory
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true,
                                                 attributes: [.posixPermissions: 0o700])
        NSWorkspace.shared.selectFile(nil, inFileViewerRootedAtPath: folder.path)
    }

    @objc private func stopServer() {
        server.stop()
        isReady = false
        refreshMenu(running: false)
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }
}
