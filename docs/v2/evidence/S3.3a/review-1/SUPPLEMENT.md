# Independent implementation review, S3.3a, attempt 1

Reviewer: independent implementation reviewer. Attempt 1 of 3. Candidate
`56d1847`, base `9d92d7b`. Working directory for every command below: the
repository root, unless the command says otherwise. No sandbox run folder was
created; every run-folder path is written `<sandbox>`. No model, no Ollama, no
Apunta server, no port 7717, no live data folder, no acquisition. All content
below is fabricated or repository bytes.

## 0. Environment and state

| Item | Value |
| --- | --- |
| HEAD at the start of the review | `56d1847` (matches the dispatch requirement) |
| HEAD at the end of the review | `d59474d` |
| Intervening commits | `eb309ac`, `d59474d` — documentation only |
| `git diff --stat 56d1847 HEAD` over the five May-edit paths | **empty** |
| Pinned node | `~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node`, `v24.19.0` |
| `node` on PATH for the row commands | overridden to the pinned 24.19.0 for every re-run |
| `server/dist/ai/fact-guard.js` | present before the review; **no build was run** (see §5) |

The dispatch's hard stop says "HEAD must be `56d1847`, and anything else is a
stop", and the paragraph before it says a documentation-only HEAD move "alone is
not a stop" and the stop is a source path that differs. The two sentences
disagree. The operative test — a May-edit path differing between `56d1847` and
HEAD — is **not** met: the five paths are byte-identical across both commits.
This is reported rather than treated as a stop, and **every row was additionally
re-run at `d59474d`** (§4) so the result does not depend on which of the two
readings the coordinator takes.

Scratch for every mutation and probe was `build/s3.3a-review/`, which
`.gitignore` already excludes via `build/`. No source file and no fixture was
modified: `git status --porcelain` at the end of the review lists only this
review's own two files.

---

## 1. Row re-runs (hermetic)

Commands are the card's own, extracted verbatim from the verification table of
`docs/v2/state/dispatch/S3.3a-review.md` and unescaped exactly as
`plan-lib.mjs`'s `splitRow` does (`\|` → `|`). Each is one `bash` invocation.

```
b=/tmp/apunta-v2-s3.3a-v1; rm -rf $b; ...        # verbatim, see §1 row source
```

| Row | cwd | start (UTC) | end (UTC) | exit | status |
| --- | --- | --- | --- | --- | --- |
| V1 | repo root | 2026-10-03T01:13:30Z | 2026-10-03T01:13:30Z | 0 | PASS |
| V2 | repo root | 2026-10-03T01:13:30Z | 2026-10-03T01:13:30Z | 0 | PASS |
| V3 | repo root | 2026-10-03T01:13:30Z | 2026-10-03T01:13:30Z | 0 | PASS |
| V4 | repo root | 2026-10-03T01:13:30Z | 2026-10-03T01:13:31Z | 0 | PASS |
| V5 | repo root | 2026-10-03T01:13:31Z | 2026-10-03T01:13:31Z | 0 | PASS |
| V6 | — | — | — | — | **NOT RUN** (owner quiet-machine hold) |
| V7 | — | — | — | — | **NOT RUN** (owner quiet-machine hold) |
| V8 | repo root | 2026-10-03T01:13:31Z | 2026-10-03T01:13:31Z | 1 | FAIL (attributed in §4) |

V1 to V5 produced no output at all (silent success). Re-run at HEAD `d59474d`,
`2026-10-03T01:16:08Z` to `2026-10-03T01:16:10Z`: V1 0, V2 0, V3 0, V4 0, V5 0,
**V8 1 with the identical 22-line list**. The rows are stable across both heads.

V1 was additionally decomposed conjunct by conjunct to confirm the four
refusals individually rather than trusting the row's aggregate exit:

```
rc=0; APUNTA_CHECK_URL= APUNTA_V2=1 node scripts/check-refine.mjs >"$b/o1" 2>"$b/e1" || rc=$?
rc=0; APUNTA_CHECK_URL= APUNTA_V2=1 node scripts/check-note-format.mjs >"$b/o2" 2>"$b/e2" || rc=$?
rc=0; APUNTA_CHECK_URL=http://10.0.0.1:7800 node scripts/check-refine.mjs >"$b/o3" 2>"$b/e3" || rc=$?
rc=0; APUNTA_CHECK_URL=http://10.0.0.1:7800 node scripts/check-note-format.mjs >"$b/o4" 2>"$b/e4" || rc=$?
```

All four exit `2`; all four name the refusal the row greps for; all four leave
stdout empty (`test ! -s` passed on `o1`..`o4`). `10.0.0.1:7800` is refused as a
string by the guard at `check-refine.mjs:344` / `check-note-format.mjs:331`
before a request object exists, so nothing was dialled and no name resolved.

V5's two leftover guards: `ls scripts/*.mutated.mjs` →
`No such file or directory` after every run.

## 2. Lint and typecheck

| Command | cwd | start (UTC) | end (UTC) | exit |
| --- | --- | --- | --- | --- |
| `npm run lint` | repo root | 2026-10-03T01:14:49Z | 2026-10-03T01:14:56Z | 0 |
| `npm run typecheck` | repo root | 2026-10-03T01:15:04Z | 2026-10-03T01:15:11Z | 0 |

`npm run lint` output, in full beyond the npm banner: `All matched files use
Prettier code style!` and `THIRD-PARTY-LICENSES.md lists all 111 shipped
packages.` Stop 8 is not triggered, including for this card's own Markdown.

## 3. Coordinator's two reproductions, re-derived independently

### 3.1 Multi-id `--only` fails on the second id — CONFIRMED, both scripts

The reviewer did not take the coordinator's report on trust; the defect is
visible in the shipped bytes and reproduces.

```
NB=$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin
APUNTA_V2=1 APUNTA_CHECK_URL=http://127.0.0.1:1 $NB/node \
  scripts/check-refine.mjs --only tone-request shorten-keeps-facts
APUNTA_V2=1 APUNTA_CHECK_URL=http://127.0.0.1:1 $NB/node \
  scripts/check-note-format.mjs --only 1-typed-brief 2-presentation-and-talk
```

```
Refusing to run: unexpected argument shorten-keeps-facts.
  the argument: shorten-keeps-facts
exit=2
Refusing to run: unexpected argument 2-presentation-and-talk.
  the argument: 2-presentation-and-talk
exit=2
```

Mechanism, both scripts (`check-refine.mjs:194-198`,
`check-note-format.mjs:200-204`): the inner loop `for (let next = index + 1;
next < argv.length && !argv[next].startsWith('-'); next += 1) only.add(argv[next])`
consumes every following bare token, but the outer loop then does `index += 1`
instead of advancing to the last token consumed. The next outer iteration lands
on the second id, which is neither a flag nor a value, so `refuseUsage('unexpected
argument …')` fires at `check-refine.mjs:201` / `check-note-format.mjs:207`.

That the multi-id form is **documented and previously working** is established
from the base, not from the candidate's own header:

```
git show 9d92d7b:scripts/check-refine.mjs   # line 61-62
/** `-- --only tone-request shorten-keeps-facts` runs just those scenarios; … */
const only = new Set(process.argv.slice(2).filter((arg) => arg !== '--only'));
```

At `9d92d7b` every non-`--only` token was an id, so two ids ran. At `56d1847` the
same documented command exits 2. The candidate's own header
(`check-refine.mjs:11`) still advertises it. This is a backward-compatibility
regression, not a new refusal: **no test in either suite covers a multi-id
`--only`**, which is why V5 is green.

### 3.2 Seeder reads `.id` off a `Response` — CONFIRMED

Isolation first, by inspection and then by execution.

*By inspection.* `seed-check-instance.mjs` reads the environment at `:22`, defines
`checkPort` at `:35`, and its first three executable statements after the helpers
are the `APUNTA_V2` guard (`:52-59`), the loopback guard (`:61-63`) and `api`/
`post` (`:65-76`). The first `fetch` is at `:82`, inside `seed()`, which is
called at `:114`. So **every refusal precedes any HTTP call**.

*By execution*, pinned node, `APUNTA_V2=1`:

| Case | `APUNTA_CHECK_URL` | stderr | exit |
| --- | --- | --- | --- |
| unset | (unset) | `Under APUNTA_V2=1, run this through scripts/v2/sandbox.mjs …` | 2 |
| non-loopback | `http://10.0.0.1:7800` | `Refusing to talk to http://10.0.0.1:7800: this only ever speaks to a local Apunta.` | 2 |
| dead loopback | `http://127.0.0.1:1` | `That Apunta at http://127.0.0.1:1 would not answer: fetch failed` | 2 |

Isolation before HTTP: **confirmed**. The third row is the only one that creates
a request object, and it is a loopback address the kernel refuses.

*`post()` returns a `Response`.* `seed()` reads `format?.id` at `:97` and
`patient?.id` at `:102` off the value `post()` returns. `post()` (`:71-76`)
returns `api(...)`, and `api` (`:65-69`) returns the `Response`, never
`response.json()`. A `Response` object has no `id` property, so `format?.id` is
`undefined` and `:97` refuses.

*Reproduced with a fabricated in-memory `fetch` and **no listener and no
socket*** — `build/s3.3a-review/seed-probe.mjs`, a file in the ignored scratch
folder, replacing `globalThis.fetch` before importing the seeder, then printing
the calls it saw and the fabricated instance state on exit:

```
APUNTA_V2=1 APUNTA_CHECK_URL=http://127.0.0.1:1 $NB/node \
  build/s3.3a-review/seed-probe.mjs
```

```
That Apunta took the format and returned no id for it.
CALLS: ["GET /api/formats","GET /api/patients","POST /api/formats"]
STATE: {"formats":[{"id":"fmt_1","name":"Check instance format"}],"patients":[]}
exit=2
```

The instance **did** accept and store the format (HTTP 201 with a body carrying
`id`), and the seeder still exited 2. Idempotence, three invocations against one
fabricated instance that persists across them
(`build/s3.3a-review/seed-probe2.mjs`):

| Invocation | Instance before | Created | stderr | exit |
| --- | --- | --- | --- | --- |
| 1 | 0 formats, 0 patients | format | `That Apunta took the format and returned no id for it.` | 2 |
| 2 | 1 format, 0 patients | patient | `That Apunta took the patient and returned no id for it.` | 2 |
| 3 | 1 format, 1 patient | nothing | `Nothing to seed: … already has 1 format(s) and 1 patient(s).` | 0 |

So the seeder's header claim "It is safe to run twice, which is the point: the
second run finds both records and creates neither" (`:17-18`) is **false as
written**: the second run still fails. V7 conjunct 1 chains
`seed && seed && check`, so the first non-zero aborts the chain and
`check-note-format.mjs` never runs — the row would be red for this reason alone,
independently of the `grep` defect in §5.

## 4. V8 — FAIL, attributed

Executed verbatim; exit `1`. Full output (identical at `56d1847` and
`d59474d`), 22 paths:

```
FAIL: docs/v2/ORCHESTRATION-LOG.md is outside May edit
FAIL: docs/v2/cards/P3.5.md is outside May edit
FAIL: docs/v2/evidence/S3.3a/COORDINATOR.md is outside May edit
FAIL: docs/v2/evidence/S3.3a/NOTES.md is outside May edit
FAIL: docs/v2/evidence/S3.3a/ROWS.md is outside May edit
FAIL: docs/v2/state/AMENDMENTS.md is outside May edit
FAIL: docs/v2/state/BLOCKED.md is outside May edit
FAIL: docs/v2/state/NEXT-SESSION.md is outside May edit
FAIL: docs/v2/state/P3.4-REPAIR-PROPOSAL-2026-10-03.md is outside May edit
FAIL: docs/v2/state/PROGRESS.json is outside May edit
FAIL: docs/v2/state/SESSION-HANDOFF-2026-10-02.md is outside May edit
FAIL: docs/v2/state/cards/P3.4.json is outside May edit
FAIL: docs/v2/state/cards/P3.5.json is outside May edit
FAIL: docs/v2/state/cards/P3.8.json is outside May edit
FAIL: docs/v2/state/cards/S3.2.json is outside May edit
FAIL: docs/v2/state/cards/S3.3a.json is outside May edit
FAIL: docs/v2/state/dispatch/S3.3a-review.md is outside May edit
FAIL: docs/v2/state/dispatch/S3.3a.md is outside May edit
FAIL: docs/v2/state/reviews/P3.4-diagnosis-2026-10-03.md is outside May edit
FAIL: docs/v2/state/reviews/P3.5-V5-command-ir.md is outside May edit
FAIL: docs/v2/state/reviews/P3.5-V5-command-repair.md is outside May edit
FAIL: docs/v2/state/reviews/continuation-state-audit-2026-10-03.md is outside May edit
```

**Not one of the five May-edit paths appears in that list.** The row is red
entirely from paths outside this card's grant, in three buckets:

1. **Coordinator and neighbouring-card state (16 paths).** `ORCHESTRATION-LOG.md`,
   `cards/P3.5.md`, `AMENDMENTS.md`, `BLOCKED.md`, `PROGRESS.json`,
   `NEXT-SESSION.md`, `SESSION-HANDOFF-2026-10-02.md`, `cards/{P3.4,P3.5,P3.8,S3.2,
   S3.3a}.json`, `state/dispatch/{S3.3a,S3.3a-review}.md`, three
   `state/reviews/*` files. `git log --diff-filter=A -- <path>` shows most were
   last added at `69f8cda`, long before this card; they are in the list because
   `git diff --name-only 9d92d7b` sweeps **everything** changed since the base,
   across all cards. The row measures the shared tree, not this card.
2. **The card's own three evidence files (3 paths).** `evidence/S3.3a/{COORDINATOR,
   NOTES,ROWS}.md`, added in the candidate commit `56d1847`. V8's allow-list
   contains `docs/v2/evidence/S3.3a` **and** `docs/v2/evidence/S3.3a/`, but the
   membership test is `[ "$p" = "$w" ]` — exact string equality. A directory
   name can never equal a file path beneath it, so **neither entry can ever
   match**, and the card's own required output is unmatchable by construction.
   This is a defect in the row, not in the submission. (`state/returns/S3.3a.md`
   escapes only because it appears in the allow-list as a whole path.)
3. **Two `docs/v2/state/**` paths from a concurrent agent** that were dirty in
   the tree at `56d1847` (`P3.4-REPAIR-PROPOSAL-2026-10-03.md`,
   `reviews/P3.5-V5-command-ir.md`) and have since been committed upstream by
   other work. Not this card's.

The row's FAIL is **not** reclassified as a PASS. Its red is real, its
attribution is documentation drift plus a row-authoring defect, and no source
path this card owns was touched outside May edit:

```
git diff --stat 9d92d7b -- scripts/check-refine.mjs scripts/check-note-format.mjs \
  scripts/v2/seed-check-instance.mjs scripts/check-refine.test.mjs \
  scripts/check-note-format.test.mjs
 scripts/check-note-format.mjs      | 310 ++++++++++++++++++++++++++++++++++++-
 scripts/check-note-format.test.mjs | 237 ++++++++++++++++++++++++++++
 scripts/check-refine.mjs           | 306 ++++++++++++++++++++++++++-
 scripts/check-refine.test.mjs      | 219 ++++++++++++++++++++++++
 scripts/v2/seed-check-instance.mjs | 119 ++++++++++++++
 5 files changed, 1180 insertions(+), 11 deletions(-)
```

## 5. Build lease — not needed

V1's third conjunct is the only row that reaches
`await import('server/dist/ai/fact-guard.js')` (`check-refine.mjs:331`), which
exits 2 without the build. At the start of the review
`server/dist/ai/fact-guard.js` and `server/dist/ai/refine-request.js` were both
present, so **no build was run** and no build lease was exercised. The candidate
commit `56d1847` touches only `scripts/**` and `docs/**`, so `server/dist` cannot
be stale with respect to it. V1 conjunct 3 returned 2 with the guard's own
message, which is what the row requires, so the existing dist was adequate.

## 6. PINNED_* duplication and the self-validating literal-presence test

This is the coordinator's "further review concern", and it is **worse than
stated**. The claim it tests is written into the source as an anti-drift
guarantee, at `check-refine.mjs:69-73` and `check-note-format.mjs:69-74`:

> Each entry below is the literal as it appears in the rule named beside it, and
> `scripts/check-*.test.mjs` asserts exactly that — so the dump and the rules
> cannot drift apart without the suite going red.

The assertion it names is
`print-rules-shape: each pattern is the literal the rule function uses`
(`check-refine.test.mjs:116-126`, `check-note-format.test.mjs:159-167`). It does:

```js
const source = readFileSync(script, 'utf8');
const literal = (expression) => `/${expression.source}/${expression.flags}`;
for (const expression of [dumped.headingPattern, dumped.wordCountSplit])
  assert.ok(source.includes(literal(expression)), …);
```

`source` is the **whole file**, and the `PINNED_*` block is inside that file. The
assertion is therefore satisfied by the very copy it is supposed to police. The
method used: mutate **copies only** — the source file and every fixture were left
untouched — then run the **shipped** test bytes against the copy from a throwaway
tree, the same technique the card's own exit-6 case uses.

### 6.1 Effective rules mutated, PINNED copies untouched — undetected

`check-note-format.mjs` copy with **all three effective `flagsFor` regexes**
replaced (`:410`, `:416`, `:419`) and `PINNED_FLAG_RULES` untouched:

```
scripts/check-note-format.test.mjs: run in a throwaway tree,
  APUNTA_CHECK_URL=http://127.0.0.1:1 $NB/node --test <tree>/scripts/check-note-format.test.mjs

✔ print-rules-shape: each pattern is the literal the rule function uses
✔ exits-0-on-a-complete-run: every fixture was read and the count matched
✔ exits-3-on-a-count-mismatch: the run completed and the count did not match
ℹ pass 13
ℹ fail 0
```

**13 of 13 pass with the entire executing rule surface changed.** The
`PINNED_FLAG_RULES` literals are still at lines 92, 96 and 100 of the copy, so
the grep finds them there.

`check-refine.mjs` copy with the effective `CLAIM_VERBS[0]` regex
(`:408`) and the effective `sectionsOf` regex (`:387`) replaced,
`PINNED_CLAIM_VERBS` and `PINNED_HEADING` untouched:

```
✔ print-rules-shape: each pattern is the literal the rule function uses
ℹ pass 10
ℹ fail 2   (self-test-passes and exits-4-on-a-missed-control)
```

The literal-presence test **passes**. The two incidental failures are worth
separating: the `sectionsOf` regex happens to be covered by the
`sectionsOf` self-test control, so that particular divergence was caught by a
different test. `CLAIM_VERBS` has no control at all, so its divergence was
caught by nothing. The suite's incidental coverage is not a substitute for the
assertion it claims.

### 6.2 PINNED copy mutated, effective rule untouched — also undetected

The other direction, so the finding is not one-sided. `check-note-format.mjs`
copy with **only** `PINNED_BORROWED` changed from `{25,}` to `{99,}` and
`exampleSentences()` at `:385` untouched:

```
✔ print-rules-shape: each pattern is the literal the rule function uses
ℹ pass 13
ℹ fail 0
```

and the dump now reports a pattern the rule does not use:

```
"borrowedExtractor": { "source": "\"[A-Z][A-Za-z ]+\":\\s*\"([^\"]{99,})\"", "flags": "g" }
```

while the executing rule is still `instructions.matchAll(/"[A-Z][A-Za-z ]+":\s*"([^"]{25,})"/g)`.

### 6.3 What this costs S3.3

S3.3's V3 proves "every pin literal **byte-present** in `git show 9d92d7b:…`".
Byte-presence over file text is the **same** predicate the broken test uses, so
S3.3's checker and pin inherit exactly this blindness: once a rule diverges from
its `PINNED_*` copy, the pin still finds the copy and goes green while the dump
reports a surface nothing executes. The card's own statement that the pin has "a
key to live in" per shared constant holds only if the key holds the constant
itself, not a transcription of it.

The declared deviation in `docs/v2/state/returns/S3.3a.md` §1 is honest about
the duplication and states that the byte-presence test means "the copy cannot
drift silently". That specific sentence is **false**, with the counterexample
above. The rest of the deviation — that FD4's "one key each" and Must-not-edit's
prohibition on the rule functions cannot both hold unless the dump reads a second
copy — is a fair reading, and this review does not dispute it. Only the
guarantee is wrong.

## 7. Must-not-edit and deviation review

`git diff 9d92d7b -- scripts/check-refine.mjs scripts/check-note-format.mjs`,
removed lines in full:

```
-import { readFileSync, readdirSync } from 'node:fs';
-const dir = join(root, 'e2e', 'fixtures', 'her-format');
-const names = readdirSync(dir)
-  .filter((name) => /^\d+-[a-z0-9-]+\.txt$/.test(name))
-  .sort();
-  const source = readFileSync(join(dir, name), 'utf8').trim();
-import { readFileSync } from 'node:fs';
-/** `-- --only tone-request shorten-keeps-facts` runs just those scenarios; the default is all of them. */
-const only = new Set(process.argv.slice(2).filter((arg) => arg !== '--only'));
-for (const file of ['scenarios.json', 'owner-progress.json']) {
```

Eight removed lines, all four accounted for by the return file's declared
deviation 2 (`FIXTURE_FILES`, the enumerated fixture listing) and deviation 3's
restatement of the `:62` change the card itself exists to make. **No rule
function body was edited**: `splitSections`, `sectionsOf`, `wordCount`,
`flagsFor`, `exampleSentences`, `stillHas`, `losses`, `CLAIM_VERBS`,
`SERVER_OPENINGS`, the four English section constants and `None.` are all
untouched, and the summary lines are byte-identical. Must-not-edit on rule logic
is respected. The `PINNED_*` blocks are additions, not edits.

Deviation 3 (multi-id `--only`, repeated `--only` is 2) is declared as a
deliberate reading of FD1 + FD3 against the base behaviour. The reading is
defensible; the **implementation of it is broken** (§3.1), so the deviation
holds in intent and fails in fact.

## 8. Observations that are not defects

* **`check-refine.mjs:504` hardcodes the tree.** The run loop reads
  `join(root, 'e2e', 'fixtures', 'refine', file)` while `--only` validation at
  `:302-309` validates against `tree` (`refine-es` once S3.3 lands it). When
  `--locale es-MX` becomes real, `--only` will validate against one tree and run
  against another. Unobservable today (`--locale es-MX` exits 5 at `:265` first),
  so it is a note for S3.3, not a defect in this card.
* **Code `6` pre-empts the pre-flight guards when an `--expect-*` flag is
  passed.** `enumerateFixtures()` is invoked at `:305` (`:281` equivalent),
  above the `APUNTA_V2` guard at `:315`. So `--expect-scenarios 1` under
  `APUNTA_V2=1` with an unset URL returns 6, where the no-flag path returns 2.
  FD2's guarantee is scoped to "no flag in argv", which this is not, so this is
  consistent with the card; recorded because it is a behaviour change a reader
  could be surprised by.
* **`--expect-fixtures` in `check-refine.mjs` counts fixture *files*** (2 for
  `en`), declared in the return file §3. Consistent with FD1's wording; recorded
  so S3.3's checker is written to what exists.

## 9. V7's grep is a row defect, not an implementation defect

Confirmed, and it is the return file's unresolved item 1. The card greps

```
grep -qF -e 'fixture(s) across' "$b/o1"
```

The summary line is Must-not-edit and is byte-identical to the base:

```
$ git show 9d92d7b:scripts/check-note-format.mjs | grep -n 'flag(s) across'
  console.log(`\n${String(total)} flag(s) across ${String(names.length)} fixtures.`);
```

It prints `flag(s) across N fixtures.`, which does not contain the token
`fixture(s) across`. V7 conjunct (a) is therefore a false red against a correct
implementation, and Must-not-edit forbids changing the summary to match. **V7
cannot go green as written**, independently of the seeder defect in §3.2 and of
the owner's hold. Not run for that reason as well as the hold.