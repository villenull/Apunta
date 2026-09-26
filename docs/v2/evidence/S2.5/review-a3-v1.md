# S2.5 — implementation review, attempt 3 — row V1

Reviewer-run. Attempt-2's file for this row is `review-a2-v1.md`; this one
supersedes nothing, it is a third independent run.

- Working directory: repository root
- Node: `v24.19.0` (exported from the provisioned path first, as the row writes)
- Tip at run 1: `22fd351` · Tip at run 2 (re-run after the tip moved): `c5a62c8`
- Start / end: 2026-09-26T15:10:57-06:00 → 15:10:58 (run 1);
  15:11:35 → 15:11:36 (run 2)

## Command, exactly as the row writes it

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && npm run build:shared && npx vitest run server/src/http/errors.test.ts server/src/http/locale.test.ts server/src/boot-error.test.ts server/src/ai/errors.test.ts server/src/routes/chat.test.ts server/src/routes/settings.test.ts server/src/routes/backup.test.ts shared/src/i18n
```

(`--reporter=verbose` added so the test names are in the log, as
RUN-CONFIG §4 requires for a row that names new cases.)

## Exit codes observed

| Step | Run 1 | Run 2 |
| --- | --- | --- |
| `node --version` | `0` → `v24.19.0` | `0` → `v24.19.0` |
| `npm run build:shared` | **0** | **0** |
| `npx vitest run …` | **0** | **0** |

## Collected counts

```
 Test Files  9 passed (9)
      Tests  142 passed (142)
   Duration  1.45s
```

Both runs. Row floor is **8 files / 122 tests**; the card adds
`server/src/http/locale.test.ts` as its one new test file, so 9 is the expected
figure. 0 skipped, 0 failed. Reproduces attempt 1's, attempt 2's and the
implementer's figure exactly.

## The four new cases, and where they are witnessed

The four cases attempt 3 added are in `server/src/ai/refine-request.test.ts`,
which **this row's fixed filter does not name**. Confirmed: the filter lists
seven server files plus `shared/src/i18n`; `ai/refine-request.test.ts` is not
among them, so V1 collects 9/142 whether they exist or not. The implementer
disclosed this. See the review's ruling — it is a NOTE, not a FAIL — and V3 for
the witness (`review-a3-v3.md`):

```
✓ src/ai/refine-request.test.ts > the server’s own sentences in Spanish > joins a Spanish reply out of the same pieces, with the diff sentence in Spanish too
✓ … > names a scope of two sections with y, not with an English and
✓ … > reports a change in the note’s language, addition and conjunction included
✓ … > clears, shortens, expands and rewrites a section in the note’s language
✓ … > gives the two verdict fallbacks in the note’s language, beside the English they replace
```

What V1 *does* witness for this attempt, and it is the part that matters:
`shared/src/i18n/t.test.ts`'s per-key placeholder-equality case runs inside this
row, and the nine new keys are in the catalogues it checks. "names the same
placeholders in both, for every key either holds" is green.

## The English oracle this row still anchors

`server/src/routes/chat.test.ts` is in the filter and pins the diff sentence's
**English** bytes, unmodified by attempt 3 — `:146`, `:164` (one part),
`:1303`, `:1467` (two parts), `:1492`. Those five pins pass. They are the
orasure FD6 names, and they pass. See the review for the one branch of that
sentence that no pin in the repository covers.

`server/src/routes/settings.test.ts:149` and `server/src/boot-error.test.ts:12`
also in the filter, both green.
