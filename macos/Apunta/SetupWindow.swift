import AppKit

/// The first-run window.
///
/// A view over `installer/`'s NDJSON, and nothing more: it shows what the plan
/// said, draws a bar when progress arrives, and offers one button. Every
/// number and every sentence in it was computed and worded on the other side
/// of the pipe, where they are tested.
///
/// It is deliberately plain. The person in front of it has just double-clicked
/// an app for the first time, may be looking at an "unidentified developer"
/// dialog five seconds ago, and needs to know three things: what is happening,
/// how long it will take, and what to do if it stops.
final class SetupWindow: NSWindowController {
    private let titleLabel = NSTextField(labelWithString: "Setting up Apunta")
    private let bodyLabel = NSTextField(wrappingLabelWithString: "")
    private let detailLabel = NSTextField(labelWithString: "")
    private let licenceButton = NSButton()
    private let progress = NSProgressIndicator()
    private let actionButton = NSButton()
    private let secondaryButton = NSButton()

    private var licenceURL: URL?
    private var onPrimary: (() -> Void)?
    private var onSecondary: (() -> Void)?

    convenience init() {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 520, height: 320),
            styleMask: [.titled, .closable],
            backing: .buffered,
            defer: false
        )
        window.title = "Apunta"
        window.center()
        window.isReleasedWhenClosed = false
        self.init(window: window)
        buildLayout()
    }

    private func buildLayout() {
        guard let content = window?.contentView else { return }

        titleLabel.font = NSFont.systemFont(ofSize: 20, weight: .semibold)
        bodyLabel.font = NSFont.systemFont(ofSize: 13)
        bodyLabel.textColor = .secondaryLabelColor
        detailLabel.font = NSFont.systemFont(ofSize: 12)
        detailLabel.textColor = .secondaryLabelColor

        progress.style = .bar
        progress.isIndeterminate = false
        progress.minValue = 0
        progress.maxValue = 100
        progress.isHidden = true

        licenceButton.title = ""
        licenceButton.bezelStyle = .inline
        licenceButton.isBordered = false
        licenceButton.contentTintColor = .linkColor
        licenceButton.target = self
        licenceButton.action = #selector(openLicence)
        licenceButton.isHidden = true

        actionButton.bezelStyle = .rounded
        actionButton.keyEquivalent = "\r"
        actionButton.target = self
        actionButton.action = #selector(primaryPressed)

        secondaryButton.bezelStyle = .rounded
        secondaryButton.target = self
        secondaryButton.action = #selector(secondaryPressed)
        secondaryButton.isHidden = true

        let stack = NSStackView(views: [
            titleLabel, bodyLabel, licenceButton, progress, detailLabel,
        ])
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false

        let buttons = NSStackView(views: [secondaryButton, actionButton])
        buttons.orientation = .horizontal
        buttons.spacing = 12
        buttons.translatesAutoresizingMaskIntoConstraints = false

        content.addSubview(stack)
        content.addSubview(buttons)

        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -24),
            stack.topAnchor.constraint(equalTo: content.topAnchor, constant: 24),
            progress.widthAnchor.constraint(equalTo: stack.widthAnchor),
            bodyLabel.widthAnchor.constraint(equalTo: stack.widthAnchor),
            buttons.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -24),
            buttons.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -20),
        ])
    }

    // MARK: - What the window can be showing

    /// "Here is what I am about to download, and here is whose terms apply."
    func showPlan(model: SetupModel,
                  steps: [SetupStep],
                  disk: SetupDisk,
                  onDownload: @escaping () -> Void,
                  onQuit: @escaping () -> Void) {
        titleLabel.stringValue = "Apunta needs to download two things"

        let needed = steps.filter { $0.needed }.map { $0.label }
        var lines: [String] = []
        lines.append(model.reason)
        lines.append("")
        lines.append(needed.map { "•  \($0)" }.joined(separator: "\n"))
        lines.append("")
        lines.append(disk.message)
        lines.append("")
        lines.append("Apunta does not host or copy these models. This Mac downloads them from "
            + "\(model.publisher), under their terms. They stay on this Mac afterwards, and "
            + "nothing you write is ever sent anywhere.")
        bodyLabel.stringValue = lines.joined(separator: "\n")

        licenceURL = URL(string: model.licence.url)
        licenceButton.title = "Read \(model.publisher)’s terms for \(model.tag)"
        licenceButton.isHidden = licenceURL == nil

        progress.isHidden = true
        detailLabel.stringValue = ""

        actionButton.title = "Download"
        actionButton.isEnabled = true
        onPrimary = onDownload

        secondaryButton.title = "Not now"
        secondaryButton.isHidden = false
        onSecondary = onQuit

        present()
    }

    /// The disk refusal. There is nothing to press but Try again.
    func showBlocked(title: String, detail: String, onRetry: @escaping () -> Void, onQuit: @escaping () -> Void) {
        titleLabel.stringValue = title
        bodyLabel.stringValue = detail
        licenceButton.isHidden = true
        progress.isHidden = true
        detailLabel.stringValue = ""

        actionButton.title = "Try again"
        actionButton.isEnabled = true
        onPrimary = onRetry

        secondaryButton.title = "Quit"
        secondaryButton.isHidden = false
        onSecondary = onQuit

        present()
    }

    func showWorking(step: String) {
        titleLabel.stringValue = "Setting up Apunta"
        bodyLabel.stringValue = step
        licenceButton.isHidden = true
        progress.isHidden = false
        progress.isIndeterminate = true
        progress.startAnimation(nil)

        actionButton.title = "Stop"
        actionButton.isEnabled = true

        secondaryButton.isHidden = true
        present()
    }

    func update(percent: Double?, detail: String) {
        progress.isHidden = false
        if let percent {
            progress.isIndeterminate = false
            progress.doubleValue = percent
        } else {
            progress.isIndeterminate = true
            progress.startAnimation(nil)
        }
        detailLabel.stringValue = detail
    }

    func update(message: String) {
        bodyLabel.stringValue = message
    }

    func showFailure(title: String, detail: String, retryable: Bool,
                     onRetry: @escaping () -> Void, onQuit: @escaping () -> Void) {
        titleLabel.stringValue = title
        bodyLabel.stringValue = detail
        licenceButton.isHidden = true
        progress.isHidden = true
        progress.stopAnimation(nil)
        detailLabel.stringValue = ""

        actionButton.title = retryable ? "Try again" : "Quit"
        actionButton.isEnabled = true
        onPrimary = retryable ? onRetry : onQuit

        secondaryButton.title = "Quit"
        secondaryButton.isHidden = !retryable
        onSecondary = onQuit

        present()
    }

    func setPrimary(title: String, action: @escaping () -> Void) {
        actionButton.title = title
        onPrimary = action
    }

    private func present() {
        window?.center()
        NSApp.activate(ignoringOtherApps: true)
        showWindow(nil)
    }

    func hide() {
        progress.stopAnimation(nil)
        window?.orderOut(nil)
    }

    // MARK: - Actions

    @objc private func primaryPressed() { onPrimary?() }
    @objc private func secondaryPressed() { onSecondary?() }

    /// Opens the publisher's terms in the browser.
    ///
    /// This is a click the user made, on a link the window showed them, to a
    /// page in the download allow-list. The app itself makes no request:
    /// `NSWorkspace.open` hands the URL to the browser and stops there.
    @objc private func openLicence() {
        guard let licenceURL else { return }
        NSWorkspace.shared.open(licenceURL)
    }
}
