# P3.6 attempt 4 — CODE/UNIT implementation evidence

The fourth attempt, bounded by AM-201 to the seven confirmed defects F1–F7 of
`docs/v2/state/reviews/P3.6-impl3-source.md`. One source file changed, and one
evidence directory was added. No card field, verification row, Expected cell,
threshold or scope was touched; the frozen V0 evidence, the test AppImage and the
attempt-1..3 histories are unmodified.

| File | What it is |
| --- | --- |
| `01-scoped-checks.txt` | `node --check`, `eslint` and `prettier --check` on the repaired harness and on the test file — all exit 0 |
| `02-helper-tests.txt` | 40 synthetic helper tests (exit 0), including attempt 3's twenty unchanged |
| `03-file-hashes.txt` | sha256 and line counts of the repaired harness and the test file, against attempt 3's candidate |
| `04-defect-repair-map.md` | F1–F7 against the code that now answers each, with the `file:line` that renders every label once |
| `helper-tests.mjs` | the tests themselves; `node helper-tests.mjs` runs them |

## The one source file changed

`scripts/v2/tauri-e2e-smoke.test.mjs`, 2789 → 3174 lines, sha256
`9637b7da…452e9c` (attempt 3's candidate was `ca8bc468…14e`). Nothing else in the
checkout was created, edited or deleted by this attempt: no `src-tauri/**`, no
`web/**`, no `server/**`, no `shared/**`, no `package.json`, no sibling script,
no capability, no `invoke_handler`, no hook, no new dependency, no global ignore,
no suppression comment. `docs/v2/state/**` was read and not written.

## What was proved, and how

Each defect is answered by code a synthetic test can exercise plus a read-only
read of the app's own source:

- **F1** `Identifier (optional)` grounds the add-patient screen once, and the
  screen's own `Add patient` is shown to be there twice (and refused).
- **F2 / F3** `stripTrailingPunctuation` takes a run of `.`, `,` and U+2026 from
  both sides; the placeholder matches `feedback...`, `feedback..`, `feedback.`,
  `feedback` and `feedback…`, and `Listening for words…` matches `words…`,
  `words...`, `words.` and `words`.
- **F4 / F5** `choosePaneOpener` (pure, exported) is pinned on three synthetic
  screens: the welcome beside the notes column (the shared label is twice, the
  card's hint is chosen), a note open with no welcome (the switch is chosen), and
  a screen with neither (refused, naming both labels).
- **F6** the settings modal carries `Appearance` twice and `Drafting model` once.
- **F7** `ownershipContainment` reports the backup flow's `backups/` (and any
  other non-ownership name) without failing, still fails on a second
  `apunta.db-wal`, and still fails on anything from the baseline vanishing.

The helper tests also assert, against the tree, that every label the harness
grounds is the string the cited file renders at the cited line, so a label cannot
drift from the app's own i18n string without a check failing.

## Not run, by instruction

No V0, V1, V2, V3, V4 or V5; no build; no producer; no AppImage launch; no Tauri;
no cargo; no display; no `xdotool`; no audio device; no inference; no network; no
port, 7879 included; no `git add`, commit or push. Nothing outside this card's
two paths was touched. This is offered as a **CODE/UNIT candidate**; it claims no
row and no flow, and whether OCR reads these strings on a live screen, whether
the keyboard paths land and whether each click hits the intended cluster remain
**UNKNOWN** until V3 runs — which is a build/producer/native run this attempt is
not permitted to do.