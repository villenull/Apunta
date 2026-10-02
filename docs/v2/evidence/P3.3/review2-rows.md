# P3.3 attempt 2 — independent re-run of every verification row

Reviewer: independent implementation reviewer (did not write this change). No
branch, no commit, no approval, no source edit. Test lease: this session's
build/test/runtime lease only; no other worker active.

- Source commit under review: **`d35c4b6`** (base `2235fee`).
- Working tree at the start carried coordinator-owned state (`docs/v2/**`) only;
  I edited no source, no card, no contract, no threshold and no guard. During
  the run the coordinator committed that state as `4e64d05`
  (`docs/v2/**` only — verified with `git show --stat 4e64d05`), so HEAD moved
  to `4e64d05` while I ran. Neither `eba2925` nor `4e64d05` touches `src-tauri/`,
  `server/`, `scripts/` or any threshold; `git diff d35c4b6..4e64d05 --name-only`
  is `docs/v2/**` only.
- Sandbox environment: `PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH"`.
- Every launch went through `scripts/v2/sandbox.mjs …` with the test identity, a
  run folder under `/tmp/apunta-v2/<sandbox>/`, and one of the card's pinned
  ports. **7717 was never contacted and was free before and after**; no live
  data, no Claude export, no Halaxy PDF, no `recover-current-linux`, no
  `smoke-live`. `APUNTA_ALLOW_FOCUS_TEST` was never set and the owner's desktop
  session was never used for a real assertion.
- All my scratch (screenshots, capture scripts, the X11 helper, per-row env
  files, logs) is under the git-ignored `build/p33-review2/`. Every `<sandbox>`
  path below is sanitised.

## Results

| ID | Status | Exit code | Where |
| --- | --- | --- | --- |
| V0 | **PASS** (probe only; A03 already `→ RESOLVED`) | 0 | below |
| V1 | **PASS** | fmt 0, clippy 0, clippy `--all-targets` 0, test 0 (55 passed / 0 failed) | below |
| V2 | **PASS** | 0 (AppImage rebuilt, 177,515,000 B) | below |
| V3 | **PASS** | 0, 12/12 assertions | below |
| V4 | **PASS** | 0, 11/11 assertions | below |
| V5 | **PASS**, focus read **NOT RUN** (permitted, correctly not attempted) | 0, 11/11 + 1 NOT RUN | below |
| V6 | **PASS** | five separate commands, all 0 | below |

## V0 — pre-flight probe

Working directory: repository root. Start 2026-10-02T07:07:40Z.

```
$ command -v cargo rustc rustup; rustc --version; command -v Xvfb xvfb-run xdotool; pkg-config --modversion webkit2gtk-4.1
/home/villenull/.cargo/bin/cargo
/home/villenull/.cargo/bin/rustc
/home/villenull/.cargo/bin/rustup
rustc 1.99.0 (b940084b7 2026-09-28)
/usr/bin/Xvfb
/usr/bin/xvfb-run
/usr/bin/xdotool
2.52.6
exit 0
```

(`wmctrl` absent; `$HOME` shown for the toolchain path only — every other path in
this file is `<sandbox>`.) All five tools the card names are present, so V0 does
**not** route to an owner action now; A03 is recorded `→ RESOLVED` in
`docs/v2/state/cards/P3.3.json`.

## V1 — Rust: fmt, clippy, test

Working directory: `src-tauri`. `export PATH="$HOME/.cargo/bin:$PATH"` first, as
the row requires. I added `--offline --locked` to the cargo invocations (stricter
than the row: no network, no re-resolution) and additionally ran CI's stricter
`--all-targets` form. Start 2026-10-02T07:04:15Z.

```
cargo fmt --check                          exit 0
cargo clippy --offline --locked -- -D warnings            exit 0
cargo clippy --offline --locked --all-targets -- -D warnings   exit 0
cargo test  --offline --locked              exit 0   test result: ok. 55 passed; 0 failed
```

55 tests, up from attempt 1's 39. The tests that matter for this attempt are all
present and pass, and they are not decision-table only:

- `quit::tests::eight_threads_racing_for_one_quit_produce_exactly_one_winner`
  (the one-shot gate, real threads, real `Barrier`);
- `tests::the_group_id_is_handed_out_exactly_once` (the `swap(0)`, so a reaped
  group can never be signalled again);
- `tests::the_ladder_shuts_down_a_real_child_that_honours_shutdown` and
  `tests::the_ladder_signals_a_real_child_that_ignores_shutdown` (real child,
  real process group, real stdin, real exit status; the second one pays the
  card's own 10 s once);
- `lifecycle::tests::the_budgets_are_the_card_values` — `SHUTDOWN_GRACE_MS ==
  10_000`, `TERM_GRACE_MS == 5_000`. **The 10 s / 5 s bounds are unchanged** and
  asserted as card values, not thresholds.

## V2 — `tauri:build:test`

Working directory: repository root. 2026-10-02T07:04:49Z → 07:06:07Z, 78 s wall
(incremental; the release profile was already warm).

```
$ npm run tauri:build:test
tauri build --features test-identity --config src-tauri/tauri.test.conf.json
   Compiling apunta v0.0.0
    Finished `release` profile [optimized] target(s) in 29.90s
   Bundling Apunta (test)_0.0.0_amd64.AppImage (169.29 MiB)
exit 0
```

- AppImage: `src-tauri/target/release/bundle/appimage/Apunta (test)_0.0.0_amd64.AppImage`,
  177,515,000 B, mtime 2026-10-02 01:06 local.
- **Freshness (the S4 anchor):** `find src-tauri -newer <AppImage> -type f -not -path '*/target/*'`
  returns **nothing** — the bundle is newer than every `src-tauri` source file
  and newer than `build/linux-resources`. Exactly one file matches the harness's
  glob.
- **D4 closed, re-verified the way review 1 asked.** In an isolated copy with no
  `node_modules` (`build/p33-review2/ci-test/{package.json,package-lock.json}`):
  `npm ci --dry-run --offline` → `added 157 packages`, exit 0, and the plan
  contains `@tauri-apps/cli` and `@tauri-apps/cli-linux-x64-gnu` (2 lines).
  `--offline`, so nothing was downloaded and the working `node_modules` was not
  touched. In the working tree `npm ls @tauri-apps/cli` →
  `@tauri-apps/cli@2.12.1`, no longer `extraneous`. `node_modules/.bin/tauri`
  therefore comes from a clean install, not from a local leftover.
- `package-lock.json` diff is `+234/−1`: the `@tauri-apps/cli` entries plus the
  lock's root `engines` moving `">=22"` → `">=24.19.0 <25"`, which is the repair
  review 1 already accepted. No other package changed.

## V3 — `tauri-lifecycle.test.mjs launch` (sandbox port 7831)

2026-10-02T07:06:52Z → 07:06:58Z. `node --version` printed `v24.19.0` before the
row. Exit **0**, **12/12 assertions passed**.

```
PASS the app's own window is up, inside the display
PASS the window has rendered content
PASS the window is showing the app's own document
  V3 signal-quit window: 1330x950 at 36,26 on a 1400x1000 display, 981 distinct colours, document 1265 bytes
PASS server answers with this run id
PASS exactly one server process before the quit
PASS the shell exits on its own, with no SIGKILL from this harness
PASS the port is released
PASS no server process from the run survives
PASS the data lock is released
PASS the unrelated dummy is still alive
PASS ollama is still running
```

The app's own stderr carries the quit door's line, which is the D2 evidence:

```
apunta: the server is ready ({"type":"ready","port":7831,"nonce":"…","version":"0.0.0","protocol":1})
apunta: the main window will be 1330x950 physical at 17.5,12.5 logical, on a 1400x1000 display at scale 2
apunta: the main window is open on http://127.0.0.1:7831
apunta: a termination signal is closing the app; starting the quit ladder
```

**I looked at the pixels myself** (`build/p33-review2/home-persist.png`,
`import -window root` on an isolated Xvfb, 701 distinct colours). It is the
app's real home screen, not a splash and not an error page: the teal **Apunta**
wordmark, a two-step progress rail with step 1 filled teal and step 2 grey, the
heading **"Add your note format"**, the subtitle "Choose how to define it — we'll
figure out the structure for you.", and the first option cards — "My standard
progress note" (with a teal **Recommended** chip and its section list), "Upload a
blank template", "Upload a few example notes", "Describe it myself". No private
data: this is a fresh synthetic sandbox folder with no patients.

## V4 — `tauri-lifecycle.test.mjs fatal` (sandbox port 7832)

2026-10-02T07:07:08Z → 07:07:17Z. Exit **0**, **11/11 assertions passed**: both
cases, the code carried and the other code absent, splash gone, the holder still
alive at the moment the assertions passed, the dummy stopped and 7832 free
afterwards, and nothing of the run left listening.

I captured both error screens myself and read them
(`build/p33-review2/fatal-port.png`, `fatal-folder.png`, 695 / 712 colours):

- `port_in_use` — window title `Apunta — port_in_use`; body "Apunta could not
  start." / "Something else is using Apunta's port. Close it, or restart your
  computer, and try again." / "Algo más está usando el puerto de Apunta.
  Ciérralo, o reinicia el equipo, e inténtalo de nuevo." / a `port_in_use`
  chip. The splash window is gone; no spinner anywhere; the hidden 20×20 `apunta`
  helper is the only other window.
- `data_folder_in_use` — window title `Apunta — data_folder_in_use`; "Apunta is
  already open. Close the other window, or the other copy of Apunta, and try
  again." / "Apunta ya está abierto. Cierra la otra ventana, u otra copia de
  Apunta, e inténtalo de nuevo." / a `data_folder_in_use` chip. Bilingual, no
  spinner, and it is C-OWN@1's rejection example verbatim — the screen says
  "already open", not "port in use".

The codes are also visible in the app's own words on the two runs, from two
different real causes and never interchanged:

```
apunta: the server refused to start: {"type":"fatal","code":"port_in_use"}
apunta: the code means: the port was already taken
apunta: the server refused to start: {"type":"fatal","code":"data_folder_in_use"}
apunta: the code means: the data folder is already owned by a live Apunta
```

## V5 — `tauri-lifecycle.test.mjs single-instance` (sandbox port 7833)

2026-10-02T07:07:31Z → 07:07:36Z. Exit **0**, **11/11 assertions passed, 1 NOT
RUN**:

```
PASS the first instance reaches the home screen
PASS the first instance owns the run
PASS the first instance created the ownership files
PASS exactly one server process exists for the run
PASS the second launch is reaped inside the 10s quit-ladder budget
PASS still exactly one server process after the second launch
PASS the first instance is untouched
PASS the first instance still answers /api/health
PASS no second lock, database, -wal or -shm
PASS the lock on disk is still the first instance's
NOT RUN V5 focus read: APUNTA_ALLOW_FOCUS_TEST is not set for this run, and a
      focus read takes the owner focus mid-work
```

The focus read is `NOT RUN` for the reason the card names, which is correct, and
it is recorded as `NOT RUN` rather than `PASS`. It does not stand in for the
single-instance assertions above, which all passed on their own.

## V6 — lint, typecheck, bridge tests, unit tests

Repository root, 2026-10-02T07:06:18Z → 07:06:48Z. Run as **five separate
commands with five exit codes** (D5's correction), not as one `&&` chain, so no
result depends on an earlier one being green:

| Step | Exit | Result |
| --- | --- | --- |
| `npm run build:shared` | 0 | workspace build |
| `npm run lint` | **0** | eslint + prettier + URL checker + licences + UI strings |
| `npm run typecheck` | 0 | |
| `npx vitest run server/src/shell-bridge.test.ts` | 0 | **1 file, 21 passed, 0 skipped** (not a `No test files found`) |
| `npm test` | 0 | **159 files, 2148 tests passed** |

`npm run lint` is 0 at HEAD, including the `docs/v2/state/proofs/*.mjs` files
that were red in review 1 — they are clean now, and none of them is P3.3's.
`collect-licenses.mjs --check` is part of that chain and passes with
`THIRD-PARTY-LICENSES.md` untouched, as A04 requires (the CLI is a
devDependency).

The bridge's own cases cover what the card's S3 names, and two of them are worth
naming because they are the properties that are easy to claim and hard to prove:
`arrives intact when the writer exits in the same tick, through a piped stdout`
(the synchronous-write property, proved by a real child and a real pipe), and
the four end-of-file cases under "the shell disappearing" (the child EOF
containment, including *a shutdown line followed by end-of-file is one shutdown,
not two*).

## Containment after every row

| Check | Result |
| --- | --- |
| 7831 / 7832 / 7833 | free before and after every row |
| 7717 | never contacted; free |
| Ollama `/api/version` | 200 before and after every row; no model pulled, no model touched |
| AppImage FUSE mounts (`/tmp/.mount_Apunta*`) | none left |
| Bundled server processes on any run folder | none left |
| Unrelated dummy processes | alive through each run, stopped afterwards by the harness or by me |
| My own Xvfb displays (`:95`, `:96`) | stopped; no `Xvfb` process left |
| Signals sent | only to PIDs this session started |
| Live data / export / Halaxy PDFs / `recover-current-linux` / `smoke-live` | never touched |