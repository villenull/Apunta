# P3.6 attempt 4 — F1–F7 against the code that now answers each

Every label below is quoted from `shared/src/i18n/en.ts` as it stands in this
tree, and each is proved **once** on the screen it is read on. The helper tests
assert both halves mechanically: that the string the harness grounds is the
string the cited file renders at the cited line, and that a synthetic OCR word
list of that screen grounds it exactly once (and refuses it when the screen
carries it twice).

| ID | Mechanism | Label / code | Source evidence (renders once) |
| --- | --- | --- | --- |
| **F1** | The onboarding pane is confirmed by the add-patient dialog's **identifier field label**, not by its own title. `patients.add` is on that screen twice — the dialog `h2` (`AddPatient.tsx:92`) and the submit button (`:152`) — so it was never a pane-only label. | `Identifier (optional)` (`patients.identifierLabel`) | `shared/src/i18n/en.ts:2168`; rendered once at `web/src/routes/AddPatient.tsx:128` (helper test asserts `renders(AddPatient.tsx,'patients.identifierLabel') === 1` and `renders(...,'patients.add') === 3`, the third being the `Dialog title` prop with `showTitle={false}` at `:85`) |
| **F2** | The refine placeholder is quoted **in full, dots and all**, and `findPhraseBoxes` now strips a **run** of trailing punctuation from both sides of the comparison (`stripTrailingPunctuation`, `[.,\u2026]+$`), so `feedback...`, `feedback..`, `feedback.` and a bare `feedback` all match. | `Ask a question or give feedback...` | `shared/src/i18n/en.ts:1058`; rendered once at `web/src/components/RefineColumn.tsx:284` (`:285` is the same composer's **aria** label, not on screen) |
| **F3** | The capture label is quoted with its **U+2026**, and the same run-strip handles `…`, `...`, `..` and `.` (and strips the quoted phrase's own ellipsis identically). | `Listening for words…` (`capture.listening`) | `shared/src/i18n/en.ts:1010`; the visible `<span>` at `web/src/components/LiveRecording.tsx:74` — the second reference on that line is `ThinkingDots`' **aria** label, whose three spans are CSS dots with no text |
| **F4** | The plan pane is **opened first**, by `openWorkspacePane`, which grounds whichever of the pane's two openers is unique on the screen it is reading: the notes column's switch (`Treatment plan`, `NotesColumn.tsx:111`) when the welcome is not rendered, otherwise the welcome card's own **hint** (`Set goals and track progress.`, `PatientWelcome.tsx:73`), which is inside that card's button. Only then is `Start a plan` clicked — it is the pane's empty-state control (`PlanView.tsx:348`) and is nowhere on screen while the pane is closed. | `Start a plan` (`plan.start`) | `shared/src/i18n/en.ts:1907`; rendered once at `web/src/components/PlanView.tsx:348` |
| **F5** | The briefing and brainstorm panes are opened by the same helper, so the label the notes column's switch shares with the patient's welcome card (`Prepare for session` — `NotesColumn.tsx:122` / `PatientWelcome.tsx:78`; `Brainstorm` — `:100` / `:66`) is never required to be unique. The card's hint line (`A short summary before you see them.`, `Think through the case out loud with the assistant.`) renders once and is unique, and once a pane is open the welcome is not mounted at all (`Workspace.tsx:706-713`), so the switch is unique instead. Neither path picks one of two boxes of the same label; a refusal still records `NOT RUN` with both reasons. | see F4's helper | `shared/src/i18n/en.ts:1527`, `:1762` (switches, rendered once each in `NotesColumn.tsx`); `:1753`, `:1751` (hints, rendered once each in `PatientWelcome.tsx`) |
| **F6** | The settings screen is confirmed by a heading **inside** the open Appearance section. `settings.appearance` is on the modal twice — the nav label (`Settings.tsx:85`, rendered at `:181`) and the section heading (`:455`) — so the confirmation is the section's other heading instead. | `Drafting model` (`settings.draftingModel`) | `shared/src/i18n/en.ts:2406`; the `h2` at `web/src/routes/Settings.tsx:357` — the second reference (`:358`) is a `role="radiogroup"` **aria-label**, not on screen |
| **F7** | The containment check compares against the **four C-OWN@1 names only** (`ownershipContainment`): `secondOwned` is any of `apunta.lock`, `apunta.db`, `apunta.db-wal`, `apunta.db-shm` that appeared beside the post-first-instance baseline. Everything else that appeared is reported as `otherNew` (the backup flow's own `backups/`, `server/src/backup/store.ts:37-39`) rather than failed on, and `vanished` is still computed over the **whole** baseline, so nothing the first instance created may disappear. The check's name and its mechanism now match, and its strength for the four names is unchanged — the helper test has a second `apunta.db-wal` appearing and being caught. | `ownershipContainment(baseline, after)` | `scripts/v2/tauri-e2e-smoke.test.mjs:1713` and the check in `runSmoke`; the four names come from `ownershipFiles()`, never from a literal in the check |

## What did not change

- **Grounding stays fail-closed.** `groundPhrase` still refuses zero matches and
  more than one match; `openWorkspacePane` only chooses between two *different*
  labels, each of which must be unique on its own, and reports both refusals when
  neither is.
- **Every flow still drives a real UI action and still reads two facts**: a
  uniquely identified on-screen label and an application fact the action
  produced. No API call replaced a click anywhere in this repair.
- **D1–D6 and R1–R7 are untouched.** The baseline timing, signal teardown, the
  fail-closed bundle scan, `NOT RUN` → exit 4, the Rule B freshness predicate,
  the cluster margin, the `Copied` state, the physical-microphone read-back, the
  zero-windows `NOT RUN`, the import guard, the tool preflights and the inherited
  `DISPLAY` are all as attempt 3 left them; attempt 3's helper tests are copied
  into this directory unchanged and still pass here.
- **One refactor, no behaviour change:** `clickScreenLabel` now shares its
  measured-click tail with `clickGroundedBox` (the same inside-the-window check,
  the same centre arithmetic, the same `clickNative`); the returned `why` is
  still the grounding reason.

## The one helper-test assertion that was relaxed, and why

`D6 the freshness predicate runs against real git` asserted `moved === []`,
i.e. that this checkout is clean. Other cards' workers are editing `server/**`
and `shared/src/**` in parallel, so a dirty Rule B tree is not this test's
subject and would fail a unit test over someone else's file. The test now
asserts what the predicate is responsible for — both git halves succeed, every
name it reports really is a Rule B input, and two consecutive reads agree — and
prints the in-flight count. The freshness **predicate itself** is unchanged, and
V3 still fails on a moved Rule B input at run time.