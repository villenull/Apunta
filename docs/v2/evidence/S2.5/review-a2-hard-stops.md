# S2.5 implementation review, attempt 2 — hard stops, and the four NOTEs

## HS-1 … HS-10, checked against the diff

| HS | Check | Result |
| --- | --- | --- |
| **1 Live data** | No row launched a server, opened a data folder, or contacted **7717**. Databases are the tests' own `mkdtempSync(join(tmpdir(),'apunta-test-'))`. No `recover-current-linux.mjs`, no `smoke-live.mjs`. | **respected** |
| **2 Isolation** | V1–V4 are in-process vitest / eslint / prettier / `tsc`, which the card's closing paragraph says run **bare**, not through `sandbox.mjs`. The assigned port **7835** stayed unused; V3's only socket is `real-socket-guard.test.ts:27` on **7812**, inside C-ISO@1's 7800–7889 band. | **respected** |
| **3 Downloads** | No model, no download, no install, no dependency change. | **respected** |
| **4 Git** | On `feature/v2` throughout. No pull, merge, rebase, reset, force-push, history rewrite or visibility change. No commit made. `git status` shows only the one file that was already dirty. | **respected** |
| **5 Secrets** | `git diff` grep for `api_key`/`secret`/`password`/`token`/`PRIVATE KEY` on added lines: no match. No key created, printed or committed. | **respected** |
| **6 Runtime network** | Added lines matching `http(s)://`, `fetch(`, `axios`, `node:http(s)`, `net.`, `dns.`, `WebSocket`: **no match**. `node scripts/check-no-external-urls.mjs` also passed inside V2's lint chain. | **respected** |
| **7 Safety instruments** | See the dedicated check below. | **respected** |
| **8 Fabricated data** | The only personal name in added test lines is `John Smith`, the prototype's sample person. No real patient text. | **respected** |
| **9 Protected paths** | `prototype/` untouched. Every changed path inside May edit — `review-a2-scope.md`. | **respected** |
| **10 Owner-only actions** | Spanish not enabled in any release build; no clinical verdict written; no release, no secret, no contact with the live v1 instance. | **respected** |

## HS-7 specifically — no check, threshold or test was loosened

This is the one that matters most for a reviewer's credibility, so it was
checked at the diff level rather than inferred from green rows.

**No test was deleted, skipped or `todo`ped.** Every `-` line in the
`*.test.ts` portion of the diff is one of four things:

1. an import of `UNCHANGED_NOTICE` / `ALREADY_THERE_NOTICE` /
   `QUESTION_LEFT_ALONE` — **constants that became functions**, so the import
   has to change;
2. an assertion rewritten to call the function, e.g.
   `- expect(verdict.reply).toBe(UNCHANGED_NOTICE);` →
   `+ expect(verdict.reply).toBe(unchangedNotice('es-MX'));`
3. `-import { describe, expect, it } from 'vitest';` in a file that grew a
   second import line from `@apunta/shared`;
4. a test helper in `licenses.test.ts` reshaped to return `{ app, db }`, with
   both call sites updated.

Not one assertion was weakened, and none was replaced by a weaker form. The
counts corroborate: V1 went 122 → 142 (**+20**) and V3 went 1304 → 1340
(**+36**), with `1340 passed (1340)` and no skipped segment. Assertions were
added.

**No guard logic moved.** The three guard modules changed sentences and
comments. Every `*_NOTICE_OPENING` is still `msg('en', <its own key>)` — the
reviewer checked all three. No branch, count, threshold, logged field or
`blocked`/`lockedSections` decision changed; `enforceRefineScope` returns
`{ sections, held }` exactly as before, and `assessRefine`'s outcome ladder is
untouched.

**No contract threshold.** Nothing in `docs/v2/CONTRACTS.md` was edited.

## The four NOTEs the coordinator asked me to rule on

### NOTE 7 — Fastify's own parser message, passed through as a 400 body

**Ruling: correctly reported, correctly unchanged, and the right call.**

`http/errors.ts` passes a framework parser message ("Unexpected token } in JSON
at position 12") through as a 400 body. There is no key for a parser's
complaint, it names no Apunta resource, and fixed decision 6 forbids inventing
English. The alternative — wrapping it in a generic key — would *lose*
information and change the English the wire carries today. The code now carries
a comment saying so, which is what attempt 1 asked for and what was missing.
Note this is the only English that can still reach a Spanish install through an
error body, and it is a framework string, not a sentence this card wrote.

### NOTE 8 — `server/src/test/providers.ts` drops the locale

**Ruling: a real gap. Record it as a named follow-up. It is not an S2.5
blocker, because HS-9 forbids the fix.**

Verified: `RecordingLlmProvider.generateNote` / `refineNote` / `discussPatient`
take only their first argument and forward it, so the `locale` parameter the
card added to the three `LlmProvider` streaming signatures never reaches
`FakeLlmProvider` through this wrapper.

The consequence is a **silent** one, which is what makes it worth a card: a
future Spanish SSE test that wraps the fake in `recordingProviders()` will get
**English** status and progress frames and will have no signal that it did.
Nothing warns; the assertion just fails, or worse, passes against English.

It cannot be fixed here. May edit licenses "every `*.test.ts` **beside a file
named above**". `server/src/test/providers.ts` is not a `*.test.ts` — it is a
helper in `server/src/test/`, beside no May-edit file — so **HS-9 forbids the
edit** and the implementer was right to report rather than fix it. The
coordinator's framing is correct and I endorse it.

The second half of the NOTE is also right and needs no card: `eval/run.ts:160`
calls `generateNote` with no locale, and the eval corpus is English by
construction. The three route call sites (`routes/draft.ts:98`,
`routes/chat.ts:233`, `routes/brainstorm.ts:168`) **do** pass one — confirmed
by reading each, which corrects attempt 1's "four" to three.

**Recommended follow-up, one line:** give `server/src/test/providers.ts` the
same second parameter and forward it, in whichever card next touches a
`server/src/test/` helper.

### NOTE 10 — three comments claimed the notice opening is locale-invariant

**Ruling: fixed, and the fix is the honest one.** The comments now say what is
actually true — that the strip list reads the key in each language, not that the
const is the same string everywhere. The `*_NOTICE_OPENING` values themselves
are unchanged English constants, and the review confirmed all three still equal
their key's English. A comment that would have misled the next reader into
treating the const as locale-invariant is gone.

### NOTE 11 — `RawHttpError` carried a placeholder key

**Ruling: fixed, and the fix is better than the one attempt 1 suggested.**
Attempt 1 offered "a `readonly key` field set to a real per-category key, or a
`null` key". The implementer instead assigned the raw sentence to `this.message`
in the constructor, which removes the trap — a 400 or 409 whose sentence is not
in the catalogue can no longer log as a 500 — without a type change reaching
past the problem. The wire is untouched because `messageIn()` is what the
handler answers with, and it is witnessed by the comment plus the passing suite.
Leaving `key` as a documented placeholder is defensible: nothing reads it.

## The 404 body that lost `path`

`routes/licenses.ts` used to answer
`{ error:'not_found', message:'…', path:'/api/licenses' }`. It now throws
`notFound('errors.not_found.licenses_file')`, so the handler renders the body
and **`path` is gone**.

**Ruling: acceptable. Not a wire regression in any sense a consumer can
observe — and it is a consequence of the card's own pins, not of the
implementer's judgement.**

- `ApiErrorSchema` (`shared/src/errors.ts:31-35`) is
  `{ error, message, details? }`. It has **no `path` field**, so the old body
  was carrying a field the contract does not define. Zod strips unknown keys on
  `safeParse`, so `web/src/api/client.ts:60-75` **never saw it** — the reviewer
  read `toError` and confirmed it reads only `error`, `message`, `details`.
- Nothing anywhere reads it. The reviewer searched `.path` on the client and in
  the shared schema: no read.
- `error: 'not_found'` and the 404 status are unchanged, and a new case
  (`licenses.test.ts`) asserts both, plus the Spanish body and that it is *not*
  the English one.
- `app.ts:150`'s own not-found body still sends `path: request.url` and is
  **untouched**; `app.test.ts:50`'s pin on it still passes. So the only body
  that lost the field is the one the card had to re-render.

The alternative was `app.ts:128` to hand the route a `db`, which is outside
AM-045's `:14,120,150` pins — and the implementer chose the conforming body
over the out-of-scope edit, disclosing it plainly. **That is the right trade and
the right disclosure.** A ` — ` note for the record: passing `path` as
`details` was available in-scope, but it would have *moved* the field into a
contract-defined one, which is a larger wire change than dropping an
undefined one.

This is nonetheless the second time in two attempts that a **line pin, rather
than a named unit, was the thing that stopped the card doing the obviously
better edit** (the first was `chat.ts:583-610`). It is the same lesson as the
`refine-request.ts` crux, from the other direction, and the reviewer's
recommendation in the verdict follows from it.
