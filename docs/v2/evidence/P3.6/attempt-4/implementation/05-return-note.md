# Return note — P3.6 attempt 4 (CODE/UNIT), F1–F7

Append-only: written once, at the end of this attempt, and not rewritten by a
later session. A later attempt appends its own note rather than editing this one.

## Status

The seven confirmed defects are repaired in
`scripts/v2/tauri-e2e-smoke.test.mjs` and each is proved by a synthetic helper
test plus a read-only read of the app's own source. Nothing outside this card's
two paths changed. **No row was run**, so the card's own rows (V0–V5) are
untouched and V3 remains unproven: whether OCR reads these strings on a live
screen, whether the keyboard paths land and whether each click hits the intended
cluster are still UNKNOWN, and only a native V3 can settle them.

## Files changed

- `scripts/v2/tauri-e2e-smoke.test.mjs` — 2789 → 3174 lines, sha256
  `9637b7daa32072cbe48143cc6618581a046dd926cec47bab830d687d40452e9c`.
- `docs/v2/evidence/P3.6/attempt-4/implementation/**` — this directory:
  `00-readme.md`, `01-scoped-checks.txt`, `02-helper-tests.txt`,
  `03-file-hashes.txt`, `04-defect-repair-map.md`, `helper-tests.mjs`,
  `05-return-note.md`.

Not touched: the frozen V0 evidence, `src-tauri/target/**`, the test AppImage,
`docs/v2/state/**`, `docs/v2/cards/P3.6.md`, every `server/**`, `shared/**` and
`web/**` file (other workers have `server/**` and `shared/**` in flight, and this
attempt left them alone), and every attempt-1..3 history.

## Per defect

- **F1** — the onboarding pane is confirmed with `Identifier (optional)`
  (`patients.identifierLabel`), which renders once at
  `web/src/routes/AddPatient.tsx:128` (`shared/src/i18n/en.ts:2168`), instead of
  `Add patient`, which the test shows appearing twice on that screen.
- **F2** — the refine placeholder is quoted in full, `Ask a question or give
  feedback...` (`shared/src/i18n/en.ts:1058`, rendered once at
  `web/src/components/RefineColumn.tsx:284`), and the matcher's strip is now
  `stripTrailingPunctuation` = `/[.,\u2026]+$/u` applied to **both** sides, so a
  run of dots or an ellipsis matches however OCR reads it.
- **F3** — the capture label is quoted with its U+2026, `Listening for words…`
  (`shared/src/i18n/en.ts:1010`, the visible `<span>` at
  `web/src/components/LiveRecording.tsx:74`; the second reference on that line is
  `ThinkingDots`' aria label), and the same strip handles `…`, `...` and `.`.
- **F4** — `openWorkspacePane` opens the pane first, by grounding whichever opener
  is unique on the screen it reads, and only then is `Start a plan` clicked: it is
  the pane's empty-state control (`web/src/components/PlanView.tsx:348`), so it is
  nowhere on screen while the pane is closed.
- **F5** — the briefing and brainstorm panes are opened by the same helper, so the
  label the notes column's switch shares with the welcome card
  (`NotesColumn.tsx:100`/`:122` against `PatientWelcome.tsx:66`/`:78`) is never
  required to be unique; the welcome card's hint line renders once and is inside
  that card's button, and once a pane is open the welcome is not mounted at all.
- **F6** — the settings screen is confirmed with `Drafting model`
  (`settings.draftingModel`, `shared/src/i18n/en.ts:2406`), whose `h2` renders
  once at `web/src/routes/Settings.tsx:357`, because `Appearance` is on the modal
  twice (nav label `:85`/`:181` and section heading `:455`).
- **F7** — the containment check now uses `ownershipContainment`
  (`scripts/v2/tauri-e2e-smoke.test.mjs:1713`) and compares only the four C-OWN@1
  names, so the backup flow's own `backups/` directory
  (`server/src/backup/store.ts:37-39`) is reported rather than failed on; a second
  `apunta.lock`/`apunta.db`/`-wal`/`-shm` is still caught, and anything vanishing
  from the whole baseline is still caught.

## Commands run (pinned Node v24.19.0)

| Command | Exit |
| --- | --- |
| `node --check scripts/v2/tauri-e2e-smoke.test.mjs` | 0 |
| `node docs/v2/evidence/P3.6/attempt-4/implementation/helper-tests.mjs` | 0 (40/40) |
| `npx eslint scripts/v2/tauri-e2e-smoke.test.mjs` | 0 |
| `npx prettier --check scripts/v2/tauri-e2e-smoke.test.mjs` | 0 |
| `npx eslint docs/v2/evidence/P3.6/attempt-4/implementation/helper-tests.mjs` | 0 |
| `npx prettier --check docs/v2/evidence/P3.6/attempt-4/implementation/helper-tests.mjs` | 0 |

Two read-only git calls ran inside the helper tests (`git diff`, `git status`),
which is what attempt 3's D6 test already did.

## For the coordinator

- No stop condition fired and nothing needed a scope, card-row or protected-rule
  change, so nothing is escalated. The only judgement worth recording is in
  `04-defect-repair-map.md`: attempt 3's D6 freshness **test** asserted a clean
  working tree, which cannot hold while other workers have `server/**` in flight,
  so it now asserts the predicate's own behaviour and prints the in-flight count.
  The predicate, and V3's failure on a moved Rule B input, are unchanged.