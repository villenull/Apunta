# P3.5 attempt 2 — bounded code/unit repair (D1, D2, D3)

- Authorised dispatch: coordinator, attempt 2 of 3, **code/unit repair only**,
  runtime held. `docs/v2/state/cards/P3.5.json` was set by this session to
  `attempt: 2`, `status: "IN PROGRESS"`,
  `nextAllowedAction: "code-unit-repair-only-runtime-held"`, with every
  attempt-1 criterion, side effect and run anchor preserved verbatim.
- Scope: close the two candidate source defects (D1, D2) and the false
  click-count claim (D3) that the independent review
  (`docs/v2/state/reviews/P3.5-impl1.md`) raised. D4 was left as one honest
  witness, within the card's own wording.
- **No capture row was run. No V3/V4/V5 row was re-run.** The environment fixes
  (ENV1 bundle path, A03 packages, A10 query-key rule) are outside this grant
  and were not touched. V3 stays **BLOCKED**, V4 **NOT RUN**, V5 **FAIL**; all
  five attempt-1 `PREV_DEFAULT` records and their anchors are intact.
- Runtime status is **BLOCKED, not PASS**; this repair is **SUBMITTED** pending
  independent review. Nothing was staged or committed.

## Changed paths

| Path | Change |
| --- | --- |
| `scripts/v2/tauri-audio.test.mjs` | the only feature path touched: D1 source-output mapping and D2 newest-marker rectangles, plus the live containment read that uses them. |
| `docs/v2/evidence/P3.5/V3-capture-spoken.md` | D3 only: the "all five clicks landed" claim corrected to four; `record-stop` marked never reached. Rows, anchors and BLOCKED status unchanged. |
| `docs/v2/state/returns/P3.5.md` | D3 only in the V3 criteria row, plus the attempt-2 code-only appendix. Attempt-1 history retained. |
| `docs/v2/state/cards/P3.5.json` | the authorised bookkeeping (attempt 2 / IN PROGRESS / nextAllowedAction); attempt-1 criteria, side effects and run anchors preserved verbatim. |
| `docs/v2/evidence/P3.5/attempt-2/**` | this report, the pure-test script and its exact output. |

Not touched: the other three feature paths (`web/src/main.tsx`,
`src-tauri/src/permissions.rs`, `src-tauri/src/main.rs`), any card text or
`Expected` cell, any contract, `OWNER-ACTIONS.md`, `ACQUISITION.md`,
`package.json`, `scripts/v2/sandbox.mjs`, P3.4's proposal/ignored model or any
P3.4 file.

## D1 — `pactl list short source-outputs` is resolved through the source table

The shipped predicate compared column `[2]` of a source-outputs row to a source
name. On this host's `pactl` (17.0) the short format is
`%u\t%u\t%s\t%s\t%s` with column `[1]` the **numeric source index** and column
`[2]` the **numeric client index**, so the old check could never see a stream on
`apunta_p35_mic` and could never see a leak on the owner's microphone: the
safety-critical assertion was vacuous. That predicate is gone.

Three pure functions now do the work, and the live read calls them:

- `parseSourceTable` (`scripts/v2/tauri-audio.test.mjs:271`) builds a
  `source index → source name` map from `pactl list short sources`.
- `classifySourceOutputs` (`:300`) resolves every source-outputs row through
  that map and groups the result into `virtual`, `realMic` and `unrelated`, with
  `all` retained for the evidence. The virtual test is
  `sourceName === SOURCE_NAME`; the leak test is
  `sourceName.startsWith(REAL_MIC_PREFIX)` — resolved names, never raw columns.
- `classifyPactlReads` (`:335`) checks both command exit codes first.
- The live block (`:1410`) reads both commands while recording, prints both
  verbatim, and classifies.

**Fail-closed, not "unknown → safe":** a non-zero exit from either command, a
row with too few columns, a non-numeric column, a duplicated source index, an
empty source name, or a source-output whose source index is not in the table all
throw. The live block catches the throw, reports `BLOCKED`, and returns — the
`finally` then stops the shell by pid and runs the teardown, so the default
source is restored and both modules are unloaded on the fail-closed path too.
An unrelated-but-mapped stream is named and recorded (a justified known
exception: it is neither the virtual source nor the owner's microphone), not
silently treated as safe. A stream resolved to the owner's microphone is the
stop condition: the app is stopped by pid, the teardown restores and unloads, and
the row reports `BLOCKED`. No pre-launch source-outputs acceptance was added —
the card defines none, and the readback that the virtual source is the default
before launch is the existing pre-launch check and is unchanged. The read is one
sample, as the card says it "narrows the window; it does not close it".

The test script extracts these exact function bodies from the shipped file and
evaluates them — it does not copy a predicate. Fixtures and results:
`repair-verify-output.txt`, 30/30 checks, exit 0.

- virtual-only → `virtual=1, realMic=0, unrelated=0`.
- virtual + physical leak → `virtual=1, realMic=1`, resolved name is the
  microphone.
- real-only → `virtual=0, realMic=1`.
- unrelated source → `unrelated=1`, no leak.
- stale/unknown source ID → throws.
- missing source in the table → throws.
- duplicate source index → throws.
- malformed source table row → throws.
- malformed source-outputs row and non-numeric column → throw.
- failed source-outputs command and failed sources command → throw.

## D2 — the own `data-testid` rectangles come from the newest marker only

`readReported` used to union `tid_*` fields across every audio marker and never
clear them, so a marker that omitted an element could not remove its rectangle,
and a partial newer marker could merge its coordinates onto an older rectangle's
dimensions.

`tidsFromNewestMarker` (`scripts/v2/tauri-audio.test.mjs:1030`) now reads the
**newest** audio marker alone and `readReported` uses it (`:1106`). A test id is
installed only when that one marker carries all four of `x`, `y`, `w`, `h` as
finite numbers with positive width and height; a test id the newest marker omits
is absent. A partial or truncated newer marker therefore installs nothing and
cannot resurrect or corrupt an older rectangle. There is deliberately **no
fallback to an older complete marker**: a truncated newer marker could have
dropped a test id precisely because its element left the screen, so falling back
would resurrect a removed target — the failure the card names. P3.4's text-leaf
reader (`state.leaves`) is untouched — no inherited reader was rewritten.

Fixtures and results (`repair-verify-output.txt`):

- one complete marker → both rectangles installed.
- newest marker omits `record-start` → `record-start` gone (no history union).
- a newly published rectangle appears.
- an older removed rectangle is not resurrected.
- a partial newer marker installs no partial rectangle and does not merge.
- a `NaN` dimension and a zero dimension each install nothing.
- a dashed test id with all four fields installs.
- no markers installs nothing.

## D3 — the click-count claim corrected, nothing reclassified

Attempt 1 landed **four** card clicks (`home-action-note`, `home-search`, the
result option, `record-start`); the onboarding `Continue` is a separate app
click; `record-stop` was never reached because the row failed
`the phase reached recording` (`record-start+capture-error`) and returned before
the fifth click. `V3-capture-spoken.md` now says so, and the return's V3 row now
says so. V3 stays **BLOCKED**, V4 **NOT RUN**, V5 **FAIL**; all five
`PREV_DEFAULT` records and anchors are unchanged.

Note, for the coordinator: the checkpoint's own V3 criteria note still carries
the attempt-1 wording "All five real clicks landed", because the coordinator's
instruction was to preserve all attempt-1 criteria verbatim. It is superseded by
the corrected evidence and is flagged rather than silently edited.

## D4 — kept as one honest witness

The card says the containment read "narrows the window; it does not close it".
No continuous guarantee and no new acceptance were invented. The single sample
is retained, now correctly resolved, and it takes place before the
"no capture stream on the owner's real microphone" assertion, which stops the
app by pid on a leak. No extra attempts or host microphone effects were used to
debug it.

## Commands run (exact) and exits

| Command | Exit | Purpose |
| --- | --- | --- |
| `~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node --check scripts/v2/tauri-audio.test.mjs` | 0 | pinned-Node syntax |
| `~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node docs/v2/evidence/P3.5/attempt-2/repair-verify.mjs` | 0 | 30/30 pure checks |
| `npx eslint scripts/v2/tauri-audio.test.mjs docs/v2/evidence/P3.5/attempt-2/repair-verify.mjs` | 0 | source-scope lint clean |
| `npx prettier --check <changed files>` | 0 | formatting clean |
| `npm run typecheck` | 0 | all workspaces |
| `npx eslint .` | 1 | 60 `no-console` errors, all in committed P3.4 `docs/v2/evidence/P3.4/**` scratch (58) and the attempt-1 independent reviewer's untracked `docs/v2/evidence/P3.5/review-1/*.mjs` proofs (2). **Attributed, not waived**; none is in a file this session changed. |

No app, server, database, build, LLM, model, audio, microphone, display, input,
pactl mutation, network, acquisition, install or port 7717 was used. The pure
test only reads one repository file; it imports nothing from the harness at
runtime.

## Status

Code repair **SUBMITTED** pending independent review. Runtime **BLOCKED, not
PASS**: V3 cannot run until the environment is fixed and the coordinator
authorises a fresh attempt. One bounded repair pass, as dispatched.
