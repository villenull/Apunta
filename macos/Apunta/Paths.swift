import Foundation

/// Where everything lives inside `Apunta.app`, in one place.
///
/// The layout follows Apple's "Placing content in a bundle" table, with one
/// deliberate departure noted below. Getting this wrong is not a runtime
/// inconvenience — a Mach-O in `Contents/Resources/` is the exact mistake
/// Apple's own guidance warns produces code-signing problems that only surface
/// at notarization.
///
///     Contents/MacOS/Apunta                  the shell (this program)
///     Contents/MacOS/node                    the Node runtime
///     Contents/Helpers/ollama/ollama         the AI runtime, with its dylibs
///     Contents/Helpers/whisper/whisper-cli   the transcriber
///     Contents/Helpers/better_sqlite3.node   the database addon
///     Contents/Resources/server/index.mjs    Apunta's own server, bundled
///     Contents/Resources/setup/setup.mjs     first-run setup, bundled
///     Contents/Resources/node_modules/       better-sqlite3's JavaScript only
///     Contents/Resources/web/                the built browser app
///     Contents/Resources/THIRD-PARTY-LICENSES.md
///
/// The departure: `ollama` and its `libggml*` / `libllama*` dylibs sit together
/// in one directory rather than being split between `Contents/MacOS/` and
/// `Contents/Frameworks/`. They are built with `@loader_path` run paths, so
/// they must be beside their executable, and moving them would mean rewriting
/// load commands with `install_name_tool` — which invalidates a signature if
/// it happens in the wrong order. Keeping upstream's own flat layout is the
/// option with the fewest moving parts.
enum Paths {
    static let bundle = Bundle.main

    static var contents: URL {
        bundle.bundleURL.appendingPathComponent("Contents", isDirectory: true)
    }

    static var node: URL {
        contents.appendingPathComponent("MacOS/node")
    }

    static var helpers: URL {
        contents.appendingPathComponent("Helpers", isDirectory: true)
    }

    static var ollamaBinary: URL {
        helpers.appendingPathComponent("ollama/ollama")
    }

    static var whisperBinary: URL {
        helpers.appendingPathComponent("whisper/whisper-cli")
    }

    static var sqliteBinding: URL {
        helpers.appendingPathComponent("better_sqlite3.node")
    }

    static var resources: URL {
        contents.appendingPathComponent("Resources", isDirectory: true)
    }

    static var serverScript: URL {
        resources.appendingPathComponent("server/index.mjs")
    }

    static var setupScript: URL {
        resources.appendingPathComponent("setup/setup.mjs")
    }

    static var webDist: URL {
        resources.appendingPathComponent("web", isDirectory: true)
    }

    static var licenses: URL {
        resources.appendingPathComponent("THIRD-PARTY-LICENSES.md")
    }

    /// `~/Library/Application Support/Apunta` — the same directory
    /// `server/src/config.ts` computes, and the one the uninstall instructions
    /// name. `APUNTA_DATA_DIR` overrides it there and here alike, so a
    /// practice that keeps its data on an external drive still works.
    static var dataDirectory: URL {
        if let override = ProcessInfo.processInfo.environment["APUNTA_DATA_DIR"], !override.isEmpty {
            return URL(fileURLWithPath: override)
        }
        let library = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return library.appendingPathComponent("Apunta", isDirectory: true)
    }

    /// Everything the child processes are told about the machine.
    ///
    /// The server reads all of these; none of them is optional in the packaged
    /// app, and every one is a path into this bundle rather than something
    /// found on `PATH`. There is no Homebrew here.
    static func childEnvironment(port: Int) -> [String: String] {
        var environment = ProcessInfo.processInfo.environment
        environment["APUNTA_PORT"] = String(port)
        environment["APUNTA_DATA_DIR"] = dataDirectory.path
        environment["APUNTA_INSTALL_DIR"] = Bundle.main.bundleURL.deletingLastPathComponent().path
        environment["APUNTA_OLLAMA_BIN"] = ollamaBinary.path
        environment["APUNTA_WHISPER_BIN"] = whisperBinary.path
        environment["APUNTA_SQLITE_BINDING"] = sqliteBinding.path
        environment["APUNTA_LICENSES_FILE"] = licenses.path
        environment["APUNTA_WEB_DIST"] = webDist.path
        // The shell opens the browser itself, once, after the server answers.
        // Letting the server do it too would open two tabs.
        environment["APUNTA_NO_OPEN"] = "1"
        // Never. With it on, the AI runtime writes the full text of every
        // prompt — the therapist's account of a session — into a log file.
        environment.removeValue(forKey: "OLLAMA_DEBUG")
        return environment
    }
}
