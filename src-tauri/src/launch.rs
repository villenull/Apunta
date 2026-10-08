//! Where the shell finds everything it spawns, and the two refusals that keep a
//! test build away from the live instance.
//!
//! Two things live here and nothing else: `LaunchConfig`, which resolves the
//! bundled Node, the bundled server and the port from the environment, and the
//! identity check that E10 makes load-bearing.

use std::path::{Path, PathBuf};

/// C-ISO@1 rule 2 and HS-1: never this port, in any build.
pub const LIVE_PORT: u16 = 7717;

/// Production identity (DECISIONS E10).
pub const PRODUCTION_IDENTIFIER: &str = "app.apunta.desktop";

/// Test identity (DECISIONS E10). A test app can never focus or signal the
/// production app, and the single-instance plugin keys on the identifier, so a
/// forgotten `--config` would be visible rather than silent.
pub const TEST_IDENTIFIER: &str = "app.apunta.desktop.test";

#[derive(Debug)]
pub struct LaunchConfig {
    /// `<bundle>/node/bin/node`.
    pub node_bin: PathBuf,
    /// `<bundle>/server/server.mjs`.
    pub server_entry: PathBuf,
    /// A `PATH` with no host Node in it (P3.1's launch contract).
    pub child_path: String,
    /// Loopback only. `7717` in production, the sandbox's port in a test build.
    pub port: u16,
    /// The sandbox's data folder. Never the platform default.
    pub data_dir: PathBuf,
    /// `APUNTA_SHELL=1`.
    pub shell: bool,
    /// P3.1's four bundle-path overrides.
    pub paths: ChildPaths,
    /// The bundled AI runtime's address, when the bundle carries one (the Mac
    /// app). The server starts the runtime there and the installer pulls into
    /// it; without a bundled runtime both use the system Ollama's default.
    pub ollama_url: Option<String>,
}

/// The bundled runtime's port. Not Ollama's own 11434, so an Ollama she
/// installed herself keeps its port and its models, and the two never answer
/// for each other. A sandbox port gets its own, so two shells never share one.
pub const BUNDLED_OLLAMA_PORT: u16 = 11435;

pub fn bundled_ollama_url(server_port: u16) -> String {
    let port = if server_port == LIVE_PORT {
        BUNDLED_OLLAMA_PORT
    } else {
        server_port.saturating_add(1000)
    };
    format!("http://127.0.0.1:{port}")
}

/// P3.1's launch contract: the four `APUNTA_*` overrides that point into the
/// bundle itself.
///
/// Without them `config.ts` resolves `web/dist`, the licences file, the SQLite
/// addon and `whisper-cli` by walking **out** of the bundle folder to its
/// parent (`config.ts:165-173`), which inside an AppImage is a directory that
/// holds nothing of ours. Each is named rather than found, and each points at a
/// path the bundle actually contains.
#[derive(Debug, Clone)]
pub struct ChildPaths {
    pub sqlite_binding: PathBuf,
    pub licenses_file: PathBuf,
    pub web_dist: PathBuf,
    pub whisper_bin: PathBuf,
    /// `ollama/ollama`, the AI runtime, with its libraries beside it (A19). Only
    /// the Mac bundle carries it: on Linux the system's Ollama service is used,
    /// as before.
    pub ollama_bin: Option<PathBuf>,
}

impl ChildPaths {
    /// Every path is inside the bundle. Nothing here is optional: a missing
    /// member is a bundle that is not the one P3.1 built.
    pub fn resolve(bundle: &Path) -> Option<Self> {
        let paths = Self {
            sqlite_binding: bundle.join("native").join("better_sqlite3.node"),
            licenses_file: bundle.join("THIRD-PARTY-LICENSES.md"),
            web_dist: bundle.join("web").join("dist"),
            whisper_bin: bundle.join("bin").join("whisper-cli"),
            ollama_bin: Some(bundle.join("ollama").join("ollama")).filter(|path| path.is_file()),
        };
        let all_present = paths.sqlite_binding.is_file()
            && paths.licenses_file.is_file()
            && paths.web_dist.join("index.html").is_file()
            && paths.whisper_bin.is_file();
        if all_present {
            Some(paths)
        } else {
            None
        }
    }
}

/// Everything the shell needs to spawn, or a refusal naming what is missing.
#[derive(Debug)]
pub enum Refusal {
    /// A test build without both environment variables.
    MissingTestEnvironment(&'static str),
    /// `APUNTA_PORT` is not a port.
    BadPort(String),
    /// `APUNTA_PORT` is the live instance's.
    LivePort,
    /// A build whose identity is not the one its feature implies.
    WrongIdentity {
        found: String,
        expected: &'static str,
    },
    /// The bundle is not where the resources config put it.
    MissingBundle { path: PathBuf },
    /// The bundled runtime exists but could not be started.
    SpawnFailed { path: PathBuf, detail: String },
}

/// The platform's word in the packaging names: `build/<it>-resources/`,
/// `scripts/v2/package-<it>-resources.sh`.
#[cfg(not(target_os = "macos"))]
const PLATFORM: &str = "linux";
#[cfg(target_os = "macos")]
const PLATFORM: &str = "macos";

impl std::fmt::Display for Refusal {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MissingTestEnvironment(name) => write!(
                f,
                "a test build needs {name}: run it through scripts/v2/sandbox.mjs, never bare"
            ),
            Self::BadPort(raw) => write!(f, "APUNTA_PORT is not a port: {raw:?}"),
            Self::LivePort => write!(
                f,
                "refusing port {LIVE_PORT}: that is the live instance (E5). A test build uses the sandbox's port."
            ),
            Self::WrongIdentity { found, expected } => write!(
                f,
                "this build's identity is {found:?}, but test-identity requires {expected:?}. \
                 Pass --config src-tauri/tauri.test.conf.json; a test build that could be mistaken \
                 for the production app is refused rather than started."
            ),
            Self::MissingBundle { path } => write!(
                f,
                "the bundled runtime is not at {}: build/{PLATFORM}-resources must exist \
                 (scripts/v2/package-{PLATFORM}-resources.sh). The shell spawns the bundled server and \
                 never the checkout's.",
                path.display()
            ),
            Self::SpawnFailed { path, detail } => write!(
                f,
                "the bundled runtime at {} could not be started: {detail}",
                path.display()
            ),
        }
    }
}

impl std::error::Error for Refusal {}

/// Resolves the launch configuration from the environment.
///
/// `test_identity` is this build's Cargo feature, not an environment variable:
/// a test-identity binary cannot be talked out of its refusal by an env var,
/// which is the point of E10's second half.
pub fn resolve(bundle: &Path, env: &Env, test_identity: bool) -> Result<LaunchConfig, Refusal> {
    let node_bin = bundle.join("node").join("bin").join("node");
    let server_entry = bundle.join("server").join("server.mjs");
    if !node_bin.is_file() || !server_entry.is_file() {
        return Err(Refusal::MissingBundle {
            path: bundle.to_path_buf(),
        });
    }
    // The four overrides, resolved or refused: a bundle missing one of them is
    // not P3.1's bundle, and starting a server that would resolve its own
    // assets out of the bundle's parent is worse than refusing.
    let Some(paths) = ChildPaths::resolve(bundle) else {
        return Err(Refusal::MissingBundle {
            path: bundle.to_path_buf(),
        });
    };

    let (port, data_dir) = if test_identity {
        // Both or nothing: a missing variable is a refusal, not a default, so a
        // test build has no code path that starts without the sandbox's
        // instructions.
        let port_raw = env.get("APUNTA_PORT").filter(|v| !v.is_empty());
        let data_raw = env.get("APUNTA_DATA_DIR").filter(|v| !v.is_empty());
        let Some(port_raw) = port_raw else {
            return Err(Refusal::MissingTestEnvironment("APUNTA_PORT"));
        };
        let Some(data_raw) = data_raw else {
            return Err(Refusal::MissingTestEnvironment("APUNTA_DATA_DIR"));
        };
        let port: u16 = port_raw
            .parse()
            .map_err(|_| Refusal::BadPort(port_raw.to_string()))?;
        if port == LIVE_PORT {
            return Err(Refusal::LivePort);
        }
        (port, PathBuf::from(data_raw))
    } else {
        let port_raw = env.get("APUNTA_PORT").filter(|v| !v.is_empty());
        let port: u16 = match port_raw {
            // E5: production port 7717, no fallback. An explicit port is
            // honoured so the same binary can be exercised on the sandbox's
            // range without a second identity — and the **live** port is refused
            // outright, in this branch as well as in the test branch above, so
            // `APUNTA_PORT=7717` cannot reach the owner's instance from a
            // production-identity binary either.
            Some(raw) => {
                let port: u16 = raw.parse().map_err(|_| Refusal::BadPort(raw.to_string()))?;
                if port == LIVE_PORT {
                    return Err(Refusal::LivePort);
                }
                port
            }
            None => LIVE_PORT,
        };
        let data_dir = match env.get("APUNTA_DATA_DIR").filter(|v| !v.is_empty()) {
            Some(raw) => PathBuf::from(raw),
            // The platform default, as a string only. The shell never lists or
            // opens it (C-ISO@1 rule 3).
            None => default_data_dir(env),
        };
        (port, data_dir)
    };

    Ok(LaunchConfig {
        node_bin,
        server_entry,
        // P3.1's launch contract: `/usr/bin:/bin` holds no host Node, so the
        // bundled runtime is the only Node the child can find.
        child_path: "/usr/bin:/bin".to_string(),
        port,
        data_dir,
        shell: true,
        ollama_url: paths.ollama_bin.as_ref().map(|_| bundled_ollama_url(port)),
        paths,
    })
}

/// The identity a build with this feature set must carry.
pub fn expected_identifier(test_identity: bool) -> &'static str {
    if test_identity {
        TEST_IDENTIFIER
    } else {
        PRODUCTION_IDENTIFIER
    }
}

/// E10's check. A build whose identity and feature disagree is refused.
pub fn check_identity(found: &str, test_identity: bool) -> Result<(), Refusal> {
    let expected = expected_identifier(test_identity);
    if found == expected {
        Ok(())
    } else {
        Err(Refusal::WrongIdentity {
            found: found.to_string(),
            expected,
        })
    }
}

/// C-PATH@1's Linux row, as a string only.
fn default_data_dir(env: &Env) -> PathBuf {
    if let Some(xdg) = env.get("XDG_DATA_HOME").filter(|v| !v.is_empty()) {
        return PathBuf::from(xdg).join("apunta");
    }
    let home = env.get("HOME").unwrap_or("/");
    PathBuf::from(home)
        .join(".local")
        .join("share")
        .join("apunta")
}

/// The slice of the environment this module reads. `std::env::Vars` in
/// production, a map in a test — so no case here can be reached by mutating the
/// developer's shell.
#[derive(Debug)]
pub struct Env {
    vars: Vec<(String, String)>,
}

impl Env {
    pub fn from_process() -> Self {
        Self {
            vars: std::env::vars().collect(),
        }
    }

    #[cfg(test)]
    pub fn from_pairs(pairs: &[(&str, &str)]) -> Self {
        Self {
            vars: pairs
                .iter()
                .map(|(k, v)| ((*k).to_string(), (*v).to_string()))
                .collect(),
        }
    }

    pub fn get(&self, name: &str) -> Option<&str> {
        self.vars
            .iter()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value.as_str())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A throwaway tree with everything `resolve` insists on, so these cases test
    /// the refusals rather than the filesystem.
    ///
    /// `label` makes the tree **per test**, not per process: one case removes a
    /// file to prove an incomplete bundle is refused, and a shared tree would
    /// let that race every other case in the same binary.
    fn bundle(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("apunta-shell-tests-{label}"));
        std::fs::create_dir_all(dir.join("node").join("bin")).unwrap();
        std::fs::create_dir_all(dir.join("server")).unwrap();
        std::fs::create_dir_all(dir.join("native")).unwrap();
        std::fs::create_dir_all(dir.join("bin")).unwrap();
        std::fs::create_dir_all(dir.join("web").join("dist")).unwrap();
        std::fs::write(dir.join("node").join("bin").join("node"), "").unwrap();
        std::fs::write(dir.join("server").join("server.mjs"), "").unwrap();
        std::fs::write(dir.join("native").join("better_sqlite3.node"), "").unwrap();
        std::fs::write(dir.join("THIRD-PARTY-LICENSES.md"), "").unwrap();
        std::fs::write(dir.join("web").join("dist").join("index.html"), "").unwrap();
        std::fs::write(dir.join("bin").join("whisper-cli"), "").unwrap();
        dir
    }

    #[test]
    fn a_test_build_without_both_variables_is_refused() {
        let cases: [(&[(&str, &str)], &str); 4] = [
            (&[], "APUNTA_PORT"),
            (&[("APUNTA_PORT", "7831")], "APUNTA_DATA_DIR"),
            (
                &[("APUNTA_DATA_DIR", "/tmp/apunta-v2/x/data")],
                "APUNTA_PORT",
            ),
            (
                &[
                    ("APUNTA_PORT", ""),
                    ("APUNTA_DATA_DIR", "/tmp/apunta-v2/x/data"),
                ],
                "APUNTA_PORT",
            ),
        ];
        for (pairs, expected) in cases {
            let error = resolve(&bundle("missing-env"), &Env::from_pairs(pairs), true).unwrap_err();
            assert!(
                error.to_string().contains(expected),
                "{pairs:?} produced {error}"
            );
        }
    }

    #[test]
    fn a_test_build_on_the_live_port_is_refused() {
        let env = Env::from_pairs(&[
            ("APUNTA_PORT", "7717"),
            ("APUNTA_DATA_DIR", "/tmp/apunta-v2/x/data"),
        ]);
        assert!(matches!(
            resolve(&bundle("live-port"), &env, true),
            Err(Refusal::LivePort)
        ));
    }

    #[test]
    fn a_test_build_with_both_variables_resolves_the_bundled_launch() {
        let env = Env::from_pairs(&[
            ("APUNTA_PORT", "7831"),
            ("APUNTA_DATA_DIR", "/tmp/apunta-v2/x/data"),
        ]);
        let config = resolve(&bundle("both-vars"), &env, true).unwrap();
        assert_eq!(config.port, 7831);
        assert_eq!(config.data_dir, PathBuf::from("/tmp/apunta-v2/x/data"));
        assert!(config.node_bin.ends_with("node/bin/node"));
        assert!(config.server_entry.ends_with("server/server.mjs"));
        assert!(config.shell);
        // P3.1's launch contract: the child's PATH holds no host Node.
        assert_eq!(config.child_path, "/usr/bin:/bin");
        assert!(!config.child_path.split(':').any(|dir| dir.contains("mise")));
    }

    #[test]
    fn production_defaults_to_7717_and_the_platform_default_folder() {
        let env = Env::from_pairs(&[("HOME", "/home/owner")]);
        let config = resolve(&bundle("production-default"), &env, false).unwrap();
        assert_eq!(config.port, LIVE_PORT);
        assert_eq!(
            config.data_dir,
            PathBuf::from("/home/owner").join(".local/share/apunta")
        );
    }

    /// C-ISO@1 rule 2 and HS-1: `7717` is refused in **both** identities. A
    /// production binary with `APUNTA_PORT=7717` and a data-folder override used
    /// to start without complaint, because the guard that was supposed to catch
    /// it had an empty body — and the comment beside it claimed a refusal that
    /// was not there.
    #[test]
    fn the_live_port_is_refused_in_the_production_identity_too() {
        let env = Env::from_pairs(&[
            ("HOME", "/home/owner"),
            ("APUNTA_PORT", "7717"),
            ("APUNTA_DATA_DIR", "/tmp/apunta-v2/x/data"),
        ]);
        assert!(matches!(
            resolve(&bundle("production-live-port"), &env, false),
            Err(Refusal::LivePort)
        ));
    }

    #[test]
    fn production_honours_a_non_live_port_with_a_data_folder_override() {
        // The shape that is legitimately exercisable without a second identity.
        let env = Env::from_pairs(&[
            ("HOME", "/home/owner"),
            ("APUNTA_PORT", "7831"),
            ("APUNTA_DATA_DIR", "/tmp/apunta-v2/x/data"),
        ]);
        let config = resolve(&bundle("production-non-live-port"), &env, false).unwrap();
        assert_eq!(config.port, 7831);
        assert_eq!(config.data_dir, PathBuf::from("/tmp/apunta-v2/x/data"));
    }

    #[test]
    fn a_port_that_is_not_a_port_is_refused_in_both_identities() {
        for test_identity in [true, false] {
            let env = Env::from_pairs(&[
                ("HOME", "/home/owner"),
                ("APUNTA_PORT", "not-a-port"),
                ("APUNTA_DATA_DIR", "/tmp/apunta-v2/x/data"),
            ]);
            assert!(matches!(
                resolve(&bundle("bad-port"), &env, test_identity),
                Err(Refusal::BadPort(_))
            ));
        }
    }

    #[test]
    fn production_honours_xdg_data_home() {
        let env = Env::from_pairs(&[("HOME", "/home/owner"), ("XDG_DATA_HOME", "/data")]);
        let config = resolve(&bundle("production-xdg"), &env, false).unwrap();
        assert_eq!(config.data_dir, PathBuf::from("/data/apunta"));
    }

    #[test]
    fn the_four_overrides_all_point_inside_the_bundle() {
        let dir = bundle("overrides");
        let paths = ChildPaths::resolve(&dir).expect("the fixture is complete");
        for path in [
            &paths.sqlite_binding,
            &paths.licenses_file,
            &paths.web_dist,
            &paths.whisper_bin,
        ] {
            assert!(
                path.starts_with(&dir),
                "{} escapes the bundle at {}",
                path.display(),
                dir.display()
            );
        }
    }

    #[test]
    fn a_bundled_runtime_gets_its_own_port_and_no_runtime_means_the_system_one() {
        let env = Env::from_pairs(&[
            ("APUNTA_PORT", "7831"),
            ("APUNTA_DATA_DIR", "/tmp/apunta-v2/x/data"),
        ]);
        let without = bundle("no-runtime");
        let _ = std::fs::remove_dir_all(without.join("ollama"));
        let config = resolve(&without, &env, true).expect("resolves");
        assert!(config.paths.ollama_bin.is_none());
        assert!(config.ollama_url.is_none());

        let with = bundle("runtime");
        std::fs::create_dir_all(with.join("ollama")).unwrap();
        std::fs::write(with.join("ollama").join("ollama"), "").unwrap();
        let config = resolve(&with, &env, true).expect("resolves");
        assert_eq!(
            config.paths.ollama_bin,
            Some(with.join("ollama").join("ollama"))
        );
        assert_eq!(config.ollama_url.as_deref(), Some("http://127.0.0.1:8831"));

        assert_eq!(bundled_ollama_url(LIVE_PORT), "http://127.0.0.1:11435");
    }

    #[test]
    fn an_incomplete_bundle_is_refused_rather_than_half_resolved() {
        let dir = bundle("incomplete");
        std::fs::remove_file(dir.join("web").join("dist").join("index.html")).unwrap();
        assert!(ChildPaths::resolve(&dir).is_none());
        let env = Env::from_pairs(&[
            ("APUNTA_PORT", "7831"),
            ("APUNTA_DATA_DIR", "/tmp/apunta-v2/x/data"),
        ]);
        assert!(resolve(&dir, &env, true).is_err());
    }

    #[test]
    fn a_missing_bundle_is_refused_rather_than_falling_back_to_the_checkout() {
        let env = Env::from_pairs(&[
            ("APUNTA_PORT", "7831"),
            ("APUNTA_DATA_DIR", "/tmp/apunta-v2/x/data"),
        ]);
        let error = resolve(Path::new("/nonexistent/bundle"), &env, true).unwrap_err();
        assert!(error.to_string().contains("package-linux-resources.sh"));
    }

    #[test]
    fn identity_and_feature_must_agree() {
        assert!(check_identity(PRODUCTION_IDENTIFIER, false).is_ok());
        assert!(check_identity(TEST_IDENTIFIER, true).is_ok());
        // The failure this exists for: a binary built with the test feature but
        // configured with the production identity could focus and signal the
        // owner's real app.
        assert!(check_identity(PRODUCTION_IDENTIFIER, true).is_err());
        assert!(check_identity(TEST_IDENTIFIER, false).is_err());
        assert!(check_identity("app.apunta.desktop.test.extra", true).is_err());
    }

    #[test]
    fn the_two_identities_are_distinct_strings() {
        assert_ne!(PRODUCTION_IDENTIFIER, TEST_IDENTIFIER);
    }
}
