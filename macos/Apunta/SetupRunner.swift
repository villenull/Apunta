import Foundation

/// Reading what first-run setup says.
///
/// The setup process is `node setup.js`, and it writes one JSON object per
/// line. **Nothing here decides anything.** Disk arithmetic, the model tier,
/// checksums and download-resume bookkeeping all live in TypeScript
/// (`installer/`), where they are unit-tested on Linux; this file turns lines
/// into values and hands them to a window.
///
/// That division is the reason the shell can be Swift at all: logic written in
/// a language this project's CI cannot run is logic nobody can test until it
/// reaches her Mac.
struct SetupLicence: Decodable {
    let name: String
    let url: String
    let verified: Bool
}

struct SetupModel: Decodable {
    let tag: String
    let publisher: String
    let reason: String
    let licence: SetupLicence
}

struct SetupStep: Decodable {
    let id: String
    let label: String
    let needed: Bool
    let approxBytes: Int
}

struct SetupDisk: Decodable {
    let ok: Bool
    let freeBytes: Double
    let requiredBytes: Double
    let shortfallBytes: Double
    let message: String
}

enum SetupEvent {
    case plan(model: SetupModel, steps: [SetupStep], disk: SetupDisk, ready: Bool, memoryGib: Double?)
    case step(id: String, status: String, label: String)
    case progress(id: String, percent: Double?, detail: String)
    case message(text: String)
    case done
    case failed(title: String, detail: String, retryable: Bool)

    /// One line in; one event or nothing out.
    ///
    /// A line that does not parse is dropped rather than shown. The setup
    /// process promises stdout carries only its own events, but a library
    /// writing a warning there must not become a dialog in front of a
    /// therapist.
    static func decode(line: String) -> SetupEvent? {
        guard let data = line.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let kind = object["event"] as? String
        else { return nil }

        switch kind {
        case "plan":
            guard let model = decodeValue(SetupModel.self, from: object["model"]),
                  let steps = decodeValue([SetupStep].self, from: object["steps"]),
                  let disk = decodeValue(SetupDisk.self, from: object["disk"]),
                  let ready = object["ready"] as? Bool
            else { return nil }
            return .plan(model: model, steps: steps, disk: disk, ready: ready,
                         memoryGib: object["memoryGib"] as? Double)
        case "step":
            guard let id = object["id"] as? String,
                  let status = object["status"] as? String,
                  let label = object["label"] as? String
            else { return nil }
            return .step(id: id, status: status, label: label)
        case "progress":
            guard let id = object["id"] as? String, let detail = object["detail"] as? String
            else { return nil }
            return .progress(id: id, percent: object["percent"] as? Double, detail: detail)
        case "message":
            guard let text = object["text"] as? String else { return nil }
            return .message(text: text)
        case "done":
            return .done
        case "failed":
            guard let title = object["title"] as? String,
                  let detail = object["detail"] as? String
            else { return nil }
            return .failed(title: title, detail: detail,
                           retryable: object["retryable"] as? Bool ?? true)
        default:
            return nil
        }
    }

    private static func decodeValue<T: Decodable>(_ type: T.Type, from raw: Any?) -> T? {
        guard let raw, let data = try? JSONSerialization.data(withJSONObject: raw) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }
}

/// Runs `node setup.js <command>` and delivers its events on the main queue.
final class SetupRunner {
    private var process: Process?
    private var buffer = Data()

    var isRunning: Bool { process?.isRunning ?? false }

    /// - Parameters:
    ///   - command: `plan` (decide, change nothing) or `run` (do it).
    ///   - onEvent: called on the main queue, one call per event.
    ///   - onExit: called on the main queue when the process has gone.
    func start(command: String,
               port: Int,
               onEvent: @escaping (SetupEvent) -> Void,
               onExit: @escaping (Int32) -> Void) {
        cancel()
        buffer = Data()

        let process = Process()
        process.executableURL = Paths.node
        process.arguments = [Paths.setupScript.path, command]
        process.environment = Paths.childEnvironment(port: port)
        process.currentDirectoryURL = Paths.resources

        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice

        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            guard let self else { return }
            let chunk = handle.availableData
            guard !chunk.isEmpty else { return }
            self.buffer.append(chunk)
            for event in self.drainLines() {
                DispatchQueue.main.async { onEvent(event) }
            }
        }

        process.terminationHandler = { finished in
            pipe.fileHandleForReading.readabilityHandler = nil
            DispatchQueue.main.async { onExit(finished.terminationStatus) }
        }

        do {
            try process.run()
            self.process = process
        } catch {
            DispatchQueue.main.async {
                onEvent(.failed(title: "Apunta could not start its setup",
                                detail: "Something is missing from this copy of Apunta. "
                                    + "Downloading and installing it again is the fix.",
                                retryable: false))
                onExit(-1)
            }
        }
    }

    /// Pull whole lines out of whatever has arrived so far.
    ///
    /// A read can end mid-line, and a 574 MB download reports progress often
    /// enough that it will. Anything after the last newline stays in the
    /// buffer until the rest of it turns up.
    private func drainLines() -> [SetupEvent] {
        var events: [SetupEvent] = []
        while let index = buffer.firstIndex(of: 0x0A) {
            let lineData = buffer.subdata(in: buffer.startIndex..<index)
            buffer.removeSubrange(buffer.startIndex...index)
            if let line = String(data: lineData, encoding: .utf8),
               let event = SetupEvent.decode(line: line) {
                events.append(event)
            }
        }
        return events
    }

    /// Stop a download the user cancelled. Whatever arrived stays on disk, and
    /// the next run resumes from it — which is what the "Setup was stopped"
    /// message promises.
    func cancel() {
        // `terminate()` on a process that was never launched raises; only a
        // running one is worth signalling, and a finished one is already gone.
        if let process, process.isRunning { process.terminate() }
        process = nil
    }
}
