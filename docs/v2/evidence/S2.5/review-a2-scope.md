# S2.5 implementation review, attempt 2 — changed paths against May edit

Derived by the reviewer from `git diff --name-status bf7415f..1a6540a`. Not
taken from the return file's list, which was read and compared afterwards.

## The full change set: 29 paths

```
$ git diff --name-status bf7415f..1a6540a
M   docs/v2/ORCHESTRATION-LOG.md
A   docs/v2/evidence/S2.5/english-parity-attempt-2.md
M   docs/v2/evidence/S2.5/v1.md
M   docs/v2/evidence/S2.5/v2.md
M   docs/v2/evidence/S2.5/v3.md
M   docs/v2/evidence/S2.5/v4.md
M   docs/v2/state/returns/S2.5.md
M   server/src/ai/errors.test.ts
M   server/src/ai/errors.ts
M   server/src/ai/fact-guard.ts
M   server/src/ai/prior-note-guard.ts
M   server/src/ai/refine-guard.ts
M   server/src/ai/refine-request.test.ts
M   server/src/ai/refine-request.ts
M   server/src/ai/retractions.test.ts
M   server/src/ai/retractions.ts
M   server/src/http/errors.test.ts
M   server/src/http/errors.ts
M   server/src/import/halaxy/parser.test.ts
M   server/src/import/halaxy/parser.ts
M   server/src/routes/chat.test.ts
M   server/src/routes/chat.ts
M   server/src/routes/draft.ts
M   server/src/routes/generate.test.ts
M   server/src/routes/halaxy.ts
M   server/src/routes/licenses.test.ts
M   server/src/routes/licenses.ts
M   shared/src/i18n/en.ts
M   shared/src/i18n/es-MX.ts
```

**22 code paths, 7 documentation paths.** (The coordinator's note said 22 files;
that is the code count, and it reconciles exactly.)

## Each code path against May edit

| Path | Licence |
| --- | --- |
| `server/src/ai/errors.ts` | base May edit: "the twenty `MESSAGES` entries and `UNREACHABLE_MESSAGE`" |
| `server/src/ai/errors.test.ts` | "every `*.test.ts` beside a file named above" |
| `server/src/ai/refine-guard.ts` | base May edit, "sentence text only" |
| `server/src/ai/fact-guard.ts` | base May edit, "sentence text only" |
| `server/src/ai/prior-note-guard.ts` | base May edit, "sentence text only" |
| `server/src/ai/refine-request.ts` | **AM-045**, "the sentences at `:297,309,354,373,385` and `:549,552,555`" |
| `server/src/ai/refine-request.test.ts` | `*.test.ts` beside the above |
| `server/src/ai/retractions.ts` | **AM-045**, "`:254` and `:257-269`" |
| `server/src/ai/retractions.test.ts` | `*.test.ts` beside the above |
| `server/src/http/errors.ts` | base May edit (helpers, the handler's own bodies, the two storage sentences) |
| `server/src/http/errors.test.ts` | `*.test.ts` beside the above |
| `server/src/import/halaxy/parser.ts` | **AM-045**, widened to "the sentences this module returns to the browser" |
| `server/src/import/halaxy/parser.test.ts` | `*.test.ts` beside the above |
| `server/src/routes/chat.ts` | base May edit (`:184`, `:610-623`) + **AM-045** (`:583-610`) |
| `server/src/routes/chat.test.ts` | `*.test.ts` beside the above |
| `server/src/routes/draft.ts` | base May edit, "the `status` and `error` sends" |
| `server/src/routes/generate.test.ts` | `*.test.ts` beside `routes/generate.ts`, a May-edit file |
| `server/src/routes/halaxy.ts` | base May edit, one of the fourteen route files |
| `server/src/routes/licenses.ts` | **AM-045**, "`:35`, the About page's 404" |
| `server/src/routes/licenses.test.ts` | `*.test.ts` beside the above |
| `shared/src/i18n/en.ts` | base May edit, "every key this card's sentences need" |
| `shared/src/i18n/es-MX.ts` | base May edit, same |

**Every code path is inside May edit as AM-045 widened it. No exceptions.**

## The three files that must NOT appear

The reviewer checked each by name rather than by eyeball:

```
$ git diff --name-only bf7415f..1a6540a | grep -E \
  'shared/src/errors\.ts|shared/src/i18n/t\.ts|shared/src/i18n/locales\.ts|\
   shared/src/i18n/t\.test\.ts|shared/src/index\.ts|shared/src/job-context\.ts|\
   ^web/|^prototype/|server/src/app\.ts|server/src/index\.ts|\
   server/src/ai/(ollama|fake|whisper|types|index)\.ts|server/src/extract/|server/src/backup/'
(no output)
```

Empty. Specifically confirmed absent: **`web/`** (nothing), **`prototype/`**
(nothing), `shared/src/errors.ts` (the closed `ApiErrorCodeSchema` and
`ApiErrorSchema`), `shared/src/i18n/t.ts`, `locales.ts` and **`t.test.ts`** (the
three read-only oracles), `shared/src/index.ts`, `shared/src/job-context.ts`,
`server/src/app.ts`, `server/src/index.ts`, the three provider files, the
provider factory and signatures, `server/src/extract/**` and
`server/src/backup/**`.

This is a notably clean scope result. The four findings AM-045 was written to
absorb all live in files the amendment names, and the three files attempt 1
flagged as outside May edit (finding 9 — the two `*.test.ts` options objects
and `app.ts:14`) are **untouched by attempt 2**, exactly as the return claimed.
The reviewer read the diff rather than taking that on trust: no import was
added to `app.ts`, and neither options object moved.

## Nothing else in the way

```
$ git diff --name-only bf7415f..1a6540a | grep -E 'package(-lock)?\.json|\.sql$|\.config\.|tsconfig|\.mjs$|\.sh$'
(no output)
```

No dependency, no lockfile, no migration, no config, no script. Combined with
the hard-stop sweep in `review-a2-hard-stops.md`: **no network, no secrets, no
new hosts, no protected path.**

**Changed paths within scope: PASS.**
