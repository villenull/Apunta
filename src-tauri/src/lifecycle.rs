//! The quit ladder (C-BRIDGE@1 rule 2, and the card's own budget).
//!
//! Send `shutdown` on stdin, wait 10 s, then SIGTERM the child's process
//! group, then SIGKILL after 5 s. The timings are card values, not thresholds
//! this card invented, and they are named here so a test can assert them
//! without a real child.
//!
//! The decision itself is separated from the doing so it can be tested: the
//! shell asks "given how long it has been and whether the child is still
//! alive, what is the next step", and this module answers. Every rung kills the
//! child's **process group**, never a pid the shell did not spawn.
//!
//! # One quit, three doors
//!
//! Three different things can ask this shell to stop: the main window's own
//! close, the `ExitRequested` the runtime raises once the last window is gone,
//! and a `SIGTERM`/`SIGINT` from a session logout or a `kill`. They used to be
//! three independent code paths, and that is what broke twice: a window close
//! reached none of them (so the server was orphaned), and a `SIGTERM` reached
//! two of them at once (so each provoked the other into another ladder thread
//! and the shell spun at several cores forever).
//!
//! [`QuitGate`] is the single answer both problems ask for. Whoever gets
//! `try_begin` back as `true` owns the quit and runs the ladder exactly once;
//! everyone else does nothing at all. Nothing else can start a ladder thread,
//! re-signal a group, or take the child's stdin, because the process-group id is
//! handed out by a single `swap(0)` and is never written back — so a pid that
//! has been reaped can never be signalled again. `in_progress` is what lets the
//! exit request be deferred while cleanup is real and lets it through the moment
//! cleanup is done, which is the difference between "the app exits while the
//! server is still coming down" and the livelock.

/// How long the child gets to close cleanly after `shutdown`.
pub const SHUTDOWN_GRACE_MS: u64 = 10_000;

/// How long the child gets after SIGTERM before SIGKILL.
pub const TERM_GRACE_MS: u64 = 5_000;

/// What the shell does next.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Step {
    /// Nothing yet: the `shutdown` line has been written and the clock is
    /// running. Reported so the shell can log that it is waiting rather than
    /// looking stuck.
    WaitingForShutdown,
    /// The grace period is over and the child is still alive.
    SignalTerm,
    /// SIGTERM was sent and its own 5 s are running.
    WaitingAfterTerm,
    /// SIGKILL was sent. Nothing follows.
    SignalKill,
    /// The child is gone. The shell stops here and never signals anything.
    Done,
}

/// The next step, given the elapsed milliseconds since the ladder started and
/// whether SIGTERM has already gone out.
///
/// `term_sent` is what separates "send SIGTERM" from "wait for it to land":
/// without it the ladder would re-send the same signal on every poll, and the
/// 5 s that follow would be indistinguishable from the 10 s that precede them.
pub fn next_step(elapsed_ms: u64, child_alive: bool, term_sent: bool) -> Step {
    if !child_alive {
        return Step::Done;
    }
    if elapsed_ms < SHUTDOWN_GRACE_MS {
        return Step::WaitingForShutdown;
    }
    if elapsed_ms < SHUTDOWN_GRACE_MS + TERM_GRACE_MS {
        return if term_sent {
            Step::WaitingAfterTerm
        } else {
            Step::SignalTerm
        };
    }
    Step::SignalKill
}

/// The signal a step sends, if it sends one. `None` for the waiting steps and
/// for `Done`, which is what makes "never signal a process the shell did not
/// spawn" checkable: there is exactly one place that names a signal, and it is
/// reached only from a `Step` the ladder produced.
pub fn signal_for(step: Step) -> Option<&'static str> {
    match step {
        Step::SignalTerm => Some("SIGTERM"),
        Step::SignalKill => Some("SIGKILL"),
        Step::WaitingForShutdown | Step::WaitingAfterTerm | Step::Done => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_ladder_is_shutdown_then_ten_seconds_then_term_then_five_then_kill() {
        assert_eq!(next_step(0, true, false), Step::WaitingForShutdown);
        assert_eq!(
            next_step(SHUTDOWN_GRACE_MS - 1, true, false),
            Step::WaitingForShutdown
        );
        assert_eq!(next_step(SHUTDOWN_GRACE_MS, true, false), Step::SignalTerm);
        assert_eq!(
            next_step(SHUTDOWN_GRACE_MS + TERM_GRACE_MS - 1, true, true),
            Step::WaitingAfterTerm
        );
        assert_eq!(
            next_step(SHUTDOWN_GRACE_MS + TERM_GRACE_MS, true, true),
            Step::SignalKill
        );
    }

    #[test]
    fn a_child_that_exits_at_any_point_ends_the_ladder_and_nothing_more_is_signalled() {
        for elapsed in [0, 1, SHUTDOWN_GRACE_MS - 1, SHUTDOWN_GRACE_MS, 60_000] {
            for term_sent in [false, true] {
                assert_eq!(
                    next_step(elapsed, false, term_sent),
                    Step::Done,
                    "at {elapsed}ms (term_sent {term_sent})"
                );
                assert_eq!(signal_for(next_step(elapsed, false, term_sent)), None);
            }
        }
    }

    #[test]
    fn sigterm_is_sent_once_not_on_every_poll() {
        // The five seconds after SIGTERM are a wait, not a repeat.
        assert_eq!(
            next_step(SHUTDOWN_GRACE_MS + 1, true, true),
            Step::WaitingAfterTerm
        );
        assert_eq!(signal_for(Step::WaitingAfterTerm), None);
    }

    #[test]
    fn only_two_steps_send_a_signal_and_they_are_the_documented_two() {
        let signalled: Vec<_> = [
            Step::WaitingForShutdown,
            Step::SignalTerm,
            Step::WaitingAfterTerm,
            Step::SignalKill,
            Step::Done,
        ]
        .into_iter()
        .filter_map(signal_for)
        .collect();
        assert_eq!(signalled, vec!["SIGTERM", "SIGKILL"]);
    }

    #[test]
    fn the_budgets_are_the_card_values() {
        assert_eq!(SHUTDOWN_GRACE_MS, 10_000);
        assert_eq!(TERM_GRACE_MS, 5_000);
    }
}
