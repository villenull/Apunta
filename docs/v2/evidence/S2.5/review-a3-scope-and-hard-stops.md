# S2.5 — attempt 3, review: scope and hard stops

Reviewer-derived at `c5a62c8`. The coordinator had already verified the shape of
the diff; this file records what I checked myself, and the one place I went
past it.

## Changed paths

Attempt 3's code commit is `ccb3dc2`, and it is exactly four files:

```
$ git show --name-only --format= ccb3dc2
server/src/ai/refine-request.test.ts
server/src/ai/refine-request.ts
shared/src/i18n/en.ts
shared/src/i18n/es-MX.ts
```

All four are in May edit as AM-045 re-encoded it: the module by the
"every sentence this module returns to the browser" clause, its `*.test.ts`
beside it, and the two catalogues for the keys those sentences need. Nothing
else in `shared/src/i18n/` changed.

Whole range `77767c2..c5a62c8`, code paths only:

```
server/src/ai/refine-request.test.ts
server/src/ai/refine-request.ts
shared/src/i18n/en.ts
shared/src/i18n/es-MX.ts
```

plus nine Markdown files (evidence, return, checkpoint, this dispatch) and
`c5a62c8`'s three `web/` files, which are the other agent's and are not this
card's.

## The read-only oracles, verified untouched

```
$ git diff --name-only 77767c2 c5a62c8 -- shared/src/errors.ts shared/src/index.ts \
    shared/src/i18n/t.ts shared/src/i18n/locales.ts shared/src/i18n/t.test.ts web prototype
(empty)
```

`shared/src/errors.ts` (the closed `ApiErrorCodeSchema`), `shared/src/index.ts`,
`t.ts`, `locales.ts`, `t.test.ts`, all of `web/` and all of `prototype/` — no
byte. So S2.2's oracles, the enum's closure and the whole of `web/` are exactly
as the card found them (HS-9).

## Guard logic, verified untouched

```
$ git diff 77767c2 c5a62c8 -- server/src/ai/refine-guard.ts server/src/ai/fact-guard.ts \
    server/src/ai/prior-note-guard.ts shared/src/chat.ts
(empty)
```

No branch, no count, no threshold, no logged field and no `*_NOTICE_OPENING`
identity moved. `refine-request.ts` is not a guard, and the diff inside it is
confined to the two render helpers and their two new `locale` parameters — the
diff loop, the verb choice and the `parts.length === 0` early return are all
byte-identical.

## HS-7, at the diff level

- No `.skip`, `.only` or `it.todo` anywhere in `ccb3dc2`.
- No `expect(` line removed anywhere in `ccb3dc2` (grep of the diff's `-` side).
- `refine-request.test.ts`: `27 → 31` `it(` blocks. One title changed, nothing
  deleted; the retitled case gained six assertions.
- V3 collected 92 files / 1344 tests with **0 skipped**, and V1 9 / 142 with 0
  skipped.
- V4's perturbation was reverted and `git status --porcelain` is empty;
  `t.test.ts` was not edited.
- No threshold, scorer or contract in `docs/v2/CONTRACTS.md` was touched.

**No check was loosened. HS-7 holds.**

## The other hard stops

| Stop | Finding |
| --- | --- |
| HS-1 live data | Nothing opened the data folder, a backup, the Claude export or a Halaxy PDF. **7717** never contacted. No `recover-current-linux.mjs`, no `smoke-live.mjs`. Databases were only the tests' own `mkdtempSync` temp directories. |
| HS-2 isolation | The card's four rows run bare by its own written exemption, and this review ran them bare too. No server was launched, no app opened, no browser used. |
| HS-3 downloads | None. No install, no model, no network of any kind during this review. |
| HS-4 git | I pulled, merged, rebased, reset, stashed, cleaned and committed **nothing**. Read-only throughout; the only writes were this review's own output files under `docs/v2/` and scratch files outside the checkout. One temporary `.cjs` was placed at the repository root for a single `node` invocation that could not resolve `typescript` from `/tmp`, and removed in the same command — flagged here rather than left implicit. |
| HS-5 secrets | None created, printed or committed. |
| HS-6 runtime network | No new network access from `server/`, `web/` or `shared/`. `ccb3dc2` adds no import of anything but `@apunta/shared` and the module's own `../http/locale.js`. |
| HS-8 fabricated data | Every name and every clinical string in this review's evidence is synthetic and prototype-derived (`John Smith` style). No real patient text was read, quoted or committed. |
| HS-9 protected paths | `prototype/` untouched. Every edited path inside May edit. The one defect found is **inside** a licensed file, so it is a finding, not a scope breach. |
| HS-10 owner-only actions | None taken. Spanish was not enabled in any release build; no verdict written; nothing published. |

## The tip moved under me, twice, and this is the report

- Dispatch step 1 asks me to confirm `HEAD` is `6e77654` and the tree is clean.
  **Neither held.** `git log -1` was `22fd351` ("Dispatch S2.5's final
  implementation review"), a descendant of `6e77654`, and the tree carried three
  dirty `web/` files belonging to another agent. Reported, not treated as a
  stop, per the coordinator's instruction.
- **While the rows were running, the tip moved again** to `c5a62c8`
  ("Retune the palette, serif and settings modal to claude.ai", AM-047), which
  is the other agent committing exactly those three `web/` files. The three
  files' *content* is what my rows ran over, so the results carry; I did not
  rely on that argument alone and **re-ran all four rows at the new tip**, and
  every figure reproduced exactly (V1 9/142 exit 0, V2 lint 0 / typecheck 0 /
  `TOTAL 0`, V3 92/1344 exit 0, V4 row 0 with the perturbed run failing on
  `errors.language_unavailable in es-MX` and the file restored).
- `6e77654` is an ancestor of `c5a62c8`, and:

```
$ git diff --name-only 6e77654 c5a62c8 -- server shared e2e scripts installer prototype package.json vitest.config.ts
(empty)
```

**Not one byte of the code under review differs from the reviewed head.** The
whole delta is Markdown and three `web/` files. Same protocol the attempt-2
reviewer used, and for the same reason.

## Environment collision

**None to report.** Both lint runs were green over the other agent's dirty
`web/src/components/icons.tsx`, `web/src/styles/app.css` and
`web/src/styles/tokens.css`. No repo-wide row came back red in a file this
review does not own, so nothing was re-run for that reason and nothing of
`web/` was touched. `web/src/components/PatientDirectory.tsx`,
`PatientMenu.tsx`, `PatientRenameForm.tsx`, `PatientsColumn.tsx`,
`routes/Setup.tsx` also became dirty mid-review; likewise untouched.
