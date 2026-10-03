# P3.4 attempt 5 — implementation evidence (code/unit only)

Role: **implementer, code/unit preparation only.** The owner authorised exactly
one attempt 5 (AM-189) and the assertion/measurement package AM-188. This
packet prepares the two feature files and proves the port against the reviewed
pure model; it runs **no** acceptance row. V0, V1, V2, V3 and V4 are the root's
to run once, in order, after its independent review.

**No runtime.** No app, build, server, database, model, audio, input, display,
download, install or network; port 7717 never contacted; no live data folder
opened. Every execution below is `node --check`, `node --test` over synthetic
fixtures, `npx eslint`/`npx prettier --check`, or `tsc` (typecheck). The only
`spawn` is a local `node -e` child in one adapter test — no app, no server.

Base: `6974943`, `main`. The two source paths are byte-identical between
`6974943` and current `HEAD` (`git diff --stat 6974943 HEAD -- web/src/main.tsx
scripts/v2/tauri-security.test.mjs` is empty), so the diff below is the change
against the card's base. Nothing staged, nothing committed.

## Files written

| Path | What |
| --- | --- |
| `web/src/main.tsx` | the AM-188 hook delta, **inside `installObservationHook()` only** |
| `scripts/v2/tauri-security.test.mjs` | the AM-188 reader/selection/deadline/poll/solve/orchestration port, the new (a), the widened gate, the two-arm cascade, the single-shape `spawnAsync`, the `GDK_SCALE=1` headless env, and the exports/main guard for testability |
| `docs/v2/evidence/P3.4/attempt-5/implementation/ported-model.test.mjs` | the reviewed model's own 73 adversarial cases, re-pointed at the **shipped** harness functions |
| `docs/v2/evidence/P3.4/attempt-5/implementation/adapters.test.mjs` | the harness-specific real-IO seam: real clock, single-shape `spawnAsync`, child-stderr frame adapters |
| `docs/v2/evidence/P3.4/attempt-5/implementation/README.md` | this file |

P3.5's seam is untouched: the P3.5 block of `web/src/main.tsx` extracts
byte-for-byte identical between `6974943` and the working tree
(`sha256 b2c92205…`), and no audio/P3.5 line appears in the diff.

## `web/src/main.tsx` — the hook delta

Inside `installObservationHook()`, and nothing else in `web/`:

- the nine existing facts (`href title tauri tauriInternals probe scriptText
  styleAttr styleComputed attempt`) are retained unchanged; added to the same
  fact line: `ipc`, `ipcInvoke`, `ipcProbe`, `ipcProbeMsg`, `vpW`, `vpH`,
  `ptrN`, `ptrCX`, `ptrCY`, `clickN`, `clickCX`, `clickCY`, `clickTag`,
  `clickTestId`, `clickText`;
- one run-local short safe-integer `epoch` per `sendRects` publication, and the
  rectangle key becomes the **global** index `index * batchSize + at`, plus the
  `i{n}_t` (tagName) and `i{n}_d` (data-testid, `''` when absent) fields;
- one one-shot IPC probe `invoke('plugin:event|listen', …)` that records
  `pending` → `rejected`/`resolved` and the exact rejection message;
- one `pointermove` listener and one capture-phase `click` listener, both read
  by the **existing** 250 ms change-only poll — no second hook, no second gate,
  no second interval.

The single non-loopback literal and its one `// eslint-disable-next-line
no-restricted-syntax` are unchanged from attempt 3/4.

## `scripts/v2/tauri-security.test.mjs` — the port

The reviewed pure model `build/p3.4-spec-v5-repair2/model.mjs` (IR7 CLEAR,
SHA `dbca7da9…`, 73/73) is ported function-for-function into the harness with
the same names and signatures: `createBatchReader`, `selectTarget`,
`targetCentre`, `createTargetDeadline`, `raceDeadline`, `awaitGuarded`,
`dispatchGuarded`, `pollObservation`, `checkCommand`, `solveTransform`,
`toNativePoint`, `containedInWindow`, `checkReadback`, `compareDescriptor`,
`landingFact`, `rectSignature`, `calibrationTargets`, `firstFactGate`,
`cascadeCause`, `checkNoIpc`, `guardedMove`, `runClick`, `runFlow`. No
executable model is imported; the model's bytes are read only as the port
reference.

The real IO seam is adapted, not modelled: `createRealClock` (absolute `at` →
`setTimeout` delay), the real command seam `makeOps` (`xdotool
getwindowgeometry --shell` / `mousemove --sync` / `getmouselocation --shell` /
`click 1`), and the child-stderr frame adapters `markerLinesOf`/`frameFrom`/
`tagForLabel`. `spawnAsync` keeps one result shape `{code, signal, stdout,
stderr}` — backward compatible, every existing caller unchanged. A hung
dispatch is stopped by its **own pid** (`killActiveCommands`, no `pkill`), and
the `finally` block clears any command still running, so no process is stranded.

Behaviour changes, all required by AM-188 and none of them a loosening:

- the gate widens from `href` alone to `href` **and** `ipcProbe` **present**
  (45 s kept); a missing gate records **all five** rows `NOT RUN` with the
  two-arm cause (`cascadeCause`);
- (a) becomes the AM-188 assertion: `tauri === 'undefined'`, `ipc === 'object'`,
  `ipcInvoke === 'function'`, `ipcProbe === 'rejected'`, `ipcProbeMsg` exactly
  the ACL denial; `resolved` fails, `pending` at the 30 s deadline fails;
- (d)'s handler half opens the note by the measured calibration path: read the
  window once, wait for the viewport, take two **measured** bootstrap points
  (containment before, read-back after), solve the per-axis affine map with
  every check before use, select the row by its unique `(label, tag)` pair,
  warp, take the one fresh ≤2 px client witness, dispatch **exactly one** click,
  and land on the patient `href` change and then on `scriptText === 'true'`;
- `GDK_SCALE=1` is set in the **private headless shell environment** (the
  existing `launchApp` env block), reported explicitly on stdout, and never
  masks a measurement or assertion — the calibration still solves the real
  per-axis scale from two measured points.

Preserved unchanged: the (b) and (c) refusal assertions, the (d) header half,
(e), the five containment checks, the pid-only stop, the release-invariant
counts, the `security`-only mode dispatch, and every existing output line the
card's V2 row asserts.

For testability only, the ported functions are `export`ed and the top-level
`main()` runs only when the file is the entry point (`import.meta.url ===
pathToFileURL(process.argv[1]).href`). Running the harness as a script is
unchanged; importing it runs nothing.

## Commands, exits and counts

Pinned Node **v24.19.0**
(`~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node`).

| Command | Exit | Result |
| --- | --- | --- |
| `node --check scripts/v2/tauri-security.test.mjs` | 0 | syntax OK |
| `node --test …/implementation/ported-model.test.mjs` | 0 | **tests 73, pass 73, fail 0** |
| `node --test …/implementation/adapters.test.mjs` | 0 | **tests 7, pass 7, fail 0** |
| both files together | 0 | **tests 80, pass 80, fail 0** |
| `npx eslint web/src/main.tsx scripts/v2/tauri-security.test.mjs …/implementation/*.mjs` | 0 | clean |
| `npx prettier --check` on the same four files | 0 | clean |
| `npm run typecheck` | 0 | shared, server, installer, web, e2e all pass |
| `node scripts/v2/tauri-security.test.mjs badmode` (`APUNTA_V2_SECURITY_XVFB=1`) | 2 | unknown mode refused, usage printed |
| `import('./scripts/v2/tauri-security.test.mjs')` | 0 | 39 exports, `main()` not run |
| `sha256sum build/p3.4-spec-v5-repair2/model.mjs` | 0 | `dbca7da9ece908729431dbf8e83c8e66d014cbb7b87e7abc2f11480cb33ed9f4` — matches REPAIR2.md §0 / IR7 |
| `git diff --stat 6974943 HEAD -- web/src/main.tsx scripts/v2/tauri-security.test.mjs` | 0 | empty — the base paths are untouched by intervening commits |

## What this proves, and what it does not

- It proves the **port**: the shipped harness functions behave identically to
  the reviewed pure model on that model's own 73 adversarial fixtures —
  command failure, hung dispatch, hung poll, partial/delayed facts, scale 1.5
  and 2, truncated header with no fallback, 1 px read-back, wrong descriptor,
  ambiguous selection, the deadline, the gate, the assertion and the cascade —
  plus 7 adapter cases for the real clock, the `spawnAsync` shape and the
  child-stderr frame.
- It does **not** prove WebKitGTK input delivery: not that a warp-driven
  `pointermove` reaches the page under `xvfb-run`, not this host's native
  geometry, not this host's exact ACL string. Every fixture is synthetic. That
  is exactly what V0–V4 are for, and none of them was run here.
- `readObservations`' rectangle map is now unused (the batch reader replaced
  it); the function and its marker count are retained because the gate and the
  containment check use `markerLines`.
- The 30 s deadline, the 45 s first-fact window and the 30 s assertion window
  keep their lengths; no timeout was widened, no count lowered, no assertion
  relaxed (HS-7).
- No card, checkpoint, dispatch, tool or manifest was edited; no acceptance row
  was attempted.

**Uncommitted, as instructed. No `git add`, no commit, no push.**
