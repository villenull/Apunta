# P3.3 attempt 2 — closure of review 1's findings, scope and hard stops

Reviewer: independent implementation reviewer. `d35c4b6` against base `2235fee`.
Nothing was fixed by me; the coordinator-owned state files were not touched.

## D1 — a window close orphaned the server (HIGH) — **CLOSED, verified on the real door**

- `src-tauri/src/main.rs:504-517`: the main window's `WindowEvent::CloseRequested`
  is now a first-class door — `api.prevent_close()` on the event-loop thread,
  then `begin_quit` on a blocking task through the same one-shot gate as the
  other two. It cannot be a builder method, which the code says, and the
  comment is accurate.
- The ladder reached over **the same `pgid`** the other doors use, taken by one
  `swap(0)` (`main.rs:177`), so no second signal and no recycled pid.
- **Reproduced the owner's actual gesture myself** — see
  `review2-native-close.md`: a real ICCCM `WM_DELETE_WINDOW` to the real window
  produced `apunta: the window close is closing the app; starting the quit
  ladder`, the shell exited on its own in ~300 ms with no signal from me, the
  port was released, no server process survived, `apunta.lock` was gone, the
  dummy was alive and Ollama was untouched. That is D1's exact residue, absent.
- The forced-destroy path (what review 1 reproduced with `xdotool windowclose`)
  is contained independently, by the child's stdin end-of-file: harness
  `forced-close` mode **12/12**, with `Gdk-WARNING … BadDrawable` in the app's
  own stderr and no surviving server. Both mechanisms are real; neither is
  assumed.

## D2 — SIGTERM livelocked the shell at ~4.3 cores (HIGH) — **CLOSED**

- One `QuitGate` (`src-tauri/src/quit.rs:48-83`) with `compare_exchange`, so
  exactly one caller in the process ever owns the quit; `in_progress()` is the
  only thing `ExitRequested` consults (`main.rs:136-150`) and `prevent_exit()`
  is called only while cleanup is real. The old unconditional
  `prevent_exit()` + per-event ladder thread is gone.
- The `pgid` is `swap(0)`-ed once and never written back
  (`main.rs:177`, `main.rs:225`), so a reaped group cannot be signalled twice.
- Proved by tests (`eight_threads_racing_for_one_quit_produce_exactly_one_winner`,
  `the_group_id_is_handed_out_exactly_once`, `a_finished_gate_stays_finished_under_further_claims`)
  and by V3's signal door: the harness's `stopPid` reports whether it escalated,
  and the row requires `gone && !outcome.escalated` — **PASS on my run**.

## D3 — the CI `rust` job could not pass (HIGH) — **CLOSED in the workflow; hosted CI NOT RUN**

- `.github/workflows/ci.yml:74-132` installs `libwebkit2gtk-4.1-dev`,
  `libgtk-3-dev` and `libayatana-appindicator3-dev` — A03's own Ubuntu names —
  before the three checks, inside CI only, and the comment now says plainly that
  compiling needs them because `webkit2gtk-sys`'s build script exits non-zero
  when `pkg-config` cannot find the library. It also `mkdir -p ../build/linux-resources`
  for `tauri-build`'s resource-existence check.
- **Local equivalent of the job's exact steps, all green** (V1): `cargo fmt
  --check` 0; `cargo clippy --all-targets -- -D warnings` 0 (CI's stricter
  flag); `cargo test` 0, 55 passed. Same working directory (`src-tauri`), same
  flags.
- **The hosted job itself was not executed and is not claimed to have passed.**
  This host is Arch; the `apt-get` step is CI-only and cannot be run here. That
  remains an unexecuted-CI fact, recorded as such, exactly as the disposition
  does.

## D4 — `@tauri-apps/cli` in the lock but not in `package.json` (HIGH) — **CLOSED**

- `package.json` declares `"@tauri-apps/cli": "^2.12.1"`, the range the lockfile
  had already resolved.
- Re-verified the way review 1 asked, in an isolated copy with no
  `node_modules`: `npm ci --dry-run --offline` → exit 0, 157 packages, and
  `@tauri-apps/cli` + `@tauri-apps/cli-linux-x64-gnu` present in the plan.
  `npm ls @tauri-apps/cli` → `2.12.1`, no longer extraneous. V2 then rebuilt the
  AppImage from that state, so V2 is reproducible from a clean install.

## D5 — V6 recorded PASS on a red row (HIGH) — **CLOSED**

- V6 is now five separately recorded commands with five exit codes, so no result
  depends on a chain reaching it, and `npm run lint` is **0** at HEAD (including
  the proofs that were red in review 1). Every later step is its own command in
  `review2-rows.md`.

## D6 — the home-screen assertion was vacuous (MEDIUM) — **CLOSED**

- The harness compares the window name as the **exact string** `Apunta`, requires
  `WINDOW_PID` to equal this run's shell, requires ≥ 400×300, and requires the
  rectangle to lie inside `xdotool getdisplaygeometry`
  (`tauri-lifecycle.test.mjs:272-407, 617-651`). No `--name` regexp, no
  first-match.
- The real off-screen-window defect it exposed is fixed in
  `main.rs:541-572` (`main_window_geometry`): size **and** minimum fitted to the
  monitor, computed in physical pixels and divided by the scale factor. Measured
  on a 1400×1000 display at scale 2: 1330×950 at 36,26 — inside the display.
- Colour count is the weakest of the three pieces and the row says so; the
  second piece is the served document at that origin (200, `text/html`, 1265
  bytes, app root present).
- I did not stop at colour count: I read the screenshot myself and described the
  rendered home screen — see `review2-native-close.md`.

## D7 — neither real quit direction was asserted (MEDIUM) — **CLOSED**

- `stopPid` **returns** whether it escalated and the row requires the shell to be
  gone without it (`tauri-lifecycle.test.mjs:135-165, 690-703`).
- Containment after each quit is asserted for the **port**, for **surviving
  server processes** (polled, because a free socket does not prove a reparented
  server is gone — D1's exact residue) and for the **data lock**.
- Three separate quit cases: signal (a card row), cooperative close (records
  `NOT RUN` with its cause, never `PASS`), forced destroy (explicitly not
  labelled a native close). All three run clean except the cooperative close,
  which is `NOT RUN` for its own honest reason — and which I then executed for
  real by another route.

## D8 — `on_navigation` was a string prefix (MEDIUM) — **CLOSED, and the tests carry meaning**

- `main.rs:592-606` parses both sides and compares `scheme()`, `host_str()` and
  `port_or_known_default()`; it fails closed on an unparseable expected origin.
- The tests (`main.rs:761-880`) are not decorative. They cover the port-suffix
  case `http://127.0.0.1:78310/` against `…:7831`, userinfo
  `http://127.0.0.1:7831@evil.example/`, no port at all, `https:`, `file:`,
  `localhost`, `127.0.0.1.evil.example`, `[::1]`, the live port, and the
  default-port equivalence — and, importantly, they **count how many cases the
  URL parser rejected outright and assert both that at least one was rejected and
  that not all were**, so the test cannot quietly become a test of nothing.
  `the_guard_treats_the_effective_port_as_the_port` asserts the effective-port
  rule directly rather than through a side effect.

## D9 — a dead guard whose comment claimed a guard (MEDIUM) — **CLOSED**

- The empty `if` is gone. `launch.rs:154-198`: the production branch now refuses
  `APUNTA_PORT=7717` as well, so the comment "the live port is refused in both
  branches" is true, while an explicit non-live port with a data-dir override is
  still exercisable (covered by its own tests, so the fix cannot be mistaken for
  "production can no longer be run").

## D10 — no environment scrub (LOW) — **OPEN BY THE OWNER'S INSTRUCTION, non-blocking, not expanded**

- `main.rs:395-419` still overrides `PATH` and the six `APUNTA_*` values and
  inherits the rest, so the child carries the caller's variables. No contract
  demands a scrub, the card does not ask for one, and attempt 2 deliberately left
  it. I did not propose a change: an allow-list decision belongs to a later card,
  and guessing wrong breaks the server in a way nothing here would catch. Recorded
  as an accepted open LOW, exactly as the disposition does.

## D11 — a Tokio worker blocked for the shell's whole life (LOW) — **CLOSED**

- `main.rs:259` uses `tauri::async_runtime::spawn_blocking` for `drive`, and
  `main.rs:354-360` waits with `recv_timeout(250ms)` and returns on
  `Disconnected`, so no async worker is parked on a bare `recv()` for the
  shell's life.

## D12 — unpinned third-party actions in CI (LOW) — **CLOSED**

- `dtolnay/rust-toolchain@stable` and `Swatinem/rust-cache@v2` are gone. The job
  uses only `actions/checkout@v5` (pre-existing in this repository) and
  `rustup component add rustfmt clippy`, which uses the toolchain the image
  already ships — no ACQUISITION row needed and nothing fetched from GitHub at
  run time.

## Scope — **PASS**

Every path changed in `2235fee..d35c4b6` outside `docs/v2/**` is on the card's
May-edit list: `src-tauri/**` (including `src-tauri/ui/*.html`,
`src-tauri/ui/apunta-a.svg`, `src-tauri/gen/` ignored, and the 17 icons, each
**byte-identical** to `docs/v2/assets/tauri-icons/` — checked with `cmp`),
`package.json`, `package-lock.json` (A04's entries plus the accepted `engines`
repair), `server/src/index.ts`, `server/src/shell-bridge.ts`,
`server/src/shell-bridge.test.ts`, `scripts/v2/tauri-lifecycle.test.mjs`,
`.github/workflows/ci.yml`, `.gitignore`, `eslint.config.js`,
`scripts/check-no-external-urls.mjs`. The only other paths are the
coordinator-owned dispatch, return, review and evidence documents.

The hygiene files are exactly the card's three and no fourth: one `.gitignore`
block naming `src-tauri/target/` **and** `src-tauri/gen/schemas/`, one
`eslint.config.js` line, one repository-relative skip in the URL checker with
`https://schema.tauri.app/config/2` admitted by exact string. No
`.prettierignore` line and no `src-tauri/.gitignore`. `node scripts/check-no-external-urls.mjs`
exits 0. `git diff --check` is clean.

`server/src/index.ts` changed at exactly the three places the card permits: the
two `writeFatal` call sites and the `writeReady` / `startStdinBridge` wiring.
Both fatal writes are `fs.writeSync(1, …)` and are followed immediately by the
exit — `writeFatal('data_folder_in_use')` before `process.exit(75)`, and the
`EADDRINUSE`-only branch before the existing `app.log.error` + `process.exit(1)`,
with every other error in that `catch` untouched. **No real incompatibility**
between the EOF wiring and the approved bridge: `startStdinBridge` is one-shot, so
a `shutdown` followed by the shell's own EOF is one shutdown (asserted in the
bridge's tests), browser mode reads no stdin and writes nothing at all
(`shellIsListening` requires `APUNTA_SHELL === '1'`), and the child-EOF
containment I measured is the same code path the forced-destroy row exercises.

## Hard stops — **PASS**

| Stop | Result |
| --- | --- |
| HS-1 live data | never opened, listed, read, copied or restored; 7717 never contacted and free; neither forbidden script run |
| HS-2 isolation | every launch via `scripts/v2/sandbox.mjs`, test identity, `APUNTA_DATA_DIR`, ports 7831/7832/7833 only |
| HS-3 downloads | nothing downloaded, installed or pulled; `cargo`/`clippy`/`test` run with `--offline --locked`; `npm ci --dry-run --offline`; no Ollama tag touched |
| HS-4 git | `main` only, no branch/merge/pull/rebase/reset, no commit by me; staging not used |
| HS-5 secrets | no key or password created, printed or stored; the test build carries no signing identity |
| HS-6 runtime network | no new network in `server/`, `web/` or `shared/`; the only host-looking strings in the new Rust are test literals and the SVG namespace; the URL checker passes |
| HS-7 safety instruments | no threshold, scorer, guard, lock or test touched; `10_000`/`5_000` ladder bounds and the harness's `20 s`/`15 s` waits are exactly as committed |
| HS-8 fabricated data | synthetic sandbox folders only; no real names in fixtures, screenshots or evidence |
| HS-9 protected paths | `prototype/` untouched; nothing edited outside my two owned outputs and git-ignored scratch |
| HS-10 owner-only actions | nothing published, no secrets created, the live v1 instance never stopped or inspected; **no owner focus taken for any assertion** and `APUNTA_ALLOW_FOCUS_TEST` never set |

## One environmental hazard worth recording

This session's ambient environment exports `WAYLAND_DISPLAY=wayland-1` and
`XDG_BACKEND=wayland`, and `DISPLAY=:0` is the owner's session. Two of my early
manual launches inherited it and briefly put an Apunta window on the owner's
compositor before I killed them (both cleaned within seconds; nothing survived,
no port or lock left). Every harness row is immune because
`tauri-lifecycle.test.mjs:214-236` unsets `WAYLAND_DISPLAY` and forces
`XDG_BACKEND=GDK_BACKEND=x11` for the app — which is a real robustness property
of the harness, now demonstrated from the outside. My scratch scripts set the
same variables explicitly. No assertion in this review depends on the owner's
display, and nothing ran on it deliberately.