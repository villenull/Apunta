# S2.6, attempt 2 (AM-063): the four language names, and the two oracles that hold them

Base `85c3fd2`. Sandboxed run `<sandbox>` on ports 7833 (English) and 7834
(es-MX). Node v24.19.0 (`~/.local/share/mise/installs/node/24.19.0/bin`),
`PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium`.

## The defect, and the direction that is not interchangeable

At the base, `shared/src/i18n/es-MX.ts` held

```
'language.en.english': { text: 'Inglés (Estados Unidos)' },
```

while `shared/src/i18n/en.ts` held `'English (United States)'`. The dialog
prints the endonym and the English name in **every** locale
(`LanguageDialog.tsx`, the `.language-option-endonym` and
`.language-option-english` spans), so the English cell read
`English (United States)` over `Inglés (Estados Unidos)` on a Spanish screen.

The repair is one value, in `es-MX`, moving **toward** the English text:

```
-  'language.en.english': { text: 'Inglés (Estados Unidos)' },
+  'language.en.english': { text: 'English (United States)' },
```

`en.ts` is untouched. The reversed repair — writing the Spanish value into
`en.ts` — would make the two catalogues agree, drop the key out of
`ENGLISH_FORMS`, turn V1 green, and leave the defect on screen. V15 and V16
exist to catch exactly that, and V17 proves they can.

## V15 — the four names, byte for byte (PASS)

New case in `shared/src/i18n/t.test.ts`, `the two catalogues > leaves the four
language names untranslated, byte for byte`. It compares `esMX[key].text` to
`en[key].text` per key for `language.en.endonym`, `language.en.english`,
`language.es-MX.endonym`, `language.es-MX.english`, and then pins the four
rendered strings so a reviewer can read the names off the test.

```
cwd: repo root
npx vitest run shared/src/i18n/t.test.ts
2026-09-29T15:43:04Z -> 2026-09-29T15:43:04Z   exit 0   25 passed (25)
```

Re-run in the final tree state:

```
npx vitest run shared/src/i18n/t.test.ts web/src/components/LanguageDialog.test.tsx
exit 0   2 files, 32 tests
```

## V16 — the dialog in Spanish (PASS)

One added case in `web/src/components/LanguageDialog.test.tsx`: `names the
languages the same way in Spanish, English option included`. It renders the app
with `{ spanish_available: true, language: 'es-MX' }`, so the value on screen
comes from the **Spanish** catalogue, and asserts the Spanish heading
(`Elige tu idioma`, which is what proves the locale), the English cell reading
`English (United States)` on both lines, the Spanish cell reading
`Español (México)` / `Spanish (Mexico)`, two `.language-option-endonym,`
`.language-option-english` spans in every cell, and the tick on Spanish.

The stale header comment at the top of the file — which still claimed the
English line is dropped when it would repeat the endonym, the claim the case
directly beneath it disproves — is corrected in the same edit. No other test,
no other comment.

```
npx vitest run web/src/components/LanguageDialog.test.tsx
exit 0   7 passed (7)
```

**A fact V16 depends on, recorded because it makes the row vacuous otherwise.**
`web` resolves `@apunta/shared` to `shared/dist` (`shared/package.json`
`main`/`exports`), not to `shared/src`. A `LanguageDialog` run without
`npm run build:shared` after a catalogue edit tests the **previous** build. The
first run of this row in this attempt passed while a deliberately wrong value
was in `shared/src`, for exactly this reason; every run recorded below is after
a rebuild.

## V17 — the negative control, run twice (PASS, both halves)

V17 is the row that makes V15 and V16 mean something. A control that passes, or
is not run, leaves the repair unverified.

### V17a — a deliberately wrong per-key value makes V15 fail

`shared/src/i18n/es-MX.ts` copied to a scratch backup, then
`'language.en.english'` set to `'Ingles (Estados Unidos)'` (unaccented, so the
two runs differ by exactly the one value and nothing else):

```
npx vitest run shared/src/i18n/t.test.ts
exit 1
FAIL |shared| src/i18n/t.test.ts > the two catalogues >
     leaves the four language names untranslated, byte for byte
AssertionError: language.en.english differs between en and es-MX:
  expected 'Ingles (Estados Unidos)' to be 'English (United States)'
 ❯ src/i18n/t.test.ts:227:70
```

Supplementary, from the same scratch state, after a rebuild: the added V16
case fails too, so it is not vacuous either.

```
npm run build:shared && npx vitest run web/src/components/LanguageDialog.test.tsx
exit 1
AssertionError: expected 'English (United States)Ingles (Estado…'
                to be 'English (United States)English (Unite…'
 Tests  1 failed | 6 passed (7)
```

The file was restored from the backup (SHA-256 `058182df…b037c` before and
after) and `shared` rebuilt.

### V17b — with the repair reverted, the dialog's `checkScreen` fails again

`shared/src/i18n/es-MX.ts` restored to the base value `'Inglés (Estados
Unidos)'` from `git show HEAD:shared/src/i18n/es-MX.ts`, `npm run build:shared`,
then the idle-dialog case of the `es-MX-language` project run alone:

```
npx playwright test --config e2e/playwright.config.ts --workers=1 \
  --project=es-MX-language -g "V2 on the dialog"
exit 1
Error: English catalogue text on the Spanish
       the Language dialog with nothing in flight screen
 + Received  + 3
 +   "language.en.english [text]: \"English (United States)\" (es-MX: \"Inglés (Estados Unidos)\")",
   at ../support/no-english.ts:173
   at ../support/fixtures.ts:64:34
   at ../e2e/tests/language-control.spec.ts:382:5
```

The leak is reported **by key**, from the `checkScreen` call inside the idle
dialog case, which is where the card names it. No `ALLOWED` entry, no
weakening of the identical-value rule and no change to `ENGLISH_FORMS` or
`counterpart()` was made at any point in this attempt: `e2e/support/no-english.ts`
and `e2e/support/fixtures.ts` are byte-identical to the base.

The repair was then restored (SHA-256 matches), `shared` rebuilt, and the same
case re-run: **exit 0, 1 passed**. The final tree holds the repair.

## What was not touched

The five named routes by which V1 could be made green without the catalogue
fix were all checked and none was taken: `e2e/support/no-english.ts`
(unchanged), `e2e/support/fixtures.ts` (unchanged), `e2e/playwright.config.ts`
(unchanged — the es-MX projects keep `appLocale: 'es-MX'` and
`APUNTA_DEV_SPANISH=1`, and `es-MX-language` keeps no `dependencies`),
`e2e/tests/language-control.spec.ts` (unchanged, including the dialog's
`checkScreen` at its call inside the idle-dialog case).
