# V1 — Rust toolchain checks (attempt 2)

**Status: PASS. fmt 0, clippy 0, test 0 (55 passed / 0 failed).**
Working directory: `src-tauri`. Start 2026-10-02T06:46Z, end
2026-10-02T06:47Z (UTC), after the last source edit and therefore after the
build V2 used.

Exact commands, each run and recorded **separately** (the row's `&&` chain is
not used as a single recorded result — see `attempt2-V6-…` for why that matters):

```sh
export PATH="$HOME/.cargo/bin:$PATH" && cd src-tauri && cargo fmt --check          # exit 0
export PATH="$HOME/.cargo/bin:$PATH" && cd src-tauri && cargo clippy --all-targets -- -D warnings   # exit 0
export PATH="$HOME/.cargo/bin:$PATH" && cd src-tauri && cargo test                  # exit 0
```

Excerpts:

```
== fmt
fmt exit=0
== clippy
   Compiling apunta v0.0.0 (~/Projects/Apunta/src-tauri)
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.46s
clippy exit=0
== test
test result: ok. 55 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 15.01s
```

`--all-targets` is used for clippy, as attempt 1 and the review did: it is what
makes the test code linted rather than only the binary.

## 39 → 55: what the sixteen new tests are

Attempt 1 recorded 39. The difference is entirely the correction.

**`src-tauri/src/quit.rs` (5 tests, new module)** — the one-shot quit gate:

- `exactly_one_caller_owns_the_quit_however_many_ask` — the first caller wins,
  100 further callers all get `false`.
- `the_exit_is_deferred_while_the_ladder_runs_and_allowed_once_it_is_done` — the
  livelock in its smallest form: claim → work → finish → a final exit request
  must not re-claim and re-defer.
- `eight_threads_racing_for_one_quit_produce_exactly_one_winner` — the race,
  with a `Barrier` so the eight start together.
- `a_finished_gate_stays_finished_under_further_claims`.
- `a_gate_nobody_claimed_never_reports_progress` — a refused start must still be
  able to exit.

**`src-tauri/src/main.rs` (7 tests)**

- `the_navigation_guard_allows_this_servers_own_origin_and_its_paths` — the
  allowed origin and its paths, queries and fragments (C-BRIDGE@1 rule 5).
- `the_navigation_guard_refuses_anything_that_is_not_that_origin` — twelve
  cases that all share the `http://127.0.0.1:7831` **string prefix**: another
  port including `78310`, the live port, a missing port, `https:`, `file:`, a
  userinfo form naming a foreign host, `localhost`, a host with the IP inside its
  text, and a different loopback address. The test states which of the two
  defences stopped each case (URL parser or guard) and fails if *neither* was
  exercised, so it cannot silently become a test of nothing.
- `the_guard_treats_the_effective_port_as_the_port` — `http://127.0.0.1/` and
  `http://127.0.0.1:80/` are one origin; `8080` is not.
- `the_navigation_guard_fails_closed_on_an_unparseable_origin`.
- `the_origin_the_guard_allows_is_the_one_the_ready_line_produced` — the guard's
  expectation and the navigated URL come from the same `ready` line's port.
- `the_group_id_is_handed_out_exactly_once` — the `swap(0)` that makes a second
  signal of a reaped group impossible, on the same primitive the wiring uses.
- `the_ladder_stops_a_real_group_and_returns` / `the_ladder_signals_a_real_child_that_ignores_shutdown`
  — see below.

**`src-tauri/src/launch.rs` (4 tests)**

- `the_live_port_is_refused_in_the_production_identity_too` — the empty `if`
  body review D9 found, replaced with a real refusal in both branches.
- `production_honours_a_non_live_port_with_a_data_folder_override` — the shape
  that is legitimately exercisable without a second identity.
- `a_port_that_is_not_a_port_is_refused_in_both_identities`.

## The two tests that use **real processes** and assert a **real exit**

The review asked for "unit race tests and actual process exit assertions". Both
are here, and they are the tests that would have caught D1 and D2.

`the_ladder_shuts_down_a_real_child_that_honours_shutdown` spawns a real `sh` in
**its own process group** with a real piped stdin, runs the real ladder, reaps
the child the way the app's reader thread does, and asserts the group's
existence probe returns `-1` (gone), the child's **exit status is 0** — so the
first rung did it and no signal was ever sent — and the whole thing finished
inside the 10 s grace period.

`the_ladder_signals_a_real_child_that_ignores_shutdown` spawns a `sh` that
ignores `shutdown` entirely, so only the SIGTERM rung can stop it, and asserts
the child's exit status is **signalled by `SIGTERM` (15)** — read from the real
`ExitStatus`, not from an exit code the harness invented. It costs the card's
own 10 s, which is why there is one such test and not three.

Both reaping with `reap_within`, which panics rather than hanging: a regression
fails `cargo test` in CI instead of stalling it. Reaping is not a convenience —
`kill(-pgid, 0)` reports a **zombie** as alive, so a test that never reaped
would see the group persist after the child had died and would then drive the
ladder all the way to `SIGKILL`, passing for entirely the wrong reason. That is
exactly the mistake the first version of these two tests made, and it is why the
helper exists.

## CI's compile-time dependencies (review D3) — not claimed as run here

`.github/workflows/ci.yml`'s `rust` job now installs `libwebkit2gtk-4.1-dev`,
`libgtk-3-dev` and `libayatana-appindicator3-dev` before the three checks,
because `tauri`'s default features put `wry` → `webkit2gtk-sys` in the graph and
that crate's build script exits non-zero when `pkg-config` cannot find the
library. **This attempt has not run hosted CI and does not claim a CI pass.**
What it can say is that the three commands above were run locally, on a machine
where those libraries are installed, and passed; and that the CI job's
`working-directory` (`src-tauri`) and its `cargo` invocations are the same three
with the same flags. See `attempt2-findings-disposition.md` D3.