# Review 1 (`P3.3-review1.md`) — disposition of every finding, attempt 2

One row per finding, with what was done, what proves it, and — where a finding is
only partly closed — exactly what is left and why. Nothing here claims a fix that
was not built or a result that was not measured.

## Blocking

| ID | Severity | Disposition | Where |
| --- | --- | --- | --- |
| D1 | HIGH | **Fixed**, by two independent mechanisms rather than one | `src-tauri/src/quit.rs`, `src-tauri/src/main.rs` (`WindowEvent::CloseRequested` + `begin_quit`), `server/src/shell-bridge.ts` (`onParentGone`) |
| D2 | HIGH | **Fixed** | `src-tauri/src/quit.rs` (one-shot gate), `begin_quit`'s single `swap(0)` |
| D3 | HIGH | **Fixed in the workflow; not claimed as run** | `.github/workflows/ci.yml` |
| D4 | HIGH | **Fixed** | `package.json`, `attempt2-V2-appimage.md` |

### D1 — a window close orphaned the server

Two separate things were wrong and both are addressed.

**The app never heard a close.** The ladder lived only in the `ExitRequested`
arm. The main window's `CloseRequested` is now a first-class door: the handler
prevents the close (so the window outlives the cleanup) and hands the *same*
`begin_quit` gate the other two doors use.

**The review's reproduction used a forced destroy, not a close.** `xdotool
windowclose` is `XDestroyWindow` (from this host's own `man xdotool`), and
`xdotool windowquit` sends `_NET_CLOSE_WINDOW`, a window-manager message that
nothing routes under `xvfb-run` (`strings libxdo` → `XSendEvent[_NET_CLOSE_WINDOW]`;
measured twice: the window stayed, the process stayed, `/api/health` stayed 200).
So on this host `CloseRequested` **cannot** be reached from outside, and the
review's warning against assuming it handles fatal exits is right.

The forced-destroy path is therefore reproduced as its own case and contained by
a mechanism that does not need the shell at all: the shell holds the write end of
the child's stdin, so when GDK aborts it, the child sees **end-of-file** and
closes itself. Measured, on the built AppImage: port released, **no server
process survives**, data lock released, dummy and Ollama untouched, 12/12.

Proof it is not assumed: `attempt2-V3-launch.md`'s forced-destroy log, and the
shell's own stderr showing `Gdk-WARNING … BadDrawable` — i.e. the shell died
where it always did and the containment came from the child.

The cooperative close is recorded **NOT RUN** with its cause, never `PASS`.

### D2 — SIGTERM livelocked the shell at ~4.3 cores

The mechanism the review identified is gone: `ExitRequested` no longer calls
`prevent_exit()` unconditionally and no longer spawns a ladder thread. One
`QuitGate` decides, with `compare_exchange`, so exactly one caller in the process
ever runs the ladder; the exit is deferred while `in_progress()` and allowed
through the moment the ladder calls `finish()`.

Fixed in the same change as D1, as the review required — the two are the same
missing abstraction.

Proof: 5 gate tests including an **8-thread race** that asserts exactly one
winner, plus `the_ladder_shuts_down_a_real_child_that_honours_shutdown` and
`the_ladder_signals_a_real_child_that_ignores_shutdown`, which run the real
ladder against real processes and assert real exit statuses; and the live signal
run, where the shell exits on its own with no SIGKILL from the harness and the
whole run's CPU is not observed to spin.

### D3 — the CI `rust` job could not pass

The diagnosis was accepted and is correct: `tauri` 2.12.1's default features pull
`wry` → `webkit2gtk-sys` into the graph, whose build script exits non-zero when
`pkg-config` cannot find the library, so **clippy and test cannot compile**
without the GTK/WebKitGTK development packages — the old comment claiming they
were a packaging-only prerequisite was wrong and said so misleadingly.

The job now installs `libwebkit2gtk-4.1-dev`, `libgtk-3-dev` and
`libayatana-appindicator3-dev` (A03's own Ubuntu names) before the three checks,
inside CI only, and the comment explains why compiling needs them.

**This attempt has not run hosted CI and does not claim a CI pass.** What it can
say: the same three commands, with the same flags and the same working directory
(`src-tauri`), were run locally and passed (`attempt2-V1-rust-toolchain.md`). D12
is folded in: the two unpinned third-party actions are gone, and `rustup component
add rustfmt clippy` uses the toolchain the image already ships.

### D4 — `@tauri-apps/cli` was in the lock but not in `package.json`

`package.json` now declares `"@tauri-apps/cli": "^2.12.1"` — exactly the range
the lockfile's root entry had already resolved. Declaring it reconciled
`package.json` **to** the lock: `git diff --stat package-lock.json` is unchanged
at `+234/−1`, so no re-resolution, no new package and no download.

Proven the way the review asked — an isolated copy with no `node_modules`:

```
cd build/p33-correct-clean && npm ci --dry-run --offline
add @tauri-apps/cli-linux-x64-gnu 2.12.1
add @tauri-apps/cli 2.12.1
added 157 packages in 259ms      exit 0
```

`--offline` means the plan was resolved from the npm cache and **nothing was
downloaded**, and the working `node_modules` was never touched. In the working
tree `npm ls @tauri-apps/cli` is no longer `extraneous` and `node_modules/.bin/tauri`
resolves. The AppImage was then rebuilt from the corrected state, so V2 is
reproducible from a clean install.

## Evidence and verdict defects

| ID | Severity | Disposition | Where |
| --- | --- | --- | --- |
| D5 | HIGH | **Fixed** — V6 is five separately recorded commands; lint is **0** | `attempt2-V6-lint-typecheck-tests.md` |
| D6 | MEDIUM | **Fixed** — exact name + owning pid + size + geometry + render evidence | `scripts/v2/tauri-lifecycle.test.mjs`, `attempt2-V3-launch.md` |
| D7 | MEDIUM | **Fixed** — three quit cases; escalation reported and required absent | same |

### D5 — V6 was recorded PASS on a red row

V6 is now five commands with five exit codes, each executed on its own, so no
result depends on a chain reaching it. `npm run lint` exits **0**. Attempt 1's
own `V6-lint-typecheck-tests.md` is left exactly as written, including its
`PASS`-with-lint-1 error.

Two things are recorded rather than smoothed over: the first lint run of this
attempt was red **on this card's own harness** (prettier) and was fixed, not
ignored; and the first `npm test` exited 1 on an unrelated file's 5 s timeout
under load, which passes alone and passes on re-run, with **no timeout raised and
no file skipped**.

### D6 — the home-screen assertion was vacuous

All three parts of the correction are in, and the review's own diagnosis was
verified on the built binary (the hidden `apunta 20x20` window does match a
case-insensitive `^Apunta$` first).

- **Exact visible window owned by the app**: name compared as the exact string
  `Apunta`, `WINDOW_PID` equal to this run's shell, at least 400×300, and the
  rectangle required to lie inside `xdotool getdisplaygeometry`.
- **Render evidence proves app content**: three independent pieces, because a
  non-uniform screenshot alone could be a splash or an error page — a polled
  capture with ≥ 8 distinct colours (measured 179/271/290; the same unpainted
  window measures 2), the **document the server actually served** at that origin
  (200, `text/html`, 1265 bytes, `id="root"` present), and the title/pid/size.
- **Window geometry scoped to the sandbox display**: asserting it exposed a real
  defect — the app's window was genuinely **off-screen** (2560×1720 at
  `-960,-620` on 1400×1000) because a fixed size plus `center()` exceeds small
  displays, and because the 880×600 *logical* minimum is 1760×1200 *physical* on
  a scaled display, clamping the window back up to its own minimum. The app now
  fits both the requested size and the minimum to the monitor, computing in
  physical pixels and dividing by the scale factor. The harness also names its
  own `xvfb-run` screen (`-screen 0 1400x1000x24`) instead of inheriting
  `xvfb-run`'s 640×480 default, which was smaller than the app's minimum window.

No owner focus was taken; `xdotool` is used purely as a reader (`search`,
`getwindowname`, `getwindowgeometry`, `getwindowpid`, `windowclose`,
`windowquit`) and `import`/`convert` as capture tools.

### D7 — neither real quit direction was asserted

`stopPid` now **returns** whether it escalated, and the row requires the shell to
be gone **without** it. Three separate cases, each with the full containment set:
the port released, **no surviving server process** (polled, because a free socket
does not prove a reparented server is gone — that was D1's exact residue), and
the data lock released or naming a dead pid.

Signal and cooperative close are separate rows. The forced-destroy case is a
third and is explicitly **not** labelled a native close.

## Source defects

| ID | Severity | Disposition |
| --- | --- | --- |
| D8 | MEDIUM | **Fixed** — parsed scheme/host/effective port, never a prefix |
| D9 | MEDIUM | **Fixed** — the dead guard is gone and the claim is now true |
| D10 | LOW | **Deliberately not done**, and why |
| D11 | LOW | **Fixed** |
| D12 | LOW | **Fixed** (folded into the CI rewrite) |
| D13–D15 | INFO | unchanged; D15's `frontendDist` note still stands for P3.4/P5.4 |

### D8 — `on_navigation` was a string prefix

`is_allowed_origin` parses both sides and compares `scheme()`, `host_str()` and
`port_or_known_default()`. Four unit tests cover the exact cases named:

- a **port suffix**: `http://127.0.0.1:78310/` against `…:7831` — refused;
- **userinfo**: `http://127.0.0.1:7831@evil.example/` — refused. Worth being
  precise: the installed `url` parser rejects that form outright (`:7831@` is not
  a valid port), so it never reaches the comparison; the test names which of the
  two defences stopped each case and **fails if neither was exercised**, so it
  cannot quietly become a test of nothing. The prefix check would have admitted
  it, which was the actual defect.
- **off-origin**: `localhost`, `evil.example`, `127.0.0.1.evil.example`,
  `[::1]`, `https:`, `file:`, no port at all — all refused.
- `port_or_known_default` is used so `http://127.0.0.1/` cannot match a
  configured `http://127.0.0.1:80/`, asserted directly.

### D9 — a dead guard whose comment claimed a guard

The `if` body that was empty but for a comment is deleted, and the production
branch now **actually refuses** `APUNTA_PORT=7717`, so the live port is refused
in both identities as the comment claims. Two new tests cover the production
branch; the legitimate non-live-port-with-override shape is covered too, so the
fix cannot be mistaken for "production can no longer be exercised".

### D10 — no environment scrub (NOT done, deliberately)

`spawn` overrides `PATH` and the four `APUNTA_*` bundle paths and inherits the
rest, so the child's environment carries the caller's variables. The review
correctly said **no contract demands a scrub** and rated it LOW, and a scrub is
exactly the kind of speculative hardening this correction was told not to add: it
would need an allow-list decision about which variables the bundled server may
see, that belongs to a later card rather than to a defect fix, and getting it
wrong breaks the server in a way nothing here would catch. Left unchanged and
recorded.

### D11 — a Tokio worker blocked for the shell's whole life

`drive` now runs on `tauri::async_runtime::spawn_blocking` and waits with
`recv_timeout` rather than a bare `recv()` loop. A long-lived blocking receive no
longer occupies an async worker.

### D12 — unpinned third-party actions in CI

`dtolnay/rust-toolchain@stable` and `Swatinem/rust-cache@v2` are removed. The
image already ships Rust and rustup, so `rustup component add rustfmt clippy`
covers the only real gap, with no ACQUISITION row needed and nothing fetched from
GitHub at run time.

## Low, informational and reconciled

- **D13** — the child's stdout carries pino log lines alongside the bridge JSON,
  so "exactly one JSON line" is not literally true. Unchanged: the line is read,
  rejected as `Unreadable`, logged and ignored, which is the correct handling and
  is visible in every V3 log.
- **D14** — reconciled in review, unchanged.
- **D15** — unchanged. `tauri-plugin-updater` is declared and unregistered (P5.4
  owns the update code), and `frontendDist: "ui"` points at the shell's own
  splash/error assets, which is harmless today because the main window uses
  `WebviewUrl::External` — flagged again for P3.4/P5.4.