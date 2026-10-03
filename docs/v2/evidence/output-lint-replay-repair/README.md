# Forced-DEBUG control for the output-lint replay repair

**Date 2026-10-02.** Two files, both executable:

- `forced-debug-control.mjs` — the control;
- `normalisation.mjs` — the four normalisation rules the output-lint replay
  checker applies, plus the *previous* order of the same four rules, so the
  control can show that the order is load-bearing rather than cosmetic.

This exists because of two defects in
`docs/v2/state/reviews/evidence-output-lint-ir.md`. That review found (D1) that
the line-number rule in `replay-check.mjs` was inert, so the `+1` import shift
was never actually normalised, and (D2) that its success line claimed raw byte
identity for a case whose raw streams differ. Both are repaired in
`docs/v2/evidence/P3.4/output-lint-repair/replay-check.mjs`, whose §8 addendum
records that. §3.1 of that directory described a forced-DEBUG control as prose;
this is that control, as a script.

## Why a control is needed at all

The 12-case replay runs clean, so `if (r.status !== 0)` in
`tooling-guard.test.mjs` never fires — the one DEBUG line the output repair moved
is never exercised, and the replay says nothing about it. Worse, in a clean run
the test file's *path* never appears in the output either, so the two rules that
D1 is about never fire. A green run cannot distinguish a correct normalisation
order from an inert one.

So this control forces the branch: it takes a copy of the read-only ignored tool
`build/ir4/`, renames `build-dispatch.mjs` aside, and puts a wrapper in its place
that exits 1 on one `--attempt` number and delegates **every other invocation to
the real tool, unmodified**. The guard then fires, the stack frames appear, and
the two orders can be told apart.

Both sides of every comparison are the same file content:

| side | source | written to |
| --- | --- | --- |
| before | `git show 3bd142f:…/tooling-guard.test.mjs`, read from git on **every** run | `build/evidence-replay-repair/originals/docs/v2/evidence/P3.4/proposal-ir4/tooling-guard.test.mjs` |
| after | the working-tree file | unchanged in place |

The "before" file is written under its own repo-relative path deliberately: only
its *directory* may differ, because a differing file *name* would remove the very
differences under test. Reading it from git each run means the comparison cannot
be satisfied by editing both sides.

Two fixtures are built, breaking on different attempt numbers, so that runs whose
semantic output genuinely differs can be compared against each other. Nothing in
`build/ir4/` is modified; the failing copies are new files under the ignored
`build/evidence-replay-repair/tools/`, written by the script on each run.

## Run

```
$ ~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node \
    docs/v2/evidence/output-lint-replay-repair/forced-debug-control.mjs
```

Exit 0 only if every check passes. Raw stdout/stderr/status of all four runs are
written under `build/evidence-replay-repair/runs/` for inspection. Hashes printed
by the script:

| file | sha256 |
| --- | --- |
| `build/ir4/build-dispatch.mjs` (read-only source) | `b41edf2ccc7a39abb299d7c209955c9e30c37e6245f35e3035ee8895a513293a` |
| `3bd142f:…/tooling-guard.test.mjs` | `ec99468e0ed8a1ed622cc2c6a825f44f5215867e2ac0891907c963b065b8a851` |
| working tree `…/tooling-guard.test.mjs` | `ef402642e2c78dd7c69b23cc1f59cd34408433bc9a1aa9104b389cc3613d3e31` |

## The exact normalisations, and their limits

Four rules, three tolerated shapes. In order:

| # | rule | replaces with | shape | why it is permitted |
| --- | --- | --- | --- | --- |
| 1 | `/\(\d+(\.\d+)?ms\)/g` | `(TIME)` | reporter timings | wall-clock; cannot match by construction |
| 2 | `/^ℹ duration_ms .*$/gm` | `ℹ duration_ms TIME` | reporter summary line | same |
| 3 | `/tooling-guard\.test\.mjs:\d+/g` | `tooling-guard.test.mjs:N` | the file's own line numbers | the repaired file carries exactly one added line (`import { format }` at line 23), so every frame below it shifts by exactly `+1`. **Only the number** is replaced; the rest of the line is still compared |
| 4 | `/[^ \n]*tooling-guard\.test\.mjs/g` | `<TESTFILE>` | the file's own path | the before side runs from a scratch copy, so its directory necessarily differs |

**Rule 3 must precede rule 4.** Rule 4's `[^ \n]*` prefix is greedy and consumes
the `.mjs` literal; if it ran first, rule 3 would have nothing left to match and
the `+1` shift would reach the comparison. That is D1, and `C6`/`C11` below fail
if the order is put back.

Limits, stated plainly:

- Rules 1 and 2 match only node's test-reporter shapes. A `ms` figure printed by
  a proof itself would also be erased — no proof in these twelve does that, and
  `C8`/`N5` bound the risk rather than remove it.
- Rule 3 erases *any* line number attached to that one filename, not specifically
  the six frames that shift. A line number in the file's own source text printed
  as output would be erased with them; nothing in its output does that.
- Rule 4 erases the whole path prefix, so a path difference elsewhere in the
  output would be erased with it. Both sides run with cwd at the repository root
  and the only path that appears is the test file's own.
- Nothing else is touched: an argument, a counter, a verdict mark, a counterexample
  line or an exit status all fail the case. `C8` checks that mechanically — it
  deletes the permitted spans from each line and from its normalised form and
  compares the remainders, so a rule that rewrote anything else would fail the
  run rather than absorb it. `N5` shows that guard rejects a rule set that also
  rewrites digits (60 lines reported against 0).
- The rules are duplicated between this module and `replay-check.mjs`, because the
  checker's directory may not gain a file. `C0` therefore reads the checker and
  asserts its line rule still precedes its path rule, so the two cannot drift
  apart silently.

## Checks

Forced on `--attempt 4`, the invocation the DEBUG line exists for:

| id | assertion | observed |
| --- | --- | --- |
| C0 | the checker lists its line rule before its path rule | line rule at char 4538, path rule at 4626 |
| C1 | exit status equal on both sides, and non-zero | 1 / 1 |
| C2 | DEBUG lines: same count, byte-identical, and unchanged by normalisation | 1 each |
| C3 | raw stdout is **not** byte-identical, so C5 is doing real work | differs in all four shapes |
| C3b | raw stderr is byte-identical | 0 bytes both sides |
| C4 | pass/fail marks identical | 7 failing of 18, same order |
| C5 | **equal after this normalisation order** | stdout and stderr |
| C6 | **unequal after the previously committed order** | first difference line 28: `"test at <TESTFILE>:130:1"` vs `"…:131:1"` |
| C7 | every stack frame shifts by exactly `+1` | 6 frames, all deltas 1 |
| C8 | nothing normalised outside a permitted span | 0 out-of-span lines |

Forced on `--attempt 1` as well, to show the result is not specific to one broken
invocation: C9 status equal and non-zero, C10 equal under this order, C11 unequal
under the previous one.

`C6`/`C11` are the D1 proof in executable form: the same bytes, the same rules,
only the order differs.

## Negative controls

The green above is worthless if the normalisation would flatten anything, so:

| id | assertion | observed |
| --- | --- | --- |
| N1 | the same file under a *different* broken invocation stays unequal, under both orders | unequal / unequal |
| N2 | same, on the before side | unequal / unequal |
| N3 | before-side run vs after-side run across the two invocations | unequal / unequal |
| N4 | one character changed on a verdict (`✔` → `✖`) stays unequal under both orders | unequal / unequal |
| N5 | the span audit rejects an over-broad rule set | 0 out-of-span lines with the four rules, 60 with an extra rule rewriting digits |
| N6 | and the complement: a change confined to a reporter timing is still absorbed | equal, so rule 1 is live and confined |

N1–N4 are "different semantic output must stay unequal". N5–N6 bound the audit
itself, so it is neither vacuous nor over-eager.

## Scope

- Read-only: git, `build/ir4/` (the real tool, copied and never modified), the
  committed proof, the committed checker, `docs/v2/{templates,CARDS…}` as the
  proof itself reads them.
- Written: only this directory, and scratch under the ignored
  `build/evidence-replay-repair/`.
- Not run: any app, server, database, model, audio input, display, network,
  install or update check; port 7717 was never contacted; no live data folder was
  opened. No proof, source, model, card, config, checkpoint or threshold was
  edited, and no threshold was relaxed to make anything pass.
- Left unstaged and uncommitted, for an independent review.