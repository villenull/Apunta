# P3.8 — evidence index, implementation attempt 1

Base commit `a9166a0`; HEAD at session start `c93b42c` (documentation only since
the base; `src-tauri/src/main.rs` identical at both). Card port 7860. Every
launching row ran through `scripts/v2/sandbox.mjs`; every run-folder path is
written `<sandbox>`.

| Row | Status | Exit | Evidence |
| --- | --- | --- | --- |
| V0 build the AppImage | PASS | 0 | [V0.md](V0.md) |
| V1 Rust (before the change) | PASS | 0 | [V1-baseline.md](V1-baseline.md) |
| V1 Rust (after the change) | PASS | 0 | [V1-rust.md](V1-rust.md) |
| V2 scope/lint (before the change) | PASS with a reported expectation mismatch | 0 | [V2-baseline.md](V2-baseline.md) |
| V2 scope/lint (after the change) | PASS with a reported expectation mismatch | 0 | [V2-scope.md](V2-scope.md) |
| V3 forwarding, end to end | NOT RUN | 3 | [V3-forwarding.md](V3-forwarding.md) |
| V4 lifecycle negative control | NOT RUN | 3 | [V4-lifecycle-negative.md](V4-lifecycle-negative.md) |

**Card status: BLOCKED** at V3 and V4. Both rows died on the same cause, which
is outside this card's May edit and outside its authority to repair: the
AppImage's bundled `linux-resources` has no `web/` payload, so the shell refuses
to start and never writes a `ready` line or any forwarded line. See
[V3-forwarding.md](V3-forwarding.md) for the measurement and the coordinator
action needed.