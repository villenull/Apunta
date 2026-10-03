# S3.3a independent implementation review, attempt 2 — reviewer evidence supplement

Role: independent implementation reviewer. I did not write `eac3291`. Every
number below comes from a command I ran; nothing is taken from the
implementer's report, and the coordinator's 48-case claim was not relied on —
the suite was re-run here and reported on its own.

## Environment

- Repository: `/home/villenull/Projects/Apunta` (shown as `~/Projects/Apunta`).
- Every command below ran with the working directory **the repository root**.
- Interpreter: `v24.19.0`, `~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node`
  (the `engines` pin). It was put first on `PATH` for V1 to V4 so the rows'
  bare `node` resolves to it; the box default is `v26.8.2`, which is outside
  `engines`. V5 invokes the pinned binary by path itself, as its command does.
- Candidate reviewed: `eac3291`. Repair base for the candidate commit: `85dc7ce`
  (the coordinator's dispatch). Card base token: `dbafbc1`. Pristine original
  rules: `9d92d7b`.
- Scratch: `build/review-s3.3a-ir2/` (ignored, `.gitignore:55`). No raw log is
  committed; each excerpt below is short and the run folders stay under
  `/tmp/apunta-v2*`.
- `server/dist` was already present, so no build lease was needed and none was
  taken. V1's only build-dependent conjunct reached the loopback guard through
  the existing `dist`.
- No Apunta server was started, no database opened, no model or Ollama touched,
  nothing bound 7717, no sandbox run on the dispatched port 7841, no download.
  The only listener this review created was the two `listen(0, '127.0.0.1')`
  stubs **inside** the candidate's own test processes.

## Reading a row out of the dispatch table

The dispatch writes each row's shell inside a Markdown table cell, so `\|\|` is
the cell's escape for the row's own `||`. Reading a row verbatim means undoing
that one escape and nothing else:

```
node -e '…for each line, match /^\| (V[0-9]+) \| `([\s\S]*)` \|/…,
        then m[2].split(String.fromCharCode(92) + "|").join("|")…'
```

Getting this wrong is not cosmetic: with the escape left in, `\|\|` parses as a
pipe into an empty command, the exit status of every `node` invocation is
discarded, and **V2 reports `exit 0` for all eighteen of its refusals** while
the scripts are in fact correct. The first run of V2 in this review did exactly
that; the numbers below are from the corrected extraction. After the extraction
was re-checked against the dispatch file at HEAD, all eight row commands were
byte-identical to the ones run.

## Row results

| ID | Command (cwd: repo root) | Start / end (UTC) | Exit | Status |
| --- | --- | --- | --- | --- |
| V1 | `bash build/review-s3.3a-ir2/row-V1.sh` | `01:51:42Z` / `01:51:42Z` | 0 | PASS |
| V2 | `bash build/review-s3.3a-ir2/row-V2.sh` | `01:51:42Z` / `01:51:42Z` | 0 | PASS |
| V3 | `bash build/review-s3.3a-ir2/row-V3.sh` | `01:51:42Z` / `01:51:43Z` | 0 | PASS |
| V4 | `bash build/review-s3.3a-ir2/row-V4.sh` | `01:51:42Z` / `01:51:43Z` | 0 | PASS |
| V5 | `bash build/review-s3.3a-ir2/row-V5.sh` | `01:51:49Z` / `01:51:50Z` | 0 | PASS |
| V8 | `bash build/review-s3.3a-ir2/row-V8.sh` | `01:59:06Z` / `01:59:06Z` | 1 | FAIL — attributed, see §4 |
| V6 | not run | — | — | HELD (owner quiet machine) |
| V7 | not run | — | — | HELD (owner quiet machine) |

V1 to V5 printed nothing on success and left no residue. `ls scripts/*.mutated.mjs`
afterwards: *No such file or directory*.

### V5, run here

`node --test` on the pinned binary over the two colocated suites:

```
ℹ tests 48
ℹ pass 48
ℹ fail 0
ℹ duration_ms 995.369367
```

All twelve case names V5 requires are present in the TAP output, including
`exits-0-on-a-complete-run`, `exits-3-on-a-count-mismatch` and
`exits-6-on-an-unenumerable-fixture` — the last of which is the code FD1 added
and which had no case at all before this attempt.

## 1. Effective original rule bytes against `9d92d7b`

Two independent routes, both green.

**(a) Textual.** Extracting each rule region from the pristine file and from the
candidate and diffing them:

| Region | Result |
| --- | --- |
| `check-note-format.mjs` `splitSections` + `exampleSentences` + `flagsFor` | identical |
| `check-note-format.mjs` `noteFromStream` | identical |
| `check-note-format.mjs` `APUNTA_V2` guard, loopback guard, `api()` | identical (one added comment only) |
| `check-note-format.mjs` fixture loop + every printed summary line | identical except `dir` → `treeDir` |
| `check-note-format.mjs` the four pre-flight refusal blocks | identical |
| `check-refine.mjs` `stillHas`, `readChat`, `sectionsOf`, `wordCount`, `CLAIM_VERBS`, `claimProblems`, `SERVER_OPENINGS`, `losses`, `HELD_BACK` | identical, function by function |
| `check-refine.mjs` main scenario loop + the whole summary block | identical except the fixture array hoisted to `FIXTURE_FILES` |

`treeDir` is `join(root, 'e2e', 'fixtures', tree)` and `dir` was
`join(root, 'e2e', 'fixtures', 'her-format')`; with no `--locale` the two are
the same string, and with `--locale es-MX` the run has already exited `5`.

**(b) Syntax-tree, reviewer's own reader.** `build/review-s3.3a-ir2/independent-ast.mjs`
extracts the executing bodies out of each file's own AST and compares them with
the same regions at `9d92d7b`, then with what `--print-rules` actually emits.
Exit 0, all twenty-one comparisons `OK`:

```
--- effective original rule bodies: candidate eac3291 vs pristine 9d92d7b ---
OK    check-refine sectionsOf / wordCount / stillHas / losses / claimProblems / heldBack
OK    check-refine CLAIM_VERBS / SERVER_OPENINGS
OK    check-note-format splitSections / exampleSentences / flagsFor
OK    check-note-format riskSentinel nodes / section order / flagRules
OK    check-note-format headingPattern / borrowedExtractor
--- effective rules vs the --print-rules blob (dead URL, pinned node) ---
OK    refine.headingPattern / wordCountSplit / fixtureFilter / serverOpenings / claimVerbs
OK    format.sections / riskSentinel / headingPattern / flagRules / borrowedExtractor
--- uniqueness of every pattern the comparison relies on ---
OK    sectionsOf holds exactly one regex        OK  wordCount holds exactly one regex
OK    splitSections holds exactly one regex     OK  exampleSentences has exactly one matchAll
OK    flagsFor holds exactly one "None." sentinel
ALL EQUAL
```

So every original rule body, constant and printed summary line is untouched, and
the reader behind the anti-drift guard is pointed at the executing node, not at
a description of it.

## 2. The anti-drift guard, adversarially (D3)

The guard's whole claim is that it cannot be satisfied by a copy that no longer
runs. `build/review-s3.3a-ir2/mutate-matrix.mjs` writes one node at a time into
an ignored copy, runs `--print-rules` on the copy, and asks a **reviewer-written**
reader whether the dump and the rule that executes now disagree. 26 directions,
**26/26 as required**, exit 0.

Twelve move a rule that executes, and all twelve are red:

```
CLAIM_VERBS[1]  CLAIM_VERBS[2]  pinned CLAIM_VERBS[3]  SERVER_OPENINGS[3]
sectionsOf heading regex  wordCount split regex  splitSections heading regex
exampleSentences matchAll  riskSentinel inside flagsFor  flagsFor section name #3
flagsFor reported rule  flagsFor cadence rule
```

Seven move only a `PINNED_*` copy, and all seven are red — the direction a
whole-file grep for the literal cannot see, because the grep is satisfied by the
copy it is meant to police:

```
PINNED_HEADING  PINNED_WORD_SPLIT  PINNED_BORROWED  PINNED_RISK_SENTINEL
PINNED_FLAG_RULES[2]  PINNED_SECTIONS[0]  PINNED_CLAIM_VERBS[3]
```

Three carry the pattern in a **comment** and correctly produce **no** drift
(`comment carrying the heading pattern`, `… the borrowed pattern`, `… the risk
sentinel` → all green): the reader reads nodes, so a comment cannot satisfy it.

Two are **dead duplicates** that never run — a `CLAIM_VERBS_DEAD_COPY` array and
a `DEAD_COPY_RE` regex — and correctly produce **no** drift.

Two are constants that are genuinely not part of the dumped surface and correctly
produce no drift: `HELD_BACK` (FD4 names no key for it) and the inner sentence
split inside `exampleSentences` (`borrowedExtractor` is the `matchAll` pattern
only).

One is **single-sourced**: `fixtureFilter` is `[...FIXTURE_FILES]`, and
`FIXTURE_FILES` is also what the fixture loop iterates, so changing it moves the
dump and the rule together and there is nothing to drift. This is honest and is
recorded in the return file's deviation 2; it is noted here so S3.3 does not read
the `fixtureFilter` leg of the comparison as evidence of anything.

The candidate's own suite mutates nine directions (five executing, four pinned)
and is green on the pristine tree first, so a red below is the mutation and not
the verifier. The thirteen directions above are the ones its suite does not
exercise; they are red for the same reason, which is what makes the gap a
coverage gap and not a soundness gap.

## 3. The command line and the seeder (D1, D2)

**Multi-id parse, checked here directly** (`node` = 24.19.0,
`APUNTA_CHECK_URL=http://127.0.0.1:1`):

| Invocation | Exit | stderr |
| --- | --- | --- |
| `check-refine --only tone-request question-only shorten-keeps-facts --print-rules` | 0 | — |
| `check-refine --print-rules --locale en --only tone-request question-only` | 0 | — |
| `check-note-format --only 1-typed-brief 3-risk-reviewed 6-retraction --print-rules` | 0 | — |
| `check-refine --only tone-request question-only nosuch-scenario-id` | 2 | `--only does not name a scenario in refine/: nosuch-scenario-id` |
| `check-note-format --only 1-typed-brief 3-risk-reviewed nosuch-fixture` | 2 | `--only does not name a fixture in her-format/: nosuch-fixture` |
| `check-refine --only tone-request --only question-only` | 2 | `Refusing to run: --only was given twice.` |
| `check-refine --only` | 2 | `Refusing to run: --only needs a value.` |
| `check-refine --only tone-request --print-rules --locale` | 2 | `Refusing to run: --locale needs a value.` |
| `check-refine tone-request` (bare positional) | 2 | `Refusing to run: unexpected argument tone-request.` |
| `check-refine --only a b --expect-scenarios 3` (dead URL) | 1 | node's unhandled rejection — FD1's disclaimed code |

Every id used above is real on disk, and the counts are the real ones:
`e2e/fixtures/her-format/` holds **6** fixtures over the script's own regex
(`1-typed-brief` … `6-retraction`), and `e2e/fixtures/refine/` holds **16**
scenarios across the two files (13 + 3). The suite computes the fixture count at
load time over the same regex, so `--expect-fixtures 6` is the tree's count and
not the implementer's.

**Seeder idempotence, on one maintained synthetic store.** The colocated suite
answers "safe to run twice" with a **hand-prefilled** `formats`/`patients` list
(`check-note-format.test.mjs:769`). That is weaker than it looks: it never shows
the second run reading back what the **first** run created, because the child
harness ignores the POST bodies entirely.

`build/review-s3.3a-ir2/d2-seeder.mjs` therefore keeps the store in a file that
only the requests themselves change, and runs the seeder **three times, one
process each**. Exit 0, `D2 OK`:

```
seed #1: exit 0  Seeded format Check instance format and patient John Smith for the check scripts on http://127.0.0.1:1.
seed #2: exit 0  Nothing to seed: http://127.0.0.1:1 already has 1 format(s) and 1 patient(s).
seed #3: exit 0  Nothing to seed: http://127.0.0.1:1 already has 1 format(s) and 1 patient(s).
every request across the three runs, in order:
  GET /api/formats   GET /api/patients   POST /api/formats   POST /api/patients
  GET /api/formats   GET /api/patients
  GET /api/formats   GET /api/patients
>> OK  exactly two POSTs across three seeds
>> OK  the store holds one format and one patient
>> OK  the seeded format carries the four English section names
>> OK  the seeded patient is the prototype sample person (HS-8)
```

Refusals before any request, checked with a real child and no `fetch` stub:

```
APUNTA_CHECK_URL= APUNTA_V2=1 node scripts/v2/seed-check-instance.mjs
  → exit 2, 0 bytes on stdout, stderr: Under APUNTA_V2=1, run this through scripts/v2/sandbox.mjs …
APUNTA_CHECK_URL=http://127.0.0.1:1 APUNTA_V2=1 node scripts/v2/seed-check-instance.mjs
  → exit 2, 0 bytes on stdout, stderr: That Apunta at http://127.0.0.1:1 would not answer: fetch failed
```

No-id, malformed-body and refused-request refusals are the suite's own cases and
V5 passed them; the source is `scripts/v2/seed-check-instance.mjs:95-109`, where
attempt 2's fix is that the POST's **body object** is read, not the `Response`.

## 4. V8, attributed rather than waived

V8 as written exits **1** with thirteen lines, none of them a source path:

```
docs/v2/ORCHESTRATION-LOG.md                          docs/v2/state/PROGRESS.json
docs/v2/cards/P3.5.md                                 docs/v2/state/cards/P3.5.json
docs/v2/evidence/P3.5/command-ir2/V5-branches.md      docs/v2/state/cards/S3.3a.json
docs/v2/state/NEXT-SESSION.md                         docs/v2/state/dispatch/S3.3a-review.md
docs/v2/state/P3.4-REPAIR-PROPOSAL-2026-10-03.md      docs/v2/state/dispatch/S3.3a.md
docs/v2/state/reviews/P3.4-owner-proposal-repair2.md  docs/v2/state/reviews/P3.5-V5-command-ir2.md
```

Every one is either the coordinator's own reconciliation state
(`ORCHESTRATION-LOG.md`, `NEXT-SESSION.md`, `PROGRESS.json`, `cards/*.json`,
both dispatch files) or another card's evidence and review (all `P3.4` / `P3.5`
paths). The prefix conjunct the repair added does work — it accepts this
review's own `docs/v2/evidence/S3.3a/review-2/` — but it cannot help with paths
that are not under a card prefix, so V8 stays red and is **not** waived here.

**SOURCEAUTHOR scope, proved separately.** The base token `dbafbc1` is two
commits behind the coordinator's dispatch, so V8's committed half sweeps in the
coordinator's own writes. Restricting the same membership test to the candidate
commit's own parent interval `85dc7ce..eac3291`:

```
docs/v2/evidence/S3.3a/attempt-2/REPORT.md
docs/v2/evidence/S3.3a/attempt-2/anti-drift.md
docs/v2/evidence/S3.3a/attempt-2/byte-identity.md
docs/v2/state/returns/S3.3a.md
scripts/check-note-format.mjs
scripts/check-note-format.test.mjs
scripts/check-refine.mjs
scripts/check-refine.test.mjs
scripts/v2/seed-check-instance.mjs
candidate-commit-only V8 bad=0
```

All five May-edit source paths and both required outputs, nothing else. This is
a **base-token** problem in the row, not a source-scope problem in the candidate,
and it is the same reading the implementer's return file reaches.

## 5. Fixed decision 3 — `--print-rules` and `--self-test` need no build

The box has a `server/dist`, so "unbuilt" was proved by copying the two scripts
into a throwaway tree that has no `server/` at all:

```
no server/dist under <sandbox>
unbuilt check-refine       --print-rules exit=0
unbuilt check-note-format  --print-rules exit=0
unbuilt check-refine       --self-test   exit=0
unbuilt check-note-format  --self-test   exit=0
unbuilt check-refine, no flags: exit=2  This needs the built server (npm run build): it borrows the fact lock's tokeniser.
```

The parse sits above the built-server import (`check-refine.mjs:161-318` against
the import at `:340`) and above the first `fetch`, and the `APUNTA_V2` guard
(`:324`) sits above that import too, so V1's refusals hold unbuilt.

## 6. Hard stops

| Check | Result |
| --- | --- |
| Hosts and URLs added | none. Every URL literal in the three shipped files is `127.0.0.1`; the two non-loopback literals in the rows (`http://10.0.0.1:7800`, `http://127.0.0.1:1`) are refused or dead before any socket exists |
| Runtime network code | none. No `listen`, `createServer`, `node:net`, `node:dns`, `node:http(s)` or `child_process` in the three shipped scripts; the two `listen(0, '127.0.0.1')` stubs are in the two `.test.mjs` files, on an ephemeral port, opened and closed inside one process — Fixed decision 8's grant exactly |
| Fixed ports | none. Both stubs read `server.address().port`; `7717` appears only as the value the guards refuse |
| Secrets | none. No key, token or password anywhere in the diff |
| Fabricated data only | yes. `John Smith` (the prototype's sample person) in the seeder and in the suite's stub; synthetic ids (`fmt_stub`, `pat_stub`, `synthetic-created`). No real note text |
| Protected paths | `prototype/`, `e2e/**`, `server/src/**`, `web/**`, `shared/**`, `src-tauri/**`, `installer/**`, `package.json`, `eslint.config.js`, `server/src/eval/**`, `docs/v2/CONTRACTS.md`, `docs/v2/BASELINE.md`, `docs/v2/tools/*.mjs` — all untouched by the candidate commit |
| Thresholds | none. No scorer, guard, lock or threshold was loosened to make a row pass |
| Scratch | `build/review-s3.3a-ir2/`, ignored by `.gitignore:55`. `git check-ignore -v` confirms it. No raw log is committed and nothing was force-added |
| Prettier | `npx prettier --check` on all five candidate files: *All matched files use Prettier code style!* (this closes the card's own B3 for these five paths) |

## 7. HEAD movement during the review

HEAD was `eac3291` when the review began and moved to `f51f4f7` ("Record attempt
two review and bounded command repairs") while it ran. Checked:

```
git diff --name-only eac3291..HEAD -- <the five May-edit source paths>
                docs/v2/cards/S3.3a.md docs/v2/state/returns/S3.3a.md docs/v2/tools/
→ (no output: every reviewed path is identical at HEAD)
```

and all eight row commands in the dispatch file at HEAD were re-extracted and
compared byte-for-byte against the ones actually run: **identical**. The move is
documentation-only, which the dispatch's preamble allows. V8 was re-run at the
new HEAD and reported in §4.
