# S2.5 attempt 4 — V1 (targeted server + i18n filter)

- Working directory: repository root (`<sandbox>/Apunta`)
- Node: `v24.19.0`, exported first as the row writes
- Start: 2026-09-26T18:36:08-06:00 · End: 2026-09-26T18:36:10-06:00
- Card commit under test: **`bc7528e`** ("Restore the diff sentence's English
  join, and pin all four part counts")

## Command

```
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && npm run build:shared && npx vitest run --reporter=verbose server/src/http/errors.test.ts server/src/http/locale.test.ts server/src/boot-error.test.ts server/src/ai/errors.test.ts server/src/routes/chat.test.ts server/src/routes/settings.test.ts server/src/routes/backup.test.ts shared/src/i18n
```

`--reporter=verbose` is added so the row records test names, as RUN-CONFIG §4
requires for V1; it changes nothing about collection.

## Exit codes

| Step | Exit |
| --- | --- |
| `node --version` | 0 (`v24.19.0`) |
| `npm run build:shared` | **0** |
| `npx vitest run …` | **0** |
| **row** | **0** |

## Output (excerpt)

```
 Test Files  9 passed (9)
      Tests  142 passed (142)
   Duration  1.45s
```

9 files / 142 tests, 0 skipped — the review's attempt-3 figure, above the row's
floor of 8 / 122. The seven named server files plus
`shared/src/i18n/locales.test.ts` and `t.test.ts`.

`t.test.ts`'s per-key placeholder-equality case runs inside this filter and
covers all nine keys attempt 3 added; the two catalogues are still symmetric
(no catalogue edit in this attempt, so the 737/737 symmetry the review measured
is unchanged).

## The FD6 oracles this row's filter does contain

- `routes/chat.test.ts` — pins the diff sentence's English bytes at its `:146`,
  `:164`, `:1303`, `:1467`, `:1492` (one-part and two-part forms), unmodified.
- `routes/settings.test.ts:149`, `boot-error.test.ts:12`, `app.test.ts`'s
  `Not Found` pin (in V3) — the named English-unchanged oracles, all pass.

## Disclosed deviation, unchanged from attempt 3 and ruled a NOTE

The row's fixed filter does **not** name `server/src/ai/refine-request.test.ts`,
so the five new cases this attempt adds are not collected here. That is the
deviation the attempt-3 review recorded and ruled a NOTE; it is not widened
here, because widening a fixed row's filter is not this attempt's to do. V3
collects the file, and the case-by-case run is in
`attempt-4-part-counts.md`.

## Extra run, outside the row, for this attempt's own cases

```
npx vitest run server/src/ai/refine-request.test.ts --reporter=verbose
```

exit **0**, `Test Files 1 passed (1) / Tests 36 passed (36)`, including:

```
✓ the diff sentence's English, part count by part count > one change: the frame around a single part, no separator at all
✓ the diff sentence's English, part count by part count > two changes: one and
✓ the diff sentence's English, part count by part count > three changes: and and — no comma, which is what the wire has always carried
✓ the diff sentence's English, part count by part count > four changes: still and and and, and still no comma
✓ the diff sentence's English, part count by part count > a non-default locale still joins through the catalogue, so Spanish reads as a list
```

31 pre-existing cases in that file still pass, unedited — the diff of
`refine-request.test.ts` in `bc7528e` is **106 insertions, 0 deletions**.
