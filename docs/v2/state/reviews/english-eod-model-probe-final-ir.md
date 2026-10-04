# English EOD model probe — final independent review

**Verdict: CLEAR.** The approved completion holds. Every claim in
`english-eod-model-probe-repair/probe-repair-replay.md` and
`english-eod-model-probe-fixtures/fixtures-replay.md` that the root asked me to
verify was reproduced from scratch, offline, with my own harness rather than
theirs. No DEFECT. Seven non-blocking observations follow.

- Reviewer: independent review of commit `e7889bc` ("Preserve offline
  acquisition cases as fixture data"), which carries both passes — the reviewer
  artifact hygiene repair and the case-table-to-fixture extraction — in one
  commit. Both reports and both harnesses are in scope.
- Evidence: `docs/v2/evidence/english-eod-model-probe-final-ir/`.
- Nothing was staged or committed. No author, adapter, cache, card, catalogue or
  config file was edited. One disclosure, below and in
  `09-side-effect-and-restoration.txt`.

## What I ran

| Command | exit | result |
| --- | --- | --- |
| `node docs/v2/evidence/english-eod-model-probe-final-ir/ir-run.mjs` | 0 | 23 PASS, 0 FAIL |
| `node docs/v2/evidence/english-eod-model-probe-final-ir/ir-controls.mjs` | 0 | 58 PASS, 0 FAIL |
| `node docs/v2/evidence/english-eod-model-probe-repair/replay.mjs` | 0 | 33 PASS, 0 FAIL |
| `node docs/v2/evidence/english-eod-model-probe-fixtures/fixtures-replay.mjs` | 0 | 17 PASS, 0 FAIL |
| `npx eslint .` | 0 | no output |

Probes ran with `node_modules/.bin/tsx` from the repository root, each twice:
once normally and once inside an empty network namespace (`unshare -rn`). No
acceptance V4, no `npm test`, no typecheck, no build, no native toolchain, no
STT, no Ollama, no `pactl`, nothing on :7717. No download, no inference. The
acquisition technical receipt was already CLEAR and is not re-opened.

## The numbers the root asked for, re-measured

BEFORE (`before-probe.ts.txt`, materialized to scratch with only the
guarded-fetch import depth changed) and AFTER (`guard-probe.ts`):

```
BEFORE                    exit=0  stdout=1601B  stderr=0B
AFTER                     exit=0  stdout=1601B  stderr=0B
BEFORE  in empty netns    exit=0  stdout=1601B  stderr=0B
AFTER   in empty netns    exit=0  stdout=1601B  stderr=0B
```

- 14 lines, last line `total fetchReached=4`, first case still the refused
  `loopback /api/pull`.
- BEFORE ≡ AFTER ≡ the reviewer's recorded `guard-probe-output.txt`
  (sha256 `415b6690…`, 1601 B), byte for byte, so the recorded evidence still
  describes the repaired artifact and no re-recording was needed.
- Identical bytes with **no network namespace at all**: the synthetic
  `globalThis.fetch` recorder intercepts all four `fetchReached=true` cases. I
  read `build/eod-model-acquisition/guarded-fetch.ts` to confirm it dispatches
  through the global `fetch` and never `http`/`https` directly — that is what
  makes the netns run meaningful rather than decorative. Adapter unchanged:
  sha256 `a0febd22…`, mtime 17:58:27, as the repair report claims.

## Negative controls — all of them discriminate, including 4 → 5

Run against my own scratch copies, never the committed files:

| Control | Mutation | Result |
| --- | --- | --- |
| channel | `process.stdout.write` → `process.stderr.write` | caught: stdout 0 B, baseline reproduced exactly on stderr, decisions unchanged |
| **data** | one refused address flipped **in `guard-cases.json`**, probe source byte-identical | caught: 1581 B, 14 lines, first case `ALLOWED`, `total fetchReached=5`; restoring the fixture restores the baseline bytes exactly |
| rule scope | archived case table back to executable source, header stripped | caught: `{"no-restricted-syntax":7,"no-console":2}` — the rule still fires, nothing is exempted; stable on a second lint |
| lint, authors' | the two prints reverted | caught: `no-console` twice |
| fail-closed | 7 malformed fixtures (empty array, bare string, short pair, non-string URL, non-array, malformed JSON, missing file) | caught: exit 1 every time, **zero** case lines printed |

The data control is the load-bearing one and it holds: with the probe source
unchanged, only the fixture moved, and the decisions moved with it.

I also re-derived the fixture from a witness the authors did not use. Rather
than trust `before-probe.ts.txt`, I parsed the reviewer-recorded
`guard-probe-output.txt` and checked it against `guard-cases.json`: all 13 labels
in fixture order, all 9 refused URLs match after the adapter's own redaction
(`?<redacted>`, user-info stripped, fragment stripped), 4 ALLOWED / 9 REFUSED,
7 external / 6 loopback. That is a stronger anchor than the archive chain and it
agrees with it.

## Containment, lint scope, and the repair's own claim

- The probe writes only `build/eod-model-probe-repair/guard-probe-egress.jsonl`,
  covered by `.gitignore:55`. The old `/tmp/opencode` destination is gone from
  the source. `/tmp/opencode/guard-probe-egress.jsonl` is byte-size 3657 with
  mtime 18:03:29 both before and after my review: never read, written or deleted.
- No `*.jsonl` is read, copied, exported or printed by either harness — only
  `existsSync`. Neither harness deletes anything; the only commands either spawns
  are `git` and `npx`.
- `eslint.config.js` is byte-unchanged across `e7889bc~1..e7889bc`. The archived
  case table still trips the rule 7 times as source; with its own disable header,
  0. `guard-probe.ts` lints `{}` — completely clean — and contains no
  `http(s)://` literal and no `console` call.
- `npx eslint .` over the whole repository: exit 0, no output.
- The repair's central claim, measured: `console.log(x)` and
  `process.stdout.write(format('%s\n', x))` emit identical bytes for 6 payloads
  including `%s`, `%d`, `%20`, a bare trailing `%`, and a real case line with a
  query. Output-only, as approved.
- Strictness spot-check on the new rule-scope checks: `=== 7`, `=== 0`,
  `lines.length === 14`, `lines[13] === 'total fetchReached=4'`, byte
  `Buffer.equals`, exit codes compared. Comparison is by bytes and status
  throughout, never by a summary or a count.

## Observations — none blocking, none a defect

1. **The harness writes a volatile line into a committed file.** `replay.mjs`
   ends with `git rev-parse HEAD`, so re-running it always dirties
   `results/replay-report.txt` by exactly one line. All 33 substantive lines
   reproduce byte-identically; only the HEAD stamp moves. If the coordinator
   wants the evidence to be re-runnable without a diff, the stamp either belongs
   in scratch or should be dropped.
2. **Disclosure and restoration.** Running the authors' `replay.mjs` in place is
   what caused that one line. I restored the file from `e7889bc` with `git show`
   and a direct write — no `checkout`, no `reset`, no index operation — and
   verified the worktree blob equals the baseline `0fad4a0a…`. All 17 files of
   `e7889bc` were then compared by blob hash; all 17 identical. No history
   rewritten, nothing staged. Details in
   `09-side-effect-and-restoration.txt`.
3. **The archive header overstates itself.** `before-probe.ts.txt` line 1 calls
   itself a "verbatim BEFORE snapshot of the reviewer's probe", but its log path
   is already the in-repo one; the reviewer's original used `/tmp/opencode`. The
   probe report is honest that the snapshot differs by that one line, so the
   evidence is not misleading — only the header is loose. Cosmetic.
4. **`format('%s\n', …)` is defensive, not load-bearing.** The repair report
   justifies the `%s` by saying "`util.format` interprets `%` in a bare first
   argument". With no extra arguments Node leaves a bare `%s` literal, so
   `format(line)` would emit the same characters — but without the trailing
   newline. The template is the right call; the stated reason is slightly off.
   Bytes are identical either way, so nothing observable rests on it.
5. **One check cannot fail.** `replay.mjs` asserts
   `check('NC3 negative control is never executed', true, 'static check only')`.
   It is a true-by-construction assertion. The adjacent check — the same
   predicate applied to a probe naming an outside log — is the one that actually
   discriminates, and it passes.
6. **The committed probe cannot be re-run from a fresh clone.** It imports the
   *ignored scratch* adapter `build/eod-model-acquisition/guarded-fetch.ts`.
   That is inherited from the acquisition receipt, not introduced here, and I am
   not re-opening it — but whoever integrates this should know the evidence
   depends on a scratch file that git does not carry.
7. **Constructive: a standalone run without the scratch directory fails quietly.**
   `appendFileSync` cannot create a parent, so with
   `build/eod-model-probe-repair/` absent the probe does not error out — it
   records `ENOENT` as the refusal reason for all 13 cases and still exits 0,
   printing 2361 B of plausible-looking `REFUSED` lines instead of 1601 B
   (`07-missing-scratch-dir.txt`). `replay.mjs` `mkdir`s first, so the committed
   replay is unaffected, and a byte comparison catches it. Making the probe
   `mkdirSync(dirname(log), { recursive: true })` would close the gap, but that
   is a one-line control-flow change to an evidence file, so it is the
   coordinator's call, not mine.

## Callback

CLEAR to close the probe-repair and fixture-extraction passes. Two things the
coordinator may want before committing: decide on observation 1 (the volatile
HEAD line in a committed report) and observation 7 (a one-line `mkdir` in the
probe, or an explicit precondition in the report). Neither affects the evidence
as recorded. The spoken-STT evidence is owned by another agent and its in-flight
outputs were neither read nor relied on. My artifacts are untracked and
uncommitted, awaiting the coordinator:

- `docs/v2/state/reviews/english-eod-model-probe-final-ir.md`
- `docs/v2/evidence/english-eod-model-probe-final-ir/` — `ir-run.mjs`,
  `ir-controls.mjs`, `01`–`09` evidence files (all scratch in
  `build/eod-model-probe-final-ir/`, git-ignored)