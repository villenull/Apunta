# S3.3a, attempt 2 — D1, D2 and D3

- Card: `docs/v2/cards/S3.3a.md`, dispatched at base `dbafbc1`
- Attempt: 2 of 3. Attempt-1 evidence (`docs/v2/evidence/S3.3a/*.md`, `*.log`,
  `review-1/`) is untouched and additive to.
- Working directory for every command: the repository root
- No sandbox run folder: nothing here started an Apunta server, opened a
  database, or dialled anything but a dead loopback address and an ephemeral
  loopback listener in the suites' own process.
- No acquisition, no download, no network call, no port 7717, no model, no
  `npm run build` (`server/dist` was already present and V1's only
  build-dependent conjunct reached the loopback guard through it).

## Rows

Every command is the card's own row, taken verbatim out of
`docs/v2/cards/S3.3a.md` through the plan's reader and run with
`{{BASE}}` → `dbafbc1`. The runner is
`build/s3.3a-attempt2/run-rows.mjs` (ignored scratch); it refuses V6 and V7 by
name.

| ID | Status | Exit | Start (UTC) | End (UTC) | Note |
| --- | --- | --- | --- | --- | --- |
| V1 | PASS | 0 | 2026-10-03T01:42:49.982Z | 2026-10-03T01:42:50.072Z | four pre-flight refusals with no flag; no stdout |
| V2 | PASS | 0 | 2026-10-03T01:42:50.072Z | 2026-10-03T01:42:50.288Z | eighteen cases through one `chk` |
| V3 | PASS | 0 | 2026-10-03T01:42:50.288Z | 2026-10-03T01:42:50.364Z | both producers of `5` |
| V4 | PASS | 0 | 2026-10-03T01:42:50.364Z | 2026-10-03T01:42:50.805Z | six blobs, determinism, locale sensitivity |
| V5 | PASS | 0 | 2026-10-03T01:42:50.806Z | 2026-10-03T01:42:51.796Z | 48 cases (20 refine + 28 note-format), engines-pinned node, no `.mutated.mjs` left |
| V6 | NOT RUN | — | — | — | owner quiet-machine hold; drives a real model |
| V7 | NOT RUN | — | — | — | owner quiet-machine hold; needs a sandboxed server and a seeded database |
| V8 | FAIL | 1 | 2026-10-03T01:42:51.796Z | 2026-10-03T01:42:51.803Z | eleven paths, all coordinator-owned `docs/` state; attributed below |

`npm run lint` 0 and `npm run typecheck` 0, both from the repository root.

### V8 attribution

All eleven reported paths are coordinator or neighbouring-card state, and none
is a May-edit path of this card or a path this card reads, writes or tests:

```
docs/v2/ORCHESTRATION-LOG.md
docs/v2/state/NEXT-SESSION.md
docs/v2/state/P3.4-REPAIR-PROPOSAL-2026-10-03.md   (twice: committed and untracked)
docs/v2/state/PROGRESS.json
docs/v2/state/cards/P3.5.json
docs/v2/state/cards/S3.3a.json
docs/v2/state/dispatch/S3.3a.md
docs/v2/evidence/P3.5/
docs/v2/state/reviews/P3.4-owner-proposal-repair2.md
docs/v2/state/reviews/P3.5-V5-command-ir2.md
```

The two required outputs of this card are **not** in that list: the return file
is allow-listed as a whole path, and `docs/v2/evidence/S3.3a/attempt-2/…` is
accepted by the prefix conjunct IR4 added, which the attempt-1 review had
reported as unmatchable. V8 stays FAIL for the pre-existing reason; no row was
reinterpreted.

## D1 — the multi-id `--only` regression

Repaired in both scripts, in the argument parse only. The inner loop now records
the last token it consumed and the outer index is set to that token instead of
to the one before it, so `--only a b c` consumes three ids and the next
iteration starts on whatever follows them.

```js
let last = index;
for (let next = index + 1; next < argv.length && !argv[next].startsWith('-'); next += 1) {
  only.add(argv[next]);
  last = next;
}
if (only.size === 0) refuseUsage(`${arg} needs a value`, arg);
index = last;
```

Regression coverage, colocated and hermetic (`--print-rules` exits above the id
check, so the parse is asserted with no server, no build and no request).

The review's own reproduction, re-run against the repaired parser:

```
$ APUNTA_V2=1 APUNTA_CHECK_URL=http://127.0.0.1:1 node scripts/check-refine.mjs \
    --only tone-request shorten-keeps-facts
[TypeError: fetch failed] { [cause]: Error: bad port … }        exit 1
```

Both ids were taken, both validated against `e2e/fixtures/refine/`, and the run
reached the deliberately dead URL — which is node's unhandled-rejection `1` that
Fixed decision 1 disclaims, not a usage refusal. At attempt 1 the same command
exited **2** with `Refusing to run: unexpected argument shorten-keeps-facts.`

| Case | Both scripts |
| --- | --- |
| two valid ids | exit 0, no `unexpected argument` |
| a flag after the ids (`--self-test --locale en`) | exit 0, the flag is still a flag |
| second id unknown | exit 2 naming the **id**, not the token |
| `--only` twice, `--expect-scenarios` twice | exit 2, `was given twice` |
| `--only` / `--locale` / `--expect-scenarios` / `--expect-fixtures` with no value | exit 2, `needs a value` |
| nothing in `argv` | the APUNTA_V2 guard is still the first thing to fire, and stdout is empty |

The no-flag path is unchanged: `only` stays empty with an empty argv, so no id is
unknown and none is refused, and V1's four pre-flight refusals are byte-identical
(verified by V1, exit 0).

## D2 — the seeder

`seed()` now reads the body, not the `Response`:

```js
const format = await (await post('/api/formats', {…})).json();
const patient = await (await post('/api/patients', { name: PATIENT })).json();
```

`format.name` and `patient.name` in the success line now come off the same
object, so they are the names the instance stored.

Deterministic coverage with an **in-memory** `fetch` stood in inside the child,
so there is no listener and no socket; the requests are appended to a log the
test reads back, which makes "it created both records, once" a fact about the
requests rather than a claim about stdout.

| Case | POSTs seen | Exit | stderr |
| --- | --- | --- | --- |
| empty instance | `POST /api/formats`, `POST /api/patients` | 0 | — |
| both records present | none | 0 | `Nothing to seed: …` |
| created record with no `id` | `POST /api/formats` | 2 | `took the format and returned no id for it.` |
| body that is not JSON | `POST /api/formats` | 2 | `Seeding failed: … SyntaxError/JSON …` |
| request refused (HTTP 500) | `POST /api/formats` | 2 | `Seeding failed: /api/formats answered 500` |
| no `APUNTA_CHECK_URL` under `APUNTA_V2=1` | none | 2 | the sandbox refusal |
| dead loopback URL | refused after one refused connection | 2 | `would not answer` |

The seeder's **non-loopback** refusal has no case in the colocated suite:
`no-restricted-syntax` refuses a non-loopback URL literal anywhere under
`scripts/`, and assembling one out of string parts to get past a safety rule is
the wrong trade. That path is unchanged from attempt 1, is unchanged byte for
byte, and V1 covers the same guard in both check scripts.

## D3 — the anti-drift claim that was false

The two comments in the `PINNED_*` blocks claimed "the dump and the rules cannot
drift apart without the suite going red". They could, and the test named for it
(`print-rules-shape: each pattern is the literal the rule function uses`) was
satisfied by the copy it was meant to police. Both the claim and that test are
gone.

The replacement compares each dumped field against the **executing** AST node,
read out of the script's own text with `typescript` (already a declared
root devDependency; no `package.json` change), and it lives in the colocated
suites only — so `--print-rules` keeps zero new imports and stays hermetic on a
checkout with no dev dependencies.

| Dump field | Read from |
| --- | --- |
| `headingPattern` | the regex literal inside `sectionsOf` / `splitSections` |
| `wordCountSplit` | the regex literal inside `wordCount` |
| `claimVerbs` | each `{kind, re}` entry of the `CLAIM_VERBS` array literal |
| `serverOpenings` | the `SERVER_OPENINGS` array literal |
| `fixtureFilter` | the `FIXTURE_FILES` array literal (single-sourced: this one has no copy) |
| `sections` | the string literals `flagsFor` passes to `at()`, in order |
| `riskSentinel` | the `'None.'` literal inside `flagsFor` |
| `flagRules` | each `.test()` condition that is not under a `!`, paired with the flag it pushes |
| `borrowedExtractor` | the pattern handed to `matchAll` in `exampleSentences` |

`sectionsByFixture` is read from the fixture tree at run time and has no AST
node; it is covered by the locale-sensitivity case instead, and that is stated
rather than glossed.

Mutations splice at the **syntax-tree offset** of the node they name, in an
ignored copy under `build/`, so "the regex inside `sectionsOf`" is a position
and the `PINNED_*` copy carrying the same bytes cannot be the one that moves.
Nine mutations, all red under the new verifier, pristine green:

| Direction | Mutations |
| --- | --- |
| executing side | `sectionsOf` heading, `wordCount` split, `CLAIM_VERBS[0]`, `SERVER_OPENINGS[0]`, `splitSections` heading, `exampleSentences` borrowed extractor, `flagsFor` reported-content rule, `flagsFor` risk rule, `flagsFor` section name |
| pinned side | `PINNED_HEADING`, `PINNED_WORD_SPLIT`, `PINNED_CLAIM_VERBS[0]`, `PINNED_SERVER_OPENINGS[0]`, `PINNED_BORROWED`, `PINNED_FLAG_RULES[0]`, `PINNED_RISK_SENTINEL.en`, `PINNED_SECTIONS.en[0]` |

## Byte identity of the rules that execute

`build/s3.3a-attempt2/byte-identity.mjs` compares the raw bytes of every named
rule declaration and every printed summary line against `9d92d7b`. All sixteen
comparisons are identical; exit 0. See `byte-identity.md` for its output.

## What was not run, and why

V6 and V7 are owner-held. No real model call, no Ollama, no sandbox launch, no
audio, no microphone, no port 7717, no live data folder, no acquisition, no
download, no `npm run build`. The suites' only listener is the ephemeral
loopback `node:http` stub Fixed decision 8 grants, created and closed inside one
test process; every other case talks to `http://127.0.0.1:1`, which the kernel
refuses, or to nothing at all.

Node on `PATH` is v26.8.2 and ran V1–V4 and V8; V5 names the engines-pinned
binary itself (`~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node`,
v24.19.0), as its row requires, and the suites were also re-run under that
binary: 48 cases, 48 pass, 0 fail.
## Coordinator verification before independent review

2026-10-03T01:46:35.328071+00:00: repo-root pinned-node invocation with APUNTA_CHECK_URL=http://127.0.0.1:1, `node --test scripts/check-refine.test.mjs scripts/check-note-format.test.mjs`, exit0:48 passed,0 failed. Includes both-direction AST mutation guards, multi-ID parser regressions and fabricated in-memory seeder cases. No app/model/build/audio/acquisition. Candidate remains unaccepted pending independent review and owner-held V6/V7. Foreign P3.4 proposal and P3.5 review artifacts were inspected only for ownership and are not this source candidate.
