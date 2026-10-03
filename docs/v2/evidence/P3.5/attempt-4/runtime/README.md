# P3.5 — attempt-4 runtime, once-only evidence (owner amendment AM-194)

The once-only runtime of `P3.5` **attempt 4**, run once on 2026-10-03 on `main`
at `3f87a8b` (runtime base `498cc98`, CLEAR source candidate `5857079`, harness
`85fbb13d`). Raw output and logs only: every number here was printed by a
command in this folder. Nothing was edited, relaxed or retried; no attempt 5, no
counter reset, no row re-run, no source change.

Owned by this runtime pass alone: this folder, the checkpoint append in
`docs/v2/state/cards/P3.5.json`, the append to `docs/v2/state/returns/P3.5.md`,
and the card-required V0 witness `docs/v2/evidence/P3.5/V0-host-and-build.md`.
The sibling `attempt-4/source-review/**` and `attempt-4/runtime-readiness/**`
were read and never written, moved or deleted.

## Row table

| Row | Run at (UTC) | Exit | Status | Evidence |
| --- | --- | --- | --- | --- |
| STEP-0 (AM-190 prerequisite read) | 22:35 | **0** | PASS | `00-step0.txt` |
| row-cell parse and `bash -n` | 22:36 | 0 | 6/6 cells | `01-row-cells-parsed.txt`, `02-row-cells-verified.txt` |
| V0 host and build probe | 22:36:41 → 22:36:43 | **0** | **PASS** | `03-V0.txt` |
| V1 30 s fixture + silence | 22:37:12 | **0** | **PASS** | `04-V1.txt` |
| V2 the single flagged rebuild | 22:37:56 → 22:39:47 | **0** | **PASS** | `05-V2.txt` |
| AM-190 four dry AppDir inspections | 22:39 | **0** | **PASS** | `06-am190-four-dry-inspections.txt` |
| V3 capture | 22:39:52 → 22:40:11 | **0** | **PASS**, 35/35 | `07-V3.txt` |
| V4 tone (7837) + silence (7839) | 22:40:18 | **2** | tone **PASS** 35/35; silence **NOT RUN** | `08-V4.txt` |
| AM-187 literal witnesses + V5 | 22:42:57 | **1** | **FAIL** (provenance only) | `09-am187-witnesses-and-V5.txt` |
| cleanup verification, from outside | 22:43 | 0 | clean | `10-cleanup-verification.txt` |

## The one failure, stated exactly

`V4`'s cell is a single `&&` chain. The tone case on 7837 passed 35 of 35. The
chain then reached its own `node scripts/v2/sandbox.mjs env --port 7839`, which
**refused and exited 2** before writing anything:

```
refusing data folder /tmp/apunta-v2/2026-10-03T22-40-18-947Z-72d61c98/data: it equals
(or sits inside) the platform default /tmp/apunta-v2/2026-10-03T22-40-18-947Z-72d61c98/data.
Sandbox runs never touch the live data folder.
```

The cause is inside the card's own cell, not in the source under review: the
tone env file, sourced earlier in the same chain, leaves `APUNTA_DATA_DIR`
exported in that shell, and `resolveSandboxDataDir` (`scripts/v2/sandbox.mjs:176-195`)
computes the platform default **from `process.env`**, so on the second call the
inherited sandbox data folder *is* the platform default and the C-ISO@1 guard
refuses. Consequences, all verified: `/tmp/apunta-v2-p3.5-v4-silence.env` is
empty, no run folder was created for 7839, no sink or module was created, port
7839 was never bound, no capture record exists for `V4-silence`.

The silence case was **not** started separately and the cell was **not** re-run,
so this attempt proves tone discrimination and proves **nothing** about silence
in either direction. The failure stays recorded. No source repair was made and
none is claimed.

`V5` then failed closed for exactly that reason —

```
FAIL: no sandboxRuns entry names step V4-silence at attempt 4; a PREV_DEFAULT
record with no matching capture run cannot be identified, so the baseline is unverifiable
```

— while its **live half passed in full**: the default source is the owner's USB
microphone and all four exact-token residue counts are 0. Provenance was not
repaired, invented, sorted, deduplicated, restamped or deleted.

## Provenance actually created

| Step | attempt | runId | dateUtc | prevDefault | sinkId | srcId |
| --- | --- | --- | --- | --- | --- | --- |
| V3 | 4 | `2026-10-03T22-39-52-770Z-69fe0aa7` | `2026-10-03T22:39:56.098Z` | `alsa_input.usb-UGREEN_Camera_2K_UGREEN_Camera_2K_SN0001-02.analog-stereo` | 536870916 | 536870917 |
| V4-tone | 4 | `2026-10-03T22-40-18-947Z-72d61c98` | `2026-10-03T22:40:22.023Z` | `alsa_input.usb-UGREEN_Camera_2K_UGREEN_Camera_2K_SN0001-02.analog-stereo` | 536870916 | 536870917 |

Both objects are byte-equal to the runs' own `p3.5-capture-record.json` files and
to their `RECORD {…}` stdout lines; `11-checkpoint-before-append.json` and
`12-checkpoint-after-append.json` show the checkpoint either side of the append.
The five attempt-1 and two attempt-3 records, their seven anchors and both
`priorAttempt1Criteria` and `priorAttempt3Criteria` are untouched.

## What the run actually establishes

- **AM-194's patch did what it was approved to do.** V3 and V4-tone both resolved
  `pactl list short source-outputs` rows whose client column is the literal `-`
  (`8607 8599 - PipeWire float32le 2ch 48000Hz`) — the read that stopped both
  capture rows in attempt 3 — and then reached the assertions behind it:
  containment on `apunta_p35_mic` with no stream on the real microphone,
  `levelPeak` not 0, the marker delivered on the child stderr inside the
  `apunta: ignoring a bridge line (Unreadable):` wrapper, and
  `whisper_model_missing` surfaced for real WAV payloads, which is this card's
  designed no-model state and not a defect.
- **Containment held on every path.** Only the created virtual source was ever the
  capture device; `pactl list short source-outputs` shows 0 streams on
  `alsa_input.usb-UGREEN` and 0 on `apunta_p35` afterwards.
- **Not established:** anything about the silence mode, and every word-level
  claim. `GET /api/notes` was empty before and after V3; that is recorded as a
  vacuous precondition, not as evidence. Words remain **S4a.2's**.

## Containment and cleanup, verified from outside

`10-cleanup-verification.txt`: no AppImage, harness, Xvfb, `paplay` or sandbox
server process of this run survives; ports 7837 and 7839 are free; the default
source is back to `alsa_input.usb-UGREEN_Camera_2K_UGREEN_Camera_2K_SN0001-02.analog-stereo`;
0 exact-token lines in `pactl list short sources` and `sinks`; 0 loaded
`module-null-sink` / `module-remap-source` modules naming `apunta_p35`;
`build/p3.5-web` and `build/linux-resources/web/dist` are gone by V2's own trap
and `web/dist/assets/*.js` reads 0 for the marker in every file. `ollama serve`
is pid 1123 before and after — untouched.

## Files

| File | What |
| --- | --- |
| `00-step0.txt` | AM-190 STEP-0 fail-closed prerequisite read. |
| `01-row-cells-parsed.txt` | The six card rows parsed through `plan-lib.mjs`'s `parseCells`, three cells each, card and dispatch identical. |
| `02-row-cells-verified.txt` | Each command cell byte-identical to the readiness witness, no Markdown escape surviving, `bash -n` exit 0 ×6. |
| `03-V0.txt` … `09-…` | Raw row output with start/end stamps and exit codes. |
| `10-cleanup-verification.txt` | Post-run verification from outside the rows. |
| `11-…` / `12-checkpoint-*.json` | The checkpoint immediately before and after the provenance append. |

The runtime's scratch is git-ignored `build/p35-final-runtime4/`
(`.gitignore:55 build/`, checked with `git check-ignore -v`). Nothing is staged
or committed. `docs/v2/evidence/P3.5/V1-fixture.md`, `V2-test-build.md`,
`V3-capture-spoken.md`, `V4-non-speech.md` and `V5-containment.md` were left
exactly as earlier attempts wrote them: this run's write grant named the V0
witness only, and inventing rewrites of the others is not evidence.