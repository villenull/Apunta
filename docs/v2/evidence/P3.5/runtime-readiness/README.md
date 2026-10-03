# P3.5 runtime-readiness evidence

Read-only, synthetic preparation for the runtime-only continuation of P3.5
attempt 3. Companion report:
`docs/v2/state/reviews/P3.5-runtime-readiness.md`.

**Nothing here is an acceptance, a card attempt or a V-row result.** No build,
app, server, database, model, audio, microphone, `pactl`, input, display,
network, port 7717, capture or install was used. Only file reads, `node --check`
parses, and `git`/`ss`/`pgrep` inspection.

| File | What |
| --- | --- |
| `state-snapshot.txt` | HEAD, tree cleanliness, config key, scanner/voice presence, checkpoint shape, port/build-lease state. |
| `synthetic-checks.txt` | Harness and sandbox `node --check`; the V5 provenance program extracted from the card and unescaped then parsed; stale-dispatch vs current-card markers; checkpoint provenance counts; AM-190 artifact presence. |
| `v5-provenance.unescaped.mjs` | The V5 `node -e` program as it executes after Markdown unescaping (`\|`→`\|`); parses clean. Not run against real state. |
| `commands.md` | Every read-only command used, with exit status. |

## Findings at a glance

- Final attempt-3 order: V0 → V1 → V2 (single rebuild, `GSTREAMER_HELPERS_DIR`)
  → AM-190 step-2 dry plugin gate → V3 → V4 (tone 7837, silence 7839) → V5.
  Each capture mode **exactly once**.
- Checkpoint at HEAD: `attempt 3`, `BLOCKED`, 5 `sandboxRuns`, 5 attempt-1
  `PREV_DEFAULT` objects, 0 records at attempt 3. V5 needs 3 fresh attempt-3
  records + matching anchors; the five attempt-1 records are preserved and
  excluded by the attempt selection.
- One-writer handoff: root appends the three `RECORD` objects to
  `sideEffectsDone`/`sandboxRuns` between V4 and V5; the worker writes evidence
  and its return only.
- IR-09.1: the V5 command uses exact-token `awk`; the legacy `grep -c` wording
  survives in the Expected cell and its literal witnesses **must still be run
  and recorded** (AM-187), non-zero = FAIL/stop.
- Stale `dispatch/P3.5.md` (base `8783181`, attempt 1) must not be executed;
  regenerate at stable current HEAD with `--attempt 3 --port 7837`.
- Real holds: P3.4 exclusive build lease; U-2 (`GSTREAMER_HELPERS_DIR`
  inheritance) unobserved; dry plugin gate must PASS before V3/V4.
