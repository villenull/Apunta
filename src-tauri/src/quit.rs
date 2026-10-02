//! One quit, three doors.
//!
//! Three different things can ask this shell to stop:
//!
//! - the **main window's own close** (`WindowEvent::CloseRequested`),
//! - the **`ExitRequested`** the runtime raises once the last window is gone, and
//! - a **`SIGTERM`/`SIGINT`** from a session logout, a `kill` or Ctrl-C.
//!
//! They used to be three independent code paths, and both halves of that were
//! reproduced on the built AppImage:
//!
//! - A **window close reached none of them**. The ladder lived only in the
//!   `ExitRequested` arm, which GDK's fatal X error handler pre-empted, so the
//!   shell died, the server was reparented and kept running, `127.0.0.1:<port>`
//!   stayed bound, `apunta.lock` still named the orphan, and the AppImage's FUSE
//!   mount was left behind.
//! - A **`SIGTERM` reached two of them at once**. Each arm called
//!   `api.prevent_exit()` on *every* `ExitRequested` — including the one its own
//!   `handle.exit(0)` provoked — and each spawned another ladder thread whose
//!   first step was `Done` because the group was already gone, which exited again.
//!   The child shut down correctly and the shell then spun at roughly 4.3 cores
//!   for ever, with new threads appearing and vanishing each cycle.
//!
//! [`QuitGate`] is the single answer both ask for, and it is deliberately the
//! only thing in the crate that can say "a quit has begun". Whoever gets `true`
//! out of [`QuitGate::try_begin`] owns the quit and runs the ladder exactly once;
//! every other caller, through any door, does nothing at all.
//!
//! Two properties make that safe rather than merely tidy:
//!
//! - **The process-group id is handed out once.** [`QuitGate`] does not hold it;
//!   `spawn`'s single `swap(0)` does, and the zero it leaves behind is what makes
//!   a second signal of a reaped group impossible rather than merely unlikely.
//! - **The exit is deferred only while cleanup is real.** [`QuitGate::in_progress`]
//!   is `true` from the moment the winner claims the quit until the ladder
//!   finishes, which is exactly the window in which `ExitRequested` must be
//!   prevented. Once the ladder is done the flag is `false` and the exit the
//!   ladder itself asked for goes through — the difference between "the app exits
//!   while the server is still coming down" and the livelock above.

use std::sync::atomic::{AtomicBool, Ordering};

/// The one-shot quit state, shared by the window, the runtime and the signal
/// watchdog.
///
/// `Default` is the whole constructor: there is no way to build one already
/// claimed, so a test and production start from the same place.
#[derive(Default)]
pub struct QuitGate {
    /// Whether anyone has taken ownership of the quit.
    started: AtomicBool,
    /// Whether the ladder has finished, so the app may finally exit.
    finished: AtomicBool,
}

impl QuitGate {
    /// Claims the quit. `true` **exactly once** per process, to exactly one caller.
    ///
    /// `compare_exchange` rather than `swap`, so a loser leaves the winner's state
    /// untouched; `AcqRel`/`Acquire` because the winner goes on to read and clear
    /// state its own caller published before the claim.
    pub fn try_begin(&self) -> bool {
        self.started
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_ok()
    }

    /// Whether a quit is under way and has not finished.
    ///
    /// This is the only thing `ExitRequested` consults. While it is `true` the
    /// exit is deferred, because a live ladder is exactly the "cleanup still
    /// running" case; once the ladder is done it is `false` again, so the exit
    /// the ladder itself asked for is allowed to happen.
    pub fn in_progress(&self) -> bool {
        self.started.load(Ordering::Acquire) && !self.finished.load(Ordering::Acquire)
    }

    /// Marks the ladder finished. Idempotent, so a defensive second caller
    /// cannot reopen the window and re-defer the exit.
    pub fn finish(&self) {
        self.finished.store(true, Ordering::Release);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;

    #[test]
    fn exactly_one_caller_owns_the_quit_however_many_ask() {
        let gate = QuitGate::default();
        assert!(gate.try_begin(), "the first caller owns the quit");
        for _ in 0..100 {
            assert!(
                !gate.try_begin(),
                "a second caller must never start a second ladder"
            );
        }
    }

    #[test]
    fn the_exit_is_deferred_while_the_ladder_runs_and_allowed_once_it_is_done() {
        let gate = QuitGate::default();
        assert!(!gate.in_progress(), "nothing is in progress before a quit");
        assert!(gate.try_begin());
        assert!(
            gate.in_progress(),
            "a quit that has begun but not finished must defer the exit"
        );
        gate.finish();
        assert!(
            !gate.in_progress(),
            "the ladder's own exit must be allowed through, or the shell never exits"
        );
        gate.finish();
        assert!(
            !gate.in_progress(),
            "finishing twice must not reopen the window"
        );
    }

    #[test]
    fn eight_threads_racing_for_one_quit_produce_exactly_one_winner() {
        use std::sync::{Arc, Barrier};
        let gate = Arc::new(QuitGate::default());
        let barrier = Arc::new(Barrier::new(9));
        let winners = Arc::new(AtomicUsize::new(0));
        let mut threads = Vec::new();
        for _ in 0..8 {
            let gate = Arc::clone(&gate);
            let barrier = Arc::clone(&barrier);
            let winners = Arc::clone(&winners);
            threads.push(std::thread::spawn(move || {
                barrier.wait();
                if gate.try_begin() {
                    winners.fetch_add(1, Ordering::SeqCst);
                }
            }));
        }
        barrier.wait();
        for thread in threads {
            thread.join().expect("no racing thread may panic");
        }
        assert_eq!(
            winners.load(Ordering::SeqCst),
            1,
            "exactly one caller may run the ladder"
        );
        assert!(gate.in_progress(), "the winner has not finished yet");
    }

    #[test]
    fn a_finished_gate_stays_finished_under_further_claims() {
        // The order the ladder actually produces: claim, work, finish, then the
        // runtime asks to exit one last time. That last ask must not be able to
        // re-claim and re-defer, which is the livelock in its smallest form.
        let gate = QuitGate::default();
        assert!(gate.try_begin());
        gate.finish();
        for _ in 0..10 {
            assert!(!gate.try_begin());
            assert!(!gate.in_progress());
        }
    }

    #[test]
    fn a_gate_nobody_claimed_never_reports_progress() {
        // A refused start never begins a quit, which is what lets it exit at all
        // rather than waiting on a ladder that was never going to run.
        let gate = QuitGate::default();
        assert!(!gate.in_progress());
    }
}
