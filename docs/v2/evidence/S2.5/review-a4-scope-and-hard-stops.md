# S2.5 review, attempt 4 — scope, hard stops, and the two preconditions

- Working directory: repository root. Node `v24.19.0`.
- Head named by the coordinator `bea4b40`; tip when the rows ran `23e36ca`.

## Precondition 1 — the tip is not `bea4b40`, and I continued

```
$ git log -1 --format='%H %s'
23e36ca Log S2.5's final attempt, the UI browser pass, AM-050 and the held review

$ git merge-base --is-ancestor bea4b40 HEAD ; echo $?
0
```

`bea4b40` **is** an ancestor of the tip; nothing was rewritten. The commits
between them are another agent's (`c136b8d` AM-050, `98b1870` the pin/rename
work) and one docs commit. The proof that the code under review is untouched:

```
$ git diff --name-only bea4b40 HEAD -- server shared installer scripts prototype package.json vitest.config.ts e2e
(empty)
```

The only `web/` delta between the two tips is that agent's `web/**`, which this
card may not edit and which I did not touch. The dispatch's step 1 and the
coordinator's instruction both say to report this and continue; this is that
report.

## Precondition 2 — the working tree

`git status --porcelain` was **empty** when I started, and empty after every
row. The three `web/` files another agent had in flight are now committed
(`98b1870`). Untouched by me throughout. No pull, merge, rebase, reset, stash,
clean, force-push or commit was performed by this review. The only files I
created are this one, its siblings under `docs/v2/evidence/S2.5/`, and the
review itself; the only files I executed are in `/tmp/opencode/s25/`.

## Changed paths, against May edit

```
$ git diff --name-only 2dd09d2 bea4b40 -- server shared web installer scripts prototype package.json vitest.config.ts e2e
server/src/ai/refine-request.test.ts
server/src/ai/refine-request.ts
shared/src/i18n/en.ts
web/src/components/PatientDirectory.tsx
web/src/components/PatientRenameField.tsx
web/src/components/icons.tsx
web/src/styles/app.css
```

**Three of these seven are the card's**, and each is licensed:

| Path | Licence |
| --- | --- |
| `server/src/ai/refine-request.ts` | AM-045: "every sentence this module returns to the browser" — the separator and the docstring, nothing else |
| `server/src/ai/refine-request.test.ts` | "every `*.test.ts` beside a file named above" |
| `shared/src/i18n/en.ts` | "every key this card's sentences need, and only those" — **and here, a comment only** |

The four `web/` files are the other agent's commits (`98b1870`), interleaved
into the range. `web/**` is in the card's Must-not-edit list, so I checked
whether the S2.5 commits touched them: the S2.5 commits in this range are
`bc7528e` (the code), `49ebdbb` (Markdown evidence) and `bea4b40` (the return
file), and

```
$ git show --stat --format= bc7528e
 server/src/ai/refine-request.test.ts | 106 ++++++++++++++++++++++++++++++++
 server/src/ai/refine-request.ts      |  44 ++++++++++-----
 shared/src/i18n/en.ts                |   7 ++-
```

No `web/` path in the card's own commit. **Changed paths within scope: PASS.**

Files that must not be touched, checked one by one against `2dd09d2..bea4b40`:

```
shared/src/errors.ts               unchanged   (ApiErrorCodeSchema stays closed at ten)
shared/src/index.ts                unchanged   (read-only)
shared/src/i18n/t.ts               unchanged   (read-only, the oracle)
shared/src/i18n/locales.ts         unchanged   (read-only, DEFAULT_LOCALE lives here)
shared/src/i18n/t.test.ts          unchanged   (read-only, the oracle)
shared/src/i18n/es-MX.ts           unchanged
server/src/ai/refine-guard.ts      unchanged   (guard logic)
server/src/ai/fact-guard.ts        unchanged   (guard logic)
server/src/ai/prior-note-guard.ts  unchanged   (guard logic)
server/src/ai/retractions.ts       unchanged
shared/src/chat.ts                 unchanged
prototype/                         untouched
installer/                         untouched
```

And `en.ts`'s diff, filtered to lines that are not comment lines, is **empty**:

```
$ git diff 2dd09d2 bea4b40 -- shared/src/i18n/en.ts | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)' | grep -vE '^[+-]\s*(\*|/\*\*|\*/)'
(empty)
```

**No key was added, removed or reworded by this attempt** — which is also why
V1's placeholder oracle has nothing new to bite on here.

## HS-7 at the diff level

```
$ git diff 2dd09d2 bea4b40 -- server shared | grep -E '^-.*expect\('   | wc -l
0
$ git diff 2dd09d2 bea4b40 -- server shared | grep -E '^\+.*expect\('   | wc -l
14
$ git diff 2dd09d2 bea4b40 -- server shared web | grep -E '^\+.*(\.skip|\.only|it\.todo|describe\.skip|test\.skip)'
(no match)
$ grep -c 'it(' <base test>   → 31        $ grep -c 'it(' <head test>  → 36
```

**Zero assertions removed, fourteen added, no `skip`, no `only`, no `todo`, and
31 → 36 cases with the 31 pre-existing ones unedited** (the test file's diff is
106 insertions, 0 deletions). No check, threshold, guard or scorer was touched
anywhere in the diff. V1 and V3 both report 0 skipped.

## The rest of the hard stops

| Stop | Status | How I checked |
| --- | --- | --- |
| **HS-1** live data | PASS | No server launched, no data folder opened, 7717 never contacted, no `recover-current-linux` / `smoke-live`. The only databases are the tests' own `mkdtempSync` temp dirs; the only socket is 7812, inside C-ISO@1's band. |
| **HS-2** isolation | PASS | Every row is in-process vitest / eslint / prettier / `tsc`, run bare exactly as the card's Verification section directs. `scripts/v2/sandbox.mjs` was not used because no row launches anything. |
| **HS-3** downloads | PASS | No model, no install, no fetch. `docs/v2/ACQUISITION.md` is untouched by this attempt. |
| **HS-4** git | PASS | No merge, pull, rebase, reset, force-push, history rewrite or visibility change. Explicit paths only; I staged nothing. |
| **HS-5** secrets | PASS | The diff adds no key, password or token. `grep -iE 'token|secret|password|apiKey'` over added lines in `server/` and `shared/`: no match. |
| **HS-6** network at runtime | PASS | `grep -iE 'https?://|fetch\(|net\.|dns\.'` over added lines in `server/` and `shared/`: no match. No dependency added — `collect-licenses --check` still lists 111 packages. |
| **HS-7** safety instruments | PASS | See above. No threshold in `docs/v2/CONTRACTS.md` changed; no test deleted, skipped or relaxed. |
| **HS-8** fabricated data | PASS | The new cases use the prototype's own section names and a synthetic note; no patient name appears in the diff, in English or Spanish. |
| **HS-9** protected paths | PASS | `prototype/` untouched; nothing edited outside May edit; the two named follow-ups (`server/src/test/providers.ts`, the three error-class files) were left alone, as HS-9 requires. |
| **HS-10** owner-only actions | PASS | Spanish was not enabled anywhere, no release published, no secret created, the live v1 instance neither stopped nor inspected. |

## The one thing the rows cannot see, which I looked for anyway

`t.test.ts`'s placeholder oracle unions `text` with **every** plural form
(`t.test.ts:57-66`), so a key whose `text` and whose `plural.one` carry
different placeholder *sets* passes it. I checked every key for that shape and
found one, in a key this card does not own — see
`review-a4-comments-and-return.md`, finding 4. It is out of scope and does not
gate, and it is exactly the blind spot that let a three-part English form escape
four green rows at attempt 3, so it is worth the next card's attention.
