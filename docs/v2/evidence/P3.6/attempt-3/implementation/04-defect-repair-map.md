# P3.6 attempt 3 — defect repair map (CODE/UNIT)

Each row of the source review (`docs/v2/state/reviews/P3.6-impl2-source.md`,
D1–D6 and R1–R7) against the code that now answers it. Line numbers are from the
repaired `scripts/v2/tauri-e2e-smoke.test.mjs`
(sha256 `ca8bc468ae15717ca14cdacf6848736672877448ced7d760066f756d4018314e`).

| ID | Where it is answered now | What changed |
| --- | --- | --- |
| **D1** self-proving API facts | `flowOnboarding`, `flowDraft`, `flowRefine`, `flowPublishAndCopy`, `flowPatientList`, `flowPlan`, `flowBriefing`, `flowBrainstorm`, `flowSettings`, `flowBackup`; helpers `confirmPane`, `clickScreenLabel`, `waitForScreenLabel`, `screenWords` | Every flow now drives a **real UI action** — a measured click at a uniquely identified on-screen label, or the app's own keyboard — and then reads **two** things the action produced: a **pane-only label** read offline by `tesseract` from a fresh capture (unique on screen; zero or several matches is a refusal) and the **resulting application fact**. The always-true reads are gone: `plan.plan !== null` instead of `plan !== null`, a **draft-status** note row, the publish control's own changed label `Edit again`, a clicked row's patient, a created plan. `flowDraft` no longer re-reads a note it never opened: it clicks the drafted note's own `Draft` chip row and confirms the draft screen's refine column. |
| **D2** ownership containment guaranteed to fail | `snapshotDataDirNames`, `ownershipBaselineProof`, and the baseline call inside `runSmoke` after `waitForOwnership` | The baseline is a **name set taken after the first instance is up**, exactly as the lifecycle sibling does it. The check is now "did anything appear **beside** the baseline", plus two more: the four C-OWN@1 names are asserted present in the baseline as the proof the first instance created them, and the baseline is asserted not emptied behind the run. |
| **D3** no signal teardown | `installTraps`, called first thing in `main`; `rememberPid`/`startedPids` | `SIGINT`, `SIGTERM` and `SIGHUP` are trapped and `exit` is trapped, each running the synchronous idempotent teardown, **before** the first module can be loaded; the signal path also SIGTERMs every pid this file started, by pid. The header claim is now true. |
| **D4** vacuous observation scan | `observationChannelGone` → `scanBundleForObservationChannel` | The scan is over the card's own `web/dist/assets/*.js`, and a missing directory, a directory with no `.js`, or an unread script returns `unreadable`, which the check treats as a **FAIL** — never as "zero occurrences". Exercised by the helper test on synthetic directories. |
| **D5** `NOT RUN` counted ok and exit 0 | `exitCodeFor`, `recordFlow`/`notRunRemaining`, the summary block in `main` | `NOT RUN` is recorded separately from `ok`, **every one of the eleven named flows is printed with its outcome on every path**, and any `NOT RUN` exits **4**. Blocked preconditions exit 3, failures exit 1. |
| **D6** no freshness predicate | `ruleBFreshness`, `newestRuleBInput`, `isRuleBInput`, `RULE_B_BASE`, `RULE_B_PATHS` | The row is now executable: `git diff --name-only 62abb28...HEAD -- <Rule B set>` plus `git status --porcelain -- <set>` over the set restated from the dispatch's Fixed decision, with the base copied out of the dispatch header by hand (three ASCII full stops), `src-tauri/target/**` and `src-tauri/gen/**` excluded; **and** the recorded fresh-build anchor — a source walk over the same set compared with the AppImage's own mtime. A moved input or an older artefact is a FAIL before anything is launched. |
| **R1** colour-cluster ambiguity | `pickPrimaryCluster`, `CLUSTER_MARGIN` | The largest cluster is clicked only when it beats the runner-up by a real margin; a screen with two comparable accent clusters is `NOT RUN` with the counts it saw. Never the largest-by-default. |
| **R2** copy asserted by a colour count | `flowPublishAndCopy` | The colour count is **deleted** (`RENDER_MIN_COLOURS` and `distinctColours` are gone). The flow clicks the control whose label is `Copy` and asserts the control's own label became **`Copied`**; publishing asserts the control became `Edit again`. Specific strings, read off the screen; the host clipboard is still not read and nothing is claimed about it. |
| **R3** physical microphone never checked | `parseSourceTable`, `classifySourceOutputs`, `readCaptureStreams`, `assertNoPhysicalStream` | While the app records, `pactl list short source-outputs` is resolved through `pactl list short sources` (P3.5's mechanism, including the `-` client column and the rule that an unresolvable index is an error). The physical device is named from the **live table**, so a differently named USB device is still covered. |
| **R4** zero windows is FAIL, flows unrecorded | `runSmoke`'s window branch, `notRunRemaining` | Zero windows records `NOT RUN` with that cause for **all eleven flows**, not one FAIL. The same applies to every other early abort (geometry, scale, capture, measurement, ownership, AppImage, missing tool). |
| **R5** import runs `main()` | `isEntryPoint` guard, `preconditions`, `export { … }` | Import runs nothing and exits nothing; the preconditions moved into `main`; 25 helpers are exported for probing. Before/after proof in `02-helper-tests.txt`: the baseline copy exits 2 at import, the repaired file returns. |
| **R6** undeclared tools | `REQUIRED_TOOLS`, `preflightTools` | `xdotool`, `import`, `identify`, `convert`, `compare`, `tesseract`, `pactl` and `paplay` are each named in a preflight; a missing one is a named `BLOCKED` (exit 3) before any launch, not a generic image failure later. |
| **R7** redundant double `xvfb-run` | `ensureDisplay` | An inherited `DISPLAY` is honoured and printed, so V3's own `xvfb-run -a` is the display the run uses; the harness only supplies one when it has none. |

## What is deliberately unchanged

Identity scope (one `'Apunta (test)_'*.AppImage` glob, zero or several refused
with the listing), the measured frame-to-client relationship, the scale read off
the app's own line and required to be 1, the CSP assertion pinned to
`server/src/http/csp.ts`, and the pid-scoped stop. Those were re-checked green by
the source review and none of them needed a repair.

## Honest limits of this phase

- **Nothing was launched.** No AppImage, no display, no window, no audio device,
  no port, no inference. Every repair above is code plus a synthetic unit proof;
  whether the clicks land on the intended controls, whether OCR reads the labels
  at this window size, and whether the flows' API facts move is exactly what V3
  has still to answer.
- **The OCR labels are quoted from `shared/src/i18n/en.ts` and the components
  that render them**, not invented; if a label differs at run time the flow
  records `NOT RUN` naming the label, which is the intended behaviour rather than
  a fallback to a weaker assertion.
- **Two controls are icon-only** and have no on-screen label: the rail's mission
  control (`rail-mission-control`) and the compact rail buttons. The settings
  flow therefore opens the menu by the app's own keyboard and **verifies** it by
  the menu item's label before clicking it; over six attempts with no label the
  flow is `NOT RUN`. That is a real limit of a screenshot-grounded harness with
  no observation hook, recorded rather than papered over.