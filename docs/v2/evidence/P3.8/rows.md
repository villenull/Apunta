# P3.8 — evidence index

Attempt 1's files are kept as they were written. Attempt 2 adds files suffixed
`-a2` rather than overwriting, so no record is lost and neither attempt's status
is ambiguous.

Base for attempt 2: `799597d` (attempt 1's change, committed by the
coordinator) · HEAD `f9daac9` · card port **7860**. Every launching row ran
through `scripts/v2/sandbox.mjs`; every run-folder path is written `<sandbox>`,
the home folder `~`, hostnames and nonces redacted.

## Attempt 2

| Row | Status | Exit | Evidence |
| --- | --- | --- | --- |
| V0 build the AppImage | PASS | 0 | [V0-build-a2.md](V0-build-a2.md) |
| V1 Rust | PASS | 0 | [V1-rust-a2.md](V1-rust-a2.md) |
| V2 scope/lint/typecheck | PASS, one reported predicate mismatch | 0 | [V2-scope-a2.md](V2-scope-a2.md) |
| V3 forwarding, end to end | PASS | 0 | [V3-forwarding-a2.md](V3-forwarding-a2.md) |
| V4 lifecycle negative control | NOT RUN | 3 | [V4-lifecycle-negative-a2.md](V4-lifecycle-negative-a2.md) |

**Card status: IN PROGRESS, not approvable on this attempt.** V3 now passes for
the first time — the marker reached stderr, after `ready`, through the real
AppImage — but **V4, the negative control, is `NOT RUN`**, and it is `NOT RUN`
twice over: launch 2's pre-ready race was lost on this host (the card's recorded
case), and under a bare `xvfb-run` the window reader never saw a window title at
all, so (b) and (e) would pass vacuously. The post-`ready` guard that part (ii)
exists for is therefore still **unproven from outside**.

## Attempt 1 (inherited, superseded by the above)

| Row | Status | Exit | Evidence |
| --- | --- | --- | --- |
| V0 build the AppImage | PASS | 0 | [V0.md](V0.md) |
| V1 Rust (before the change) | PASS | 0 | [V1-baseline.md](V1-baseline.md) |
| V1 Rust (after the change) | PASS | 0 | [V1-rust.md](V1-rust.md) |
| V2 scope/lint (before the change) | PASS, expectation mismatch reported | 0 | [V2-baseline.md](V2-baseline.md) |
| V2 scope/lint (after the change) | PASS, expectation mismatch reported | 0 | [V2-scope.md](V2-scope.md) |
| V3 forwarding, end to end | NOT RUN | 3 | [V3-forwarding.md](V3-forwarding.md) |
| V4 lifecycle negative control | NOT RUN | 3 | [V4-lifecycle-negative.md](V4-lifecycle-negative.md) |
