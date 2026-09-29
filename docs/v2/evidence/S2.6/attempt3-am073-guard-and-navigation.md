# S2.6 attempt 3 — the guard that passed by asserting nothing, and the `goBack()` that fell off the history

Implementation session, 2026-09-29. Dispatch `docs/v2/state/dispatch/S2.6.md`
(base `413445c`, attempt 3 of 3). Sandbox ports **7847** (English) and **7848**
(es-MX), `scripts/v2/sandbox.mjs env` run folders, sanitised to `<sandbox>`
below. Node **v24.19.0** (pinned, `mise`),
`PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium`. Live port 7717 never
contacted. Nothing committed, staged, reset or checked out; two source files
left modified for the coordinator to stage.

Raw logs for every run below are under `/tmp/opencode/S2.6-a3/`. The four
committed PNGs in `docs/v2/evidence/P2.2/screenshots/` were rewritten by the
Playwright runs, as the attempt-2 review warned; they are left dirty, not
reverted and not committed.

## 0. Starting state

```
cwd: repository root
git log --oneline -3
34aa61e Give S2.6's last attempt both fixes, and pin the shape of the guard fix
413445c Record S2.6's review FAIL, and the guard that passes by asserting nothing
b54fe25 Approve P3.1 on an independent cold re-run, carrying one finding forward
git status --porcelain      # empty
```

HEAD is `34aa61e`, one coordinator commit ahead of the dispatch's base
`413445c`; that commit is the one that adds AM-072 and AM-073 to the card, so
the working base is the intended one. It is recorded rather than treated as a
stop, and nothing under `shared/`, `web/`, `e2e/`, `server/` or `installer/`
differs between the two.

## 1. What changed, and why each change is the licensed one

Two files, both already inside May edit.

### `e2e/support/no-english.ts` — the guard must require a non-zero read (AM-073)

One new function, `arrivedStrings` (`e2e/support/no-english.ts:187`), and one
new assertion (`e2e/support/no-english.ts:225-229`).

`arrivedStrings` reads the page, and **while it has read nothing it keeps
reading**, up to `ARRIVAL_TIMEOUT_MS = 5_000` at `ARRIVAL_POLL_MS = 100`. That
is the whole of the wait. The visibility rule is untouched: `visibleStrings`
still calls `checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })`
on every host, exactly as at base, and `e2e/support/no-english.ts:138` is
unchanged from base (`git diff` shows no hunk inside `visibleStrings`).

The new assertion is `expect(read).toBeGreaterThan(0)`, placed **before** the
leak assertion and after the annotation, so a call that read nothing records
`0 strings read, 0 English` and then fails, naming the screen and the count.

The diagnosis the wait acts on is the one the review measured, and §5 below
re-measures it: `.route-transition` is re-keyed per path (`web/src/App.tsx`) and
animated by `rise-in`, whose `from` is `opacity: 0` (`web/src/styles/motion.css`);
`checkVisibility({ checkOpacity: true })` drops that whole subtree; Playwright's
`toBeVisible()` immediately before every call does not consider opacity, so the
two disagree for the length of one `--motion-base` (240ms).

**Not done, deliberately:** `checkOpacity` was not narrowed; `ALLOWED` still
holds exactly `chat.list.last` and `common.listLast` and gained no entry; no
screen was dropped from the es-MX project; no `checkScreen` call was removed,
conditioned or `fixme`d; no assertion was deleted; no `appLocale` was changed.

### `e2e/tests/language-control.spec.ts` — one case's navigation (AM-072)

Only the "V3 on the dialog" case (`:385`) and only its away-and-back steps. In
both halves of that case the page leaves `/` by clicking `new-patient`
(`<Link to="/patients/new">`, `PatientsColumn.tsx:308`), asserts
`add-patient-form` is visible — proof it really left — and then calls
`page.goBack()`, which now has a history entry to return from. Every assertion
that was there is still there: `toHaveURL(/\/$/)`, the `lang` attribute before
and after the Back, `storedLanguage`, both `checkScreen` calls with their
original screen names, the reload, and the Settings round trip. Two assertions
were **added** (`add-patient-form` visible, and a second `toHaveURL(/\/$/)`) and
none removed. `home` visible moved to after the Back, where it is the assertion
that actually means "we are back on the workspace".

The case count in the file is unchanged at 6 (1 top-level + 5 in the serial
describe), measured from the run in §3.

## 2. V4 — the gates (PASS, exit 0 on all four)

```
cwd: repository root   node v24.19.0

npm run build:shared                                    exit 0
$ grep -n "language.en.english" shared/dist/i18n/es-MX.js
1135:    'language.en.english': { text: 'English (United States)' },

npx vitest run web/src                                  exit 0   49 files / 516 tests passed (5.55s)
npm run lint                                            exit 0
  (eslint, prettier --check ., check-no-external-urls.mjs,
   collect-licenses.mjs --check, check-ui-strings.mjs — all clean)
npm run typecheck                                       exit 0   (shared, server, web, e2e)
```

`npm run lint` was run **again at the end**, after the Playwright runs that
rewrote the P2.2 screenshots, and was exit 0 then too: no prettier or lint
failure on any path, this session's or the concurrent docs agent's.

`build:shared` is confirmed to have moved the value `web` reads, **before** every
web run recorded here — the trap attempt 2 fell into once. §6's V17a repeats
`build:shared` and greps `shared/dist` again before its web run.

## 3. V1 — the bilingual e2e line, both projects (PASS, exit 0)

```
. <sandbox>.env   # node scripts/v2/sandbox.mjs env --port 7847
export APUNTA_E2E_ES_PORT=7848
export APUNTA_E2E_ES_DATA_DIR='<sandbox>/data'   # the 7848 run folder
export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium

npm run e2e -- --workers=1
2026-09-29T18:58:29Z -> 18:59:21Z   exit 0   6 skipped / 106 passed (51.6s)
2026-09-29T19:02:01Z -> 19:02:53Z   exit 0   6 skipped / 106 passed (52.0s)   # re-run, final tree
```

Run twice, both exit 0. The 6 skips are the six `test.skip(appLocale !== …)`
branches — five Spanish-only cases in the `chromium` project and the
English-only case in `es-MX-language`. Nothing else is skipped, and **the
`es-MX` project ran**: its `es-MX-language` dependency passed, so unlike the
attempt-2 run there is no `did not run` block.

The cases the card names, from the final run's own list:

```
✓  28 [chromium]      language-control.spec.ts:80   Language: not offered on a build without the dev switch
✓  58 [es-MX-language] language-control.spec.ts:104  V2: disabled with its reason while a refine streams
✓  59 [es-MX-language] language-control.spec.ts:154  V2: the server refuses a language change while a draft streams
✓  60 [es-MX-language] language-control.spec.ts:203  V3: switching applies at once, leaving the control and coming back
✓  61 [es-MX-language] language-control.spec.ts:268  V2 on the dialog
✓  62 [es-MX-language] language-control.spec.ts:385  V3 on the dialog          <-- the case AM-072 licenses
✓  34 [chromium]      plan.spec.ts:58                the treatment plan
✓  90 [es-MX]         plan.spec.ts:58                the treatment plan
✓  35 [chromium]      plan.spec.ts:245               V14
✓  91 [es-MX]         plan.spec.ts:245               V14
```

`V3 on the dialog` is the row that was exit 1 at attempt 2 on
`expect(page).toHaveURL(/\/$/)` receiving `about:blank`. It is now green,
twice, with the navigation fixed rather than with the assertion weakened.

The single case on its own, before the whole-project run, so its result does not
depend on anything else passing:

```
npx playwright test --config e2e/playwright.config.ts --workers=1 \
  --project=es-MX-language
2026-09-29T18:58:07Z -> 18:58:26Z   exit 0
  1 skipped / 5 passed (18.4s)
```

## 4. The accounting AM-073 asks for: all 33 es-MX `checkScreen` calls

Counted from the JSON reporter's own `no-english-ui` annotations, not inferred.
`--no-deps` is a Playwright flag; no config was edited, both servers still come
from the same `webServer` block, and `appLocale: 'es-MX'` is intact.

```
npx playwright test --config e2e/playwright.config.ts --workers=1 \
  --project=es-MX --no-deps --reporter=json
2026-09-29T18:59:29Z -> 19:00:33Z   exit 0
stats {"expected":50,"skipped":0,"unexpected":0,"flaky":0}
CHECKSCREEN CALLS 33 across 11 spec files
CALLS THAT READ 0 STRINGS: 0
CALLS THAT REPORTED ENGLISH: 0
```

| read | English | screen | reached by a route change? |
| ---: | ---: | --- | --- |
| 13 | 0 | `settings-appearance.spec.ts` **Home** | **yes — the `<Link to="/">` click, one assertion before the call; this is the call that read 0 at attempt 2** |
| 7 | 0 | `halaxy-import.spec.ts` Import from Halaxy | **yes — `<Link to="/import/halaxy">` click** |
| 10 | 0 | `halaxy-import.spec.ts` Import from Halaxy, with an earlier import | yes — `page.goto('/import/halaxy')` |
| 58 | 0 | `capture.spec.ts` Capture | yes — `page.goto('/capture/:id')` |
| 62 | 0 | `capture.spec.ts` Capture while recording | no (same route, mic) |
| 20 | 0 | `capture.spec.ts` the drafted note | no (same route) |
| 43 | 0 | `spelling.spec.ts` a note with spelling marks | yes — `page.goto` |
| 50 | 0 | `spelling.spec.ts` the spelling menu | no (click) |
| 50 | 0 | `chat-dictation.spec.ts` the refine chat while dictating | yes — `page.goto` |
| 85 | 0 | `settings-appearance.spec.ts` Settings | yes — `page.goto('/settings')` |
| 70 | 0 | `backup.spec.ts` Settings after a backup | yes — `page.goto('/settings')` |
| 92 | 0 | `backup.spec.ts` Settings, Advanced open, with archives | no |
| 91 | 0 | `backup.spec.ts` Settings, Advanced open | no |
| 95 | 0 | `backup.spec.ts` Settings with a restore staged | no |
| 25 | 0 | `setup.spec.ts` Setup, with the local AI missing | yes — `page.goto('/setup')` |
| 30 | 0 | `setup.spec.ts` About | yes — `page.goto('/about')` |
| 12 | 0 | `import.spec.ts` Import from Claude | yes — `page.goto('/')`, then the More menu |
| 13 | 0 | `import.spec.ts` the Claude import preview | no |
| 11 | 0 | `import.spec.ts` the Claude import report | no |
| 5 | 0 | `import.spec.ts` the Claude import, undone | no |
| 19 | 0 | `halaxy-import.spec.ts` the Halaxy import preview | no |
| 7 | 0 | `halaxy-import.spec.ts` the Halaxy import report | no |
| 35 | 0 | `plan.spec.ts` the treatment plan, empty | yes — `page.goto('/')`, then the pane |
| 69 | 0 | `plan.spec.ts` the treatment plan with proposed goals | no |
| 84 | 0 | `plan.spec.ts` the treatment plan details | no |
| 65 | 0 | `plan.spec.ts` the treatment plan in force | no |
| 69 | 0 | `plan.spec.ts` a plan review in draft | no |
| 73 | 0 | `plan.spec.ts` a superseded plan version | no |
| 50 | 0 | `plan.spec.ts` the session briefing | no |
| 22 | 0 | `save-integrity.spec.ts` the blocked second window | yes — a second window's own load |
| 34 | 0 | `brainstorm.spec.ts` Brainstorm, empty | yes — `page.goto` |
| 35 | 0 | `brainstorm.spec.ts` Brainstorm, after a reply | no |
| 35 | 0 | `brainstorm.spec.ts` Brainstorm, new-conversation confirm | no |

**Summary: 33 calls, 0 read zero, 33 read non-zero, 0 English.** 13 of the 33
follow a route change (a `page.goto`, a `<Link to>` click, or a second
window's load) and are therefore the ones whose read is now a product of the
wait; the other 20 are state changes inside a route that had already settled and
read on the first look, as they always did.

The other es-MX project, counted the same way so the total is honest:

```
npx playwright test --config e2e/playwright.config.ts --workers=1 \
  --project=es-MX-language --reporter=json
2026-09-29T19:03:36Z -> 19:03:54Z   exit 0
stats {"expected":5,"skipped":1,"unexpected":0,"flaky":0}
  the Language dialog (the former Settings-row case) with a refine in flight — 55 strings read, 0 English
  the Language dialog with a refine in flight                              — 55 strings read, 0 English
  the Language dialog with nothing in flight                              — 62 strings read, 0 English
  Home, Spanish again after a switch from the dialog                      — 13 strings read, 0 English
  the workspace, Spanish again after a switch from the dialog             — 13 strings read, 0 English
```

Five more calls, five non-zero. The last two are the two `checkScreen` calls in
the case AM-072 fixed; at attempt 2 the second of them ran against `about:blank`
and read nothing at all, and the guard reported success for it.

**Grand total across both es-MX projects: 38 calls, 0 read zero, 0 English.**

## 5. The guard's new assertion is not vacuous — a control, exit 1

AM-073 does not name a control for the non-zero assertion, and one is owed
anyway: an assertion nobody has seen fail is the same defect one level down.
The control removes the wait and keeps the assertion — `ARRIVAL_TIMEOUT_MS`
scratch-set to `0`, so the guard reads once and does not wait — and runs the
exact case the review measured.

```
# scratch: e2e/support/no-english.ts, ARRIVAL_TIMEOUT_MS 5000 -> 0
npx playwright test --config e2e/playwright.config.ts --workers=1 \
  --project=es-MX --no-deps -g "keeps the chosen theme"
2026-09-29T19:01:37Z -> 19:01:43Z   exit 1

  ✘  1 [es-MX] › e2e/tests/settings-appearance.spec.ts:21:1 › settings appearance: keeps the
     chosen theme after leaving Settings and coming back, no reload (534ms)

  Error: the Spanish Home screen gave the English check nothing to read: 0 visible
  strings after waiting 0ms for it to arrive, so "0 English" here is not a result

  expect(received).toBeGreaterThan(expected)
  Expected: > 0
  Received:   0
     at ../support/no-english.ts:229
  at expectNoEnglishUi (e2e/support/no-english.ts:229:5)
  at e2e/support/fixtures.ts:64:34
  at e2e/tests/settings-appearance.spec.ts:52:3
```

This is the review's measurement reproduced from the other end: the same file,
the same line, the same `0 strings read`, and now a **failure that says so and
names the screen**. It also settles the review's stated reservation — "I am not
asserting the cause is *only* the transition opacity". On this box, in this run,
the transition opacity is the whole of it: with the wait removed the call reads
0 and fails; with the wait in place it reads 13 and passes, with the visibility
rule byte-identical to base.

Scratch file restored; `sha256sum -c` green on all four files this session
touched (§7).

## 6. V17 — the negative control, both halves (PASS: exit 1 **and** exit 1)

Hashes of all four touched files were taken before anything was mutated
(`/tmp/opencode/S2.6-a3/before.sha256`) and re-checked after every restore.

### V17a — a deliberately wrong per-key `es-MX` value makes V15 fail

`shared/src/i18n/es-MX.ts:1231` set to `'Ingles (Estados Unidos)'` (unaccented,
so the two runs differ by exactly one value):

```
npx vitest run shared/src/i18n/t.test.ts
2026-09-29T19:01:00Z   exit 1
AssertionError: language.en.english differs between en and es-MX:
                expected 'Ingles (Estados Unidos)' to be 'English (United States)'
 ❯ src/i18n/t.test.ts:227:70
Test Files  1 failed (1)   Tests  1 failed | 24 passed (25)
```

And, after `npm run build:shared` so the web test really reads a rebuilt
`shared/dist` (`shared/dist/i18n/es-MX.js:1135` confirmed to hold the wrong
value first):

```
npm run build:shared                                        # exit 0
npx vitest run web/src/components/LanguageDialog.test.tsx
2026-09-29T19:01:03Z   exit 1
AssertionError: expect 'English (United States)Ingles (Estado…'
                to be 'English (United States)English (Unite…'
Test Files  1 failed (1)   Tests  1 failed | 6 passed (7)
```

V16 is therefore not vacuous either.

### V17b — with the repair reverted, the dialog's `checkScreen` fails again

`shared/src/i18n/es-MX.ts:1231` set back to the base value
`'Inglés (Estados Unidos)'` (`git diff` confirms one line, one insertion, one
deletion), then the idle-dialog case of the `es-MX-language` project:

```
npx playwright test --config e2e/playwright.config.ts --workers=1 \
  --project=es-MX-language -g "V2 on the dialog"
2026-09-29T19:01:12Z -> 19:01:20Z   exit 1

  Error: English catalogue text on the Spanish the Language dialog with nothing in flight screen
  - Array []
  + Array [
  +   "language.en.english [text]: \"English (United States)\" (es-MX: \"Inglés (Estados Unidos)\")",
  + ]
     at ../support/no-english.ts:230
     at expectNoEnglishUi (e2e/support/no-english.ts:230:75)
     at e2e/support/fixtures.ts:64:34
     at e2e/tests/language-control.spec.ts:382:5
  1 failed
```

Note **which** assertion failed: `no-english.ts:230`, the leak assertion, not
the new one at `:229`. The call read 62 strings, so the non-zero assertion
passed and the check did its real work. That is the distinction attempt 2 could
not make.

Restored, rebuilt (`shared/dist/i18n/es-MX.js:1135` back to
`'English (United States)'`), same case re-run:

```
npx playwright test --config e2e/playwright.config.ts --workers=1 \
  --project=es-MX-language -g "V2 on the dialog"
2026-09-29T19:01:25Z -> 19:01:33Z   exit 0   1 passed (8.4s)
```

## 7. Every tracked file this session mutated, restored

```
$ sha256sum -c /tmp/opencode/S2.6-a3/before.sha256   # after the last restore
shared/src/i18n/es-MX.ts: OK
shared/src/i18n/en.ts: OK
e2e/support/no-english.ts: OK
e2e/tests/language-control.spec.ts: OK
```

`en.ts` was never edited — only read, and hashed. The final tree is those two
`e2e/` files modified and nothing else of mine:

```
$ git status --porcelain
 M docs/v2/evidence/P2.2/screenshots/dark-accent-7c3aed.png
 M docs/v2/evidence/P2.2/screenshots/dark-default-accent.png
 M docs/v2/evidence/P2.2/screenshots/light-accent-7c3aed.png
 M docs/v2/evidence/P2.2/screenshots/light-default-accent.png
 M e2e/support/no-english.ts
 M e2e/tests/language-control.spec.ts
```

The four PNGs are the side effect the attempt-2 review recorded (finding 7):
**any** `npm run e2e` rewrites them, and the coordinator's AM-071 revert is
undone by each run. Left dirty, not reverted, not committed.

## 8. Rows carried from attempt 2 rather than re-run

- **V5** — the per-form oracle's negative control. AM-062 says do not repeat the
  deliberate catalogue mutation. Re-proved in-tree instead: `t.test.ts:237`
  asserts the oracle's exact mismatch lines from an injected scratch value, and
  it is in the exit-0 run of §2's route gate; V17a above is a second,
  independent demonstration of the same property, run here.
- **V7** — the accent picker's contrast warning. Not run and not runnable: the
  accent picker was removed by the UI owner (backlog #9), which the attempt-2
  review established (finding 5). Attempt-1 evidence
  (`docs/v2/evidence/S2.6/V7-accent-low-contrast.md`) stands as a record of
  behaviour that no longer exists. Neither file this attempt touched
  reintroduces it. This is a coordinator decision, not an implementer's.
