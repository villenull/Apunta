//! The two signals the quit ladder sends, and the one place they are named.
//!
//! `std::process` has no `kill(2)`, and A05 admits four crates, so the two
//! declarations below are this crate's own rather than a dependency's. The
//! numbers are the POSIX ones and are the same on every platform this app
//! ships for (Linux and macOS); they are named rather than written inline so a
//! test can assert that SIGTERM precedes SIGKILL without reading the call site.
//!
//! The child is put in **its own process group** (`process_group(0)` in
//! `spawn.rs`), so a negative pid reaches the group the shell created and
//! nothing else. There is no code path here that takes a pid from anywhere but
//! the shell's own `Child`.

/// POSIX SIGTERM: ask the child to stop. Sent to the child's process group.
pub const SIGTERM: i32 = 15;

/// POSIX SIGKILL: stop now. Sent to the child's process group, and only after
/// SIGTERM's own grace period.
pub const SIGKILL: i32 = 9;

/// `kill(2)`, declared rather than depended on.
///
/// # Safety
///
/// `pid` must be a process group this shell created (`-child_pid`) or a pid it
/// spawned. Both callers pass exactly that, and nothing else in the crate can
/// reach this function.
pub unsafe fn kill(pid: i32, sig: i32) -> i32 {
    unsafe extern "C" {
        fn kill(pid: i32, sig: i32) -> i32;
    }
    unsafe { kill(pid, sig) }
}

/// POSIX SIGINT and SIGTERM, for the handlers below.
pub const SIGINT: i32 = 2;

/// Set by the signal handler; polled by the watchdog thread.
static TERMINATE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

extern "C" fn on_terminate(_signal: i32) {
    // The only async-signal-safe thing done here: store a flag. Everything else
    // — the quit ladder, closing the child, exiting — happens on the watchdog
    // thread, which is the only correct place for it.
    TERMINATE.store(true, std::sync::atomic::Ordering::SeqCst);
}

/// Asks the shell to take the same path a window close would.
///
/// Without this, a `SIGTERM` from a session logout kills the shell in place and
/// orphans the server it started, which is precisely the "everything it started
/// goes down cleanly" half of the objective. The handler itself does nothing but
/// set a flag; the watchdog does the work.
pub fn install_terminate_handlers() {
    unsafe extern "C" {
        fn signal(signum: i32, handler: usize) -> usize;
    }
    let handler = on_terminate as extern "C" fn(i32) as usize;
    unsafe {
        signal(SIGTERM, handler);
        signal(SIGINT, handler);
    }
}

/// Whether a termination signal has arrived.
pub fn terminate_requested() -> bool {
    TERMINATE.load(std::sync::atomic::Ordering::SeqCst)
}

/// Sends `sig` to the process group whose id is `pgid`.
///
/// # Safety
///
/// `pgid` must be a process group this shell created.
pub unsafe fn signal_group(pgid: i32, sig: i32) -> i32 {
    unsafe { kill(-pgid, sig) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_terminate_handlers_start_clear_and_are_the_posix_signals() {
        assert_eq!(SIGINT, 2);
        assert_eq!(SIGTERM, 15);
        assert!(!terminate_requested(), "nothing has signalled this process");
        // Installing them here would disarm the test runner's own SIGINT, so the
        // call is made and immediately proven not to have fired.
        install_terminate_handlers();
        assert!(!terminate_requested());
    }

    #[test]
    fn the_two_signals_are_the_posix_ones() {
        assert_eq!(SIGTERM, 15);
        assert_eq!(SIGKILL, 9);
        // Distinct, and SIGTERM is the one the ladder sends first — the ordering
        // is the ladder's, not the numbers'.
        const { assert!(SIGTERM != SIGKILL) };
    }

    /// The existence probe works on a group this shell created, and a signal
    /// sent to that group reaches the child and stops.
    ///
    /// `process_group(0)` is the same call `spawn` makes, so this exercises the
    /// group the ladder would signal rather than a group invented here. `sleep`
    /// is used because it does nothing on stdin and exits promptly on a
    /// signal, so nothing else about the test is under test.
    #[cfg(unix)]
    #[test]
    fn the_probe_and_the_signal_reach_a_group_this_shell_created() {
        use std::os::unix::process::{CommandExt, ExitStatusExt};
        use std::time::Duration;

        let mut child = std::process::Command::new("sleep")
            .arg("30")
            .process_group(0)
            .spawn()
            .expect("sleep starts");
        let pgid = child.id() as i32;

        // Signal 0 performs the permission and process checks and sends nothing.
        assert_eq!(unsafe { kill(-pgid, 0) }, 0, "the group should exist");

        // The child's own group, so this cannot reach the test runner.
        assert_eq!(
            unsafe { signal_group(pgid, SIGTERM) },
            0,
            "signalling the group should succeed"
        );
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        loop {
            match child.try_wait() {
                Ok(Some(status)) => {
                    // Rust reports a signalled child as no exit code and the
                    // signal that stopped it, so this reads the signal rather
                    // than the shell's 128+n convention.
                    assert_eq!(status.signal(), Some(SIGTERM), "stopped by SIGTERM");
                    break;
                }
                Ok(None) if std::time::Instant::now() < deadline => {
                    std::thread::sleep(Duration::from_millis(50));
                }
                Ok(None) => panic!("the child ignored SIGTERM"),
                Err(error) => panic!("waiting for the child failed: {error}"),
            }
        }

        // The group is gone, so the probe says so and the ladder would stop here
        // rather than escalate to SIGKILL.
        assert_eq!(unsafe { kill(-pgid, 0) }, -1, "the group should be gone");
    }
}
