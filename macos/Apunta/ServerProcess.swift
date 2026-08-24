import Foundation

/// Apunta's server, as the shell's one and only child.
///
/// The shell spawns `node` and nothing else. The server spawns the AI runtime
/// and the transcriber, exactly as it already spawned the transcriber before
/// there was a shell. Two levels, each owning its own children, is what makes
/// "quitting leaves no orphans" a single kill instead of process-tree
/// bookkeeping across two languages.
final class ServerProcess {
    private var process: Process?
    private(set) var port: Int = 7717

    var isRunning: Bool { process?.isRunning ?? false }

    /// The address the browser opens. Loopback, always, written out literally.
    var url: URL { URL(string: "http://127.0.0.1:\(port)")! }

    enum StartError: Error, LocalizedError {
        case noFreePort
        case spawnFailed(String)

        var errorDescription: String? {
            switch self {
            case .noFreePort:
                return "Apunta could not find a free connection on this Mac to use."
            case .spawnFailed(let reason):
                return "Apunta could not start its own program: \(reason)"
            }
        }
    }

    func start() throws {
        guard !isRunning else { return }
        guard let free = Ports.firstFree(from: 7717, attempts: 64) else { throw StartError.noFreePort }
        port = free

        let process = Process()
        process.executableURL = Paths.node
        process.arguments = [Paths.serverScript.path]
        process.environment = Paths.childEnvironment(port: port)
        process.currentDirectoryURL = Paths.resources
        // Nothing the server prints is read by anyone, and a log file beside a
        // clinical database is a category of accident worth removing rather
        // than auditing. Its own diagnostics are its own business.
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice

        do {
            try process.run()
        } catch {
            throw StartError.spawnFailed(error.localizedDescription)
        }
        self.process = process
    }

    /// Wait until `/api/health` answers, or give up.
    ///
    /// Polling an endpoint rather than parsing the server's log output: the
    /// log is JSON meant for a developer and its shape is not a contract, but
    /// health has been one since M0.
    func waitUntilReady(timeout: TimeInterval) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if Http.getOK(url.appendingPathComponent("api/health"), timeout: 2) { return true }
            if !isRunning { return false }
            Thread.sleep(forTimeInterval: 0.25)
        }
        return false
    }

    /// Stop, and mean it.
    ///
    /// `SIGTERM` first so the server can close the database cleanly and stop
    /// the AI runtime it owns; `SIGKILL` after a grace period, because a quit
    /// that hangs is a quit the user force-quits, which is how a database is
    /// left with a stale write-ahead log.
    func stop(grace: TimeInterval = 6) {
        guard let process, process.isRunning else {
            self.process = nil
            return
        }
        process.terminate()
        let deadline = Date().addingTimeInterval(grace)
        while process.isRunning && Date() < deadline {
            Thread.sleep(forTimeInterval: 0.1)
        }
        if process.isRunning {
            kill(process.processIdentifier, SIGKILL)
        }
        self.process = nil
    }
}

/// Finding a connection nobody else is using.
enum Ports {
    /// The first port from `start` that nothing is listening on.
    ///
    /// The packet asks for exactly this: "if the port is occupied, pick the
    /// next free one and open that." Binding and immediately closing leaves a
    /// window in which something else could take it — on a single-user desktop
    /// that is not a real risk, and the alternative (the server picking its own
    /// port and the shell parsing it back out of a log line) trades a
    /// theoretical race for a brittle contract.
    static func firstFree(from start: Int, attempts: Int) -> Int? {
        for candidate in start..<(start + attempts) where isFree(candidate) {
            return candidate
        }
        return nil
    }

    static func isFree(_ port: Int) -> Bool {
        let descriptor = socket(AF_INET, SOCK_STREAM, 0)
        guard descriptor >= 0 else { return false }
        defer { close(descriptor) }

        var reuse: Int32 = 1
        setsockopt(descriptor, SOL_SOCKET, SO_REUSEADDR, &reuse, socklen_t(MemoryLayout<Int32>.size))

        var address = sockaddr_in()
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = UInt16(port).bigEndian
        address.sin_addr.s_addr = inet_addr("127.0.0.1")

        let bound = withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { rebound in
                bind(descriptor, rebound, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        return bound == 0
    }
}

/// The only network the shell ever touches, and it is 127.0.0.1.
enum Http {
    static func getOK(_ url: URL, timeout: TimeInterval) -> Bool {
        var request = URLRequest(url: url)
        request.timeoutInterval = timeout
        request.httpMethod = "GET"

        let semaphore = DispatchSemaphore(value: 0)
        var ok = false
        let task = URLSession.shared.dataTask(with: request) { _, response, _ in
            if let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) { ok = true }
            semaphore.signal()
        }
        task.resume()
        _ = semaphore.wait(timeout: .now() + timeout + 1)
        return ok
    }
}
