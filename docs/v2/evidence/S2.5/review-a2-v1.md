# S2.5 implementation review, attempt 2 — row V1 (reviewer's own run)

Reviewer run. Not the implementer's file. Every number here was produced by
this session; the implementer's `docs/v2/evidence/S2.5/v1.md` was read as a
claim and not used as a result.

- Working directory: repository root
- Tree: `feature/v2`, working tree clean apart from `docs/v2/ORCHESTRATION-LOG.md`
  (see `review-a2-head-discrepancy.md`)
- Start: 2026-09-26T20:14:15Z  End: 2026-09-26T20:14:17Z
- Node: `v24.19.0` (printed by the row itself; inside `engines` `>=24.19.0 <25`)

## Command, exactly as the row writes it

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && npm run build:shared && npx vitest run server/src/http/errors.test.ts server/src/http/locale.test.ts server/src/boot-error.test.ts server/src/ai/errors.test.ts server/src/routes/chat.test.ts server/src/routes/settings.test.ts server/src/routes/backup.test.ts shared/src/i18n --reporter=verbose
```

`--reporter=verbose` added, as the dispatch's evidence paragraph requires V1 to
record the test names. It changes no assertion and no selection.

## Exit codes observed

| Step | Exit |
| --- | --- |
| `npm run build:shared` | **0** |
| `npx vitest run …` | **0** |

## Counts, derived from the run's own summary

```
 Test Files  9 passed (9)
      Tests  142 passed (142)
   Duration  1.46s (transform 1.60s, setup 0ms, import 2.73s, tests 1.71s, environment 0ms)
```

**9 files / 142 tests.** The row's floor is 8 files at the base commit and 9
once `server/src/http/locale.test.ts` lands. 9 is met. A filter that failed to
collect the new file would have printed 8 and been a `FAIL`; it did not.

Files collected, read out of the verbose listing:

```
|server| src/ai/errors.test.ts
|server| src/boot-error.test.ts
|server| src/http/errors.test.ts
|server| src/http/locale.test.ts
|server| src/routes/backup.test.ts
|server| src/routes/chat.test.ts
|server| src/routes/settings.test.ts
|shared| src/i18n/locales.test.ts
|shared| src/i18n/t.test.ts
```

142 against the base figure of 122 is **20 new cases**, against the row's
"at least six new cases". No case was `skip`ped and none was deleted; see
`review-a2-hard-stops.md` for the diff-level check.

## The six cases the row names, located by the reviewer

| Row asks for | Found at | Title as it appears |
| --- | --- | --- |
| (a) Spanish bytes of a named key through a rendered 400 body, unchanged `error` code, English at `en` | `server/src/http/errors.test.ts:93` | "answers the request in its language and logs the English sentence" |
| (b) boot page, both languages, English first, `<html lang="en">` | `server/src/boot-error.test.ts:32` | "prints the English sentence and then the Spanish one, with html lang en" |
| (c) refine of an `es-MX` note with the setting at `en` and a Spanish-typed message (C-LANG@1's rejection example) | `server/src/routes/chat.test.ts:453` | "answers a Spanish instruction on an es-MX note in the note's language" |
| (d) `last_backup_error` in the new `{code, params, at}` shape rendered per request, **and** a legacy ` — ` row shown byte for byte | `server/src/routes/backup.test.ts:69` and `:101` | "renders a stored failure in the language of the request"; "shows a pre-card last_backup_error row byte for byte, in either language" |
| (e) `locale.test.ts`: setting-resolved, captured-at-start, note-resolved-for-refine | `server/src/http/locale.test.ts:82`, `:87`, `:102` | "resolves the setting for a request with no note of its own"; "holds the value it read, even after the setting changes underneath it"; "resolves the note locale for a refine, whatever the setting says" |
| (f) a key this card added, asserted in both catalogues | `server/src/http/locale.test.ts:127` | "fills a key this card added in both catalogues, with its number grouped" |

All six are present, each under a title a `--reporter=verbose` list names.

## The two rendered bodies the row asks to be recorded

The card asks for the Spanish and the English 400 the same request produces,
and the two boot-page paragraphs, so that "both languages, English first" is
checkable rather than asserted. Recorded from the assertions the row's own
green cases make, read at head:

- Spanish 507 `storage_error` body (`http/errors.test.ts:93`): contains
  `el disco está lleno`.
- The **pino line** for that same request: `logged.msg` is exactly

  ```
  Apunta cannot write to <sandbox>/data because the disk is full. Free space and try again. Your existing data was left untouched.
  ```

  and the case asserts `not.toContain('el disco está lleno')` as well. The
  log/screen split the card's Must-not-edit demands is therefore witnessed by a
  runtime assertion, not by a comment.

- Boot page, in document order (`boot-error.ts:46`): `<html lang="en">`, then
  `<h1>` title, then the **English** sentence in the first `<p>`, then the
  Spanish sentence in `<p lang="es-MX">`, then the data folder and the recovery
  line. `boot-error.test.ts:32` asserts that order; `:50` asserts both JSON
  bodies carry the **English** sentence, per fixed decision 4.

**Row V1: PASS, exit code 0.**
