# P3.5 completion — the last 16 global lint errors, with real code fixes

**Output and dead-binding repair only.** This directory closes the 16 errors that
`npx eslint .` still reported after `39c6723` ("Preserve proof output while fixing
evidence console lint"), the prior output-lint repair. It makes no other change
anywhere.

Prior art, unchanged and still green: `docs/v2/evidence/P3.4/output-lint-repair/`
(`39c6723`) cleared 44 `no-console` errors across 12 P3.4 reproduction scripts by
substituting `console.log(X)` → `process.stdout.write(format(X) + '\n')`. This
packet applies the identical substitution to the two P3.5 review-1 proofs and
deletes the two dead `const` bindings the same commit deliberately left for a
decision. The prior commit's report is *not* edited: its hash table and its
"16 remaining" section remain a record of what was true then.

## 1. What `npx eslint .` actually said — measured, not inherited

The task brief described "15 logs + 1 unused" in the P3.5 review-1 directory.
Measured, that is not what the tool reported. `npx eslint .` at `39c6723` gave
exactly **16 errors** in exactly three files:

| File | `no-console` | `no-unused-vars` | Total |
| --- | --- | --- | --- |
| `P3.4/proposal-v5-repair/ir5-counterexamples.mjs:29` | — | 1 (`SCALED_NATIVE`) | 1 |
| `P3.5/review-1/source-outputs-mapping.mjs` | **9** | 1 (`SINK_NAME`) | 10 |
| `P3.5/review-1/stale-rectangle.mjs` | **5** | — | 5 |
| | **14** | **2** | **16** |

So: **14 `console.log` call sites and 2 unused bindings**, not 15 calls and one
binding. The prior report's "10 `no-console` + 1 unused" for
`source-outputs-mapping.mjs` also over-counted the console sites by one (it is 9
`no-console` plus the 1 unused binding = 10 errors in that file). The arithmetic
closes at 16 either way; the split is what the AST transform and `git grep`
confirm. Line numbers before the edit: 105, 109–114, 147, 148 in
`source-outputs-mapping.mjs`; 50, 54, 55, 71, 72 in `stale-rectangle.mjs`.

## 2. The three fixes

### 2.1 `console.log` → `process.stdout.write(format(X) + '\n')` (14 sites)

`transform.mjs` (this directory) parses each file with **espree** — already an
ESLint dependency — and rewrites only `CallExpression` nodes that are a bare
`console.log(...)` whose parent is an `ExpressionStatement`, i.e. cases whose
return value nothing reads. It refuses the file if any such call is not a bare
statement, and re-parses the result to assert no `console.log` survives. It
reported **9** and **5** call sites, matching the 14 `no-console` errors exactly.

`console.error` at `source-outputs-mapping.mjs:49` is **left alone on purpose**.
`no-console` permits `warn`/`error`, so rewriting it would be an unrequested
behaviour change on an error path. (An earlier version of the transform refused
the file for that reason; the leftover check was narrowed to `console.log` and
the transform re-run from the pristine blobs, so the recorded before-hashes below
are the bytes actually transformed.)

The diff adds one `import { format } from 'node:util';` per file and rewrites the
14 call sites. In `stale-rectangle.mjs`, which has no imports and a `#!` line, the
import goes below the shebang. No argument, string, template literal, control
flow, `process.exit` code or assertion changed.

### 2.2 `SINK_NAME` deleted (`source-outputs-mapping.mjs:56`)

```diff
 const SOURCE_NAME = 'apunta_p35_mic';
 const REAL_MIC_PREFIX = 'alsa_input.usb-UGREEN';
-const SINK_NAME = 'apunta_p35';
```

The proof is about *source* outputs, and the sink name was never used.

### 2.3 `SCALED_NATIVE` deleted (`ir5-counterexamples.mjs:29`)

```diff
 ]);
-const SCALED_NATIVE = { x: Math.round(1.5 * CLIENT_TARGET.x + 26), y: Math.round(1.5 * CLIENT_TARGET.y + 31) };
 const RECT = { l: 'John Smith', t: 'span', d: 'patient-open' };
```

Nothing reads it; the script computes its points from `SCALED` instead. Renaming
it to `_SCALED_NATIVE` would silence the rule while keeping the dead binding;
deleting it removes the dead binding, which is what `no-unused-vars` is asking
for. This is the decision `39c6723` §6 left open.

### 2.4 Both deletions were proved before they were made

`dead-binding-verify.mjs` runs **before** the edit and asserts from the AST, not
by reading, that (a) the name has **0 references outside its own declarator** and
(b) the initialiser is provably free of side effects — literals, object/array
literals, reads of module-local `const`s bound to literals, and calls drawn from
an allow-list of pure built-ins (`Math.round`, `Math.floor`, …). Any assignment,
update, `new`, `await`, I/O call or unknown identifier is refused.

```
== …/P3.5/review-1/source-outputs-mapping.mjs :: SINK_NAME
   decl    line 56  init = 'apunta_p35'
   reads   0 references outside its own declarator — deleting it changes no read
   effect  initialiser is literals + allow-listed pure calls only — no I/O, no mutation

== …/P3.4/proposal-v5-repair/ir5-counterexamples.mjs :: SCALED_NATIVE
   decl    line 29  init = { x: Math.round(1.5 * CLIENT_TARGET.x + 26), y: Math.round(1.5 * CLIENT_TARGET.y + 31) }
   reads   0 references outside its own declarator — deleting it changes no read
   effect  initialiser is literals + allow-listed pure calls only — no I/O, no mutation

dead-binding-verify (check): both bindings safe to delete / confirmed absent.   exit 0
```

Re-run afterwards in `absent` mode: 0 declarations and 0 other references for
both names. Exit 0.

These are dead bindings, **not** reduced coverage: no assertion, expectation,
fixture, counterexample or printed line depended on either name.

## 3. Byte-exact replay against `39c6723`

`replay.mjs` (this directory) rebuilds the "before" tree from
`git show 39c6723:<path>` on every run — it cannot be satisfied by editing both
sides — and runs both trees under the same pinned interpreter
`~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node` (`v24.19.0`,
asserted before anything runs), cwd repository root. **Zero normalisation**: no
timing strip, no path rewrite, no line-number shift, nothing.

```
== docs/v2/evidence/P3.5/review-1/source-outputs-mapping.mjs
  ok    harness @46419f5 (its own baseline)  exit 0  stdout/stderr byte-identical (zero normalisation)
         before exit 0 / after exit 0
== docs/v2/evidence/P3.5/review-1/source-outputs-mapping.mjs
  ok    harness @HEAD (today, predicate rewritten)  exit 2  stdout/stderr byte-identical (zero normalisation)
         before exit 2 / after exit 2
== docs/v2/evidence/P3.5/review-1/stale-rectangle.mjs
  ok    pure, no external input  exit 0  stdout/stderr byte-identical (zero normalisation)
== docs/v2/evidence/P3.4/proposal-v5-repair/ir5-counterexamples.mjs
  ok    dead SCALED_NATIVE removed  exit 0  stdout/stderr byte-identical (zero normalisation)

PASS: 0 mismatch(es) against 39c6723.   exit 0
```

### 3.1 The two baselines for `source-outputs-mapping.mjs`, reported as they are

This proof is not self-contained: it **extracts its predicate from
`scripts/v2/tauri-audio.test.mjs`** by slicing two marker strings out of the
shipped file. That harness has since been rewritten (`9e6094b`, `7e16513`), so
the markers no longer exist and the script prints `could not extract the
predicate from the harness` and **exits 2**.

That is a fact about the current source, not about this repair, and it is
identical on both sides of the comparison — the edit changed nothing about it.
The replay therefore runs the proof under **both** baselines and reports both,
rather than editing anything to force a pass:

| harness baseline | sha256 of `scripts/v2/tauri-audio.test.mjs` | before | after |
| --- | --- | --- | --- |
| `46419f5` — its own baseline | `1eb4b9267fac86e3a0804c3521bc8efdaba3c3250bec9f4810a6b89da65606b4` | exit 0 | exit 0 |
| `39c6723`/`HEAD` — today | `b886f8bbc7006765a50911874f3188a79e4235a26863c419b41a24adb8931cdb` | exit 2 | exit 2 |

Under `46419f5` both sides reproduce the original finding: five `PASS` lines and
`Verdict: containment predicate is DEFECTIVE (defect reproduced)`, exit 0. Under
today's harness both sides exit 2 with the same message. Neither side was
adjusted; the fixture is an ignored miniature repo root
(`build/evidence-lint-completion/fixture-<commit>/`) holding only the baseline
harness, because the proof walks up looking for that path. The real
`scripts/v2/tauri-audio.test.mjs` was never modified.

The **exit status and the byte streams are reported faithfully and identically on
both sides in both baselines** — which is the only claim being made.

`stale-rectangle.mjs` copies the tid-union loop out of the harness *as text* and
imports nothing from the tree, so it has no external baseline: the two blobs
alone decide the comparison, and they agree at exit 0 (`Verdict: stale rectangle
reproduced (defect)`).

`ir5-counterexamples.mjs` imports the same ignored repaired model on both sides,
`build/p3.4-spec-v5-repair/model.mjs`
(`e9e8ce7a422d0bb88f81a20249e2dc9e7b786038dd2012e2f1050ed49d57a699`, `--check`ed
first), with `APUNTA_P34_MODEL`, `APUNTA_V2_PLAN_DIR_REAL=$PWD/docs/v2` and
`APUNTA_TOOL_DIR=$PWD/build/ir4` as in `39c6723`. Exit 0 on both sides; the
`P4 … ok=false … no click issued` counterexample still prints. The model was read
only, never edited or re-run.

### 3.2 The prior 12-case replay is retained

```
$ node docs/v2/evidence/P3.4/output-lint-repair/replay-check.mjs
  ok    ir4-attempt-line-identity … ok    repair2-ir5-counterex      (12 cases)
  12 case(s) replayed against 3bd142f; 0 failure(s).        exit 0
```

All 12 still byte-identical after the `SCALED_NATIVE` deletion — including
`repair2-ir5-counterex`, the same file this packet touched.

## 4. Negative controls — the checks are not vacuous

`negative-control.mjs` (this directory), exit 0:

```
  ok    control replay: one changed word in the after blob is caught (exit 0 vs 0, stdout differs)
  ok    control verifier (binding is read elsewhere): rejected, exit 1, reported "reference(s) outside the declarator"
  ok    control verifier (binding is read elsewhere (P3.4 target)): rejected, exit 1, reported "reference(s) outside the declarator"
  ok    control verifier (initialiser is impure (P3.4 target)): rejected, exit 1, reported "not provably pure"

PASS: 0 vacuous control(s).
```

The first rewrites one word of the after-blob
(`DEFECTIVE (defect reproduced)` → `SOUND (no defect)`) in the ignored fixture and
shows the stdout comparison then fails; the real proof files are untouched. The
other three point the verifier, via `APUNTA_VERIFIER_ROOT`, at synthetic files
where the same names are live or where the initialiser calls an impure function,
and show it refuses them. So the two green checks in §2.4 and §3 are evidence,
not silence.

## 5. Hashes and the exact commits compared

Base commit `39c6723a20f47f39482da72e2cca06f1bbcc7004`. Baseline harness
`46419f5`. Working tree left **unstaged and uncommitted** for the combined review
of `39c6723` + this delta.

| File | before (`39c6723`) | after (working tree) |
| --- | --- | --- |
| `P3.5/review-1/source-outputs-mapping.mjs` | `cb4e66f26d91ab6cabad0e3a3847f000962b658e6b82fc7829ff9033693e641e` | `c90b12a14fb01d86007c556209e73b1b7f91547b952e08c96077e502376a9074` |
| `P3.5/review-1/stale-rectangle.mjs` | `f667268ab4b24d9f4d04e5996964ef7a5def415e012075a5fa4422c7f2a70ea9` | `f6cc8bf306eed14ea9b5ea8ac445758e46a61debe669b951a7fdbd5f60b3fadb` |
| `P3.4/proposal-v5-repair/ir5-counterexamples.mjs` | `b6e877cfb1b55b4c1f4c0a2d88a4b6d22b29b70bcc323330e7d36240980989f4` | `8e40c4dc1fbcae914ecb23df1d74ddaa556858ba872ce44a8e4bb91b746d1c5b` |

`ir5-counterexamples.mjs` changed in two packets. `39c6723` took it from
`bfedf139…` (at `3bd142f`) to `b6e877cf…` by rewriting its 7 `console.log`
calls; this packet then removed the one dead line on top, giving `8e40c4dc…`.
Both moves are byte-exact — the 12-case replay in §3.2 covers the first, §3
covers the second, and both compare the same file's output.

Historical hash reports in other directories still describe their own earlier
commits and were deliberately left untouched — this is a new directory, not a
rewrite of an existing record.

## 6. Lint state

```
$ npx eslint .
ESLINT_EXIT=0
```

**`npx eslint .` over the whole repository is exit 0.** All 16 errors are closed by
real code changes. `npx prettier --check` on every file this packet created or
touched is exit 0 — "All matched files use Prettier code style!" — so no
reformatting was needed beyond the generated lines.

No rule was disabled. No `eslint.config.js` edit, no `overrides` entry, no
`eslint-disable`, no `no-console` exemption. No test, fixture, assertion, scorer,
threshold or rubric was deleted, weakened or loosened. No build was run; no
`npm test`, model test, e2e, seed or server was started.

## 7. What was not done

- No application, server, database, model runtime, `pactl`, audio, microphone,
  input, display, download, install or network was invoked. Port 7717 was never
  contacted. No live data folder was opened.
- No model was changed, regenerated or re-run; the ignored copies under `build/`
  were read only, at the hashes recorded above.
- No other proof directory, review, proposal, card, checkpoint, contract, config,
  `eslint.config.js` or manifest was edited. In particular
  `docs/v2/evidence/P3.5/review-1/*.md` (the findings the two proofs carry) and
  the `39c6723` report were not rewritten.
- `scripts/v2/tauri-audio.test.mjs` was not modified; the baseline harness exists
  only inside the ignored `build/evidence-lint-completion/`.
- All scratch output stayed inside the ignored `build/`. One stale
  `docs/build/evidence-lint-completion/` directory, created by the first replay
  run before a path fix, was removed so the global lint is reproducible; it held
  nothing but that run's scratch copies.
- Left unstaged and uncommitted.

## 8. For the reviewer

Independently review the **combination** of `39c6723` and this delta. The
narrowest questions are:

1. Is `console.log(X)` → `process.stdout.write(format(X) + '\n')` byte-exact for
   each of the 14 rewritten call sites, including the two `console.log('')`
   blank lines and the multi-line `console.log(\n  \`…\`,\n)` call?
   `format('')` is `''`, so each still writes exactly one `\n`.
2. Are `SINK_NAME` and `SCALED_NATIVE` genuinely unread, per §2.4 and the
   negative controls?
3. Is the `exit 2` in §3.1 under today's harness correct, and is leaving it
   un-forced the right call? It is the honest current state; forcing a pass would
   have meant editing the harness or the proof's expectations.