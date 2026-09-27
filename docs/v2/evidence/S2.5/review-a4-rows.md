# S2.5 review, attempt 4 — the four verification rows, re-run by me

- Working directory: repository root (`<repo>`), every row.
- Node: `v24.19.0` (`export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH"`,
  printed by every row). Root `engines` is `>=24.19.0 <25`; the box default is
  v26, so the export is load-bearing.
- Run at tip `23e36ca`, a descendant of `bea4b40` (see
  `review-a4-scope-and-hard-stops.md`).
- Nothing here launches an Apunta server, opens the owner's data folder or
  contacts a live instance (HS-1, HS-2). The rows run **bare**, as the card
  writes them, for the reasons in its Verification section. The only socket any
  row binds is V3's own `real-socket-guard.test.ts:27` on **7812**, inside
  C-ISO@1's 7800-7889 band. 7717 was never contacted; the assigned port was
  unused. No browser was launched.
- The working tree was clean before and after every row. No row was re-run for
  being red; **no repo-wide row came back red in a `web/` file**, so the
  environment collision the coordinator warned about did not occur.

---

## V1 — the card's own filter

- Command, exactly as the card writes it:

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && npm run build:shared && npx vitest run server/src/http/errors.test.ts server/src/http/locale.test.ts server/src/boot-error.test.ts server/src/ai/errors.test.ts server/src/routes/chat.test.ts server/src/routes/settings.test.ts server/src/routes/backup.test.ts shared/src/i18n
```

- Start `2026-09-26T18:41:53-06:00`, end `2026-09-26T18:41:56-06:00`.
- `node --version` → `v24.19.0`
- `npm run build:shared` → **exit 0**
- `npx vitest run …` → **exit 0**

```
 Test Files  9 passed (9)
      Tests  142 passed (142)
   Duration  1.49s (transform 1.66s, setup 0ms, import 2.94s, tests 1.70s, environment 0ms)
```

**9 files, as the card requires** (the six named server files plus
`shared/src/i18n/locales.test.ts` and `t.test.ts`, plus the one new
`http/locale.test.ts`). 142 tests, **0 skipped**, 0 todo. Floor is 8 files /
122 tests, so both are exceeded and the row's collection figure is not short.

`shared/src/i18n/locales.test.ts` is in this filter, which is why V1 also
witnesses `expect(DEFAULT_LOCALE).toBe('en')` — the invariant the new
`locale === DEFAULT_LOCALE` branch leans on
(`review-a4-locale-branch.md`).

**The deviation, unchanged and still correct to keep:** this fixed filter does
not name `server/src/ai/refine-request.test.ts`, so the five new cases are not
collected here. I did not widen the filter (HS-7: a fixed row is not the
implementer's to change). The five cases are witnessed by V3 below and I ran
that file on its own as well — `36 passed`, exit 0, with all five case names
listed in `review-a4-comments-and-return.md`. What V1 exists to witness is
` t.test.ts`'s per-key placeholder equality over every key, and this attempt
added **no** key, so nothing was lost by the gap. Ruling: **NOTE**, as at
attempt 3.

---

## V2 — lint and typecheck

- Command, exactly as the card writes it:

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && npm run lint && npm run typecheck
```

- Start `2026-09-26T18:41:58-06:00`, end `2026-09-26T18:42:10-06:00`.
- `node --version` → `v24.19.0`
- `npm run lint` → **exit 0**
- `npm run typecheck` → **exit 0**

`lint` tail, complete:

```
> eslint . && prettier --check . && node scripts/check-no-external-urls.mjs && node scripts/collect-licenses.mjs --check && node scripts/check-ui-strings.mjs

Checking formatting...
All matched files use Prettier code style!
THIRD-PARTY-LICENSES.md lists all 111 shipped packages.
TOTAL 0
```

`check-ui-strings.mjs` is at **`TOTAL 0`** — this card adds no web literal, as
required. `typecheck` reached `@apunta/web` and `@apunta/e2e` and finished clean,
so the type-level half of the catalogue invariant holds: `es-MX.ts`'s
`satisfies Record<MessageKey, Message>` is satisfied for every key `en.ts` holds.

No red assertion and no `tsc` error in any file this card does not own.

---

## V3 — the breadth row

- Command, exactly as the card writes it:

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && npx vitest run server/src shared/src
```

- Start `2026-09-26T18:42:12-06:00`, end `2026-09-26T18:42:17-06:00`.
- `node --version` → `v24.19.0`
- `npx vitest run server/src shared/src` → **exit 0**

```
 Test Files  92 passed (92)
      Tests  1349 passed (1349)
   Duration  4.46s (transform 2.38s, setup 0ms, import 11.17s, tests 12.63s, environment 4ms)
```

Floor is 90 files / 1304 tests. **92 / 1349, 0 skipped, 0 todo.** The difference
from attempt 3's 92 / 1344 is exactly this attempt's five new cases. The
implementer's arithmetic (`1344 + 5`) reproduces; I did not take it, I counted.

The five new cases, named by a `--reporter=verbose` run of the file on its own
(`npx vitest run server/src/ai/refine-request.test.ts --reporter=verbose`, exit
0, **36 passed**, from 31 pre-existing cases):

```
 ✓ the diff sentence's English, part count by part count > one change: the frame around a single part, no separator at all
 ✓ the diff sentence's English, part count by part count > two changes: one and
 ✓ the diff sentence's English, part count by part count > three changes: and and — no comma, which is what the wire has always carried
 ✓ the diff sentence's English, part count by part count > four changes: still and and and, and still no comma
 ✓ the diff sentence's English, part count by part count > a non-default locale still joins through the catalogue, so Spanish reads as a list
```

---

## V4 — the negative row

- Command, exactly as the card writes it:

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && cp shared/src/i18n/es-MX.ts /tmp/apunta-v2-s2.5-es-MX.orig.ts && sed -i "s/text: 'El español no está disponible/text: '{detail} El español no está disponible/" shared/src/i18n/es-MX.ts && npx vitest run shared/src/i18n/t.test.ts; code=$?; cp /tmp/apunta-v2-s2.5-es-MX.orig.ts shared/src/i18n/es-MX.ts; test $code -ne 0 && git diff --quiet -- shared/src/i18n/es-MX.ts
```

- Start `2026-09-26T18:42:21-06:00`, end `2026-09-26T18:42:21-06:00`.
- `node --version` → `v24.19.0`
- The perturbed line, `shared/src/i18n/es-MX.ts:131`:

```
    text: '{detail} El español no está disponible en esta versión de Apunta. Elige inglés o instala la edición en español.'
```

- `npx vitest run shared/src/i18n/t.test.ts` → **exit 1** (the row requires
  non-zero inside, and requires it to be *this* failure):

```
     × names the same placeholders in both, for every key either holds 4ms

 FAIL  |shared| src/i18n/t.test.ts > the two catalogues > names the same placeholders in both, for every key either holds
AssertionError: errors.language_unavailable in es-MX: expected [ 'detail' ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "detail",
+ ]

 ❯ src/i18n/t.test.ts:123:67

 Test Files  1 failed (1)
      Tests  1 failed | 20 passed (21)
```

The failure names `errors.language_unavailable in es-MX` — the key the card's
Fixed decision 2 keeps, and the only thing wrong with it is the injected
`{detail}`. One failure, for that reason, and not a collect error or an
unrelated red.

- Restore: `cp /tmp/apunta-v2-s2.5-es-MX.orig.ts shared/src/i18n/es-MX.ts`
- `git diff --quiet -- shared/src/i18n/es-MX.ts` → **exit 0** (no leftover)
- `test $code -ne 0` → **exit 0**, so the **row exits 0**.
- `git status --porcelain` afterwards → **empty**.

`t.test.ts` is read-only and was not edited. `shared/src/i18n/es-MX.ts` is
byte-identical to `2dd09d2` and to the head. The temp copy is outside the
checkout and disposable.

**The deviation, unchanged:** V4 ran after the code commit, which is what its
last step requires — `git diff --quiet` can only mean "no perturbation leftover"
if the card's own keys are already committed. Ruling: **NOTE**, as at attempt 3.

---

## Summary

| ID | Command exit codes observed | Status |
| --- | --- | --- |
| V1 | `build:shared` 0, `vitest` 0 — 9 files / 142 tests, 0 skipped | **PASS** |
| V2 | `lint` 0 (`TOTAL 0`), `typecheck` 0 | **PASS** |
| V3 | 0 — 92 files / 1349 tests, 0 skipped (floor 90 / 1304) | **PASS** |
| V4 | row 0; perturbed run 1 on `errors.language_unavailable in es-MX`; restore clean, `git diff --quiet` 0, tree clean | **PASS** |
