# P3.6 V3 — attempt 7 runtime (AM-214), reviewer evidence

| Field | Value |
| --- | --- |
| Row | **V3** — native UI, eleven flows, CSP, five containment assertions |
| Order | run **once**, after V0 succeeded and before V1 (S3) |
| Decoded command sha256 | `c117b9f3991273149ab7d5f6fffe6a6849d996b5055be89da9fd4b03fdbaa520` (`bash -n` clean) |
| Started (UTC) | **2026-10-06T19:14:00Z** |
| Ended (UTC) | **2026-10-06T19:14:36Z** |
| Elapsed | 36 s |
| **Exit code** | **4** → **FAIL** (harness's own `NOT RUN` exit; expected cell says exit 0) |
| Raw log | `/tmp/opencode/p36/logs/V3.log` (11245 bytes, sha256 `e14425d7bbc609146612c289d572c1853d6ce900f0763bb0029c2c4f10bc6c55`) |
| HEAD | `f93e27d3cd9931dbc3e5b4726a1ac635d7c660e9`, tree clean |
| Harness | `scripts/v2/tauri-e2e-smoke.test.mjs`, **3972 lines**, sha256 `4b6b00406eb1f7d5d9597c5441579e03c0efe4dbc668c7a399d5cd4f10a6c42f` — **verified against the value the dispatch states; unmodified** |
| Display branch | `command -v xvfb-run` present → `xvfb-run -a -s "-screen 0 1400x1000x24"` (the A3 branch); harness reported `display: the inherited X display :99` and measured **1400x1000**, so the card's screen size is what the probes ran against |
| App under test | V0's test AppImage only (`Apunta (test)_0.0.0_amd64.AppImage`, sha256 `aebc698e…4fb24`), listed and counted to **1** in the row before launch |
| `APUNTA_FAKE_AI` | `1`, set on the launch command itself |
| Sandbox | `APUNTA_PORT=7879`, `APUNTA_NO_OPEN=1`, `APUNTA_DATA_DIR` inside `/tmp/apunta-v2/<runid>` (`<sandbox>`), not the platform default |

**Run once. Not repeated, not relaunched, no assertion weakened, no helper added.**

## Result, as printed by the harness

```
48/48 assertions passed, 11 NOT RUN
```

### Assertions that passed (37 top-level `PASS` lines + nested ones)

| Group | What was proved |
| --- | --- |
| Artefact | the test AppImage path, identity glob count 1 |
| Rule B freshness | `PASS smoke Rule B freshness: the source set has not moved since the commit the AppImage was built from` — the **A2** repair works: the base is the commit the artefact was built from, not the dispatch base |
| Fresh-build anchor | `PASS smoke the AppImage is newer than the newest Rule B input` |
| Window | app window up, **1280x860 at 60,70 on a 1400x1000 display**, scale 1 |
| Frame-to-client | `PASS … the window capture and the display crop agree on 1280x860 pixels` — the **A1** `parseCompareMetric` repair works against this machine's ImageMagick 7 |
| Server | answers with this run id |
| Ownership | C-OWN@1 baseline files created; data folder locked by this run's own server pid, and still locked at the end |
| CSP | `PASS smoke CSP: 8 directives, nonce present` — the six of rule 6 plus `style-src` with nonce and `style-src-attr`, read over the app's own origin |
| Containment (5) | no server process from the run remains; shell gone; no second `apunta.lock`/`apunta.db`/`-wal`/`-shm`; port 7879 released; observation channel gone from the bundle; **`ollama` still running** |
| Teardown | `stopped the bundled server (pid <N>) with SIGKILL` after the pid-scoped SIGTERM, then the child pid — pid-scoped throughout, no `pkill`, no pattern |

### The eleven flows — every one `NOT RUN`, none `PASS`

```
NOT RUN onboarding:  the onboarding screen was not the first screen shown: tesseract read no words out of "Add your note format"'s capture
NOT RUN capture:     the pane label "Start with a recording" never appeared: tesseract read no words out of "Start with a recording"'s capture
NOT RUN draft:       no note exists for the patient
NOT RUN refine:      no note was opened by the draft flow, so there is nothing to refine
NOT RUN publish+copy:no note was opened by the draft flow, so there is nothing to publish
NOT RUN patient list:the patient's row could not be grounded: tesseract read no words out of the window capture
NOT RUN plan:        the plan pane could not be opened by a unique control: tesseract read no words out of the window capture
NOT RUN briefing:    the briefing control could not be grounded: tesseract read no words out of the window capture
NOT RUN brainstorm:  the brainstorm control could not be grounded: tesseract read no words out of the window capture
NOT RUN settings:    the rail menu never showed a Settings entry over six keyboard attempts, so the screen was not opened and nothing is asserted about it
NOT RUN backup:      the backup tab could not be grounded: tesseract read no words out of the window capture
```

**Stop condition 5 is met: a screen was reached but could not be read.** The
flows are recorded `NOT RUN` with that cause, **none of them `PASS`**, and this
file is the report to the coordinator. No second hook, no second marker path, no
gate change, no `src-tauri/**` edit was made or attempted.

Because no flow completed, **no `docs/v2/evidence/P3.6/<flow>.png` screenshot was
written by the harness.** The one native screenshot this run produced is copied
beside this file as `impl7-v3-window-2097190.png` (below).

## Native screenshot actually produced by this run

| Field | Value |
| --- | --- |
| File | `docs/v2/evidence/P3.6/impl7-v3-window-2097190.png` |
| Provenance | byte-for-byte copy of the harness's own last window capture, `build/p36-smoke-harness/window-2097190.png` |
| sha256 | `16ee9ca415cf9385b913db84708f23ae977893e32a417dd18f8b1712388783d3` |
| Geometry | 1280x860 PNG, 885 distinct colours, mean 0.0965055 |
| Content | the real native window: title `Apunta`, heading `Add your note format`, the three format choices and the restore line — **the screen the run never got past** |

Two other captures from the same run stay in the sandbox scratch folder and are
**not** copied: `root.png` and `root-crop.png`, both 1400x1000/1280x860 with only
**2 colours** (a black root window — nothing draws to root without a window
manager), sha256 `63aa45e7…3123` and `b42c1f19…65b5`. They are not evidence of
anything readable and are recorded here only so the difference is visible.

## Root cause — diagnosed, not guessed, and not fixed

The window capture above is perfectly legible. Running the row's own OCR
straight against it produces the whole screen:

```
$ tesseract window-2097190.png -            # exit 0
Apunta
Add your note format
Choose how to define it — we'll figure out the structure for you
[) My standard progress note  Recommended
...
$ tesseract window-2097190.png stdout tsv    # exit 0
… 98 level-5 word rows, conf column printed as a float, e.g. 92.934593 …
```

But the harness's reader is `screenWords` (`scripts/v2/tauri-e2e-smoke.test.mjs:932-962`),
and line **948** drops every one of them:

```js
if (![left, top, width, height, confidence].every((value) => Number.isInteger(value))) continue;
```

`left/top/width/height` are integers, but tesseract **5.5.3 prints the TSV `conf`
column with six decimals** — `Number.isInteger(92.934593)` is `false`. So every
row is discarded, `words.length === 0`, and `screenWords` returns `null`, which
the two call sites render as exactly the messages recorded above (`:1047` and
`:1086`).

**Measured on this run's own artefacts:**

| Probe | Result |
| --- | --- |
| TSV rows at `level=5` with non-empty text | **98** |
| … of which survive line 948's integer test as shipped | **0** (95 dropped solely on `confidence`) |
| `screenWords('window-2097190.png')` imported from the shipped module | **`null`** — the defect reproduced with the harness's own code, no edit |
| Same 95 words with only the integer test relaxed to `Number.isFinite` | **95 words**, and `groundPhrase(words, "Add your note format")` → `{box: {x:412, y:109, w:192, h:20}, why: "the label \"Add your note format\" appears exactly once"}` |

So the capture pipeline, `tesseract`, `groundPhrase` and the fail-closed
uniqueness rule are all working; **the single integer test on a float column is
what turns every flow into `NOT RUN`.** It is a defect in the frozen harness, in
`scripts/v2/tauri-e2e-smoke.test.mjs` — a file the *card* puts in its own
"May edit" list, but **not** one this reviewer may touch: AM-214 grants review
and evidence writes only, and Stop 5's forbidden remedies include any edit made
to open a channel. It is reported here for the coordinator, not repaired.

Two consequences worth stating plainly:

1. **This is the first time V3 has got far enough to fail here.** Attempt 6's
   native run exited **1** at `22/24 assertions passed, 12 NOT RUN`, with two
   FAILs — A2's history arm still pinned to the dispatch base `62abb28`, and A1's
   unparseable `compare` metric — and every flow recorded `NOT RUN: the
   frame-to-client relationship could not be measured, so no click is grounded`.
   Attempts 1–5 were CODE/UNIT phases with no native run at all. A1, A2 and A3
   are **proved working** by this run's 48/48; the OCR defect is simply the next
   one behind them.
2. **Whether it is the only one is unknown and cannot be made known by a
   repeat.** The row is spent. Nothing here predicts whether the flows would
   clear after a fix, and this review does not claim they would.

## Postconditions re-read from outside the run

| Check | Observed |
| --- | --- |
| Port 7879 after the row | free |
| Stray harness / AppImage / Xvfb processes after the row | none (`pgrep` matched only this session's own process, whose prompt text contains the pattern) |
| `ollama` on 127.0.0.1:11434 | still listening, pid unchanged (1121) |
| Sandbox run folders created by the four sandboxed rows | `/tmp/apunta-v2/<runid>` × 4 (V0, V3, V1, V4), outside the repository |
| `git status --porcelain` after the row | empty |
| Preview on 7831 | untouched (prior work) |
| Live data dir / port 7717 | never opened |

## Verdict for this row

**FAIL** — exit 4 against an expected exit 0; 11 of 11 flows `NOT RUN`.
**Stop condition 5 applies. A `NOT RUN` flow blocks approval until the
coordinator decides.**
