# P3.3 evidence — attempt 2 (correction after review 1)

Card: **P3.3 Tauri project and lifecycle**, attempt **2** of 3, base `2235fee`,
sandbox ports 7831 (V3), 7832 (V4), 7833 (V5). Correction dispatch:
`docs/v2/state/dispatch/P3.3.md` (its header records attempt 1; attempt 2
overrides that header and every scope, criterion and fixed decision is the same).

**Attempt 1's evidence is not edited or replaced.** It is in
`V0-preflight.md` … `V6-lint-typecheck-tests.md` and `acquisition-A02-A04-A05.md`,
and where attempt 2 re-ran a row the earlier file's own record — including the
rows attempt 1 recorded as `PASS` that review 1 showed were not sound — stands
unchanged beside this one. What follows is the attempt-2 record, per row.

Every command ran from the repository root unless the row names its own `cd`.
Every run-folder path is written `<sandbox>`; the home folder is `~`. Scratch and
log files are under the git-ignored `build/p33-correct-*`.

Toolchain for the whole attempt: Node `v24.19.0` (pinned), Rust
`rustc 1.99.0 (b940084d7 2026-09-28)` / `cargo 1.99.0` / `rustup 1.29.1`,
WebKitGTK `2.52.6`, `xvfb-run` present.

## Row index (attempt 2)

| Row | Status | Command | Exit | Evidence |
| --- | --- | --- | --- | --- |
| V0 | PASS | the card's pre-flight probe | 0 | `attempt2-V0-preflight.md` |
| V1 | PASS | `cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test` | 0 / 0 / 0 | `attempt2-V1-rust-toolchain.md` |
| V2 | PASS | `npm run tauri:build:test` | 0 | `attempt2-V2-appimage.md` |
| V3 (signal quit) | PASS | `… tauri-lifecycle.test.mjs launch` | 0, 12/12 | `attempt2-V3-launch.md` |
| V3 (cooperative window close) | **NOT RUN** (one criterion), rest PASS | `… window-close` | 0, 7/7 + 1 NOT RUN | `attempt2-V3-launch.md` |
| V3 (forced destroy) | PASS | `… forced-close` | 0, 12/12 | `attempt2-V3-launch.md` |
| V4 | PASS | `… fatal` | 0, 11/11 | `attempt2-V4-fatal.md` |
| V5 | PASS (focus read `NOT RUN`) | `… single-instance` | 0, 11/11 + 1 NOT RUN | `attempt2-V5-single-instance.md` |
| V6 | PASS | each step run and recorded **separately** | 0 / 0 / 0 / 0 / 0 | `attempt2-V6-lint-typecheck-tests.md` |

Per-finding dispositions (D1–D15) are in `attempt2-findings-disposition.md`.

## The three findings that shaped this attempt, in one place

1. **The review's D1 and D2 were both about the same missing thing**: three
   independent quit paths where there should be one. `src-tauri/src/quit.rs` is
   that one thing, and it is a gate, not a flag.
2. **The review's D1 reproduction used a command that is not a close.**
   `xdotool windowclose` calls `XDestroyWindow`; `xdotool windowquit` sends
   `_NET_CLOSE_WINDOW`, which is a **window-manager** message. Under `xvfb-run`
   there is no window manager, so the cooperative native close cannot be
   delivered on this host at all. Both facts are established from the installed
   tools' own documentation and binaries and are recorded in
   `attempt2-V3-launch.md`. The forced-destroy case is reproduced anyway, and the
   requirement — the server this run started must not survive the app's death —
   is asserted and met.
3. **The review's D5 was a recording defect as much as a red row.** V6 is now
   recorded as five separate commands with five exit codes rather than one `&&`
   chain that cannot yield its later results. `npm run lint` is **green** at
   attempt 2 (exit 0), after the P5 proof files it was red on were corrected by
   their owner; no lint ignore, disable or `PASS`-on-red was used here.