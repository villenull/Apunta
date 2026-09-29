# S2.6, attempt 2 — independent implementation review: every row re-run

Reviewer session, 2026-09-29. Dispatch `docs/v2/state/dispatch/S2.6-review.md`
(base `c4a364f`, head `9107639`). Sandbox ports **7841** (English) and **7842**
(es-MX), `scripts/v2/sandbox.mjs env` run folders, both sanitised to `<sandbox>`
below. Node **v24.19.0** (`mise`), `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium`.
Live port 7717 never contacted. Nothing committed; no tracked file left changed.

Raw logs: this folder's runs were captured under `/tmp/opencode/S2.6-review/`
and are summarised here; the excerpts below are the ones a row's result rests on.

## 0. Starting state

```
cwd: repository root
git rev-parse HEAD
  e7059531dc6a79f40ccc852f98f6ce837362dd3b
git log --oneline -3
  e705953 Build the P3.1 and S2.6 implementation reviews
  63b20fc Record what was actually checked, including what was not
  9107639 Untranslate the four language names, and record why S2.6 cannot close
```

**HEAD is not `9107639`; it is two coordinator commits ahead of it**
(`63b20fc`, `e705953`). Dispatch step 1 asks for the head commit, so this is
recorded rather than treated as a stop: the two intervening commits are
governance only, and `git diff --name-status 9107639..HEAD` touches nothing
under `shared/`, `web/`, `e2e/`, `server/` or `installer/`:

```
M docs/v2/DEPENDENCIES.md        A docs/v2/cards/P4.5.md
M docs/v2/ORCHESTRATION-LOG.md   M docs/v2/state/AMENDMENTS.md
A docs/v2/state/dispatch/P3.1-review.md
A docs/v2/state/dispatch/S2.6-review.md
M docs/v2/state/PROGRESS.json    M docs/v2/state/cards/P3.1.json
```

The card's own code change is `git diff c4a364f..9107639` and is **three
files**, all in May-edit:

| Path | Licensed by |
| --- | --- |
| `shared/src/i18n/es-MX.ts` (one value) | AM-051, narrowed by AM-063 to the single `language.en.english` key |
| `shared/src/i18n/t.test.ts` (one added case) | AM-051, and V15 names this file |
| `web/src/components/LanguageDialog.test.tsx` (one added case + one header comment) | AM-063 |

`--numstat` for all three is additions only; no existing assertion was touched.

## 1. The five forbidden routes — none taken

All byte-identical between `c4a364f` and `HEAD`:

```
e2e/support/no-english.ts                     UNCHANGED
e2e/support/fixtures.ts                       UNCHANGED
e2e/playwright.config.ts                      UNCHANGED
e2e/tests/language-control.spec.ts            UNCHANGED
web/src/components/LanguageDialog.tsx         UNCHANGED
server/src/routes/plans.ts                    UNCHANGED
server/src/routes/plans.test.ts               UNCHANGED
e2e/tests/plan.spec.ts                        UNCHANGED
shared/src/errors.ts                          UNCHANGED
web/src/routes/Settings.tsx                   UNCHANGED
```

Route 5 (`use.appLocale`) checked by name, not line: both `es-MX` projects carry
`use: { ...devices['Desktop Chrome'], baseURL: esBaseURL, appLocale: 'es-MX' }`,
`es-MX` `dependencies: ['es-MX-language']` while `es-MX-language` has none, and
the es-MX server's `webServer` entry carries `APUNTA_DEV_SPANISH: '1'`. `ALLOWED`
in `no-english.ts` holds exactly two keys, `chat.list.last` and
`common.listLast`; `language.en.english` is not among them, at base or at head.

**The guard is not vacuous in this run** — measured, not assumed. The es-MX
project was re-run with `--reporter=json` and the `no-english-ui` annotations
counted:

```
npx playwright test --config e2e/playwright.config.ts --workers=1 \
  --project=es-MX --no-deps --reporter=json
2026-09-29T18:35:59Z -> 18:37:03Z   exit 0
TOTAL TESTS 50  WITH checkScreen 14  checkScreen CALLS 33
stats: {"expected":50,"skipped":0,"unexpected":0,"flaky":0}
```

33 calls, every one `0 English`; e.g. `the treatment plan in force — 65 strings
read, 0 English`, `Capture while recording — 64 strings read, 0 English`,
`Settings, Advanced open — 93 strings read, 0 English`.

## 2. V4 — gates (PASS, exit 0 on all four)

```
cwd: repository root   node v24.19.0
npm run build:shared                                   exit 0
npx vitest run web/src                                 exit 0   49 files / 516 tests passed (5.7s)
npm run lint                                           exit 0
  (eslint, prettier --check ., check-no-external-urls.mjs,
   collect-licenses.mjs --check, check-ui-strings.mjs — all clean)
npm run typecheck                                      exit 0
```

`build:shared` verified to have actually moved the value the web tests read,
before any web vitest run — the trap this card already fell into once:

```
$ grep -n "language.en.english" shared/dist/i18n/es-MX.js
1135:    'language.en.english': { text: 'English (United States)' },
```

## 3. V15 — the four names, byte for byte (PASS, exit 0)

```
npm run build:shared && npx vitest run shared/src/i18n/t.test.ts
2026-09-29T18:29:11Z   exit 0   1 file / 25 tests passed (449ms)
```

## 4. V16 — the dialog under the Spanish provider (PASS, exit 0)

```
npm run build:shared && npx vitest run web/src/components/LanguageDialog.test.tsx
2026-09-29T18:29:19Z   exit 0   7 tests passed (2.44s)
```

Recorded fresh after the control runs and the restore, in the final tree:

```
npm run build:shared && npx vitest run shared/src/i18n/t.test.ts \
  web/src/components/LanguageDialog.test.tsx
2026-09-29T18:39:25Z   exit 0   2 files / 32 tests passed
```

## 5. V17 — the negative control, both halves (PASS: exit 1 **and** exit 1)

All three mutations were made to a scratch copy of one file, the original was
kept at `/tmp/opencode/S2.6-review/*.bak`, and the restore was proved with
`sha256sum -c` against hashes taken before anything ran.

### V17a — a deliberately wrong per-key value makes V15 fail

`shared/src/i18n/es-MX.ts` set to `'Ingles (Estados Unidos)'` (unaccented, so
the two runs differ by exactly one value):

```
npx vitest run shared/src/i18n/t.test.ts
exit 1
AssertionError: language.en.english differs between en and es-MX:
  expected 'Ingles (Estados Unidos)' to be 'English (United States)'
 ❯ src/i18n/t.test.ts:227:70
Test Files  1 failed (1)   Tests  1 failed | 24 passed (25)
```

Supplementary, same scratch state, **after** `npm run build:shared`, so the web
test really reads the wrong `shared/dist`:

```
npm run build:shared && npx vitest run web/src/components/LanguageDialog.test.tsx
exit 1
AssertionError: expected 'English (United States)Ingles (Estado…'
                to be 'English (United States)English (Unite…'
Tests  1 failed | 6 passed (7)
```

V16 is therefore not vacuous either.

### V17b — with the repair reverted, the dialog's `checkScreen` fails again

`git show c4a364f:shared/src/i18n/es-MX.ts > shared/src/i18n/es-MX.ts`
(`5d9e4e0e…bd6`), `npm run build:shared`, then the idle-dialog case of the
`es-MX-language` project alone:

```
npx playwright test --config e2e/playwright.config.ts --workers=1 \
  --project=es-MX-language -g "V2 on the dialog"
2026-09-29T18:32:0xZ   exit 1
Error: English catalogue text on the Spanish the Language dialog with nothing in flight screen
+ Received  + 3
+   "language.en.english [text]: \"English (United States)\" (es-MX: \"Inglés (Estados Unidos)\")",
  at ../support/no-english.ts:173
  at ../support/fixtures.ts:64:34
  at ../e2e/tests/language-control.spec.ts:382:5
1 failed
```

Restored, rebuilt, same case re-run:

```
npx playwright test --config e2e/playwright.config.ts --workers=1 \
  --project=es-MX-language -g "V2 on the dialog"
exit 0   1 passed (8.5s)
```

### V17c — a control this card's text predicted would be missed, and was not

AM-063 states that if **both** catalogues held the Spanish value the two keys
would "remain byte-identical pairwise" and "**V15 would still pass** … Only V16
catches it." The added case pins the four rendered strings as well as comparing
them pairwise, so that is not what happens. Both catalogues set to
`'Inglés (Estados Unidos)'`:

```
npx vitest run shared/src/i18n/t.test.ts
exit 1
FAIL  |shared| src/i18n/t.test.ts > the two catalogues >
      leaves the four language names untranslated, byte for byte
AssertionError: expected 'Inglés (Estados Unidos)' to be 'English (United States)'
 ❯ src/i18n/t.test.ts:232:51
Test Files  1 failed (1)
```

V15 catches the both-translated case on its own, at `t.test.ts:232`, the pin
`expect(t('language.en.english', {}, 'es-MX')).toBe('English (United States)')`.
The single-sided reversal (`en.ts` written to the Spanish value, `es-MX.ts` left
alone — the literal trap) also fails, at the pairwise comparison, `t.test.ts:227`:

```
npx vitest run shared/src/i18n/t.test.ts
exit 1
AssertionError: language.en.english differs between en and es-MX:
  expected 'English (United States)' to be 'Inglés (Estados Unidos)'
Test Files  1 failed (1)   Tests  1 failed | 24 passed (25)
```

Both catalogues restored; `sha256sum -c` green on all four tracked files.

## 6. V1 / V2 / V3 / V12 / V13 / V14 — the bilingual e2e line

```
. <sandbox>.env   # node scripts/v2/sandbox.mjs env --port 7841
export APUNTA_E2E_ES_PORT=7842
export APUNTA_E2E_ES_DATA_DIR='<sandbox>/data'   # the 7842 run folder
export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium
```

### V1 as written (FAIL, exit 1)

```
npm run e2e -- --workers=1
2026-09-29T18:30:32Z -> 18:31:10Z   exit 1
  1 failed / 6 skipped / 50 did not run / 55 passed (37.8s)

  ✘ 62 [es-MX-language] e2e/tests/language-control.spec.ts:385:3
    V3 on the dialog: switching applies at once and survives leaving the
    workspace and coming back, no reload
    Error: expect(page).toHaveURL(expected) failed
    Expected pattern: /\/$/
    Received string:  "about:blank"
    Timeout: 5000ms
      14 × locator resolved to <html>…</html> — unexpected value "about:blank"
    > 426 |     await expect(page).toHaveURL(/\/$/);
```

One failure, not two: the `settings-appearance.spec.ts:77` keyboard flake the
implementer reported did **not** occur in this run
(`✓ 39 [chromium] … moves and selects the theme with the arrow keys (255ms)`).

`50 did not run` is `es-MX` blocked by its `es-MX-language` dependency, so the
project carrying `checkScreen` on every screen was never entered by this run.

### The es-MX project, with the dependency skipped rather than removed (exit 0)

```
npx playwright test --config e2e/playwright.config.ts --workers=1 \
  --project=es-MX --no-deps
2026-09-29T18:31:28Z -> 18:32:32Z   exit 0   50 passed (1.1m)
```

`--no-deps` is a Playwright flag. No config was edited, both servers still come
from the same `webServer` block, the project still runs `appLocale: 'es-MX'`
against the `APUNTA_DEV_SPANISH=1` server on 7842, and §1's annotation count
proves `checkScreen` executed 33 times rather than being skipped.

Inside that run: **V12** `✓ 28 [es-MX] plan.spec.ts:58 … drafts goals she owns,
reviews the plan, and prepares for the session` (asserts
`SPANISH_ATTESTATION` and calls `checkScreen(page, 'the treatment plan in
force')`), **V14** `✓ 29 [es-MX] plan.spec.ts:245 V14: the English attestation is
attributed to its own key, and the Spanish one to none`, **V13** `✓ 31 [chromium]
plan.spec.ts:58` in the V1 run, **V2** `✓ 58/61 [es-MX-language] language-control
spec.ts:104` and `:268` in the V1 run.

### The V1/V3 control — run here, not taken on trust

`git show c4a364f:shared/src/i18n/es-MX.ts` written over the working file
(`Inglés (Estados Unidos)`), `npm run build:shared`, `shared/dist` confirmed to
hold the base value, then the single case:

```
npx playwright test --config e2e/playwright.config.ts --workers=1 \
  --project=es-MX-language -g "V3 on the dialog"
2026-09-29T18:33:33Z -> 18:33:44Z   exit 1
Error: expect(page).toHaveURL(expected) failed
  Expected pattern: /\/$/
  Received string:  "about:blank"
  > 426 |     await expect(page).toHaveURL(/\/$/);
1 failed
```

**Identical failure, identical line, identical message, at the base catalogue.**
The implementer's control is real and it reproduces. It is also the *only*
control that can show this: the describe block is `mode: 'serial'`
(`language-control.spec.ts:98`), so in a whole-project run at the base
catalogue the leak in the case at `:268` fails first and the V3 case at `:385` is
skipped rather than run —

```
npx playwright test --config e2e/playwright.config.ts --workers=1 \
  --project=es-MX-language                 # catalogue at base
exit 1    1 failed / 3 passed / 2 skipped
  ✘ 5  language-control.spec.ts:268  V2 on the dialog  (the checkScreen leak)
  - 6  language-control.spec.ts:385  V3 on the dialog  (did not run)
```

### The mechanism, measured rather than argued

The implementer's explanation is `<Link to="/">` (`PatientsColumn.tsx:268`)
adding no history entry because the page is already at `/`. Measured in
`/usr/bin/chromium` against a sandboxed server, from a scratch script outside
the repository:

```
node scripts/v2/sandbox.mjs run --port 7843 -- node <scratch probe>   exit 0
workspace (the failing route)
  before      url http://127.0.0.1:7843/   history.length 2
  afterClick  url http://127.0.0.1:7843/   history.length 2   <- no push
  afterBack   url about:blank              history.length 2
sibling (settings-appearance.spec.ts:51-53)
  before      url http://127.0.0.1:7843/settings  history.length 2
  afterClick  url http://127.0.0.1:7843/          history.length 3   <- a real push
  afterBack   url http://127.0.0.1:7843/settings  history.length 3
```

Confirmed, and the recommendation that follows from it — leave via a route that
pushes a real history entry — is the right one. Not changed here: the file is
the UI owner's and is not in this card's May-edit.

## 7. V8–V11, V14 (route and catalogue), exit 0

```
npm run build:shared && npx vitest run server/src/routes/plans.test.ts \
  shared/src/i18n/t.test.ts
2026-09-29T18:35:37Z   exit 0   2 files / 56 tests passed (857ms)
```

`plans.test.ts` carries the rows by name: `V8:` at `:679`, `V9:` at `:698`,
`V10:` at `:713`, `V11:` at `:756`, and the approved Spanish sentence is written
out literally at `:707` and `:719` rather than read back from `esMX`. V14's
in-browser half is the `plan.spec.ts:245` case in §6; the matcher half is
`t.test.ts:265`, the same run, exit 0.

## 8. V5, V6, V7 — inherited, with what was and was not re-run

AM-062: *"V4–V7 have verified prior evidence in evidence/S2.6. Do not repeat V5
deliberate scratch catalogue mutation. Rerun normal V4 checks for the changed
paths; cite inherited V5–V7 evidence honestly."*

- **V5** — not repeated, per AM-062. But the oracle's ability to fail is now
  **in the tree and in this run**: `t.test.ts:237` (`fails on a wrong {name} in
  one form, which the union it replaced let through`) injects a wrong per-form
  value into a `structuredClone` scratch copy, asserts the *union* still matches
  English, and then asserts the exact mismatch lines the edit adds. Had the
  oracle gone back to unioning, that case would fail. It passed in §3 and in
  §7 — twice, exit 0. Independently, §5's V17a is a second demonstration that
  `t.test.ts` can go red on a single wrong value.
- **V6** — re-run, not inherited: `t.test.ts:194`
  (`expect(perFormMismatches(en, esMX)).toEqual([])`) and `t.test.ts:359` (the
  two rendered `"de 1 nota"` / `"de 3 notas"` values) are in the exit-0 runs
  above. No per-form mismatch remains.
- **V7** — inherited from `docs/v2/evidence/S2.6/V7-accent-low-contrast.md`
  (attempt 1: `Settings.test.tsx` 12/12 plus a `/usr/bin/chromium` probe under
  the sandbox, both themes, all four surfaces). **V7 can no longer be run as
  written.** The UI owner's backlog #9 has since removed the accent picker, so
  the row's subject does not exist: `settings.accentLowContrast` is referenced
  only in a comment (`web/src/lib/accent.ts:47`) and no file under `web/src`
  renders it, and `web/src/routes/Settings.test.tsx:570` is now
  `has no colour picker: the accent is the Apunta teal`. The evidence file is
  therefore a historical record of behaviour that has since been removed, not a
  currently reproducible check. Recorded as such below; not this attempt's to
  fix.

## 9. Findings produced by this review's own runs

### 9.1 One `checkScreen` call reads zero strings, deterministically

`settings-appearance.spec.ts:52`, `await checkScreen(page, 'Home')`, read
**0 visible strings** in the es-MX project, three runs out of three:

```
npx playwright test … --project=es-MX --no-deps -g "keeps the chosen theme after leaving Settings"
run1 exit=0   Settings — 97 strings read, 0 English   Home — 0 strings read, 0 English
run2 exit=0   Settings — 98 strings read, 0 English   Home — 0 strings read, 0 English
run3 exit=0   Settings — 99 strings read, 0 English   Home — 0 strings read, 0 English
```

Cause, measured on the same screen by walking `[data-testid="home"]` up its
ancestors: the `.route-transition` wrapper is still at `opacity: 0` when the
check runs, and `no-english.ts:130-131` skips any text node whose host fails
`checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })`.

```
.tag                 display  opacity  checkVis   checkVisLoose
DIV.home             flex     1        false      true
DIV.col.col-main     flex     1        false      true
DIV.app-shell…       flex     1        false      true
DIV.workspace        flex     1        false      true
DIV.route-transition block    0        false      true      <- the cause
```

So the call asserts nothing and cannot report a leak. The other 32 calls in the
run read between 5 and 99 strings, so this is one screen, not a pattern. Two
further calls in `language-control.spec.ts:441` and `:444` are on the same
workspace surface and share the same exposure, though neither is reached while
V3 is failing at `:426`. The file is inside this card's `e2e/tests/*.spec.ts`
glob; `no-english.ts` is too, and AM-054 forbids weakening it — nothing here
was changed.

### 9.2 Side effect: four committed PNGs are dirty, left for the coordinator

`npm run e2e` rewrote, as warned:

```
 M docs/v2/evidence/P2.2/screenshots/dark-accent-7c3aed.png
 M docs/v2/evidence/P2.2/screenshots/dark-default-accent.png
 M docs/v2/evidence/P2.2/screenshots/light-accent-7c3aed.png
 M docs/v2/evidence/P2.2/screenshots/light-default-accent.png
```

This review did not revert and did not commit them. The coordinator reverted
them at 12:41 local, while this review was still running (the files' mtimes and
a clean `git status --porcelain` for that path both show it), so they are
**clean in the tree as this review ends** — but they were dirty from this
review's e2e run, twice over, and the coordinator should know that the AM-071
revert is undone by any further `npm run e2e`.

### 9.3 Two untracked files appeared that are not this review's

`docs/v2/state/reviews/P3.1-impl.md` and
`docs/v2/evidence/P3.1/review-impl-attempt1.md` — the P3.1 reviewer's, in
flight in the same tree. Left alone. `shared/`, `web/`, `e2e/`, `server/`,
`installer/`, `scripts/` and `prototype/` are clean at the end of this review.

### 9.4 The dispatch is stale in two places

- It says `e2e/tests/language-control.spec.ts` "contains a case asserting that
  `shared/src/i18n/es-MX.ts` is *not* an editable path for this card." At
  `c4a364f` no such case exists; the file's 467 lines were read in full. The
  assertion AM-063 made false has already been removed by the UI owner's
  retarget, which **has** landed — `openLanguageDialog()` (`:74`) drives the
  dialog and `openSettingsModal()` (`:58`) only reads the page's words. V1 is
  therefore evaluable at this base, and the AM-063 "V1 waits" clause no longer
  bites.
- It records the Settings row and `openSettingsModal` as still present at
  `2b2c58e`, to be recorded as a lane conflict. The retarget has landed, so
  there is no second writer on that file at this base and no lane conflict
  remains to record.
- `AM-072` was added to `docs/v2/state/AMENDMENTS.md` **during** this review
  (working tree, 12:28 local) and licences exactly the `page.goBack()` change
  this review confirms is needed. It post-dates the dispatch this review was
  given, so it was not applied, not read as authority, and not relied on.

## 10. Final tree state

```
$ sha256sum -c pre-run-hashes.txt
shared/src/i18n/es-MX.ts: OK
shared/src/i18n/t.test.ts: OK
web/src/components/LanguageDialog.test.tsx: OK
shared/src/i18n/en.ts: OK

$ git status --porcelain -- shared/ web/ e2e/ server/ installer/ scripts/ prototype/
(no output)
```

`shared/dist` was rebuilt from the restored sources and holds
`'language.en.english': { text: 'English (United States)' }`.
