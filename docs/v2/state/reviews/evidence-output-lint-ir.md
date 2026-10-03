# Independent review — evidence output-lint cleanup

- **Cards/commits under review:** `39c6723` (P3.4 output-lint repair) and
  `83b32e0` (P3.5 completion: 14 more `no-console` sites + 2 dead bindings),
  against the preceding candidate `e88a13a`. `02e40f6` (state bookkeeping) sits
  between them.
- **Reviewer:** independent, read-only; authors archived, no source writer
  active. No app/server/build/DB/model-runtime/audio/input/`pactl`/network/
  install was run; port 7717 never contacted; no source, config, card or
  checkpoint logic changed; nothing staged or committed.
- **Pinned interpreter:** `/home/villenull/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node`
  (`v24.19.0`).

## Result

All substantive criteria **PASS**. Two bounded tooling/reporting defects (D1,
D2) are recorded below; neither affects the byte-exact replay, the deleted-
binding proof, the `exit 2` preservation or global lint.

## 1. What was verified (commands and exits)

| Check | Command | Exit |
| --- | --- | --- |
| 58 substitutions present, 0 `console.log` left in the 14 files | `grep -c` over `e88a13a` blobs vs working tree | before 58 / after 0 |
| Transform reproduces the committed bytes | apply committed `transform.mjs` to `e88a13a`/`3bd142f`/`39c6723` blobs, diff | 12/14 byte-exact; other 2 differ only by the documented dead-const lines |
| P3.4 byte-exact replay (12 files) | `APUNTA_NODE=<pinned> <pinned> docs/v2/evidence/P3.4/output-lint-repair/replay-check.mjs` | **0** |
| Completion replay (3 files, 4 baselines) | `APUNTA_NODE=<pinned> <pinned> docs/v2/evidence/output-lint-completion/replay.mjs` | **0** |
| Negative controls | `APUNTA_NODE=<pinned> <pinned> docs/v2/evidence/output-lint-completion/negative-control.mjs` | **0** |
| Dead-binding proof, post-edit | `... dead-binding-verify.mjs absent` | **0** |
| Dead-binding proof, pre-edit (`e88a13a` blobs) | `APUNTA_VERIFIER_ROOT=<blobs> ... dead-binding-verify.mjs check` | **0** |
| Global lint | `./node_modules/.bin/eslint .` | **0** |
| Formatting | `prettier --check` on the 14 files + new dir | **0** |
| `node --check` on all 14 | pinned node | all pass |

Logs: `docs/v2/evidence/output-lint-review/logs/01`–`10`.

## 2. The 58 substitutions

`44` in the 12 P3.4 files and `14` in the two P3.5 files, each
`console.log(X)` → `process.stdout.write(format(X) + '\n')` with
`import { format } from 'node:util'`. Applying the **committed transform** to
the pre-edit git blobs and diffing against the working tree reproduced
**12 of 14 files byte-for-byte**; the remaining two differ only by the two
documented dead-const deletions. So argument lists, template literals, control
flow and `process.exit` codes are untouched — no check, test or fixture logic
was weakened. Every rewritten call passes strings/numbers only, so
`util.format` and `console.log` share the same default path (no TTY
colourisation applies to the captured, non-TTY replay).

Byte-exact runtime evidence: the P3.4 replay ran both trees from git under the
pinned interpreter and the same ignored models/tool; **11 of 12 cases are
byte-identical with zero normalisation**, the twelfth (`ir4-tooling-guard`)
differs only in the test reporter's own timings. The completion replay compared
all four baselines with **zero normalisation**.

## 3. The two deleted constants

- `SINK_NAME` (`source-outputs-mapping.mjs`): exactly one occurrence at
  `e88a13a` — its own declarator — and a string literal initialiser.
- `SCALED_NATIVE` (`ir5-counterexamples.mjs`): exactly one occurrence at
  `e88a13a` — its own declarator — initialised from `Math.round(...)` over
  `CLIENT_TARGET`, itself a module-local `const` bound to `{ x: 700, y: 500 }`.

`dead-binding-verify.mjs check` against the `e88a13a` blobs reports 0
references outside the declarator and a provably pure initialiser for both,
exit 0. Negative controls confirm the verifier rejects a live binding and an
impure initialiser, so the green is not vacuous.

## 4. The `exit 2` source-outputs proof — preserved, not forced

`source-outputs-mapping.mjs` extracts its predicate from
`scripts/v2/tauri-audio.test.mjs`. That harness was rewritten after this proof's
own baseline, so:

- under `46419f5` (its own baseline): **exit 0 both sides**, five `PASS` lines
  and `Verdict: containment predicate is DEFECTIVE (defect reproduced)`;
- under today's harness: **exit 2 both sides**, `could not extract the predicate
  from the harness`.

Both baselines are reported identically on the before and after sides, with zero
normalisation. The harness blobs hash to `1eb4b926…` (`46419f5`) and
`b886f8bb…` (`39c6723`), matching the report. `scripts/v2/tauri-audio.test.mjs`
was not modified. The historical `39c6723` report and all other hash tables were
left untouched; the new report's hashes were independently recomputed and match.

## 5. Defects

**D1 — `replay-check.mjs` NORMALISED: the line-number pattern is inert; the
forced-DEBUG normalisation is not reproducible from the repo.**
`docs/v2/evidence/P3.4/output-lint-repair/replay-check.mjs:59-64` lists
`[/[^ \n]*tooling-guard\.test\.mjs/g, '<TESTFILE>']` before
`[/tooling-guard\.test\.mjs:\d+/g, 'tooling-guard.test.mjs:N']`. The first is
greedy and consumes the `.mjs` literal, so the second can never match; the code
comment (lines 55-57) and `output-lint-completion/README.md` §3.1 claim the
`+1` stack-line shift is normalised, but the committed tool leaves it:

```
committed order -> "test at <TESTFILE>:130:1"
swapped order   -> "test at <TESTFILE>:N:1"
```

I reproduced the forced-failure control (a copy of `build/ir4` whose
`build-dispatch.mjs` exits 1 on `--attempt 4`, under ignored `build/`): the
`DEBUG` line bytes and stderr are identical, and every stack frame shifts by
exactly `+1` (130→131, 132→133, 137→138, 139→140, 217→218, 227→228) with the
scratch-vs-real path differing. Those differences are mechanical and justified,
but they are **not** the normalisation the committed file describes: pointed at
that forced run, `replay-check.mjs` would report `FAIL … stdout`. Impact is
bounded — the main 14/14 replay never emits the test-file path, so its
"timing-only" normalisation is genuinely all it needs. Fix (not applied here,
outside the review's write scope): swap the last two `NORMALISED` entries. The
§3.1 control itself is prose-only and is not committed as a script.

**D2 — `replay-check.mjs` overstates per-case output.** The success line at
`replay-check.mjs:116` prints `stdout/stderr byte-identical` for every case even
when `normalise()` was applied; for `ir4-tooling-guard` the raw streams differ in
timings. The README §3 is accurate; only the script's own line is imprecise.

Minor note (not numbered): `transform.mjs:8` says it asserts "no `console`
identifier survives", while the code (by design, to preserve `console.error`)
checks only `console.log` — a comment inaccuracy in a one-shot scratch tool.

## 6. Write scope

- Wrote only `docs/v2/state/reviews/evidence-output-lint-ir.md` and
  `docs/v2/evidence/output-lint-review/**` (README + `logs/01`–`10`).
- Scratch under ignored `build/evidence-output-lint-review/` (transform check,
  forced-DEBUG tool copy). Running the authors' own replay scripts wrote only
  inside the ignored `build/` trees they already own
  (`build/evidence-output-lint/`, `build/evidence-lint-completion/`).
- Nothing staged or committed; no tracked source/config/card/checkpoint changed.

During this review a concurrent commit landed on `main` (`d19a462`, a P3.5
source-review/environment-preflight record) and a separate environment-proposal
writer left an in-flight dirty tree (`M docs/v2/state/P3.5-ENVIRONMENT-PROPOSAL.md`,
untracked `docs/v2/evidence/P3.5/environment-proposal-repair2/`). Neither is part
of the reviewed commits and neither was touched, staged or committed here;
`d19a462` changes no proof script, harness or source file, so the comparison
against `e88a13a`..`83b32e0` is unaffected.
