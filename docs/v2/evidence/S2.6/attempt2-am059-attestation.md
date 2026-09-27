# S2.6 attempt 2 — AM-059 forward-only plan attestation, and the browser regressions

Base commit `812da7c`. Ports 7831 (English server) and 7832 (es-MX server), both
inside the 7800–7889 sandbox range and both verified free before the run. The
preview instance on 7867 was never contacted; the listening-port set was captured
before and after the browser runs and is byte-identical.

Runtime: pinned Node v24.19.0, selected explicitly in `PATH`
(`$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin`). The box default is
v26.8.2, outside the repo's `engines`, and none of these commands used it. Browser:
`/usr/bin/chromium`, exported as `PLAYWRIGHT_CHROMIUM_EXECUTABLE` **before**
`sandbox.mjs env`, because `printEnv` emits only `APUNTA_*`. Servers were started
by `scripts/v2/sandbox.mjs env --port 7831` and by Playwright's own `webServer`
from that run folder. `APUNTA_FAKE_AI=1` throughout (`playwright.config.ts:49`); no model inference
was run in this session, no port 7717, no live data.

**Sandbox run folder:** `<sandbox>` (path withheld — machine identifiers appear in
the server logs). Raw Playwright output stayed in `/tmp` and is not committed.

## Changed source paths

| Path | What |
| --- | --- |
| `server/src/routes/plans.ts` | Capture `storedLanguage(db)` once in the activation handler; persist `msg(locale, 'plan.attestationStatement')`; drop the now-unused `ATTESTATION_TEXT` import |
| `shared/src/i18n/en.ts` | The single `plan.attestationStatement` key, English byte-identical to `ATTESTATION_TEXT` |
| `shared/src/i18n/es-MX.ts` | The same key, the owner's approved Spanish wording |
| `server/src/routes/plans.test.ts` | V8, V9, V10, V11 |
| `shared/src/i18n/t.test.ts` | The catalogue pin for the new key (both values, and that they differ) |
| `e2e/tests/plan.spec.ts` | V12 (exact approved Spanish attestation on the Spanish screen), V13 (English unchanged), V14 (matcher attribution, and no English match for the Spanish sentence) |
| `e2e/tests/language-control.spec.ts` | V2 and V3 re-run against the owner-approved **More-menu `LanguageDialog`** as well as the Settings row (AM-062) |
| `e2e/tests/formats.spec.ts` | 6 es-MX literal assertions → `tr()` / `trRe()` |
| `e2e/tests/workspace.spec.ts` | 9 es-MX literal assertions → `tr()` / `trRe()` |

No commit, no staging, no push: the tree is left dirty for the coordinator.

## V8–V11 — route and catalogue, no server and no port

- cwd: repository root
- command: `npx vitest run server/src/routes/plans.test.ts shared/src/i18n/t.test.ts`
- start 2026-09-27T16:59:41-06:00; end 2026-09-27T16:59:42-06:00; **exit 0**
- 2 files, **55 tests** (31 in `plans.test.ts`, 24 in `t.test.ts`), all passing.
- `createTestApp` makes its own `mkdtemp` database; no server was started and no
  port was opened by this command.

```
 Test Files  2 passed (2)
      Tests  55 passed (55)
```

| Row | Case | Asserts |
| --- | --- | --- |
| V8 | activate with no language row, then with an explicit `en` | `attestation_text === ATTESTATION_TEXT` both times, and equal to `t('plan.attestationStatement', {}, 'en')` |
| V9 | activate with `es-MX` stored | the exact approved Spanish sentence, and `not.toBe(ATTESTATION_TEXT)` |
| V10 | activate Spanish → switch to English → reread → re-activate → activate a fresh version | first attestation and `attested_at` unchanged; re-activation 409; new version English; the Spanish one still Spanish in `/plan/versions` |
| V11 | activate English, then read under a Spanish setting | API, exported document and the raw `treatment_plans` row all still hold `ATTESTATION_TEXT`; zero rows anywhere hold the Spanish sentence (no backfill) |
| — | `t.test.ts` | English value `=== ATTESTATION_TEXT`; Spanish value `===` the approved wording written out; the two `not.toBe` each other, so the matcher's identical-value rule cannot silence the leak |

`V9`–`V11` set `process.env.APUNTA_DEV_SPANISH = '1'` and restore it in
`afterEach` (deleting the variable when it was absent), so no later case in
either file can inherit it.

### The negative control — the new cases can fail

Restoring the pre-AM-059 behaviour in `plans.ts` (`attestation_text:
ATTESTATION_TEXT`) and re-running the same command:

```
 Test Files  1 failed (1)
      Tests  2 failed | 29 passed (31)
```

The two failures are **V9 and V10**, each with the same diff:

```
AssertionError: expected 'I authored and reviewed this treatmen…' to be 'Yo redacté y revisé este plan de trat…'
 ❯ src/routes/plans.test.ts:706
 ❯ src/routes/plans.test.ts:718
```

V8 and V11 pass either way, which is correct: they are the English and the
history rows, and neither depends on the new behaviour. The scratch edit was
reverted and `npx vitest run server/src/routes/plans.test.ts shared/src/i18n/t.test.ts`
re-run afterwards: exit 0, 55 passed. `git diff` on `plans.ts` after the revert
is the fixed version only.

## V14 — the matcher attributes the English to its own key

- cwd: `e2e`
- command: `npx playwright test --workers=1 --project=es-MX --no-deps tests/plan.spec.ts`
- exit 0 in the final state; the case is in the list below.
- Passed in **both** projects in the recorded full runs
  (`[chromium] tests/plan.spec.ts:245` and `[es-MX] tests/plan.spec.ts:245`).

The case asserts the attribution rather than assuming it:

- `englishMatches(ATTESTATION_TEXT)` contains `plan.attestationStatement` — the
  key that owns the sentence.
- It **also** contains `chat.change.summary`, which is what the coordinator's
  baseline saw and called coincidental (its English is `I {changes}.`, so it
  swallows any sentence starting with "I " and ending in a period). AM-059
  forbids suppressing it, and this assertion is what would notice if someone did.
- The reported form is `text`, and its `spanish` value is the approved sentence.
- `englishMatches(SPANISH_ATTESTATION)` is `[]`, and so is each `'. '`-separated
  part of it.

## V12 and V13 — the plan flow in both languages

Both rows are the same `plan.spec.ts` flow, run twice.

| | Project | Result |
| --- | --- | --- |
| V13 | `chromium` (English, a build without the dev switch) | `✓ [chromium] › tests/plan.spec.ts:58` — passes; asserts `ATTESTATION_TEXT` on the screen |
| V12 | `es-MX` (`APUNTA_DEV_SPANISH=1`) | `✓ [es-MX] › tests/plan.spec.ts:58` — passes; asserts the exact approved Spanish sentence on the screen, and the flow's own `checkScreen` finds no English catalogue text |

The coordinator's inherited baseline (`coordinator-resume-baseline.md`, code head
`e9e8c8b`, exit 1, 8 passed / 1 failed) recorded this same flow **failing** at
`plan.spec.ts:142` with the English attestation on the Spanish screen. That is the
"before" of this row; it is cited, not re-run.

### The negative control, on the browser row too

Scratch edit in `plans.ts` reproducing the pre-fix behaviour for a Spanish
activation only (`locale === 'es-MX' ? ATTESTATION_TEXT : msg(locale, …)`), so
`locale` and the import stay used and the build is unaffected — verified with
`npx tsc -p server/tsconfig.typecheck.json --noEmit`, exit 0:

```
NEGATIVE_CONTROL_EXIT=1
  1) [es-MX] › tests/plan.spec.ts:58:3 › the treatment plan › drafts goals she owns…

    Error: expect(locator).toContainText(expected) failed
    Locator: getByTestId('plan-attestation')
    Expected substring: "Yo redacté y revisé este plan de tratamiento. Declarado en Apunta: firma la copia en tu sistema de registros."
    Received string:    "DeclaraciónI authored and reviewed this treatment plan. Attested in Apunta — sign the copy in your records system.Declarado en Apunta: …"
      at tests/plan.spec.ts:159
  1 failed
  1 passed (11.2s)
```

The first attempt at this control — replacing the call outright rather than
conditionally — also exited 1, **for the wrong reason**: the web server never
started (`Process from config.webServer was not able to start. Exit code: 2`).
The cause was verified afterwards rather than assumed:

```
$ npx tsc -p server/tsconfig.typecheck.json --noEmit     # with the outright revert
unconditional-scratch tsc exit=2
server/src/routes/plans.ts(228,11): error TS6133: 'locale' is declared but its value is never read.
restored tsc exit=0
```

That is what the conditional form above is for, and why the control is quoted
with the typecheck beside it.

The V14 case still passed, as it must: it reads the catalogues and does not depend
on the server. Reverted, and the green V1b run below is the "after".

## The 15 es-MX literal assertions

`formats.spec.ts` and `workspace.spec.ts` held 15 assertions that named English
chrome, so every one of them failed in the es-MX project. They were converted to
`tr()` / `trRe()` — the helpers `e2e/support/fixtures.ts` already provides — and
no `ALLOWED` entry, no `checkScreen` suppression and no guard change was made.
Six in `formats.spec.ts`, nine in `workspace.spec.ts`.

What is now asserted through a key, rather than a literal:

`format.templateTitle`, `format.examplesTitle`, `format.manualTitle`,
`format.foundTitle`, `format.addTitle`, `format.editTitle`, `format.recommended`,
`format.dropTemplate`, `format.dropExamples`, `format.addSection`,
`format.sectionNamePlaceholder`, `format.nameLabel`, `format.sectionsLabel`,
`format.instructions`, `format.renameAction` / `format.renameLabel` /
`format.moveUp` (with the section name as data), `format.tokensOk` /
`format.tokensLarge`, `format.existingNotesNote`, `format.reportFrontmatter`,
`patients.add`, `common.name`, `common.edit`, `common.add`,
`common.searchPatients`, `patients.filteredOut`, `directory.noMatch`,
`notes.emptyFor`, `note.draftChip`, `note.editAgain`, `note.finishAndCopy`,
`note.deleteLabel`, `note.deleteBodySecond`, `note.editedMetaToday`,
`note.editedToday`, `note.saveSaved`, `refine.empty`, `notes.emptySections`,
`workspace.deleteBodySecond`, `ai.unreachable` + `ai.bannerTail`,
`common.dismiss`, `format.standardSubtitle`'s section list left as data.

## V2, V3 — the Settings row **and** the More-menu dialog (AM-062)

The owner-approved `LanguageDialog` is now a second surface for the same setting,
and AM-062 requires "the same browser verification" to exercise it. Four cases in
`e2e/tests/language-control.spec.ts` now run against both: the three that existed
(driving the Settings row, and its settings modal) plus two new ones driving the
dialog — `V2 on the dialog` and `V3 on the dialog`.

- The dialog is reached the way the owner reaches it: `mission-control` →
  `mission-language` → `language-dialog`.
- V2 on the dialog asserts both options are offered (the dialog filters on
  `spanish_available` rather than disabling Spanish), `language-option-es-MX`
  carries `aria-checked="true"`, **both** options are disabled while a refine
  streams, `language-busy` carries `settings.languageChangeBlocked`, and a direct
  `PUT /api/settings` from the runner is refused 409 `language_change_blocked`
  with the stored language unchanged. When the refine finishes the reason
  disappears, both options are enabled, and no `language-error` is left.
- V3 on the dialog switches to English and back, and after each switch checks
  `<html lang>`, the stored value, that the workspace behind the dialog changed
  too, that Home is Spanish again on the way back, that the **Settings row**
  agrees with the dialog after a round trip through it (one setting, two
  controls), and that all of it survives a reload.

The two cases are duplicated rather than shared on purpose: the row and the
dialog are separate components with separate disabled logic, and a helper that
drove both would only be asserting whichever one it happened to reach.

## V1 — the full bilingual suite

- cwd: `e2e`
- command: `npx playwright test --workers=1`
- start 2026-09-27T16:57:46-06:00; end 2026-09-27T16:59:05-06:00
- **exit 1**

```
  1 failed
  6 skipped
  51 did not run
  54 passed (1.3m)
  1) [es-MX-language] › tests/language-control.spec.ts:266:3 › the Language control on the Spanish server › V2 on the dialog: disabled with its reason while a refine streams, and the server refuses a direct change
```

**V1 is not green, and is not reported as green.** The single failure is a real,
reported defect outside this card's May edit; it is written up in the return under
"Unresolved items" and measured below. The 51 "did not run" are Playwright's
`dependencies: ['es-MX-language']` (`playwright.config.ts:108`): the es-MX
project waits for the control's specs, so one failure in the control's specs stops
the project behind it. Removing that dependency to let the rest run would be a
guard change made to turn a red suite green, which HS-7 forbids, so the
configuration was left alone and the project was run separately instead.

### The same es-MX project, run on its own

- command: `npx playwright test --workers=1 --project=es-MX --no-deps`
- start 2026-09-27T16:54:28-06:00; end 2026-09-27T16:56:02-06:00
- **exit 0 — 50 passed**, including the six `formats.spec.ts` cases, all nine
  converted `workspace.spec.ts` flows, and `plan.spec.ts` (V12 and V14).

`--no-deps` skips only the dependency gate; both servers are still started by
`webServer` from the same sandbox run folder with `APUNTA_FAKE_AI=1` and
`APUNTA_DEV_SPANISH=1` on 7832. This is a supplementary run, recorded as such.

## Ports

```
listening before: 53 631 5173 6767 7807 7810 7811 7824 7825 7861 7867 11434 32895 43373 44377
listening after:  53 631 5173 6767 7807 7810 7811 7824 7825 7861 7867 11434 32895 43373 44377
PORT SET UNCHANGED (incl. preview 7867)
```

7831 and 7832 were free before the run and are free after; no process was killed
and no occupied port was reused. 7717 was never contacted.

## Timing note for contamination

All CPU and browser work above ran between **2026-09-27T16:22-06:00 and
17:01-06:00** on this box. **This session performed no model inference and
produced no model-quality evidence**, and that is the only claim made here.

> **Correction, 2026-09-27, after independent review.** This note previously
> read "the model executor (`490ebfe8`) holds the GPU throughout; no inference
> was run in this session, so no model timing is affected." **The GPU clause is
> withdrawn as unsupportable, not restated.** `490ebfe8` is not a process on
> this host (`ps -p 490ebfe8` fails; `/proc/490ebfe8` does not exist), so it
> cannot be the identity of anything whose GPU state the claim rested on; and
> the host has no `nvidia-smi` and no `/dev/nvidia*`, the GPU being reached
> through `/dev/dri` instead. A model executor was resident across the whole
> window (`ollama` up 1d15h, `llama-server` started 15:33:34, i.e. before and
> throughout 16:22–17:01) on a host that was oversubscribed (load average
> 9.07 / 8.42 / 8.16 on 8 cores during the reviewer's own read-only checks).
> "This session submitted no GPU work" and "model timing is unaffected" are
> different propositions: local inference on a shared host is sensitive to CPU
> contention, memory bandwidth and thermal headroom, and none of that is zero
> merely because this session enqueued nothing.
> See `docs/v2/state/reviews/S2.6-AM059-implementation.md` §7.

The four-timezone vitest suites are **not** re-run here, and that decision does
not rest on the withdrawn claim: they passed for the UI commit and this card
changes no date, time or zone logic — the only shared-module change is one
catalogue key with no placeholder, and `t.test.ts`'s zone cases
(`'dates and numbers'`) pass in the runs above at the box's own zone. The
coordinator's four-zone suites remain the instrument for that.
