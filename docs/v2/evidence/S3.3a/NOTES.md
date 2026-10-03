# S3.3a — evidence notes

Card: `docs/v2/state/dispatch/S3.3a.md`, base `9d92d7b`, attempt 1 of 3.
Every row below was executed **verbatim** from the card's table (extracted from
the table cell with `\|` unescaped once) by `/bin/bash -c`, and its exit code
recorded. Raw row output is in `V1.log` … `V8.log`; `ROWS.md` is the index.

Paths in this file are sanitised: the sandbox run folder is `<sandbox>`.

## Rows

| Row | Result | Notes |
| --- | --- | --- |
| V1 | PASS (0) | the four pre-flight paths, no flag in any of them |
| V2 | PASS (0) | eighteen cases through one `chk` |
| V3 | PASS (0) | six conjuncts, including both producers of `5` |
| V4 | PASS (0) | six blobs, determinism, locale sensitivity, 12 keys × 2 blobs typed |
| V5 | PASS (0) | 25 cases, all 12 required names present, no `.mutated.mjs` left |
| V6 | **NOT RUN** | held: real model (`qwen3.5:4b-q4_K_M`), owner quiet-machine decision |
| V7 | **NOT RUN** | held: same reason |
| V8 | FAIL (1) | not this card's writes — see below |

## V8: why it is red, and what is not mine

The row compares the tree against `9d92d7b`. Three commits landed **after** this
card was generated, all of them documentation and state written by the
coordinator and another agent in this shared tree:

```
8464fd6 Reconcile accepted cards and exhausted attempts with durable state
201f937 Resume orchestration with S3.3a implementation and independent audits
3235628 Correct P3.4 handoff against the failed security assertions
```

`git diff --name-only 9d92d7b HEAD` lists 14 paths, **all** under `docs/`:

```
docs/v2/ORCHESTRATION-LOG.md              docs/v2/state/cards/P3.4.json
docs/v2/state/AMENDMENTS.md               docs/v2/state/cards/P3.5.json
docs/v2/state/BLOCKED.md                  docs/v2/state/cards/P3.8.json
docs/v2/state/NEXT-SESSION.md             docs/v2/state/cards/S3.2.json
docs/v2/state/PROGRESS.json               docs/v2/state/cards/S3.3a.json
docs/v2/state/SESSION-HANDOFF-2026-10-02.md  docs/v2/state/dispatch/S3.3a.md
docs/v2/state/reviews/P3.4-diagnosis-2026-10-03.md
docs/v2/state/reviews/continuation-state-audit-2026-10-03.md
```

Two further paths were uncommitted and in flight from that same other agent
during the run: `docs/v2/cards/P3.5.md` and
`docs/v2/state/reviews/P3.5-V5-command-repair.md`.

**No path this card reads, writes or tests differs between `9d92d7b` and HEAD.**
Checked explicitly for all nine Read paths
(`scripts/check-refine.mjs`, `scripts/check-note-format.mjs`,
`scripts/v2/sandbox.mjs`, `scripts/v2/sandbox.test.mjs`,
`scripts/v2/check-es-fixtures.mjs`, `server/src/eval/cli.ts`,
`docs/v2/cards/S3.3.md`, `package.json`, `e2e/fixtures/refine/README.md`) —
all `same`. Per the dispatch's own rule this is documentation-only drift and
"alone is not a stop"; the red is V8 measuring the shared tree, not this card.

The only paths this card wrote are the five in May edit plus the two required
outputs; the same membership loop run over `git status --porcelain` alone
reports only the two foreign documentation paths above.

## No-flag behaviour is byte-identical to the base

The base copies were extracted with `git show 9d92d7b:scripts/…` and run beside
the working copies. Both pre-flight paths that need no build:

| Path | base | now |
| --- | --- | --- |
| `check-note-format`, `APUNTA_V2=1`, empty URL | exit 2, stdout same, stderr same | exit 2 |
| `check-refine`, `APUNTA_V2=1`, empty URL | exit 2, stdout same, stderr same | exit 2 |
| `check-note-format`, `http://10.0.0.1:7800` | exit 2, stdout same, stderr same | exit 2 |

The fourth conjunct (`check-refine` on a non-loopback URL) cannot be compared
this way — the base copy resolves `server/dist` from `import.meta.url`, which is
`/tmp` in that harness, so it refuses at the built-server guard instead. V1's
third conjunct covers it on the real path, and `git diff` shows the guard block
itself untouched.

The complete set of lines **removed** from the two scripts is seven, all of
them accounted for: the two import lines (extended), `const dir` (superseded by
`treeDir`), the three-line `names = readdirSync(dir)…` listing (superseded by the
enumerated list, identical with no flag), `join(dir, name)` → `join(treeDir,
name)`, the `only` line the card exists to fix plus its comment, and the inline
fixture-file array (now `FIXTURE_FILES`). No rule function, guard, HTTP call,
counter or printed summary line was touched.

## Rule bytes are pinned to the base

Every pattern, section name, opening, sentinel and fixture file name that
`--print-rules` emits was searched for as a byte substring in
`git show 9d92d7b:scripts/…` (and, for `sectionsByFixture`, in the base fixture
JSON, which is where those names live and which the dump reads):

- `check-refine.mjs`: 16 literals byte-present in the base script
  (`headingPattern`, `wordCountSplit`, 4 `claimVerbs`, 8 `serverOpenings`,
  2 `fixtureFilter`); 11 `sectionsByFixture` names byte-present in the base
  `e2e/fixtures/refine/*.json`. None missing.
- `check-note-format.mjs`: 10 of 10 byte-present in the base script
  (`headingPattern`, `borrowedExtractor`, 3 `flagRules`, 4 `sections`, and the
  `None.` sentinel). None missing.

Every dumped literal is a `source`/`flags` pair, never a `/…/flags`
re-serialisation; the suites assert that mechanically
(`print-rules-shape: each pattern is the literal the rule function uses`).

## The blob shape handed to S3.3 (Fixed decision 4, verbatim)

`scripts/check-refine.mjs` — eight keys:

| Key | Type |
| --- | --- |
| `script` | string |
| `locale` | string |
| `sectionsByFixture` | plain object, every value an array of strings |
| `headingPattern` | `{source, flags}`, both strings |
| `fixtureFilter` | array of strings (ordered file names) |
| `wordCountSplit` | `{source, flags}`, both strings |
| `claimVerbs` | array of objects `{kind, source, flags}` |
| `serverOpenings` | array of strings |

`scripts/check-note-format.mjs` — seven keys:

| Key | Type |
| --- | --- |
| `script` | string |
| `locale` | string |
| `sections` | array of strings |
| `riskSentinel` | string |
| `headingPattern` | `{source, flags}`, both strings |
| `flagRules` | array of objects `{name, source, flags}` |
| `borrowedExtractor` | `{source, flags}`, both strings |

Twelve distinct names. Empty is legal: at this base `es-MX` carries `{}`, `[]`,
`""`, `[]` for `sectionsByFixture`, `sections`, `riskSentinel` and `flagRules`.
Locale-varying keys are `sectionsByFixture` (refine) and `sections`,
`riskSentinel`, `flagRules` (format); every other key is a shared constant
repeated in every blob.

## Toolchain

- `npm run lint` → exit 0 (`eslint .`, `prettier --check .`,
  `check-no-external-urls.mjs`, `collect-licenses.mjs --check`,
  `check-ui-strings.mjs`).
- `npm run typecheck` → exit 0.
- `npm run build` → exit 0; `server/dist/ai/fact-guard.js` and
  `refine-request.js` present (V1's third conjunct needs them).
- V5 ran on the engines-pinned interpreter
  `~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node` (v24.19.0), as
  the row requires. The default `node` on this machine is v26.8.2, outside
  `engines`.
- Port 7841 was validated free by binding `127.0.0.1:7841` with `net` and
  releasing it (`ss` cannot netlink in this sandbox), and then left unused:
  V6 and V7 were held.

## The controls genuinely fail

`exits-4-on-a-missed-control` asserts **both** halves in one case: the clean
copy of `scripts/check-refine.mjs` must exit 0, and the mutated sibling
(`Plan:` → `Planz:` in the one pinned control input) must exit exactly 4. The
suite went red on its own during development (a summary-token assertion in
`check-note-format.test.mjs`), which is the same falsifiability argument from the
other side.

## A defect found in the card (reported, not fixed)

**V7 conjunct (a) greps for a string the script does not print.**
`grep -qF -e 'fixture(s) across' "$b/o1"` cannot match at this base:
`check-note-format.mjs`'s summary line is

```
0 flag(s) across 6 fixtures.
```

— the card's own note calls `:212` "the summary line the script already prints",
but `fixture(s) across` appears nowhere in that line or anywhere else on
stdout. V7 conjunct (a) is therefore a false red against a correct
implementation, and conjunct (b) inherits nothing from it. Closing it needs a
coordinator decision: either the row greps `flag(s) across`, or the summary line
is reworded — and rewording it would edit "every printed summary line", which
May edit's Must-not-edit forbids. **Not changed here.**