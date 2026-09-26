# S2.5 — independent review, row V1

Reviewer run, not the implementer's. The implementer's own
`docs/v2/evidence/S2.5/v1.md` was not read before this run and its numbers were
not used.

- Working directory: repository root (`~`)
- HEAD at the time of the run: `bafdcff` (`Record S2.5's commits in its return
  file (card S2.5)`)
- Command, exactly as the row writes it:

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && npm run build:shared && npx vitest run --reporter=verbose server/src/http/errors.test.ts server/src/http/locale.test.ts server/src/boot-error.test.ts server/src/ai/errors.test.ts server/src/routes/chat.test.ts server/src/routes/settings.test.ts server/src/routes/backup.test.ts shared/src/i18n
```

  (`--reporter=verbose` added because the row requires the collected file and
  test counts and the names of the new cases to be recorded; the row's own
  filter and order are unchanged.)

- Start: 2026-09-26T19:35:16Z
- End: 2026-09-26T19:35:18Z
- Exit code: **0**

## `node --version`

```
v24.19.0
```

Inside `engines` (`>=24.19.0 <25`). The rows were run bare, not through
`sandbox.mjs`, for the reason the card gives; nothing bound a socket and no
database outside the tests' own `mkdtemp` folders was opened.

## Collected counts — derived by the reviewer, not quoted

```
 Test Files  9 passed (9)
      Tests  137 passed (137)
   Duration  1.45s
```

- **9 files** — the row's floor once the card lands is exactly 9, and
  `server/src/http/locale.test.ts` is among them (its 9 cases are listed below),
  so the one-new-test-file requirement is met and the filter did collect it.
- **137 tests**, none skipped, none `todo`. The row's floor is the 122
  pre-existing cases; 122 + 15 new = 137. The reviewer did not take the
  implementer's "122 base figure" on trust: the 122 is what the row states for
  the base commit, and the head run is strictly a superset (every named oracle
  below still passes in this run).

## The six new cases the row names — all six present, named as written

(a) Spanish bytes through a rendered 400 body, `error` code unchanged, and the
same request at `en` with today's English:

```
 ✓ routes/settings.test.ts > C-LANG@1 rule 1 — the language > renders the same 400 in Spanish once the setting is es-MX, with the code unchanged
```

(b) boot page, both languages, English first, `<html lang="en">`:

```
 ✓ boot-error.test.ts > boot error page > prints the English sentence and then the Spanish one, with html lang en
```

(c) a refine of an `es-MX` note with the setting at `en` and a Spanish-typed
message (FD3, the contract's rejection example):

```
 ✓ routes/chat.test.ts > POST /api/notes/:id/chat — refining a draft > answers a Spanish instruction on an es-MX note in the note's language
```

(d) `routes/backup.test.ts`, new-shape row rendered in the request's language and
a legacy ` — ` row shown as stored (FD5):

```
 ✓ routes/backup.test.ts > renders a stored failure in the language of the request
 ✓ routes/backup.test.ts > shows a pre-card last_backup_error row byte for byte, in either language
```

(e) `locale.test.ts` — setting-resolved, captured-at-start, note-resolved:

```
 ✓ src/http/locale.test.ts > storedLanguage > answers English when no row has ever been written
 ✓ src/http/locale.test.ts > storedLanguage > answers the row that is there
 ✓ src/http/locale.test.ts > storedLanguage > falls back to English for a row that is not a language at all
 ✓ src/http/locale.test.ts > capture > resolves the setting for a request with no note of its own
 ✓ src/http/locale.test.ts > capture > holds the value it read, even after the setting changes underneath it
 ✓ src/http/locale.test.ts > capture > resolves the note locale for a refine, whatever the setting says
 ✓ src/http/locale.test.ts > capture > falls back to the setting when the note is unknown or has no locale
 ✓ src/http/locale.test.ts > msg > renders the same key in either language from one call
```

(f) a key this card added, asserted in both catalogues:

```
 ✓ src/http/locale.test.ts > msg > fills a key this card added in both catalogues, with its number grouped
```

## The named oracles still pass in this run (HS-7)

`server/src/routes/settings.test.ts` (`Language must be "en" or "es-MX".` and
the `language_unavailable` 400), `shared/src/chat.test.ts`
(`PUBLISHED_REFUSAL`, `FIRST_PASS_MESSAGE`) and
`server/src/boot-error.test.ts` all pass. The reviewer read the diff of every
`*.test.ts` the card touched and found **no** deleted assertion, no loosened
expectation and no `skip`/`todo`; the four oracles were *added to*, not
weakened. See `review-substance.md` for that reading.

## Verdict

**PASS**, exit 0, 9 files / 137 tests.
