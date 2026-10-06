//! The updater's and the native close's state machine (C-UPD@1, C-BRIDGE@1).
//!
//! This is a pure decision table: every input is a fact the wiring in `main.rs`
//! learned (a bridge line, the result of a network or disk operation, a timer),
//! and every output is an [`Effect`] the wiring performs. Nothing here touches a
//! process, a file or the network, which is what lets every row of C-UPD@1's
//! failure table and every native-close transition be tested without a display
//! or a server.
//!
//! Two rules from the card hold throughout:
//!
//! - **Rust acts on the canonical boolean.** A `quiesce_result` is read as `ok`
//!   and nothing else. The blocker vocabulary belongs to the renderer; this file
//!   has no copy of it.
//! - **Maintenance is released only explicitly.** In shell mode a successful
//!   quiesce keeps writes off until shutdown, so every path that backs out of an
//!   update after a successful quiesce writes `maintenance_release{}`, and the
//!   path that installs and relaunches never does.

use std::collections::VecDeque;

use crate::bridge::{RecoveryAction, StartupMode, UpdateAction};

/// The shell-owned updater states, in C-UPD@1's order.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum State {
    Idle,
    Checking,
    Available,
    Downloading,
    Verified,
    Quiescing,
    Snapshotting,
    Installing,
    Relaunching,
    HealthCheck,
    Done,
}

impl State {
    /// The word `update_status{state}` carries.
    pub fn word(self) -> &'static str {
        match self {
            State::Idle => "idle",
            State::Checking => "checking",
            State::Available => "available",
            State::Downloading => "downloading",
            State::Verified => "verified",
            State::Quiescing => "quiescing",
            State::Snapshotting => "snapshotting",
            State::Installing => "installing",
            State::Relaunching => "relaunching",
            State::HealthCheck => "health_check",
            State::Done => "done",
        }
    }
}

/// The codes `update_status{code}` carries.
pub mod code {
    pub const OFFLINE: &str = "offline";
    pub const REJECTED: &str = "rejected";
    pub const QUIESCE_REFUSED: &str = "quiesce_refused";
    pub const SNAPSHOT_FAILED: &str = "snapshot_failed";
    pub const INSTALL_FAILED: &str = "install_failed";
    pub const NOT_CONFIGURED: &str = "not_configured";
    pub const CLOSE_REQUESTED: &str = "close_requested";
    pub const CLOSE_REFUSED: &str = "close_refused";
    pub const CLOSE_CANCELLED: &str = "close_cancelled";
}

/// Why a check produced no answer. Every failure is the same to the owner
/// (C-UPD@1: "back to `idle`, no notice"), so there is one variant.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CheckFailure {
    Offline,
}

/// Why a download did not become verified bytes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DownloadFailure {
    /// The network failed; the update is still available, retry later.
    Offline,
    /// The signature (or the redirect allow-list) refused the bytes.
    Rejected,
}

/// What the wiring tells the machine.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Input {
    /// `update_request{action}` from the server.
    Request(UpdateAction),
    /// The check finished: the announced newer version, or none.
    Checked(Result<Option<String>, CheckFailure>),
    /// The download finished and (on `Ok`) the bytes verified.
    Downloaded(Result<(), DownloadFailure>),
    /// `quiesce_result{ok}`.
    Quiesced(bool),
    /// `snapshot_result{id, ok}`.
    Snapshot { id: String, ok: bool },
    /// The install finished.
    Installed(Result<(), ()>),
    /// `startup_context`, written by the server before `ready`.
    Startup {
        mode: StartupMode,
        update_id: Option<String>,
        target_version: Option<String>,
    },
    /// The server's `ready` line, validated by the parser (nonce, protocol).
    Ready { version: String },
    /// `health_result{id, ok}`.
    Health { id: String, ok: bool },
    /// `recovery_request{action}`.
    Recovery(RecoveryAction),
    /// The kept image was atomically restored.
    PreviousRestored,
    /// The wiring could not carry out a recovery request.
    RecoveryFailed,
    /// The owner asked the native window to close.
    CloseRequested,
    /// `close_decision{confirm}`.
    CloseDecision(bool),
    /// The close check's reply never came; the number is the generation the
    /// timer was armed for.
    CloseTimeout(u64),
}

/// A `update_status` report.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Status {
    pub state: State,
    pub version: Option<String>,
    pub code: Option<&'static str>,
}

/// What the wiring performs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Effect {
    /// Write `update_status`.
    Status(Status),
    /// Write `quiesce{}`.
    WriteQuiesce,
    /// Write `snapshot_request{id}`.
    WriteSnapshotRequest(String),
    /// Write `maintenance_release{}`.
    WriteRelease,
    /// Write `health_confirm{id}`.
    WriteHealthConfirm(String),
    /// Ask the endpoint for a newer release.
    Check,
    /// Download and verify the announced release.
    Download,
    /// Keep the previous AppImage, then install the verified bytes.
    Install,
    /// Quit through the ladder, then start the app again. `handoff` is the
    /// update id the new shell passes to its server (`None` for a plain
    /// restart).
    Relaunch { handoff: Option<String> },
    /// Put `Apunta.previous.AppImage` back in place, then relaunch.
    ReinstallPrevious,
    /// Drop the verified bytes.
    Discard,
    /// The native close is allowed: run the quit ladder.
    CloseApp,
    /// Start the timer that turns a missing close reply into a refusal.
    ArmCloseTimeout(u64),
}

/// Who asked for a quiesce whose reply has not arrived. Replies carry no id, so
/// they are matched to requests by order: the server answers each `quiesce{}`
/// line once, in the order it read them.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Owner {
    Update,
    Close,
    /// A close check that timed out; its late reply is read and discarded.
    Abandoned,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Close {
    Open,
    /// `quiesce{}` sent for a close request; the reply is pending.
    Checking,
    /// The reply was `ok:false` (or never came): the window stays open and the
    /// renderer is deciding.
    Refused,
    /// The owner confirmed; a fresh check is pending.
    Rechecking,
    /// `ok:true`: the quit ladder has been started.
    Closing,
}

/// A health attempt the relaunched shell still owes the server.
#[derive(Debug, Clone, PartialEq, Eq)]
struct PendingHealth {
    id: String,
    target: String,
}

pub struct Machine {
    configured: bool,
    state: State,
    version: Option<String>,
    next_id: u64,
    snapshot_id: Option<String>,
    recovery: bool,
    recovery_busy: bool,
    health: Option<PendingHealth>,
    queue: VecDeque<Owner>,
    close: Close,
    close_generation: u64,
}

impl Machine {
    /// `configured` is whether this build carries an updater key and endpoint.
    /// `id_seed` starts the snapshot-id counter; it only has to differ between
    /// shell runs, so the wiring passes the clock.
    pub fn new(configured: bool, id_seed: u64) -> Self {
        Machine {
            configured,
            state: State::Idle,
            version: None,
            next_id: id_seed,
            snapshot_id: None,
            recovery: false,
            recovery_busy: false,
            health: None,
            queue: VecDeque::new(),
            close: Close::Open,
            close_generation: 0,
        }
    }

    pub fn state(&self) -> State {
        self.state
    }

    fn status(&self, code: Option<&'static str>) -> Effect {
        Effect::Status(Status {
            state: self.state,
            version: self.version.clone(),
            code,
        })
    }

    fn move_to(&mut self, state: State, code: Option<&'static str>) -> Effect {
        self.state = state;
        self.status(code)
    }

    /// Feeds one input and returns what to do about it. Inputs that do not fit
    /// the current state are ignored, never turned into a transition: the server
    /// answers an out-of-state HTTP request with 409 itself, and a late result
    /// from a superseded operation must not move a machine that has moved on.
    pub fn step(&mut self, input: Input) -> Vec<Effect> {
        match input {
            Input::Request(action) => self.request(action),
            Input::Checked(result) => self.checked(result),
            Input::Downloaded(result) => self.downloaded(result),
            Input::Quiesced(ok) => self.quiesced(ok),
            Input::Snapshot { id, ok } => self.snapshot(&id, ok),
            Input::Installed(result) => self.installed(result),
            Input::Startup {
                mode,
                update_id,
                target_version,
            } => {
                match mode {
                    StartupMode::Recovery => {
                        self.recovery = true;
                        self.recovery_busy = false;
                        self.health = None;
                        self.version = None;
                        return vec![self.move_to(State::Idle, None)];
                    }
                    StartupMode::Normal => {
                        self.recovery = false;
                        self.health = None;
                        if let (Some(id), Some(target)) = (update_id, target_version) {
                            self.health = Some(PendingHealth { id, target });
                        }
                    }
                }
                Vec::new()
            }
            Input::Ready { version } => self.ready(&version),
            Input::Health { id, ok } => self.health_result(&id, ok),
            Input::Recovery(action) => {
                if !self.recovery || self.recovery_busy {
                    return Vec::new();
                }
                self.recovery_busy = true;
                match action {
                    RecoveryAction::Restart => vec![Effect::Relaunch { handoff: None }],
                    RecoveryAction::ReinstallPrevious => vec![Effect::ReinstallPrevious],
                }
            }
            Input::PreviousRestored => {
                if self.recovery && self.recovery_busy {
                    vec![Effect::Relaunch { handoff: None }]
                } else {
                    Vec::new()
                }
            }
            Input::RecoveryFailed => {
                self.recovery_busy = false;
                vec![Effect::Status(Status {
                    state: State::Idle,
                    version: None,
                    code: Some(code::INSTALL_FAILED),
                })]
            }
            Input::CloseRequested => self.close_requested(),
            Input::CloseDecision(confirm) => self.close_decision(confirm),
            Input::CloseTimeout(generation) => self.close_timeout(generation),
        }
    }

    fn request(&mut self, action: UpdateAction) -> Vec<Effect> {
        if self.recovery || self.health.is_some() || self.close != Close::Open {
            // Recovery mode serves no updater: nothing to move.
            return Vec::new();
        }
        match (action, self.state) {
            (UpdateAction::Check, State::Idle | State::Available | State::Done) => {
                if !self.configured {
                    // No key, no endpoint contacted: the build says so and stops.
                    self.version = None;
                    return vec![self.move_to(State::Idle, Some(code::NOT_CONFIGURED))];
                }
                vec![self.move_to(State::Checking, None), Effect::Check]
            }
            (UpdateAction::Download, State::Available) => {
                vec![self.move_to(State::Downloading, None), Effect::Download]
            }
            (UpdateAction::Install, State::Verified) => {
                self.queue.push_back(Owner::Update);
                vec![self.move_to(State::Quiescing, None), Effect::WriteQuiesce]
            }
            _ => Vec::new(),
        }
    }

    fn checked(&mut self, result: Result<Option<String>, CheckFailure>) -> Vec<Effect> {
        if self.state != State::Checking {
            return Vec::new();
        }
        match result {
            Ok(Some(version)) => {
                self.version = Some(version);
                vec![self.move_to(State::Available, None)]
            }
            Ok(None) => {
                self.version = None;
                vec![self.move_to(State::Idle, None)]
            }
            // Offline, host down, a manifest that does not parse: back to idle,
            // app fully usable, the notice (if any) is the server's to word.
            Err(CheckFailure::Offline) => {
                self.version = None;
                vec![self.move_to(State::Idle, Some(code::OFFLINE))]
            }
        }
    }

    fn downloaded(&mut self, result: Result<(), DownloadFailure>) -> Vec<Effect> {
        if self.state != State::Downloading {
            return Vec::new();
        }
        match result {
            Ok(()) => vec![self.move_to(State::Verified, None)],
            // The bytes are still out there: `available`, retry later.
            Err(DownloadFailure::Offline) => {
                vec![self.move_to(State::Available, Some(code::OFFLINE))]
            }
            // Refused bytes are deleted and the update is forgotten.
            Err(DownloadFailure::Rejected) => {
                self.version = None;
                vec![
                    Effect::Discard,
                    self.move_to(State::Idle, Some(code::REJECTED)),
                ]
            }
        }
    }

    fn quiesced(&mut self, ok: bool) -> Vec<Effect> {
        let owner = self.queue.pop_front();
        match owner {
            Some(Owner::Update) => self.update_quiesced(ok),
            Some(Owner::Close) => self.close_quiesced(ok),
            // A reply nobody is waiting for is read and dropped.
            Some(Owner::Abandoned) | None => Vec::new(),
        }
    }

    fn update_quiesced(&mut self, ok: bool) -> Vec<Effect> {
        if self.state != State::Quiescing {
            return Vec::new();
        }
        if !ok {
            // Back to `verified`, nothing restarted. A failed quiesce never
            // drops maintenance a prior success holds, so the release is ours.
            return vec![
                self.move_to(State::Verified, Some(code::QUIESCE_REFUSED)),
                Effect::WriteRelease,
            ];
        }
        self.next_id += 1;
        let id = self.next_id.to_string();
        self.snapshot_id = Some(id.clone());
        vec![
            self.move_to(State::Snapshotting, None),
            Effect::WriteSnapshotRequest(id),
        ]
    }

    fn snapshot(&mut self, id: &str, ok: bool) -> Vec<Effect> {
        if self.state != State::Snapshotting || self.snapshot_id.as_deref() != Some(id) {
            return Vec::new();
        }
        if ok {
            return vec![self.move_to(State::Installing, None), Effect::Install];
        }
        self.snapshot_id = None;
        vec![
            self.move_to(State::Verified, Some(code::SNAPSHOT_FAILED)),
            Effect::WriteRelease,
        ]
    }

    fn installed(&mut self, result: Result<(), ()>) -> Vec<Effect> {
        if self.state != State::Installing {
            return Vec::new();
        }
        match result {
            Ok(()) => {
                // Never a `maintenance_release` here: releasing would let a write
                // land after the snapshot and die at relaunch.
                let handoff = self.snapshot_id.clone();
                vec![
                    self.move_to(State::Relaunching, None),
                    Effect::Relaunch { handoff },
                ]
            }
            // The old version keeps running; the notice reports the failure.
            Err(()) => {
                self.snapshot_id = None;
                vec![
                    self.move_to(State::Verified, Some(code::INSTALL_FAILED)),
                    Effect::WriteRelease,
                ]
            }
        }
    }

    fn ready(&mut self, version: &str) -> Vec<Effect> {
        if self.recovery {
            return Vec::new();
        }
        let Some(pending) = self.health.as_ref() else {
            return Vec::new();
        };
        if pending.target != version {
            // The wrong build came up. No confirmation is sent, so the journal
            // stays attempted and the next start is recovery.
            return Vec::new();
        }
        let id = pending.id.clone();
        self.version = Some(version.to_string());
        vec![
            self.move_to(State::HealthCheck, None),
            Effect::WriteHealthConfirm(id),
        ]
    }

    fn health_result(&mut self, id: &str, ok: bool) -> Vec<Effect> {
        let matches = self.state == State::HealthCheck
            && self.health.as_ref().is_some_and(|pending| pending.id == id);
        if !matches {
            return Vec::new();
        }
        self.health = None;
        if ok {
            vec![self.move_to(State::Done, None)]
        } else {
            self.version = None;
            vec![self.move_to(State::Idle, Some(code::INSTALL_FAILED))]
        }
    }

    // --- Native close ----------------------------------------------------

    fn send_close_check(&mut self) -> Vec<Effect> {
        self.queue.push_back(Owner::Close);
        self.close_generation += 1;
        vec![
            self.status(Some(code::CLOSE_REQUESTED)),
            Effect::WriteQuiesce,
            Effect::ArmCloseTimeout(self.close_generation),
        ]
    }

    fn close_requested(&mut self) -> Vec<Effect> {
        if self.recovery_busy
            || self.health.is_some()
            || matches!(
                self.state,
                State::Quiescing | State::Snapshotting | State::Installing | State::Relaunching
            )
        {
            return Vec::new();
        }
        match self.close {
            Close::Open => {
                self.close = Close::Checking;
                self.send_close_check()
            }
            // The owner pressed close again while the dialog is up: say so
            // again rather than running a second check behind its back.
            Close::Refused => vec![self.status(Some(code::CLOSE_REFUSED))],
            Close::Checking | Close::Rechecking | Close::Closing => Vec::new(),
        }
    }

    fn close_quiesced(&mut self, ok: bool) -> Vec<Effect> {
        if !matches!(self.close, Close::Checking | Close::Rechecking) {
            return Vec::new();
        }
        if ok {
            self.close = Close::Closing;
            return vec![Effect::CloseApp];
        }
        self.close = Close::Refused;
        vec![self.status(Some(code::CLOSE_REFUSED))]
    }

    fn close_decision(&mut self, confirm: bool) -> Vec<Effect> {
        if self.close != Close::Refused {
            return Vec::new();
        }
        if confirm {
            // A confirmation starts a fresh canonical check. It never grants
            // permission to skip it.
            self.close = Close::Rechecking;
            return self.send_close_check();
        }
        self.close = Close::Open;
        vec![self.status(Some(code::CLOSE_CANCELLED))]
    }

    fn close_timeout(&mut self, generation: u64) -> Vec<Effect> {
        if generation != self.close_generation
            || !matches!(self.close, Close::Checking | Close::Rechecking)
        {
            return Vec::new();
        }
        // Fail closed: no reply is a refusal, never a silent close. The late
        // reply, if it ever comes, is read and dropped.
        for owner in self.queue.iter_mut() {
            if *owner == Owner::Close {
                *owner = Owner::Abandoned;
            }
        }
        self.close = Close::Refused;
        vec![self.status(Some(code::CLOSE_REFUSED))]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn st(state: State, version: Option<&str>, code: Option<&'static str>) -> Effect {
        Effect::Status(Status {
            state,
            version: version.map(str::to_string),
            code,
        })
    }

    /// A machine that has found, downloaded and verified version 1.2.0.
    fn verified() -> Machine {
        let mut m = Machine::new(true, 100);
        m.step(Input::Request(UpdateAction::Check));
        m.step(Input::Checked(Ok(Some("1.2.0".into()))));
        m.step(Input::Request(UpdateAction::Download));
        m.step(Input::Downloaded(Ok(())));
        assert_eq!(m.state(), State::Verified);
        m
    }

    /// A machine that is snapshotting; returns the snapshot id.
    fn snapshotting() -> (Machine, String) {
        let mut m = verified();
        m.step(Input::Request(UpdateAction::Install));
        let effects = m.step(Input::Quiesced(true));
        let Effect::WriteSnapshotRequest(id) = effects[1].clone() else {
            panic!("no snapshot request in {effects:?}");
        };
        (m, id)
    }

    #[test]
    fn the_happy_path_walks_every_state_in_order() {
        let mut m = Machine::new(true, 100);
        assert_eq!(
            m.step(Input::Request(UpdateAction::Check)),
            vec![st(State::Checking, None, None), Effect::Check]
        );
        assert_eq!(
            m.step(Input::Checked(Ok(Some("1.2.0".into())))),
            vec![st(State::Available, Some("1.2.0"), None)]
        );
        assert_eq!(
            m.step(Input::Request(UpdateAction::Download)),
            vec![
                st(State::Downloading, Some("1.2.0"), None),
                Effect::Download
            ]
        );
        assert_eq!(
            m.step(Input::Downloaded(Ok(()))),
            vec![st(State::Verified, Some("1.2.0"), None)]
        );
        assert_eq!(
            m.step(Input::Request(UpdateAction::Install)),
            vec![
                st(State::Quiescing, Some("1.2.0"), None),
                Effect::WriteQuiesce
            ]
        );
        let effects = m.step(Input::Quiesced(true));
        assert_eq!(effects[0], st(State::Snapshotting, Some("1.2.0"), None));
        let Effect::WriteSnapshotRequest(id) = effects[1].clone() else {
            panic!("{effects:?}");
        };
        assert_eq!(
            m.step(Input::Snapshot {
                id: id.clone(),
                ok: true
            }),
            vec![st(State::Installing, Some("1.2.0"), None), Effect::Install]
        );
        // The success path never releases maintenance.
        assert_eq!(
            m.step(Input::Installed(Ok(()))),
            vec![
                st(State::Relaunching, Some("1.2.0"), None),
                Effect::Relaunch { handoff: Some(id) }
            ]
        );
    }

    #[test]
    fn checking_offline_returns_to_idle_with_the_offline_code() {
        let mut m = Machine::new(true, 1);
        m.step(Input::Request(UpdateAction::Check));
        assert_eq!(
            m.step(Input::Checked(Err(CheckFailure::Offline))),
            vec![st(State::Idle, None, Some(code::OFFLINE))]
        );
        // And the owner can check again.
        assert_eq!(m.step(Input::Request(UpdateAction::Check)).len(), 2);
    }

    #[test]
    fn checking_with_nothing_newer_is_a_plain_idle() {
        let mut m = Machine::new(true, 1);
        m.step(Input::Request(UpdateAction::Check));
        assert_eq!(
            m.step(Input::Checked(Ok(None))),
            vec![st(State::Idle, None, None)]
        );
    }

    #[test]
    fn an_unconfigured_build_says_not_configured_and_asks_for_no_network() {
        let mut m = Machine::new(false, 1);
        let effects = m.step(Input::Request(UpdateAction::Check));
        assert_eq!(
            effects,
            vec![st(State::Idle, None, Some(code::NOT_CONFIGURED))]
        );
        assert!(!effects.contains(&Effect::Check));
    }

    #[test]
    fn a_failed_download_goes_back_to_available() {
        let mut m = Machine::new(true, 1);
        m.step(Input::Request(UpdateAction::Check));
        m.step(Input::Checked(Ok(Some("1.2.0".into()))));
        m.step(Input::Request(UpdateAction::Download));
        assert_eq!(
            m.step(Input::Downloaded(Err(DownloadFailure::Offline))),
            vec![st(State::Available, Some("1.2.0"), Some(code::OFFLINE))]
        );
        // Retry is allowed.
        assert_eq!(
            m.step(Input::Request(UpdateAction::Download)).len(),
            2,
            "download can be retried from available"
        );
    }

    #[test]
    fn an_invalid_signature_is_rejected_and_the_bytes_are_discarded() {
        let mut m = Machine::new(true, 1);
        m.step(Input::Request(UpdateAction::Check));
        m.step(Input::Checked(Ok(Some("1.2.0".into()))));
        m.step(Input::Request(UpdateAction::Download));
        assert_eq!(
            m.step(Input::Downloaded(Err(DownloadFailure::Rejected))),
            vec![Effect::Discard, st(State::Idle, None, Some(code::REJECTED))]
        );
        // Nothing to install any more.
        assert!(m.step(Input::Request(UpdateAction::Install)).is_empty());
    }

    #[test]
    fn a_refused_quiesce_returns_to_verified_and_releases_maintenance() {
        let mut m = verified();
        m.step(Input::Request(UpdateAction::Install));
        assert_eq!(
            m.step(Input::Quiesced(false)),
            vec![
                st(State::Verified, Some("1.2.0"), Some(code::QUIESCE_REFUSED)),
                Effect::WriteRelease
            ]
        );
        // Nothing restarted: the owner can finish the work and try again.
        assert_eq!(
            m.step(Input::Request(UpdateAction::Install)),
            vec![
                st(State::Quiescing, Some("1.2.0"), None),
                Effect::WriteQuiesce
            ]
        );
    }

    #[test]
    fn a_failed_snapshot_returns_to_verified_installs_nothing_and_releases() {
        let (mut m, id) = snapshotting();
        let effects = m.step(Input::Snapshot { id, ok: false });
        assert_eq!(
            effects,
            vec![
                st(State::Verified, Some("1.2.0"), Some(code::SNAPSHOT_FAILED)),
                Effect::WriteRelease
            ]
        );
        assert!(!effects.contains(&Effect::Install));
    }

    #[test]
    fn a_snapshot_result_for_another_id_changes_nothing() {
        let (mut m, id) = snapshotting();
        assert!(m
            .step(Input::Snapshot {
                id: format!("{id}0"),
                ok: true
            })
            .is_empty());
        assert!(m
            .step(Input::Snapshot {
                id: "0".into(),
                ok: true
            })
            .is_empty());
        assert_eq!(m.state(), State::Snapshotting);
    }

    #[test]
    fn a_failed_install_keeps_the_old_version_running_and_releases() {
        let (mut m, id) = snapshotting();
        m.step(Input::Snapshot { id, ok: true });
        assert_eq!(
            m.step(Input::Installed(Err(()))),
            vec![
                st(State::Verified, Some("1.2.0"), Some(code::INSTALL_FAILED)),
                Effect::WriteRelease
            ]
        );
    }

    #[test]
    fn a_relaunched_shell_confirms_health_only_for_the_claimed_target() {
        let mut m = Machine::new(true, 1);
        m.step(Input::Startup {
            mode: StartupMode::Normal,
            update_id: Some("77".into()),
            target_version: Some("1.2.0".into()),
        });
        // The wrong build: no confirmation, so the journal stays attempted.
        assert!(m
            .step(Input::Ready {
                version: "1.1.0".into()
            })
            .is_empty());
        assert_eq!(
            m.step(Input::Ready {
                version: "1.2.0".into()
            }),
            vec![
                st(State::HealthCheck, Some("1.2.0"), None),
                Effect::WriteHealthConfirm("77".into())
            ]
        );
        // A result for another id is not ours.
        assert!(m
            .step(Input::Health {
                id: "78".into(),
                ok: true
            })
            .is_empty());
        assert_eq!(
            m.step(Input::Health {
                id: "77".into(),
                ok: true
            }),
            vec![st(State::Done, Some("1.2.0"), None)]
        );
    }

    #[test]
    fn a_refused_health_confirmation_is_a_failure_not_a_done() {
        let mut m = Machine::new(true, 1);
        m.step(Input::Startup {
            mode: StartupMode::Normal,
            update_id: Some("77".into()),
            target_version: Some("1.2.0".into()),
        });
        m.step(Input::Ready {
            version: "1.2.0".into(),
        });
        assert_eq!(
            m.step(Input::Health {
                id: "77".into(),
                ok: false
            }),
            vec![st(State::Idle, None, Some(code::INSTALL_FAILED))]
        );
    }

    #[test]
    fn a_normal_start_without_an_update_sends_no_health_confirmation() {
        let mut m = Machine::new(true, 1);
        m.step(Input::Startup {
            mode: StartupMode::Normal,
            update_id: None,
            target_version: None,
        });
        assert!(m
            .step(Input::Ready {
                version: "1.2.0".into()
            })
            .is_empty());
    }

    #[test]
    fn recovery_mode_serves_no_updater_and_acts_only_on_recovery_requests() {
        let mut m = Machine::new(true, 1);
        // Outside recovery a recovery request is not honoured.
        assert!(m.step(Input::Recovery(RecoveryAction::Restart)).is_empty());
        m.step(Input::Startup {
            mode: StartupMode::Recovery,
            update_id: Some("77".into()),
            target_version: Some("1.2.0".into()),
        });
        assert!(m.step(Input::Request(UpdateAction::Check)).is_empty());
        assert!(m
            .step(Input::Ready {
                version: "1.2.0".into()
            })
            .is_empty());
        assert_eq!(
            m.step(Input::Recovery(RecoveryAction::ReinstallPrevious)),
            vec![Effect::ReinstallPrevious]
        );
        assert!(m.step(Input::Recovery(RecoveryAction::Restart)).is_empty());
        assert!(m.step(Input::CloseRequested).is_empty());
        m.step(Input::RecoveryFailed);
        assert_eq!(
            m.step(Input::Recovery(RecoveryAction::Restart)),
            vec![Effect::Relaunch { handoff: None }]
        );
    }

    #[test]
    fn requests_that_do_not_fit_the_state_are_ignored() {
        let mut m = Machine::new(true, 1);
        assert!(m.step(Input::Request(UpdateAction::Download)).is_empty());
        assert!(m.step(Input::Request(UpdateAction::Install)).is_empty());
        assert!(m.step(Input::Quiesced(true)).is_empty());
        assert!(m.step(Input::Installed(Ok(()))).is_empty());
        assert_eq!(m.state(), State::Idle);
    }

    // --- every native-close transition (V6) ------------------------------

    #[test]
    fn close_with_ok_true_closes() {
        let mut m = Machine::new(true, 1);
        assert_eq!(
            m.step(Input::CloseRequested),
            vec![
                st(State::Idle, None, Some(code::CLOSE_REQUESTED)),
                Effect::WriteQuiesce,
                Effect::ArmCloseTimeout(1)
            ]
        );
        assert_eq!(m.step(Input::Quiesced(true)), vec![Effect::CloseApp]);
        // A second close while the ladder starts does nothing.
        assert!(m.step(Input::CloseRequested).is_empty());
    }

    #[test]
    fn close_with_ok_false_stays_open_and_reports_close_refused() {
        let mut m = Machine::new(true, 1);
        m.step(Input::CloseRequested);
        let effects = m.step(Input::Quiesced(false));
        assert_eq!(
            effects,
            vec![st(State::Idle, None, Some(code::CLOSE_REFUSED))]
        );
        assert!(!effects.contains(&Effect::CloseApp));
        // Pressing close again re-reports the refusal without a second check.
        assert_eq!(
            m.step(Input::CloseRequested),
            vec![st(State::Idle, None, Some(code::CLOSE_REFUSED))]
        );
    }

    #[test]
    fn a_confirmed_decision_starts_a_fresh_check_and_closes_only_on_its_ok() {
        let mut m = Machine::new(true, 1);
        m.step(Input::CloseRequested);
        m.step(Input::Quiesced(false));
        let effects = m.step(Input::CloseDecision(true));
        assert!(
            effects.contains(&Effect::WriteQuiesce),
            "fresh quiesce: {effects:?}"
        );
        assert!(!effects.contains(&Effect::CloseApp));
        // The fresh check is refused again: still open, still no close.
        assert_eq!(
            m.step(Input::Quiesced(false)),
            vec![st(State::Idle, None, Some(code::CLOSE_REFUSED))]
        );
        // Confirm again; this time the check passes.
        m.step(Input::CloseDecision(true));
        assert_eq!(m.step(Input::Quiesced(true)), vec![Effect::CloseApp]);
    }

    #[test]
    fn a_cancelled_decision_reports_close_cancelled_and_stays_open() {
        let mut m = Machine::new(true, 1);
        m.step(Input::CloseRequested);
        m.step(Input::Quiesced(false));
        assert_eq!(
            m.step(Input::CloseDecision(false)),
            vec![st(State::Idle, None, Some(code::CLOSE_CANCELLED))]
        );
        // The app is running and a later close asks again from scratch.
        assert_eq!(m.step(Input::CloseRequested).len(), 3);
    }

    #[test]
    fn a_decision_with_no_refused_close_is_ignored() {
        let mut m = Machine::new(true, 1);
        assert!(m.step(Input::CloseDecision(true)).is_empty());
        assert!(m.step(Input::CloseDecision(false)).is_empty());
        m.step(Input::CloseRequested);
        // Still waiting for the first reply: a decision is not an answer to it.
        assert!(m.step(Input::CloseDecision(true)).is_empty());
    }

    #[test]
    fn a_silent_server_is_a_refusal_and_a_late_reply_cannot_close_the_app() {
        let mut m = Machine::new(true, 1);
        m.step(Input::CloseRequested);
        // A timer from some other generation is stale.
        assert!(m.step(Input::CloseTimeout(99)).is_empty());
        assert_eq!(
            m.step(Input::CloseTimeout(1)),
            vec![st(State::Idle, None, Some(code::CLOSE_REFUSED))]
        );
        // The reply that finally arrives belongs to the abandoned check.
        assert!(m.step(Input::Quiesced(true)).is_empty());
        assert_eq!(m.state(), State::Idle);
    }

    #[test]
    fn a_timer_for_an_answered_check_does_nothing() {
        let mut m = Machine::new(true, 1);
        m.step(Input::CloseRequested);
        m.step(Input::Quiesced(false));
        assert!(m.step(Input::CloseTimeout(1)).is_empty());
    }

    #[test]
    fn close_cannot_interrupt_snapshot_or_install() {
        let mut m = verified();
        m.step(Input::Request(UpdateAction::Install));
        assert!(m.step(Input::CloseRequested).is_empty());
        let update = m.step(Input::Quiesced(true));
        let Effect::WriteSnapshotRequest(id) = &update[1] else {
            panic!("snapshot must precede install")
        };
        assert!(m.step(Input::CloseRequested).is_empty());
        m.step(Input::Snapshot {
            id: id.clone(),
            ok: true,
        });
        assert_eq!(m.state(), State::Installing);
        assert!(m.step(Input::CloseRequested).is_empty());
        assert!(m.step(Input::Quiesced(true)).is_empty());
        assert_eq!(m.state(), State::Installing);
        assert!(m
            .step(Input::Installed(Ok(())))
            .iter()
            .any(|effect| matches!(effect, Effect::Relaunch { .. })));
    }
}
