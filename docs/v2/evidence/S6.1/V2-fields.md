# S6.1 — V2 Spanish fields, five surfaces

- Working directory: the repository root, once
- Sandbox run folder: `<sandbox>/2026-10-04T20-31-53-814Z-c6dbcae3/` (English server 7884, Spanish server 7885 with its own `data-es-MX` beside it; one `sandbox.mjs env`, no second)
- Started: 2026-10-04T20:31:53Z · Ended: 2026-10-04T20:36:45Z
- Command (exactly the row's, with the markdown backslash-pipe read as a bare `|`):

```
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium && node scripts/v2/sandbox.mjs env --port 7884 > /tmp/apunta-v2-s6.1-en.env && . /tmp/apunta-v2-s6.1-en.env && RUN_LOGS="$(dirname "$APUNTA_DATA_DIR")/logs" && ( cd e2e && npx playwright test --project=es-MX spelling-es.spec.ts ) > "$RUN_LOGS/v2.log" 2>&1; rc=$?; echo "exit=$rc"; exit $rc
```

- **Exit code: 0**

## Projects, counts

Projects run: `es-MX` plus its dependency `es-MX-language` (pulled
automatically, as the row requires — naming it with a file filter would collect
nothing).

```
  -   1 [es-MX-language] › tests/language-control.spec.ts:80:1 › Language: not offered on a build without the dev switch
  ✓   2 [es-MX-language] › tests/language-control.spec.ts:104:3 …
  ✓   3 [es-MX-language] › tests/language-control.spec.ts:154:3 …
  ✓   4 [es-MX-language] › tests/language-control.spec.ts:203:3 …
  ✓   5 [es-MX-language] › tests/language-control.spec.ts:385:3 …
  ✓   7 [es-MX] › tests/spelling-es.spec.ts:184:3 › el corrector en Español › marks the typed-notes box, which no English spec ever drove (1.5s)
  ✓   9 [es-MX] › tests/spelling-es.spec.ts:199:3 › el corrector en Español › marks the refine composer (1.5s)
  ✓   8 [es-MX] › tests/spelling-es.spec.ts:225:3 › el corrector en Español › marks the patient rename field, which no English spec ever drove (1.7s)
  ✓  10 [es-MX] › tests/spelling-es.spec.ts:153:3 › el corrector en Español › marks the note body, corrects it, and shows no English (2.4s)
  ✓  11 [es-MX] › tests/spelling-es.spec.ts:249:3 › el corrector en Español › marks the add-patient name input at /patients/new (1.1s)

  1 skipped
  10 passed (21.4s)
```

**5 passed, 0 failed, 1 skipped** — and the one skip is
`language-control.spec.ts:80`, a **pre-existing** case in the dependency project
("Language: not offered on a build without the dev switch"), not in
`spelling-es.spec.ts`. `spelling-es.spec.ts` contains no `test.skip()` and no
conditional skip; it has five cases and all five ran.

### Per-project collected-test counts (D6 condition 3 — the ignore is visible, not silent)

Measured with `npx playwright test --list`, from the same run folder and the
same build:

| Project | Collected tests | Spelling-related collected |
| --- | --- | --- |
| `chromium` | 58 in 18 files | 2 — `spelling.spec.ts`'s one case and `spelling-assets.spec.ts`'s one |
| `es-MX` | 62 in 18 files | 6 — `spelling-es.spec.ts`'s five and `spelling-assets.spec.ts`'s one |

The delta is exactly the two `testIgnore` entries D6 specifies: `es-MX` does not
collect `spelling.spec.ts` (the English-dictionary spec), and `chromium` does
not collect `spelling-es.spec.ts` (a Spanish dictionary this build never
offers). Neither entry names `spelling-assets.spec.ts`, which is why V3 and V6
are both executable.

## The five surfaces, and what each one asserted

Per surface: the fabricated misspellings marked, `spellcheck="false"`, a
**non-empty** suggestion list in `spelling-menu`, a correction applied from the
menu and the field's value asserted afterwards, the accented words unmarked, and
the caret/menu edge-click (`setSelectionRange` inside the marked word, then a
click that reaches the editor, then the menu's `aria-label` naming that word).

| Surface | Locator the spec drives | Correction applied, asserted as |
| --- | --- | --- |
| note body | `note-body` | `toHaveValue(<the suggestion it clicked>)`, then no marks left |
| typed-notes box (new Spanish coverage) | `summary-input` on `/capture/<patientId>` | `toHaveValue(<the suggestion it clicked>)` |
| refine composer | `chat-input` (the `testId` prop `RefineColumn.tsx` passes) | `toHaveValue(<the suggestion it clicked>)` |
| patient rename field (new Spanish coverage) | `rename-field-<id> > input` | the field commits on blur/Enter, so the correction is asserted where it lands: `patient-row-<id>` contains the chosen word |
| add-patient name input at `/patients/new` | `getByLabel(tr('common.name'))` | `toHaveValue(<the suggestion it clicked>)` |

All five ran. A run that drove the four card fields and never visited
`/patients/new` would have been a FAIL; the fifth case is in the collected list
above.

The exact arrays, from § *Words*:

```ts
const MISSPELLINGS = ['brócolido', 'zambumbia', 'telaraosa'] as const;
const FIELD_TEXT = `${MISSPELLINGS.join(' ')} con el niño, sesión atención psicología niño última café José Ramírez`;
await expect(marksOf(field)).toHaveText([...MISSPELLINGS]);
for (const word of CORRECT.split(' ')) await expect(marksOf(field).filter({ hasText: word })).toHaveCount(0);
```

`MISSPELLING` is `nertua` (a transposition of `ternura`), and no particular
suggestion is named — only that the list is non-empty, because the exact strings
`nspell` returns depend on the shipped affix file. The run did produce real
suggestions from the Spanish pair (e.g. `nerita`), which is the non-empty half
proved rather than asserted.

## `checkScreen` (D6 condition 4)

`checkScreen` is called on the note screen with marks
(`una nota con marcas de ortografía`) and on the spelling menu
(`el menú de ortografía`), through the unchanged `checkScreen` /
`expectNoEnglishUi` guards from `e2e/support/fixtures.ts` and
`e2e/support/no-english.ts`. Both are **not** no-ops: `expectNoEnglishUi` fails
a call that reads zero strings (AM-073), so a green call here is a call that
looked. The Spanish values were asserted as the project's own words
(`t('spelling.menuLabel', …, 'es-MX')` → `Ortografía de nertua`), never as
English literals.

The `no-english-ui` annotations (`<screen> — N strings read, 0 English`) are
recorded by the fixture but the `list` reporter the row's command uses does not
print them; the assertion inside the guard is the record, and it fails on zero.

## Losses and coverage, named in the card's own words

- **Reproduced from `spelling.spec.ts`:** `spellcheck="false"` on each surface,
  applying a correction from the menu, the caret/menu edge-click, and
  `checkScreen` on the spelling menu. All four are here, on all five surfaces.
- **New Spanish coverage this card adds, which no English spec ever drove:** the
  **typed-notes box** (`web/src/routes/Capture.tsx:447`, `summary-input`) and
  the patient **rename** field (`web/src/components/PatientRenameField.tsx:64`,
  mounted from `PatientsColumn.tsx:1157`).
- **The add-patient name input at `/patients/new`** is driven as well, because
  `spelling.spec.ts:84-94` drove it and D6 condition 2 requires that coverage
  reproduced. `AddPatient` and `PatientRenameField` are two different components
  and **both** are driven; "the patient-name field" stands for neither of them
  alone.
- **No sub-case was dropped as impossible in Spanish.** Every clause of the
  English spec has a Spanish counterpart here, on every surface.

## Cleanup (A10)

No `git checkout`, `git restore`, `git clean` or `git stash` ran in this row.
Playwright stopped the two servers it started; nothing was left listening on
7884–7887 (verified after V6), and 7717 was never contacted.
