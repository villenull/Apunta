//! First-run setup: the shell runs the bundled installer when the page asks.
//!
//! The page cannot start a process and the server must not download anything
//! (CLAUDE.md hard rule 1), so the server relays the page's request as
//! `setup_request{action}` and the shell runs `installer/setup.mjs` under the
//! bundled Node: a separate, short-lived process, which is the only one the
//! model-acquisition exception covers. Each line it prints goes back to the
//! server as `setup_event{event}`, and its end as `setup_exit{code}`.
//!
//! Three properties are the point:
//!
//! - **One at a time.** A second request while one runs is dropped; the
//!   server's own state check already refuses it, so this is the backstop.
//! - **It dies with the app.** The installer joins the server's process group,
//!   so the quit ladder that stops the server stops a download too, and a
//!   group the shell created still holds only processes the shell spawned.
//! - **Stop signals only this child.** The pid is read under the same lock
//!   that reaps it, so a pid the kernel has recycled can never be signalled.

use std::ffi::OsString;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};

use crate::bridge::SetupAction;
use crate::signals;

/// Where the installer sits inside the runtime bundle.
pub fn script_path(bundle: &Path) -> PathBuf {
    bundle.join("installer").join("setup.mjs")
}

/// What the shell needs to start the installer, captured at boot.
#[derive(Debug, Clone)]
pub struct Launch {
    pub node_bin: PathBuf,
    pub script: PathBuf,
    pub data_dir: PathBuf,
    pub child_path: String,
    /// The AI runtime's address, when the shell chose one (the bundled runtime).
    /// Absent, the installer uses its own default, the same one the server uses.
    pub ollama_url: Option<String>,
}

/// The installer's arguments for one action. `Cancel` is not a run.
pub fn arguments(launch: &Launch, action: SetupAction) -> Option<Vec<OsString>> {
    let command = match action {
        SetupAction::Plan => "plan",
        SetupAction::Run => "run",
        SetupAction::Cancel => return None,
    };
    let mut args: Vec<OsString> = vec![
        launch.script.clone().into_os_string(),
        command.into(),
        "--data-dir".into(),
        launch.data_dir.clone().into_os_string(),
    ];
    if let Some(url) = &launch.ollama_url {
        args.push("--ollama-url".into());
        args.push(url.into());
    }
    Some(args)
}

/// The running installer, if any. Shared by the starter, the reaper and Stop.
#[derive(Default, Clone)]
pub struct Runner {
    child: Arc<Mutex<Option<Child>>>,
}

impl Runner {
    /// Starts the installer for `action`, or says why not.
    ///
    /// `group` is the server's process group; `write` sends one finished line
    /// to the server's stdin. Every line is wrapped before it is written, and
    /// the exit line is written exactly once, after the last event line.
    pub fn start(
        &self,
        launch: &Launch,
        action: SetupAction,
        group: i32,
        write: impl Fn(&str) + Send + 'static,
    ) -> Result<(), String> {
        let Some(args) = arguments(launch, action) else {
            return Err("cancel is not a run".into());
        };
        if group <= 0 {
            return Err("the app is closing".into());
        }
        if !launch.script.is_file() {
            return Err(format!("no installer at {}", launch.script.display()));
        }
        let mut slot = self.child.lock().map_err(|_| "setup lock poisoned")?;
        if slot.is_some() {
            return Err("setup is already running".into());
        }
        let mut command = Command::new(&launch.node_bin);
        command
            .args(args)
            .current_dir("/")
            .env("PATH", &launch.child_path)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            // A diagnostic stays a log line, as the server's does.
            .stderr(Stdio::inherit());
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.process_group(group);
        }
        let mut child = command.spawn().map_err(|error| error.to_string())?;
        let stdout = child.stdout.take();
        *slot = Some(child);
        drop(slot);

        let reaper = self.child.clone();
        std::thread::spawn(move || {
            if let Some(stdout) = stdout {
                for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                    match event_line(&line) {
                        Some(wrapped) => write(&wrapped),
                        None => eprintln!("apunta: setup printed a line that is not an event"),
                    }
                }
            }
            // Reaped under the lock Stop takes, so Stop never signals a pid that
            // has already been waited for.
            let code = loop {
                if let Ok(mut slot) = reaper.lock() {
                    match slot.as_mut().map(Child::try_wait) {
                        Some(Ok(Some(status))) => {
                            *slot = None;
                            break status.code();
                        }
                        Some(Ok(None)) => {}
                        Some(Err(_)) | None => {
                            *slot = None;
                            break None;
                        }
                    }
                }
                std::thread::sleep(std::time::Duration::from_millis(50));
            };
            write(&exit_line(code));
        });
        Ok(())
    }

    /// Asks the running installer to stop. Its own `failed{cancelled}` line and
    /// then its exit follow; a partial download keeps its bytes for a resume.
    pub fn stop(&self) -> bool {
        let Ok(slot) = self.child.lock() else {
            return false;
        };
        let Some(child) = slot.as_ref() else {
            return false;
        };
        // Not yet reaped (the reaper clears the slot under this same lock), so
        // this pid is still this child.
        unsafe { signals::kill(child.id() as i32, signals::SIGTERM) == 0 }
    }

    pub fn is_running(&self) -> bool {
        self.child
            .lock()
            .map(|slot| slot.is_some())
            .unwrap_or(false)
    }
}

/// One installer line as `setup_event{event}`, or `None` when it is not an
/// object on one line.
///
/// The shell does not parse the event: the server validates it against the
/// installer's own schema. `type` is written **last** so that, whatever the
/// line holds, a JSON reader that keeps the last duplicate key still reads
/// this line as a `setup_event` and nothing else.
pub fn event_line(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if !trimmed.starts_with('{') || !trimmed.ends_with('}') || trimmed.contains(['\n', '\r']) {
        return None;
    }
    Some(format!(
        "{{\"event\":{trimmed},\"type\":\"setup_event\"}}\n"
    ))
}

/// `setup_exit{code}`; `null` when a signal ended the installer.
pub fn exit_line(code: Option<i32>) -> String {
    match code {
        Some(code) => format!("{{\"type\":\"setup_exit\",\"code\":{code}}}\n"),
        None => "{\"type\":\"setup_exit\",\"code\":null}\n".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;

    fn launch(script: PathBuf) -> Launch {
        Launch {
            node_bin: PathBuf::from("/bin/sh"),
            script,
            data_dir: PathBuf::from("/tmp/apunta-v2/x/data"),
            child_path: "/usr/bin:/bin".into(),
            ollama_url: None,
        }
    }

    #[test]
    fn the_arguments_name_the_action_the_data_folder_and_the_runtime() {
        let mut config = launch(PathBuf::from("/b/installer/setup.mjs"));
        let plan = arguments(&config, SetupAction::Plan).expect("a run");
        assert_eq!(
            plan,
            [
                "/b/installer/setup.mjs",
                "plan",
                "--data-dir",
                "/tmp/apunta-v2/x/data"
            ]
            .map(OsString::from)
            .to_vec()
        );
        config.ollama_url = Some("http://127.0.0.1:11435".into());
        let run = arguments(&config, SetupAction::Run).expect("a run");
        assert_eq!(run[1], OsString::from("run"));
        assert_eq!(
            run[4..],
            ["--ollama-url", "http://127.0.0.1:11435"].map(OsString::from)
        );
        assert!(arguments(&config, SetupAction::Cancel).is_none());
    }

    #[test]
    fn an_event_is_wrapped_with_its_type_last_and_anything_else_is_dropped() {
        assert_eq!(
            event_line("{\"event\":\"done\",\"ok\":true}").as_deref(),
            Some("{\"event\":{\"event\":\"done\",\"ok\":true},\"type\":\"setup_event\"}\n")
        );
        assert_eq!(
            event_line("  {\"a\":1}  ").as_deref(),
            Some("{\"event\":{\"a\":1},\"type\":\"setup_event\"}\n")
        );
        assert!(event_line("Downloading…").is_none());
        assert!(event_line("[1,2]").is_none());
        assert!(event_line("").is_none());
    }

    #[test]
    fn the_exit_line_carries_the_code_or_null() {
        assert_eq!(exit_line(Some(0)), "{\"type\":\"setup_exit\",\"code\":0}\n");
        assert_eq!(exit_line(None), "{\"type\":\"setup_exit\",\"code\":null}\n");
    }

    /// A real child: `/bin/sh` stands in for Node, and the "installer" is a
    /// script that prints two events. The lines arrive wrapped and in order,
    /// the exit comes last, and the slot is free again afterwards.
    #[cfg(unix)]
    #[test]
    fn a_real_run_relays_every_line_then_the_exit() {
        let dir = std::env::temp_dir().join(format!("apunta-setup-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("temp dir");
        let script = dir.join("setup.sh");
        std::fs::write(
            &script,
            "echo '{\"event\":\"message\",\"text\":\"hi\"}'\necho not-json\necho '{\"event\":\"done\",\"ok\":true}'\n",
        )
        .expect("script");
        let runner = Runner::default();
        let (tx, rx) = mpsc::channel::<String>();
        // Our own group, so the child joins a group that exists.
        let own_group = unsafe {
            unsafe extern "C" {
                fn getpgid(pid: i32) -> i32;
            }
            getpgid(0)
        };
        runner
            .start(&launch(script), SetupAction::Plan, own_group, move |line| {
                let _ = tx.send(line.to_string());
            })
            .expect("started");
        let lines: Vec<String> = rx.iter().take(3).collect();
        assert_eq!(
            lines,
            vec![
                "{\"event\":{\"event\":\"message\",\"text\":\"hi\"},\"type\":\"setup_event\"}\n"
                    .to_string(),
                "{\"event\":{\"event\":\"done\",\"ok\":true},\"type\":\"setup_event\"}\n"
                    .to_string(),
                "{\"type\":\"setup_exit\",\"code\":0}\n".to_string(),
            ]
        );
        assert!(!runner.is_running());
        assert!(!runner.stop());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn stop_ends_a_running_child_and_the_exit_says_so() {
        let dir = std::env::temp_dir().join(format!("apunta-setup-stop-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("temp dir");
        let script = dir.join("setup.sh");
        // `exec`, so the signalled process is the one holding the pipe.
        std::fs::write(&script, "exec sleep 30\n").expect("script");
        let runner = Runner::default();
        let (tx, rx) = mpsc::channel::<String>();
        let own_group = unsafe {
            unsafe extern "C" {
                fn getpgid(pid: i32) -> i32;
            }
            getpgid(0)
        };
        let config = launch(script);
        runner
            .start(&config, SetupAction::Run, own_group, move |line| {
                let _ = tx.send(line.to_string());
            })
            .expect("started");
        assert!(runner.is_running());
        // One at a time.
        assert!(runner
            .start(&config, SetupAction::Run, own_group, |_| {})
            .is_err());
        assert!(runner.stop());
        let exit = rx
            .recv_timeout(std::time::Duration::from_secs(10))
            .expect("an exit line");
        assert_eq!(exit, "{\"type\":\"setup_exit\",\"code\":null}\n");
        assert!(!runner.is_running());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn nothing_starts_while_the_app_is_closing_or_without_an_installer() {
        let runner = Runner::default();
        let config = launch(PathBuf::from("/nonexistent/setup.mjs"));
        assert!(runner.start(&config, SetupAction::Run, 0, |_| {}).is_err());
        assert!(runner.start(&config, SetupAction::Run, 1, |_| {}).is_err());
    }
}
