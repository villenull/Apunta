//! The shell's own process: spawn the bundled server, wait for its `ready`
//! line, show one window or the other, and take everything it started down
//! again on the way out.
//!
//! Structure, and why:
//!
//! - `spawn()` puts the child in **its own process group**, so the quit ladder
//!   signals the group and can never reach a process this shell did not spawn.
//! - The child's **stdout** is a pipe this shell reads line by line. Nothing
//!   else on that stream is read, and stderr goes to this process's stderr, so a
//!   log line is never mistaken for a bridge line.
//! - A URL is produced in exactly one place, from a `ready` line that carried
//!   *this shell's own nonce*. There is no health poll anywhere in the
//!   lifecycle (C-BRIDGE@1 rule 1).
//! - The fatal path closes the splash and opens the bilingual error screen
//!   carrying the code the line arrived with, in the window title as well as in
//!   the DOM. An unrecognised code is carried verbatim, never mapped onto one of
//!   the two known codes.
//! - **A quit happens once.** The window's own close, the runtime's exit request
//!   and a termination signal all go through `quit::QuitGate`, and only the
//!   winner of that gate runs the ladder — so closing the window can no longer
//!   orphan the server, and a signal can no longer livelock the shell. See
//!   `quit.rs` for both reproductions.
//!
//! The decision logic that can be tested without a display or a child lives in
//! `bridge.rs`, `launch.rs`, `lifecycle.rs`, `quit.rs` and `signals.rs`; this
//! file is the wiring, kept as thin as the contract allows.

mod bridge;
mod fetch;
mod launch;
mod lifecycle;
mod permissions;
mod quit;
mod setup;
mod signals;
mod updater;

use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
use std::sync::mpsc::{self, Receiver};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

use bridge::{Message, Rejection};
use launch::{check_identity, resolve, Env, Refusal};
use lifecycle::{next_step, signal_for, Step};
use quit::QuitGate;

/// C-BRIDGE@1 rule 7: a boot failure reaches a screen, never a spinner. A
/// refusal to start at all exits with this too, because a shell that refused to
/// start has nothing to show.
const REFUSAL_EXIT_CODE: i32 = 1;

/// This build's Cargo feature, read once so the whole file agrees on it.
const TEST_IDENTITY: bool = cfg!(feature = "test-identity");

/// The resource folder `tauri.conf.json` maps P3.1's runtime bundle into.
/// The bundled runtime's folder inside the app's resources, per platform: the
/// platform config maps `build/<platform>-resources/` to it (`tauri.conf.json`,
/// `tauri.macos.conf.json`).
#[cfg(not(target_os = "macos"))]
const BUNDLE_RESOURCE_DIR: &str = "linux-resources";
#[cfg(target_os = "macos")]
const BUNDLE_RESOURCE_DIR: &str = "macos-resources";

/// The splash window's title. Distinct from `Apunta` (the app window) and from
/// `Apunta — <code>` (the error screen), so "the splash is gone" is readable from
/// the window list alone.
const SPLASH_TITLE: &str = "Apunta — starting";

/// The main window's smallest useful size, and the size it asks for. Both are
/// floors the owner can work in, and both are fitted down to the monitor in
/// `main_window_geometry` rather than allowed to exceed it.
const MIN_WIDTH: f64 = 880.0;
const MIN_HEIGHT: f64 = 600.0;
const WANTED_WIDTH: f64 = 1280.0;
const WANTED_HEIGHT: f64 = 860.0;

/// What the reader thread hands to the UI thread.
enum Event {
    Bridge(Result<Message, Rejection>, String),
    /// The child's stdout closed and the child has been waited for.
    ChildGone(Option<i32>),
}

/// The child this shell started, kept so the quit ladder can run at exit.
///
/// Managed by Tauri rather than carried in `drive`, because the ladder belongs
/// to the app's **exit**, which is a different moment from the launch settling:
/// the shell stays alive after `ready` until the owner closes the window.
///
/// `pgid` is `0` whenever there is nothing left to signal. `spawn` writes the
/// child's group id once and [`begin_quit`] reads it with a `swap(0)`, so the id
/// exists in exactly one place at exactly one time: a group that has been
/// reaped can never be signalled a second time, and a pid the kernel has since
/// recycled can never be reached through this field.
#[derive(Default)]
struct Spawned {
    pgid: AtomicI32,
    stdin: Mutex<Option<std::process::ChildStdin>>,
    /// The one-shot quit state shared by the window, the runtime and the signal
    /// watchdog. See `quit.rs`.
    gate: QuitGate,
    /// Whether the child is still running. A close request with no server to
    /// ask goes straight to the ladder instead of waiting for a reply that
    /// cannot come.
    alive: AtomicBool,
    control: Control,
    /// First-run setup: the installer, when one is running (`setup.rs`).
    setup: setup::Runner,
    /// What starting the installer needs, captured at boot.
    setup_launch: Mutex<Option<setup::Launch>>,
}

/// The updater and native-close side of the shell: the pure machine from
/// `updater.rs` plus what its effects need to hold between steps.
struct Control {
    machine: Mutex<updater::Machine>,
    settings: Option<fetch::Settings>,
    /// The release the last check announced.
    announced: Mutex<Option<Arc<tauri_plugin_updater::Update>>>,
    /// The verified bytes of that release, kept until install or rejection.
    verified: Mutex<Option<Vec<u8>>>,
    /// What to start once the quit ladder has finished, if anything.
    relaunch: Mutex<Option<Relaunch>>,
    health_boot: AtomicBool,
    recovering: AtomicBool,
    watching: AtomicBool,
    health_target: Mutex<Option<String>>,
    health_ready: Mutex<Option<(u16, String)>>,
    context_id: Mutex<Option<String>>,
    previous_version: Mutex<Option<String>>,
    recovery_target: Mutex<Option<String>>,
}

/// A pending relaunch: the update id the new shell hands its server, if any.
struct Relaunch {
    handoff: Option<String>,
    version: Option<String>,
}

impl Default for Control {
    fn default() -> Self {
        let settings = fetch::settings();
        // Only has to differ between shell runs: the first snapshot id of a run
        // must never equal one an earlier run's journal holds.
        let seed = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_millis() as u64)
            .unwrap_or(0);
        Control {
            machine: Mutex::new(updater::Machine::new(settings.is_some(), seed)),
            settings,
            announced: Mutex::new(None),
            verified: Mutex::new(None),
            relaunch: Mutex::new(None),
            health_boot: AtomicBool::new(false),
            recovering: AtomicBool::new(false),
            watching: AtomicBool::new(false),
            health_target: Mutex::new(None),
            health_ready: Mutex::new(None),
            context_id: Mutex::new(None),
            previous_version: Mutex::new(None),
            recovery_target: Mutex::new(None),
        }
    }
}

/// A close check that gets no reply in this long is a refusal. The server's
/// own drain budget is 30 s; this adds the margin.
const CLOSE_REPLY_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(45);

fn main() {
    let env = Env::from_process();
    // A session logout, a `kill`, or Ctrl-C in a terminal must take the same path
    // a window close does, or the server this shell started is orphaned.
    signals::install_terminate_handlers();
    let mut builder = tauri::Builder::default().manage(Spawned::default()).plugin(
        tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // The second launch focuses the window rather than starting a second
            // server. Data ownership is C-OWN@1's, not this plugin's.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }),
    );
    // The updater is registered only when the build carries a key: without one
    // the shell is "not configured" and nothing here can reach the network.
    if let Some(settings) = fetch::settings() {
        builder = builder.plugin(
            tauri_plugin_updater::Builder::new()
                .pubkey(settings.pubkey)
                .build(),
        );
    }
    let app = builder
        .setup(move |app| {
            // Every refusal — identity, missing test environment, live port,
            // missing bundle — stops here, before anything is spawned and
            // before any database is touched.
            if let Err(error) = boot(
                app.handle(),
                &env,
                env.get("APUNTA_UPDATE_RECOVERY") == Some("1"),
            ) {
                eprintln!("apunta: refusing to start: {error}");
                app.handle().exit(REFUSAL_EXIT_CODE);
                return Err(Box::new(error));
            }
            Ok(())
        })
        .build({
            let mut context = tauri::generate_context!();
            if let Some(settings) = fetch::settings() {
                let transport = if cfg!(feature = "test-updater") {
                    ",\"dangerousInsecureTransportProtocol\":true"
                } else {
                    ""
                };
                let config = format!(
                    "{{\"pubkey\":{}{transport}}}",
                    bridge::json_string(&settings.pubkey)
                );
                context.config_mut().plugins.0.insert(
                    "updater".into(),
                    config.parse().expect("owned updater configuration"),
                );
            }
            context
        })
        .expect("apunta: the Tauri context is generated at build time");

    // The second door: the runtime's own exit request, which arrives once the
    // last window is gone. It is one of three callers of `begin_quit` and owns
    // nothing of its own — the gate decides, and this arm only decides whether
    // to defer the exit until the ladder is done.
    app.run(|handle, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            let state = handle.state::<Spawned>();
            if !state.gate.in_progress() {
                // Nothing is being cleaned up: the app may exit. A refused start
                // lands here too, and must exit rather than wait for a ladder that
                // was never going to run.
                return;
            }
            // A ladder is live and the server is still coming down. Deferring
            // here — and only here — is what keeps the shell alive long enough to
            // finish the cleanup it started. `begin_quit` returning `false` is
            // the ordinary case on the second and later requests.
            api.prevent_exit();
            begin_quit(handle, "the exit request");
        }
    });
}

/// Starts the quit ladder, if this caller is the one that owns the quit.
///
/// The only place a ladder thread is ever created, and reachable from all three
/// doors: the main window's `CloseRequested`, the runtime's `ExitRequested`, and
/// the termination watchdog. The winner of [`QuitGate::try_begin`] takes the
/// child's process group and its stdin — each exactly once, by `swap`/`take` — and
/// runs the ladder on its own thread. Every other caller returns without doing
/// anything at all, which is what removes both the thread storm and the
/// `prevent_exit` storm.
fn begin_quit(handle: &tauri::AppHandle, door: &str) {
    let state = handle.state::<Spawned>();
    if !state.gate.try_begin() {
        // Naming the door is the point of this line: a window close arriving
        // while a signal is being handled is the exact overlap that used to
        // livelock the shell, and the log line above the old two-path version
        // had no way to show it.
        eprintln!("apunta: {door} arrived with a quit already under way; nothing to add");
        return;
    }
    eprintln!("apunta: {door} is closing the app; starting the quit ladder");
    // Taken, not copied. After this swap the field is `0`, so no second ladder —
    // and no defensive retry — can signal this group again, and a pid the kernel
    // has since recycled cannot be reached through it.
    let pgid = state.pgid.swap(0, Ordering::SeqCst);
    let stdin = state.stdin.lock().ok().and_then(|mut slot| slot.take());
    if pgid <= 0 {
        // Nothing was ever spawned, so there is nothing to ladder down. The quit
        // still has to complete, or a refusal would hang on a ladder that has
        // nothing to do.
        eprintln!("apunta: quitting with no server to take down");
        state.gate.finish();
        handle.exit(0);
        return;
    }
    let handle = handle.clone();
    std::thread::spawn(move || {
        quit_ladder(pgid, stdin);
        handle.state::<Spawned>().gate.finish();
        start_relaunch(&handle);
        // After `finish`, `in_progress` is false, so the `ExitRequested` this
        // raises is allowed through rather than prevented.
        handle.exit(0);
    });
}

/// Starts the app again when the quit that just finished was an update's or a
/// recovery's relaunch. Runs after the ladder, so the server is down, the data
/// lock is released and the new shell finds no live owner.
fn start_relaunch(handle: &tauri::AppHandle) {
    let state = handle.state::<Spawned>();
    let plan = state
        .control
        .relaunch
        .lock()
        .ok()
        .and_then(|mut slot| slot.take());
    let Some(plan) = plan else {
        return;
    };
    let Some(target) = fetch::relaunch_target() else {
        eprintln!("apunta: no executable to relaunch");
        return;
    };
    tauri_plugin_single_instance::destroy(handle);
    let expected = plan
        .version
        .or_else(|| {
            state
                .control
                .announced
                .lock()
                .ok()
                .and_then(|slot| slot.as_ref().map(|update| update.version.clone()))
        })
        .unwrap_or_else(|| handle.package_info().version.to_string());
    let nonce = new_nonce();
    if let Err(error) = fetch::supervise(&target, plan.handoff.as_deref(), &nonce, &expected, false)
    {
        eprintln!("apunta: replacement failed: {error}; starting read-only recovery");
        // The kept previous version: `Apunta.previous.AppImage` on Linux, the
        // same program inside `Apunta.previous.app` on a Mac.
        let previous = fetch::previous_executable(&target).filter(|path| path.is_file());
        let is_previous = previous.is_some();
        let recovery = previous.unwrap_or(target);
        let recovery_version = if is_previous {
            state
                .control
                .previous_version
                .lock()
                .ok()
                .and_then(|version| version.clone())
                .unwrap_or_else(|| handle.package_info().version.to_string())
        } else {
            expected
        };
        if let Err(error) = fetch::supervise(&recovery, None, &new_nonce(), &recovery_version, true)
        {
            eprintln!(
                "apunta: recovery could not start: {error}; previous image remains available"
            );
        }
    }
}

/// Called once for a failed normal health attempt; never retries normal boot.
fn enter_recovery(handle: &tauri::AppHandle) {
    let state = handle.state::<Spawned>();
    if state.control.recovering.swap(true, Ordering::SeqCst) {
        return;
    }
    state.control.health_boot.store(false, Ordering::SeqCst);
    let pgid = state.pgid.swap(0, Ordering::SeqCst);
    let stdin = state.stdin.lock().ok().and_then(|mut slot| slot.take());
    show_splash(handle);
    if let Some(window) = handle.get_webview_window("main") {
        let _ = window.destroy();
    }
    let handle = handle.clone();
    std::thread::spawn(move || {
        quit_ladder(pgid, stdin);
        if let Err(error) = boot(&handle, &Env::from_process(), true) {
            eprintln!("apunta: recovery start failed: {error}");
            show_error(&handle, "recovery_failed");
        }
    });
}

static NATIVE_READY_SENT: AtomicBool = AtomicBool::new(false);

fn acknowledge_native_ready(port: u16, version: &str, recovery: bool) {
    if let Ok(nonce) = std::env::var("APUNTA_NATIVE_HANDOFF") {
        if !NATIVE_READY_SENT.swap(true, Ordering::SeqCst) {
            let _ = std::io::stdout()
                .write_all(bridge::native_ready_line(&nonce, port, version, recovery).as_bytes());
            let _ = std::io::stdout().flush();
        }
    }
}
/// Feeds the updater machine one input and performs what it asks for.
fn dispatch(handle: &tauri::AppHandle, input: updater::Input) {
    let state = handle.state::<Spawned>();
    let effects = {
        let mut machine = state
            .control
            .machine
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        machine.step(input)
    };
    for effect in effects {
        perform(handle, effect);
    }
}

/// The page asked for first-run setup, through the server. Stop signals the
/// running installer; plan and run start one. A start that cannot happen is
/// still answered, with an exit line, so the page is never left waiting.
fn run_setup(handle: &tauri::AppHandle, action: bridge::SetupAction) {
    let state = handle.state::<Spawned>();
    if action == bridge::SetupAction::Cancel {
        if !state.setup.stop() {
            eprintln!("apunta: setup stop asked, but no setup is running");
        }
        return;
    }
    let launch = state.setup_launch.lock().ok().and_then(|slot| slot.clone());
    let group = state.pgid.load(Ordering::SeqCst);
    let writer = handle.clone();
    let started = match launch {
        Some(launch) => state.setup.start(&launch, action, group, move |line| {
            write_to_child(&writer, line);
        }),
        None => Err("no launch configuration".to_string()),
    };
    if let Err(reason) = started {
        eprintln!("apunta: setup did not start: {reason}");
        if !state.setup.is_running() {
            write_to_child(handle, &setup::exit_line(None));
        }
    }
}

/// Writes one line to the child's stdin, if it still has one.
fn write_to_child(handle: &tauri::AppHandle, line: &str) {
    let state = handle.state::<Spawned>();
    let Ok(mut slot) = state.stdin.lock() else {
        return;
    };
    if let Some(stdin) = slot.as_mut() {
        if let Err(error) = stdin
            .write_all(line.as_bytes())
            .and_then(|()| stdin.flush())
        {
            eprintln!("apunta: a bridge line could not be written: {error}");
        }
    }
}

/// Carries out one thing the updater machine asked for.
fn perform(handle: &tauri::AppHandle, effect: updater::Effect) {
    use updater::{Effect, Input};
    match effect {
        Effect::Status(status) => write_to_child(
            handle,
            &bridge::update_status_line(
                status.state.word(),
                status.version.as_deref(),
                status.code,
            ),
        ),
        Effect::WriteQuiesce => write_to_child(handle, bridge::quiesce_line()),
        Effect::WriteSnapshotRequest(id) => {
            write_to_child(handle, &bridge::snapshot_request_line(&id))
        }
        Effect::WriteRelease => write_to_child(handle, bridge::maintenance_release_line()),
        Effect::WriteHealthConfirm(id) => write_to_child(handle, &bridge::health_confirm_line(&id)),
        Effect::Check => {
            let handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                let state = handle.state::<Spawned>();
                let control = &state.control;
                let result = match control.settings.as_ref() {
                    Some(settings) => match fetch::check(&handle, settings).await {
                        Ok(Some(update)) => {
                            let version = update.version.clone();
                            if let Ok(mut slot) = control.announced.lock() {
                                *slot = Some(Arc::new(update));
                            }
                            Ok(Some(version))
                        }
                        Ok(None) => Ok(None),
                        Err(failure) => Err(failure),
                    },
                    None => Err(updater::CheckFailure::Offline),
                };
                dispatch(&handle, Input::Checked(result));
            });
        }
        Effect::Download => {
            let handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                let state = handle.state::<Spawned>();
                let control = &state.control;
                let announced = control.announced.lock().ok().and_then(|slot| slot.clone());
                let result = match announced {
                    Some(update) => fetch::download(&update).await.map(|bytes| {
                        if let Ok(mut slot) = control.verified.lock() {
                            *slot = Some(bytes);
                        }
                    }),
                    None => Err(updater::DownloadFailure::Offline),
                };
                dispatch(&handle, Input::Downloaded(result));
            });
        }
        Effect::Discard => {
            let state = handle.state::<Spawned>();
            let control = &state.control;
            if let Ok(mut slot) = control.verified.lock() {
                *slot = None;
            }
            if let Ok(mut slot) = control.announced.lock() {
                *slot = None;
            };
        }
        Effect::Install => {
            let handle = handle.clone();
            tauri::async_runtime::spawn_blocking(move || {
                let state = handle.state::<Spawned>();
                let control = &state.control;
                let mut rollback_failed = false;
                let result = {
                    let update = control.announced.lock().ok();
                    let bytes = control.verified.lock().ok();
                    match (
                        update.as_ref().and_then(|slot| slot.as_ref()),
                        bytes.as_ref().and_then(|slot| slot.as_ref()),
                    ) {
                        (Some(update), Some(bytes)) => {
                            fetch::install(update, bytes).map_err(|error| {
                                rollback_failed =
                                    matches!(&error, fetch::InstallError::Rollback(_));
                                eprintln!("apunta: {error}");
                            })
                        }
                        _ => Err(()),
                    }
                };
                if rollback_failed {
                    enter_recovery(&handle);
                } else {
                    if result.is_ok() {
                        if let Ok(mut bytes) = control.verified.lock() {
                            *bytes = None;
                        }
                    }
                    dispatch(&handle, Input::Installed(result));
                }
            });
        }
        Effect::Relaunch { handoff } => {
            let state = handle.state::<Spawned>();
            let (handoff, version) = if state.control.recovering.load(Ordering::SeqCst) {
                (
                    state
                        .control
                        .context_id
                        .lock()
                        .ok()
                        .and_then(|id| id.clone()),
                    state
                        .control
                        .recovery_target
                        .lock()
                        .ok()
                        .and_then(|version| version.clone()),
                )
            } else {
                (handoff, None)
            };
            if let Ok(mut slot) = state.control.relaunch.lock() {
                *slot = Some(Relaunch { handoff, version });
            }
            begin_quit(handle, "the relaunch");
        }
        Effect::ReinstallPrevious => {
            let handle = handle.clone();
            tauri::async_runtime::spawn_blocking(move || {
                let restored = fetch::installed_path()
                    .ok_or_else(|| "not running from an installed app".to_string())
                    .and_then(|path| fetch::restore_previous(&path).map_err(|e| e.to_string()));
                match restored {
                    Ok(()) => dispatch(&handle, Input::PreviousRestored),
                    Err(error) => {
                        eprintln!("apunta: the previous version could not be restored: {error}");
                        dispatch(&handle, Input::RecoveryFailed);
                    }
                }
            });
        }
        Effect::CloseApp => begin_quit(handle, "the window close"),
        Effect::ArmCloseTimeout(generation) => {
            let handle = handle.clone();
            std::thread::spawn(move || {
                std::thread::sleep(CLOSE_REPLY_TIMEOUT);
                dispatch(&handle, Input::CloseTimeout(generation));
            });
        }
    }
}

/// Resolves the launch, spawns the child and wires the windows.
fn boot(handle: &tauri::AppHandle, env: &Env, recovery: bool) -> Result<(), Refusal> {
    // E10: a build whose identity and feature disagree is refused, so a
    // forgotten `--config` cannot produce something that could focus or signal
    // the production app.
    check_identity(&handle.config().identifier, TEST_IDENTITY)?;

    // The bundle sits beside the app's own resources, under the name
    // `tauri.conf.json`'s `resources` mapping gives it. The shell spawns the
    // **bundled** server and never the checkout's.
    let resources = handle
        .path()
        .resource_dir()
        .map_err(|_| Refusal::MissingBundle {
            path: PathBuf::from("<resource dir>"),
        })?;
    let bundle = resources.join(BUNDLE_RESOURCE_DIR);
    let config = resolve(&bundle, env, TEST_IDENTITY)?;

    let nonce = new_nonce();
    let (tx, rx) = mpsc::channel::<Event>();

    if let Ok(mut slot) = handle.state::<Spawned>().setup_launch.lock() {
        *slot = Some(setup::Launch {
            node_bin: config.node_bin.clone(),
            script: setup::script_path(&bundle),
            data_dir: config.data_dir.clone(),
            child_path: config.child_path.clone(),
            ollama_url: config.ollama_url.clone(),
        });
    }

    let mut spawned = spawn(&config, &nonce, recovery)?;
    eprintln!("apunta: spawned the bundled server as pid {}", spawned.id());
    // Recorded before anything else, so even a launch that fails on the next line
    // leaves the shell able to signal what it started.
    let state = handle.state::<Spawned>();
    state.control.health_boot.store(
        !recovery && env.get(fetch::HANDOFF_ENV).is_some(),
        Ordering::SeqCst,
    );
    if recovery {
        state.control.recovering.store(true, Ordering::SeqCst);
    }
    state.alive.store(true, Ordering::SeqCst);
    state.pgid.store(spawned.id() as i32, Ordering::SeqCst);
    if let Ok(mut slot) = state.stdin.lock() {
        *slot = spawned.stdin.take();
    }
    let mut child = spawned;

    // The splash is the first window, so the owner sees the A mark rather than
    // an empty frame. It is the shell's own asset with no script and no bridge,
    // not a webview origin with a capability.
    show_splash(handle);

    // The reader thread owns the child from here: it takes stdout, waits for it
    // and reports the exit. Nothing else touches the `Child`.
    let reader_tx = tx;
    let reader_nonce = nonce;
    std::thread::spawn(move || {
        let stdout = child.stdout.take();
        if let Some(stdout) = stdout {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                let parsed = bridge::parse_line(&line, &reader_nonce);
                if reader_tx.send(Event::Bridge(parsed, line)).is_err() {
                    break;
                }
            }
        }
        let status = child.wait().ok();
        let _ = reader_tx.send(Event::ChildGone(status.and_then(|s| s.code())));
    });

    let ui_handle = handle.clone();
    // `spawn_blocking`, not `spawn`: `drive` ends by waiting out the rest of the
    // child's life, which is a blocking receive, and on the async runtime that
    // would occupy one Tokio worker thread for the shell's whole life while doing
    // nothing but parking.
    tauri::async_runtime::spawn_blocking(move || {
        drive(ui_handle, rx);
    });

    // The signal watchdog: the third door into the same gate. It does nothing but
    // hand over to `begin_quit`, exactly like the other two, so a `SIGTERM`
    // arriving while the window is closing cannot start a second ladder.
    if !state.control.watching.swap(true, Ordering::SeqCst) {
        let watchdog = handle.clone();
        std::thread::spawn(move || loop {
            if signals::terminate_requested() {
                begin_quit(&watchdog, "a termination signal");
                return;
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        });
    }

    Ok(())
}

/// What the UI thread does with the child's messages.
///
/// It does **not** exit when the launch settles. The shell's life is the app's
/// life: the owner closes the window, the app asks to exit, and the ladder runs
/// there. A shell that quit as soon as the server was ready would be a shell
/// that never shows the app.
fn drive(handle: tauri::AppHandle, rx: Receiver<Event>) {
    // Whether a `ready` or `fatal` line already settled the launch. The child
    // reporting its exit while this is false is the early-exit case.
    let mut settled = false;
    let started = Instant::now();

    loop {
        let health_boot = handle
            .state::<Spawned>()
            .control
            .health_boot
            .load(Ordering::SeqCst);
        if health_boot && started.elapsed() >= std::time::Duration::from_secs(45) {
            enter_recovery(&handle);
            return;
        }
        let wait = if health_boot {
            std::time::Duration::from_secs(45).saturating_sub(started.elapsed())
        } else {
            std::time::Duration::from_secs(45)
        };
        let event = match rx.recv_timeout(wait) {
            Ok(event) => event,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if handle
                    .state::<Spawned>()
                    .control
                    .health_boot
                    .load(Ordering::SeqCst)
                {
                    enter_recovery(&handle);
                    return;
                }
                continue;
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        };
        match event {
            Event::Bridge(Ok(Message::Ready { port, version, .. }), line) => {
                let state = handle.state::<Spawned>();
                if state.control.health_boot.load(Ordering::SeqCst) {
                    let matches = state
                        .control
                        .health_target
                        .lock()
                        .ok()
                        .is_some_and(|target| target.as_deref() == Some(version.as_str()));
                    if !matches {
                        enter_recovery(&handle);
                        return;
                    }
                    *state
                        .control
                        .health_ready
                        .lock()
                        .expect("health ready lock") = Some((port, version.clone()));
                    dispatch(&handle, updater::Input::Ready { version });
                    continue;
                }
                dispatch(
                    &handle,
                    updater::Input::Ready {
                        version: version.clone(),
                    },
                );
                eprintln!("apunta: the server is ready ({line}), version {version}");
                // C-BRIDGE@1 rule 1: the only navigation in the lifecycle, and
                // it happens here and nowhere else.
                if show_main(&handle, port) {
                    close_window(&handle, "splash");
                    settled = true;
                    acknowledge_native_ready(
                        port,
                        &version,
                        state.control.recovering.load(Ordering::SeqCst),
                    );
                } else {
                    // The window would not open. C-BRIDGE@1 rule 7's shape applies:
                    // an error screen, not a splash that never resolves.
                    show_error(&handle, "the_window_would_not_open");
                    close_window(&handle, "splash");
                    settled = true;
                    acknowledge_native_ready(
                        port,
                        &version,
                        state.control.recovering.load(Ordering::SeqCst),
                    );
                    break;
                }
            }
            Event::Bridge(Ok(Message::Fatal { code }), line) => {
                if handle
                    .state::<Spawned>()
                    .control
                    .health_boot
                    .load(Ordering::SeqCst)
                {
                    enter_recovery(&handle);
                    return;
                }
                // The code travels only as this line: never parsed out of the
                // log line that also arrived, never read from an exit status,
                // never matched on a substring.
                eprintln!("apunta: the server refused to start: {line}");
                eprintln!("apunta: the code means: {}", meaning_of(&code));
                show_error(&handle, &code);
                close_window(&handle, "splash");
                settled = true;
                break;
            }
            Event::Bridge(Ok(Message::QuiesceResult { ok }), _) => {
                dispatch(&handle, updater::Input::Quiesced(ok));
            }
            Event::Bridge(Ok(Message::SnapshotResult { id, ok, .. }), _) => {
                dispatch(&handle, updater::Input::Snapshot { id, ok });
            }
            Event::Bridge(Ok(Message::UpdateRequest { action }), _) => {
                dispatch(&handle, updater::Input::Request(action));
            }
            Event::Bridge(Ok(Message::SetupRequest { action }), _) => {
                run_setup(&handle, action);
            }
            Event::Bridge(Ok(Message::CloseDecision { confirm }), _) => {
                dispatch(&handle, updater::Input::CloseDecision(confirm));
            }
            Event::Bridge(
                Ok(Message::StartupContext {
                    mode,
                    update_id,
                    target_version,
                    previous_version,
                }),
                _,
            ) => {
                let state = handle.state::<Spawned>();
                state
                    .control
                    .recovering
                    .store(mode == bridge::StartupMode::Recovery, Ordering::SeqCst);
                state.control.health_boot.store(
                    mode == bridge::StartupMode::Normal && update_id.is_some(),
                    Ordering::SeqCst,
                );
                *state.control.context_id.lock().expect("context id lock") = update_id.clone();
                *state
                    .control
                    .previous_version
                    .lock()
                    .expect("previous version lock") = previous_version;
                *state
                    .control
                    .health_target
                    .lock()
                    .expect("health target lock") = target_version.clone();
                dispatch(
                    &handle,
                    updater::Input::Startup {
                        mode,
                        update_id,
                        target_version,
                    },
                );
            }
            Event::Bridge(Ok(Message::HealthResult { id, ok, .. }), _) => {
                let state = handle.state::<Spawned>();
                if !state.control.health_boot.load(Ordering::SeqCst)
                    || !state
                        .control
                        .context_id
                        .lock()
                        .ok()
                        .is_some_and(|expected| expected.as_deref() == Some(id.as_str()))
                {
                    continue;
                }
                dispatch(&handle, updater::Input::Health { id, ok });
                let done = state.control.machine.lock().expect("machine lock").state()
                    == updater::State::Done;
                if done {
                    state.control.health_boot.store(false, Ordering::SeqCst);
                    if let Some((port, version)) = state
                        .control
                        .health_ready
                        .lock()
                        .expect("health ready lock")
                        .take()
                    {
                        if !show_main(&handle, port) {
                            // Health was durably confirmed. Keep that owned
                            // server behind an error screen, rather than roll
                            // back after its migration journal was cleared.
                            show_error(&handle, "the_window_would_not_open");
                        }
                        close_window(&handle, "splash");
                        settled = true;
                        acknowledge_native_ready(port, &version, false);
                    }
                } else if !ok {
                    enter_recovery(&handle);
                    return;
                }
            }
            Event::Bridge(Ok(Message::RecoveryRequest { id, action }), _) => {
                let state = handle.state::<Spawned>();
                if !state.control.recovering.load(Ordering::SeqCst)
                    || !state
                        .control
                        .context_id
                        .lock()
                        .ok()
                        .is_some_and(|expected| expected.as_deref() == Some(id.as_str()))
                {
                    continue;
                }
                let target = match action {
                    bridge::RecoveryAction::Restart => state
                        .control
                        .health_target
                        .lock()
                        .ok()
                        .and_then(|version| version.clone()),
                    bridge::RecoveryAction::ReinstallPrevious => state
                        .control
                        .previous_version
                        .lock()
                        .ok()
                        .and_then(|version| version.clone()),
                };
                if target.is_none() {
                    continue;
                }
                *state
                    .control
                    .recovery_target
                    .lock()
                    .expect("recovery target lock") = target;
                dispatch(&handle, updater::Input::Recovery(action));
            }
            Event::Bridge(Ok(Message::Other { kind }), _) => {
                eprintln!("apunta: ignoring an unknown outbound bridge type {kind:?}");
            }
            Event::Bridge(Err(rejection), line) => {
                // A `ready` line with another nonce, another protocol revision,
                // or an unreadable line: logged, ignored, never navigated to.
                eprintln!("apunta: ignoring a bridge line ({rejection:?}): {line}");
            }
            Event::ChildGone(status) => {
                handle
                    .state::<Spawned>()
                    .alive
                    .store(false, Ordering::SeqCst);
                if handle
                    .state::<Spawned>()
                    .control
                    .health_boot
                    .load(Ordering::SeqCst)
                {
                    enter_recovery(&handle);
                    return;
                }
                // Early exit before `ready`. C-BRIDGE@1 rule 7 wants an error
                // screen rather than a spinner, and the word is the shell's own
                // because no code arrived — an exit status is not a bridge line.
                let code = early_exit_code(status);
                eprintln!("apunta: the server exited before it was ready ({code})");
                if !settled {
                    show_error(&handle, &code);
                    close_window(&handle, "splash");
                    settled = true;
                    break;
                }
            }
        }
    }

    if !settled {
        // The channel closed without a line and without an exit report. Still an
        // error screen, still the shell's own word: nothing arrived to name a
        // condition with.
        let code = early_exit_code(None);
        eprintln!("apunta: the server produced no bridge line ({code})");
        show_error(&handle, &code);
        close_window(&handle, "splash");
    }

    // Wait out the rest of the child's life, without holding a Tokio worker for
    // it: a short poll rather than a bare `recv()`, so this thread sleeps
    // between messages instead of sitting on the channel for the shell's whole
    // life.
    loop {
        match rx.recv_timeout(std::time::Duration::from_millis(250)) {
            Ok(_) => continue,
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(mpsc::RecvTimeoutError::Disconnected) => return,
        }
    }
}

/// What a code means, for the log line beside it.
///
/// The two fixed codes are spelled out here so the log says *which* condition
/// arrived rather than leaving a reader to guess from the word. Every other code
/// is reported as itself: an unrecognised code is carried, never interpreted.
fn meaning_of(code: &str) -> &'static str {
    match code {
        bridge::DATA_FOLDER_IN_USE => "the data folder is already owned by a live Apunta",
        bridge::PORT_IN_USE => "the port was already taken",
        _ => "an unrecognised code, carried verbatim",
    }
}

/// The word for "the child exited before it was ready".
///
/// Deliberately **not** one of the two fixed codes: `port_in_use` means the
/// port was taken and `data_folder_in_use` means the folder is owned, and
/// neither is true here. Guessing one would be exactly the confusion the card
/// forbids, so the screen carries this instead.
fn early_exit_code(status: Option<i32>) -> String {
    match status {
        Some(75) => "exited_75_without_a_bridge_line".to_string(),
        Some(_) => "exited_before_ready".to_string(),
        None => "terminated_before_ready".to_string(),
    }
}

/// Spawns the bundled server in its own process group.
///
/// `std::process`, not the shell plugin (DECISIONS E7). The group is the point:
/// the ladder signals the group, and a group this shell created contains only
/// processes this shell spawned.
fn spawn(config: &launch::LaunchConfig, nonce: &str, recovery: bool) -> Result<Child, Refusal> {
    let mut command = Command::new(&config.node_bin);
    command
        .arg(&config.server_entry)
        // P3.1's launch contract, kept: the cwd is `/` and the `PATH` holds no
        // host Node, so nothing the child resolves can pick up a development
        // machine's runtime.
        .current_dir("/")
        .env("PATH", &config.child_path)
        .env("APUNTA_DATA_DIR", &config.data_dir)
        .env("APUNTA_PORT", config.port.to_string())
        .env("APUNTA_NO_OPEN", "1")
        .env("APUNTA_V2", "1")
        .env("APUNTA_SHELL", if config.shell { "1" } else { "0" })
        .env("APUNTA_SHELL_NONCE", nonce)
        .env("APUNTA_UPDATE_RECOVERY", if recovery { "1" } else { "0" })
        // P3.1's four overrides, each pointing into the bundle.
        .env("APUNTA_SQLITE_BINDING", &config.paths.sqlite_binding)
        .env("APUNTA_LICENSES_FILE", &config.paths.licenses_file)
        .env("APUNTA_WEB_DIST", &config.paths.web_dist)
        .env("APUNTA_WHISPER_BIN", &config.paths.whisper_bin)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        // stderr is this process's stderr: a log line stays a log line and can
        // never be confused with a bridge line.
        .stderr(Stdio::inherit());
    // The bundled AI runtime (the Mac app). The server starts it on a port of its
    // own, with its weights in the data folder (`server/src/ai/ollama-process.ts`);
    // without one, the system's Ollama is used as before.
    if let (Some(bin), Some(url)) = (&config.paths.ollama_bin, &config.ollama_url) {
        command
            .env("APUNTA_OLLAMA_BIN", bin)
            .env("APUNTA_OLLAMA_URL", url);
    }
    // The update id a relaunched shell was started with is the server's private
    // handoff (C-UPD@1 recovery startup). Passed explicitly, and only when set:
    // an ordinary launch never carries one.
    if let Some(handoff) = std::env::var_os(fetch::HANDOFF_ENV) {
        command.env(fetch::HANDOFF_ENV, handoff);
    }
    // The child's own process group, so a signal reaches the whole tree it
    // spawned (whisper, the bundled runtime) and nothing else.
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    command.spawn().map_err(|error| Refusal::SpawnFailed {
        path: config.node_bin.clone(),
        detail: error.to_string(),
    })
}

/// The splash: the A mark, no text.
fn show_splash(handle: &tauri::AppHandle) {
    if handle.get_webview_window("splash").is_some() {
        return;
    }
    // The splash carries its own title, distinct from both other windows, so a
    // reader can tell "still starting" from "showed the app" and from "showed the
    // error screen" without guessing. It is a title, not a visible string: the
    // splash itself shows the A mark and no text.
    let built = WebviewWindowBuilder::new(handle, "splash", WebviewUrl::App("splash.html".into()))
        .title(SPLASH_TITLE)
        .inner_size(360.0, 360.0)
        .resizable(false)
        .decorations(false)
        .center()
        .build();
    if let Err(error) = built {
        eprintln!("apunta: the splash window could not be opened: {error}");
    }
}

/// The app window, loading only this server's origin.
///
/// Returns whether the window opened, so the caller can fall back to the error
/// screen rather than leaving the owner with a splash and no app.
fn show_main(handle: &tauri::AppHandle, port: u16) -> bool {
    let origin = format!("http://127.0.0.1:{port}");
    // The navigation guard keeps its own copy: the closure is `move`, and the
    // origin is also named in the log line below.
    let allowed = origin.clone();
    let close_handle = handle.clone();
    let (width, height, x, y) = main_window_geometry(handle);
    // The minimum size is fitted too, not just the requested one. A floor of
    // 880x600 *logical* is 1760x1200 *physical* on a scaled display, which is
    // larger than a 1400x1000 screen: the window would be clamped back up to its
    // own minimum and hang off the display again, which is exactly what happened
    // before this was fitted. A floor bigger than the screen is no floor.
    let min_width = MIN_WIDTH.min(width);
    let min_height = MIN_HEIGHT.min(height);
    let built = WebviewWindowBuilder::new(
        handle,
        "main",
        WebviewUrl::External(format!("{origin}/").parse().expect("a loopback URL parses")),
    )
    .title("Apunta")
    .inner_size(width, height)
    .min_inner_size(min_width, min_height)
    .position(x, y)
    // C-BRIDGE@1 rule 5: the main window may load this origin and nothing else.
    // Any other navigation, and any attempt to open a new window, is cancelled
    // here — which is why the stop condition about an `http://127.0.0.1` URL
    // needing capabilities does not arise: no capability is granted and none is
    // needed to load a URL. `is_allowed_origin` compares the scheme, the host and
    // the effective port, never a string prefix: a prefix ending in the port would
    // also admit `…:<port>0/…` and, worse, a userinfo form such as
    // `http://127.0.0.1:<port>@evil.example/…`, whose host is `evil.example`.
    .on_navigation(move |target| is_allowed_origin(target, &allowed))
    .on_new_window(|_url, _features| tauri::webview::NewWindowResponse::Deny)
    // P3.5: the microphone, and nothing else, for this origin and no other.
    // WebKitGTK asks through this signal and carries no URL, so the origin comes
    // from `webview.url()` and an origin that cannot be read is refused; on
    // Linux the platform default is `Deny`, so the handler has to be registered
    // even for the app's own origin. See `permissions.rs`. `origin` is cloned
    // here rather than moved, because the line below the builder still names it.
    .on_permission_request({
        let allowed_origin = origin.clone();
        move |webview, kind| permissions::decide_for_webview(&webview, kind, &allowed_origin)
    })
    .build();
    let opened = built.is_ok();
    match built {
        // **The first door, and the one the owner actually uses.** Closing this
        // window is a quit request, and it is handled here rather than left to
        // the runtime: `CloseRequested` is prevented so the window survives the
        // cleanup, and the ladder starts through the same one-shot gate the other
        // two doors use. Without this the ladder never ran on a real window close
        // — GDK's fatal X error handler got there first and the server was
        // orphaned with the port bound and the data lock still held.
        //
        // It cannot be a builder method (`WebviewWindowBuilder` has no
        // `on_window_event`), so it is registered on the built window. The handler
        // runs on the event loop, which is why the ladder is handed to a blocking
        // task rather than run there: it waits on the child's exit for up to the
        // card's 15 s.
        Ok(window) => {
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    // Prevent first, on this thread: `api` is not `Send`, and more
                    // importantly this is the point of the door — the window must
                    // outlive the request until the ladder has finished, and until
                    // the server has answered the close check.
                    api.prevent_close();
                    let close_handle = close_handle.clone();
                    tauri::async_runtime::spawn_blocking(move || {
                        request_close(&close_handle);
                    });
                }
            });
            eprintln!("apunta: the main window is open on {origin}");
        }
        Err(error) => eprintln!("apunta: the main window could not be opened: {error}"),
    }
    opened
}

/// The main window's size and top-left corner, fitted to the monitor it opens on.
///
/// The requested size (1280×860) is what the window wants, not what it may have:
/// on a display smaller than that — the `xvfb-run` display this card's rows use
/// is 1400×1000, and a small laptop is smaller still — a fixed size plus
/// `center()` put most of the window **off-screen**. That was not merely untidy:
/// the review found the real window at 2560×1720 with its origin at `-960,-620`
/// on a 1400×1000 display, so the app was unusable at exactly the sizes where a
/// therapist would notice, and the row could not honestly claim the window was
/// reachable.
///
/// Everything here is computed in **physical** pixels and divided by the monitor's
/// scale factor before it reaches the builder, because the builder takes logical
/// units while `Monitor::size` is physical — and on a HiDPI display those differ
/// by the factor that caused the off-screen window in the first place. When no
/// monitor can be read the requested size is used and the window is centred, which
/// is what it did before and is right on a display that is big enough.
fn main_window_geometry(handle: &tauri::AppHandle) -> (f64, f64, f64, f64) {
    /// A little of the screen left over, so the window is never flush to the edge.
    const MARGIN: f64 = 0.95;

    let Ok(Some(monitor)) = handle.primary_monitor() else {
        eprintln!("apunta: no monitor could be read; using the requested size and centring");
        return (WANTED_WIDTH, WANTED_HEIGHT, 0.0, 0.0);
    };
    let scale = if monitor.scale_factor() > 0.0 {
        monitor.scale_factor()
    } else {
        1.0
    };
    let available_width = f64::from(monitor.size().width);
    let available_height = f64::from(monitor.size().height);
    let physical_width = (WANTED_WIDTH * scale).min(available_width * MARGIN);
    let physical_height = (WANTED_HEIGHT * scale).min(available_height * MARGIN);
    // Centred on the monitor rather than on the origin: `center()` uses the
    // primary monitor's origin too, but the arithmetic is here so the same
    // numbers that produced the size also produce the position.
    let x = (available_width - physical_width) / 2.0 / scale;
    let y = (available_height - physical_height) / 2.0 / scale;
    eprintln!(
        "apunta: the main window will be {physical_width}x{physical_height} physical at {x},{y} logical, on a {available_width}x{available_height} display at scale {scale}"
    );
    (
        physical_width / scale,
        physical_height / scale,
        x + f64::from(monitor.position().x) / scale,
        y + f64::from(monitor.position().y) / scale,
    )
}

/// Whether a navigation target is the one loopback origin this server serves.
///
/// C-BRIDGE@1 rule 5 says the main window may load only
/// `http://127.0.0.1:<port>/…` and that any other navigation or new window is
/// cancelled. The comparison is on the **parsed** URL — scheme, host and
/// effective port — and never on a string prefix, because a prefix that ends in
/// the port is not an origin check:
///
/// - `http://127.0.0.1:78310/` has the prefix `http://127.0.0.1:7831` while its
///   port is 78310 — a different server entirely;
/// - `http://127.0.0.1:7831@evil.example/` has the *same* prefix, and its host
///   is `evil.example` with `127.0.0.1:7831` as userinfo, so a prefix check
///   admits an origin the owner did not intend to load;
/// - `https://127.0.0.1:7831/` is a different scheme, so it is a different origin
///   even though the host and port match.
///
/// A path, a query and a fragment are all allowed — they are the app's own — and
/// any other host, port or scheme is refused.
pub(crate) fn is_allowed_origin(target: &tauri::Url, allowed: &str) -> bool {
    // `allowed` is produced by this file from a port, and is `http://127.0.0.1:<port>`.
    let Ok(expected) = allowed.parse::<tauri::Url>() else {
        // An origin this function cannot parse is an origin it refuses. Failing
        // closed is the only safe direction for a navigation guard.
        eprintln!("apunta: refusing navigation: {allowed} is not a URL");
        return false;
    };
    let same_scheme = target.scheme() == expected.scheme();
    let same_host = target.host_str() == expected.host_str();
    // `port_or_known_default`, so `http://127.0.0.1/…` (no port) cannot match a
    // configured `http://127.0.0.1:7831` and a trailing-digit port cannot either.
    let same_port = target.port_or_known_default() == expected.port_or_known_default();
    same_scheme && same_host && same_port
}

/// The bilingual error screen, carrying the code that arrived.
///
/// The code is in the window title as well as in the page, so it is readable
/// whether or not the page's own script ran. It is passed as a query parameter
/// on the shell's own asset URL, never over a bridge and never through a
/// capability.
fn show_error(handle: &tauri::AppHandle, code: &str) {
    let url = format!("error.html?code={code}");
    let built = WebviewWindowBuilder::new(handle, "error", WebviewUrl::App(url.into()))
        .title(format!("Apunta — {code}"))
        .inner_size(560.0, 380.0)
        .resizable(false)
        .center()
        .build();
    if let Err(error) = built {
        eprintln!("apunta: the error window could not be opened: {error}");
    }
}

/// The window's close door. The server decides: `quiesce{}` goes out, and only
/// an `ok:true` reply closes (see `updater.rs`). With no server left to ask —
/// it exited, or never started — there is nothing to protect and the ladder
/// runs at once.
fn request_close(handle: &tauri::AppHandle) {
    let state = handle.state::<Spawned>();
    if state.gate.in_progress() {
        return;
    }
    if !state.alive.load(Ordering::SeqCst) {
        begin_quit(handle, "the window close");
        return;
    }
    dispatch(handle, updater::Input::CloseRequested);
}

fn close_window(handle: &tauri::AppHandle, label: &str) {
    if let Some(window) = handle.get_webview_window(label) {
        let _ = window.close();
    }
}

/// The quit ladder. Send `shutdown`, wait, then signal the child's group.
///
/// Nothing here ever signals a process the shell did not spawn: the only pid
/// involved is the one `spawn` returned, and it is signalled as a group leader
/// with a negative pid.
fn quit_ladder(pgid: i32, mut stdin: Option<std::process::ChildStdin>) {
    if pgid <= 0 {
        return;
    }
    let started = Instant::now();
    let mut sent_shutdown = false;
    let mut sent_term = false;

    loop {
        let elapsed = started.elapsed().as_millis() as u64;
        // "Alive" means the group still exists. `kill(-pgid, 0)` is the POSIX
        // existence probe and sends nothing.
        let alive = unsafe { signals::kill(-pgid, 0) } == 0;
        match next_step(elapsed, alive, sent_term) {
            Step::Done => return,
            Step::WaitingForShutdown => {
                if !sent_shutdown {
                    sent_shutdown = true;
                    if let Some(stdin) = stdin.as_mut() {
                        let _ = stdin.write_all(bridge::shutdown_line().as_bytes());
                        let _ = stdin.flush();
                    }
                }
            }
            Step::SignalTerm => {
                if !sent_term {
                    sent_term = true;
                    eprintln!(
                        "apunta: the server did not close; sending {}",
                        signal_for(Step::SignalTerm).unwrap_or_default()
                    );
                    unsafe { signals::signal_group(pgid, signals::SIGTERM) };
                }
            }
            Step::WaitingAfterTerm => {}
            Step::SignalKill => {
                eprintln!(
                    "apunta: the server did not stop; sending {}",
                    signal_for(Step::SignalKill).unwrap_or_default()
                );
                unsafe { signals::signal_group(pgid, signals::SIGKILL) };
                return;
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
}

/// A nonce for this spawn only.
///
/// It is not the C-OWN@1 lock nonce and is never compared with it: the lock
/// nonce proves folder ownership on disk, this one proves that a bridge line
/// came out of *this* spawn. Derived from the clock, the pid and an address
/// from this process, which answers "did this line come from my child" and is
/// not a security token.
fn new_nonce() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let pid = std::process::id();
    let anchor = Box::new(0u8);
    let address = (&*anchor as *const u8) as usize;
    format!("{now:x}-{pid:x}-{address:x}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_early_exit_is_never_reported_as_one_of_the_two_fixed_codes() {
        for status in [Some(0), Some(1), Some(70), Some(126), None] {
            let code = early_exit_code(status);
            assert_ne!(code, bridge::PORT_IN_USE, "status {status:?}");
            assert_ne!(code, bridge::DATA_FOLDER_IN_USE, "status {status:?}");
            assert!(!code.is_empty());
        }
    }

    #[test]
    fn an_exit_75_without_a_fatal_line_still_gets_its_own_word() {
        // 75 is C-OWN@1's refusal code. With no line, the shell must not claim
        // to know which condition it was.
        assert_ne!(early_exit_code(Some(75)), bridge::DATA_FOLDER_IN_USE);
        assert_ne!(early_exit_code(Some(75)), bridge::PORT_IN_USE);
    }

    #[test]
    fn the_two_codes_are_named_and_never_interchanged() {
        assert_eq!(
            meaning_of(bridge::DATA_FOLDER_IN_USE),
            "the data folder is already owned by a live Apunta"
        );
        assert_eq!(
            meaning_of(bridge::PORT_IN_USE),
            "the port was already taken"
        );
        assert_ne!(
            meaning_of(bridge::DATA_FOLDER_IN_USE),
            meaning_of(bridge::PORT_IN_USE)
        );
        // Anything else is carried, not interpreted.
        assert_eq!(
            meaning_of("a_code_from_the_future"),
            "an unrecognised code, carried verbatim"
        );
    }

    #[test]
    fn the_nonce_differs_between_calls_and_is_path_safe() {
        let first = new_nonce();
        let second = new_nonce();
        assert_ne!(first, second);
        assert!(!first.contains('/'));
        assert!(!first.contains('\\'));
    }

    #[test]
    fn the_splash_and_error_urls_are_the_shells_own_assets() {
        // Both are relative asset paths. The main window is the only window
        // that ever loads a remote origin.
        let error = format!("error.html?code={}", bridge::PORT_IN_USE);
        assert!(!error.contains("://"));
        assert!(error.starts_with("error.html"));
    }

    #[test]
    fn the_navigation_guard_allows_this_servers_own_origin_and_its_paths() {
        let allowed = "http://127.0.0.1:7831";
        for target in [
            "http://127.0.0.1:7831/",
            "http://127.0.0.1:7831/patients",
            "http://127.0.0.1:7831/notes/42?tab=summary",
            "http://127.0.0.1:7831/#anchor",
        ] {
            assert!(
                is_allowed_origin(&target.parse().expect("a URL"), allowed),
                "{target} should be allowed"
            );
        }
    }

    /// C-BRIDGE@1 rule 5 is an **origin** rule. Each case below shares the
    /// `http://127.0.0.1:7831` **string prefix** and is a different origin, which
    /// is exactly what the prefix check got wrong.
    ///
    /// A case that does not parse at all is still refused — an unusable URL can
    /// never be navigated to — and the test says so rather than quietly skipping
    /// it, because "the parser rejected it" and "the guard rejected it" are
    /// different defences and the reviewer should be able to see which one each
    /// case exercised.
    #[test]
    fn the_navigation_guard_refuses_anything_that_is_not_that_origin() {
        let allowed = "http://127.0.0.1:7831";
        let mut unparseable = 0;
        for target in [
            // Another port: `78310` starts with the configured port's digits.
            "http://127.0.0.1:78310/",
            "http://127.0.0.1:7832/",
            // The live instance's port, which the shell never loads.
            "http://127.0.0.1:7717/",
            // Userinfo smuggling a foreign host behind the allowed string. The
            // URL parser rejects this outright (`:7831@` is not a valid port), so
            // it is a second line of defence behind the origin comparison — but
            // a prefix check would have admitted it.
            "http://127.0.0.1:7831@evil.example/",
            "http://127.0.0.1:7831@evil.example/steal",
            // No port at all is a different effective port.
            "http://127.0.0.1/",
            // Another scheme with the same host and port.
            "https://127.0.0.1:7831/",
            "file:///etc/passwd",
            // Another host entirely, including one that has the IP in its text.
            "http://localhost:7831/",
            "http://127.0.0.1.evil.example:7831/",
            "http://evil.example/",
            // A different loopback address.
            "http://[::1]:7831/",
        ] {
            match target.parse::<tauri::Url>() {
                Ok(url) => assert!(
                    !is_allowed_origin(&url, allowed),
                    "{target} parses and must not be navigated to"
                ),
                Err(_) => unparseable += 1,
            }
        }
        // Named rather than left implicit: at least one case is stopped by the
        // parser and at least one is stopped by the guard, so neither defence is
        // carried by a test that silently tested neither.
        assert!(
            unparseable >= 1,
            "the userinfo case was expected to be unparseable"
        );
        assert!(
            unparseable < 12,
            "if every case were unparseable this test would prove nothing about the guard"
        );
    }

    /// The guard compares the **effective** port, so an explicit default port and
    /// an implicit one are the same origin — and a port with a different number of
    /// digits after it is a different origin.
    #[test]
    fn the_guard_treats_the_effective_port_as_the_port() {
        let allowed = "http://127.0.0.1:80";
        // `http` has a known default of 80, so this is the same origin.
        assert!(is_allowed_origin(
            &"http://127.0.0.1/x".parse().expect("a URL"),
            allowed
        ));
        assert!(!is_allowed_origin(
            &"http://127.0.0.1:8080/x".parse().expect("a URL"),
            allowed
        ));
    }

    #[test]
    fn the_navigation_guard_fails_closed_on_an_unparseable_origin() {
        // Not a URL at all: nothing may be loaded, rather than everything.
        assert!(!is_allowed_origin(
            &"http://127.0.0.1:7831/".parse().expect("a URL"),
            "not a url",
        ));
    }

    #[test]
    fn the_origin_the_guard_allows_is_the_one_the_ready_line_produced() {
        // The guard's expectation comes from the same `port` the `ready` line
        // carried, so a server on another port can never be navigated to.
        for port in [7831u16, 7832, 7833] {
            let origin = format!("http://127.0.0.1:{port}");
            let own: tauri::Url = format!("{origin}/patients").parse().expect("a URL");
            assert!(is_allowed_origin(&own, &origin));
            let other: tauri::Url = format!("http://127.0.0.1:{}/x", port + 1)
                .parse()
                .expect("a URL");
            assert!(!is_allowed_origin(&other, &origin));
        }
    }

    /// The ladder against a **real** child in its own process group, with a real
    /// stdin, and the real exit status of a real process.
    ///
    /// This is what D1 and D2 broke and no decision-table test can prove: that
    /// the ladder makes a live group go away, and returns having done it. Two
    /// cases, because the ladder has two rungs that matter and only the first is
    /// fast — the second costs the card's own 10 s and is worth spending once.
    ///
    /// Both reap the child as the app's reader thread does, and that is not a
    /// convenience: `kill(-pgid, 0)` reports a **zombie** as alive, so a test that
    /// never reaped would see the group persist after the child had died and
    /// would then drive the ladder all the way to `SIGKILL`, passing for the wrong
    /// reason.
    #[cfg(unix)]
    #[test]
    fn the_ladder_shuts_down_a_real_child_that_honours_shutdown() {
        use std::os::unix::process::CommandExt;
        use std::time::Duration;

        let mut child = Command::new("sh")
            .arg("-c")
            .arg("read -r line; exit 0")
            .current_dir("/")
            .process_group(0)
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("sh starts");
        let pgid = child.id() as i32;
        let stdin = child.stdin.take().expect("a piped stdin");

        let gate = std::sync::Arc::new(QuitGate::default());
        assert!(gate.try_begin(), "the first door owns the quit");
        assert!(
            !gate.try_begin(),
            "the second door must not start a second ladder"
        );

        let ladder_gate = std::sync::Arc::clone(&gate);
        let started = Instant::now();
        let ladder = std::thread::spawn(move || {
            quit_ladder(pgid, Some(stdin));
            ladder_gate.finish();
            Instant::now()
        });

        // Reap as the reader thread does, so the group is genuinely gone rather
        // than held open by an unreaped corpse.
        let status = reap_within(&mut child, Duration::from_secs(15));
        let finished = ladder.join().expect("the ladder thread did not panic");
        assert_eq!(
            unsafe { signals::kill(-pgid, 0) },
            -1,
            "the child's process group should be gone"
        );
        assert!(
            !gate.in_progress(),
            "a finished ladder must let the exit through"
        );
        // The first rung, not escalation: the child honoured `shutdown` and
        // exited 0 well inside the 10 s grace period, so no signal was ever sent.
        assert_eq!(status.code(), Some(0), "the child should exit cleanly");
        assert!(
            started.elapsed() < Duration::from_secs(10),
            "the ladder should finish inside the shutdown grace period"
        );
        assert!(finished >= started);
    }

    /// The `SIGTERM` rung, with a real process and the card's real 10 s budget.
    ///
    /// A child that ignores the `shutdown` line is exactly the case the second
    /// rung exists for, and it is the rung the SIGTERM watchdog depends on. The
    /// assertion is on the child's own exit: stopped by `SIGTERM`, so the process
    /// really was signalled rather than the harness tidying up after it.
    #[cfg(unix)]
    #[test]
    fn the_ladder_signals_a_real_child_that_ignores_shutdown() {
        use std::os::unix::process::{CommandExt, ExitStatusExt};
        use std::time::Duration;

        let mut child = Command::new("sh")
            .arg("-c")
            .arg("while : ; do sleep 1 ; done")
            .current_dir("/")
            .process_group(0)
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("sh starts");
        let pgid = child.id() as i32;
        let stdin = child.stdin.take().expect("a piped stdin");
        assert_eq!(
            unsafe { signals::kill(-pgid, 0) },
            0,
            "the group should exist before the ladder runs"
        );

        quit_ladder(pgid, Some(stdin));

        let status = reap_within(&mut child, Duration::from_secs(5));
        assert_eq!(
            status.signal(),
            Some(signals::SIGTERM),
            "the child should have been stopped by SIGTERM, not exited on its own"
        );
        assert_eq!(unsafe { signals::kill(-pgid, 0) }, -1);
    }

    /// Waiting for a real child, reaping it as the reader thread does.
    ///
    /// Returns the real `ExitStatus`; panics rather than hanging, so a
    /// regression fails this suite instead of stalling CI's `cargo test`.
    fn reap_within(child: &mut Child, within: std::time::Duration) -> std::process::ExitStatus {
        let deadline = Instant::now() + within;
        loop {
            match child.try_wait() {
                Ok(Some(status)) => return status,
                Ok(None) if Instant::now() < deadline => {
                    std::thread::sleep(std::time::Duration::from_millis(50));
                }
                Ok(None) => panic!("the child outlived the quit ladder"),
                Err(error) => panic!("waiting for the child failed: {error}"),
            }
        }
    }

    /// The group id is **taken**, never copied: the one `swap(0)` in
    /// `begin_quit` is the reason a reaped group can never be signalled again,
    /// and a pid the kernel has since recycled can never be reached through it.
    /// Modeled here on the same primitive the wiring uses.
    #[test]
    fn the_group_id_is_handed_out_exactly_once() {
        let pgid = AtomicI32::new(4242);
        assert_eq!(pgid.swap(0, Ordering::SeqCst), 4242);
        // Every later reader — a second door, a defensive retry, a panic path —
        // sees zero, which is `begin_quit`'s "nothing to ladder down".
        for _ in 0..5 {
            assert_eq!(pgid.swap(0, Ordering::SeqCst), 0);
        }
        assert_eq!(pgid.load(Ordering::SeqCst), 0);
    }
}
