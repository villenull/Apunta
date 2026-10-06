# P3.6 resume anchor — attempt 7 runtime (AM-214)

This file is the first thing a fresh session reads. It records what is done,
what is open, and what the next action is. Created and updated by every attempt.

## Identity

| Field | Value |
| --- | --- |
| Card | P3.6 Linux AppImage integration |
| Attempt | **7 of 3**, under AM-214 (owner-approved corrective attempts; a further one is not this session's to take) |
| Base commit (dispatch `- Base commit:` header, read by hand per S1) | `e62c94f239d634faa966636836c468d7b9cd9131` |
| Dispatch | `docs/v2/state/dispatch/P3.6-review.md`, port 7879 |
| Sandbox port | 7879 (never 7717, HS-1) |
| HEAD for every row this attempt | `f93e27d3cd9931dbc3e5b4726a1ac635d7c660e9` |
| Harness | `scripts/v2/tauri-e2e-smoke.test.mjs`, **3972 lines**, sha256 `4b6b00406eb1f7d5d9597c5441579e03c0efe4dbc668c7a399d5cd4f10a6c42f` — the source-CLEAR candidate, unmodified this attempt |
| Gate before this run | `docs/v2/state/reviews/P3.6-compat-source.md` (final source CLEAR) + `docs/v2/state/reviews/P3.6-impl7-source.md` (AM-212 A1–A3 CLEAR) |

## Row-by-row status (this attempt — actual, measured)

| Row | Status | Exit | Evidence | Note |
| --- | --- | --- | --- | --- |
| V0 | **PASS** | 0 | `V0-review-impl7.md` | 19:09:52–19:12:18Z, 146 s; producer + `tauri:build:test`; test image `aebc698e…4fb24`, 194439672 B; ran **once** |
| V1 | **PASS** | 0 | `V1-review-impl7.md` | 19:17:20–19:19:42Z, 142 s; producer **before** `npm run tauri:build`; production image `39cc92a3…f1d0`, 194439672 B; ran **once**, after V3 per S3 |
| V2 | **PASS** | 0 | `V2-review-impl7.md` | `diff -r` empty, 17 vs 17 members |
| V3 | **FAIL** | **4** | `V3-review-impl7.md` | 19:14:00–19:14:36Z, 36 s; ran **once**; **48/48 assertions, all eleven flows `NOT RUN`**; Stop 5 open |
| V4 | **PASS** | 0 | `V4-review-impl7.md` | `--appimage-extract`; licences 253144 B identical to the repo copy; both icons non-empty inside the image |
| V5 | **PASS** | 0 | `V5-review-impl7.md` | `V4-fatal.md` lines 3, 27, 34 match; P3.3's row set has not drifted |

Consolidated record, clocks, command and log sha256s: `impl7-review.md`.
Review and verdict: `docs/v2/state/reviews/P3.6-impl7.md` — **FAIL**.

## Flows — which completed, in order, by name

**None.** All eleven are `NOT RUN`, none `PASS`:

onboarding, capture, draft, refine, publish+copy, patient list, plan, briefing,
brainstorm, settings, backup.

**Cause (Stop condition 5): a screen was reached but could not be read.**
Reproduced against this run's own window capture with the shipped module's own
exported `screenWords()`:

- `tauri-e2e-smoke.test.mjs:948` requires `Number.isInteger(confidence)`;
- tesseract **5.5.3** prints the TSV `conf` column with six decimals
  (`92.934593`);
- 98 level-5 word rows in the capture, **0** survive, `screenWords` returns
  `null`, and `:1047` / `:1086` render that as the recorded causes;
- with only that test relaxed to `Number.isFinite`, the same capture yields
  **95** words and `groundPhrase(..., "Add your note format")` returns
  `exactly once` with box `{x:412, y:109, w:192, h:20}`.

The capture pipeline, `tesseract`, `groundPhrase` and the fail-closed uniqueness
rule all work; **the integer test on a float column is the whole defect.**
It was **not** repaired — AM-214 grants review and evidence writes only, and
Stop 5 forbids an edit made to open a channel. **Whether it is the only defect
is unknown, and the row is spent: it may not be repeated to find out.**

Native screenshot actually produced by the run, copied beside this file:
`impl7-v3-window-2097190.png`, sha256 `16ee9ca415cf9385b913db84708f23ae977893e32a417dd18f8b1712388783d3`,
1280x860, 885 colours — the onboarding screen the run never got past.

## What this attempt proved working (attempt 6's three FAILs)

| Attempt 6 finding | This attempt |
| --- | --- |
| A1 — `compare -metric AE` printed `0 (0)`, `Number()` → NaN | **green**: `PASS … the window capture and the display crop agree on 1280x860 pixels` |
| A2 — freshness pinned to the dispatch base `62abb28` | **green**: `PASS smoke Rule B freshness: the source set has not moved since the commit the AppImage was built from`, plus the fresh-build anchor |
| A3 — display size | **green**: `xvfb-run -a -s "-screen 0 1400x1000x24"` branch taken, window measured on a **1400x1000** display |

CSP (8 directives with nonce) and all five containment assertions also passed,
and teardown was pid-scoped throughout.

## Artefact provenance

| Artefact | Status | Path | sha256 | size | mtime |
| --- | --- | --- | --- | --- | --- |
| Test AppImage (V0) | built, exit 0 — **then removed by V1's `tauri build`** | `src-tauri/target/release/bundle/appimage/Apunta (test)_0.0.0_amd64.AppImage` | `aebc698eac3aeccbc238df95f431d2ea56e88bdd13a2b897570d04012c64fb24` | 194439672 | 2026-10-06 13:12:18 -0600 |
| Production AppImage (V1) | **present** | `src-tauri/target/release/bundle/appimage/Apunta_0.0.0_amd64.AppImage` | `39cc92a38e96eecad720783aabd8e9343666ba5a980da86652898dbfadc9f1d0` | 194439672 | 2026-10-06 13:19:42 -0600 |

**A resumed session must run V0 before V3: there is no test image on disk any
more.** `tauri build` removed it instead of leaving it beside the production
identity — the clean-or-add behaviour AM-149 records as unresolved. Each row
counts its own identity pattern, so no assertion in this attempt was affected.

## Rule B drift

**None.** `git status --porcelain` over the Rule B set was empty before every
build, and no input under the set carries an mtime newer than the artefact it
would invalidate (only `src-tauri/target/**`, which Rule B names as output). The
harness's own predicate agreed and the run continued to launch.

## Stop 8 — the four pinned tuples, re-read at HEAD

| Pin | Result |
| --- | --- |
| P3.4's Rule B bullet @ `5dcabae` | byte-identical to HEAD |
| P3.4's V3 invariant row @ `04d071e` | byte-identical to HEAD (630 chars); the four-word loop quoted in this card's May edit is inside it |
| `server/src/http/csp.ts` @ `d56af1d` | byte-identical to HEAD (5767 bytes) |
| P3.3's row set @ `321b4fa` | byte-identical to HEAD (26124 bytes) |

**No drift.** Also exercised as rows: V3 asserted the CSP header live (8
directives), V5 asserted P3.3's fatal-mode evidence.

## Whisper candidate (A06 — precondition, not this card's work)

| Field | Value |
| --- | --- |
| Path | `~/.cache/apunta-v2/whisper-src/whisper.cpp/build-vulkan/bin/whisper-cli` |
| mode | `-rwxr-xr-x` |
| size | 1064648 bytes |
| mtime | 2026-10-02 13:00:05 -0600 |

Present before V0 and untouched after; `V0`/`V1`'s `test -x` passed and the
producer reported `copied whisper-cli and 15 shared libraries`. **Nothing was
acquired, cloned, fetched or downloaded by this attempt.**

## What is open

1. **V3 `FAIL`, Stop condition 5.** All eleven flows `NOT RUN`. The blocking
   defect is identified and reproduced; repairing it means a coordinator
   amendment to `scripts/v2/tauri-e2e-smoke.test.mjs:948` and a fresh bounded
   native run. **This reviewer did none of that and claims no approval.**
2. **P3.R must not be declared.** The coordinator records P3.6's approval (or its
   refusal) first; the parent review follows that.

## nextAllowedAction

**Coordinator's decision, not an implementer's.** Either (a) authorise a
one-line harness amendment for the confidence column and a fresh bounded native
run of V3 — V0 would have to re-run first, because V1 removed the test image —
or (b) record P3.6 on the evidence as it stands. Nothing in this attempt may be
repeated: every row is spent.
