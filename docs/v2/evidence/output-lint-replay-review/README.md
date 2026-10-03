# Evidence — independent review of the output-lint replay repair

**Date 2026-10-02.** Review of `b457db4` ("Correct evidence replay
normalization order and identity labels") against its base `18179fa`, written
for `docs/v2/state/reviews/evidence-output-lint-replay-ir.md`.

The candidate repairs the two defects (D1, D2) recorded in
`docs/v2/state/reviews/evidence-output-lint-ir.md` against `39c6723`/`83b32e0`:
the inert line-number rule in `replay-check.mjs` (D1) and the overstated
per-case success label (D2). It touches exactly five files:

| file | change |
| --- | --- |
| `docs/v2/evidence/P3.4/output-lint-repair/replay-check.mjs` | rule order swapped; truthful labels; added span audit |
| `docs/v2/evidence/P3.4/output-lint-repair/README.md` | §8 addendum (§1–§7 unchanged) |
| `docs/v2/evidence/output-lint-replay-repair/forced-debug-control.mjs` | new control |
| `docs/v2/evidence/output-lint-replay-repair/normalisation.mjs` | new shared rules module |
| `docs/v2/evidence/output-lint-replay-repair/README.md` | new control doc |

## Logs

All runs under the pinned interpreter
`/home/villenull/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node`
(`v24.19.0`), `APUNTA_NODE` set to it, from the repository root.

| log | command | exit |
| --- | --- | --- |
| `logs/01-forced-debug-control.txt` | `… forced-debug-control.mjs` | **0** |
| `logs/02-main-replay-12.txt` | `… P3.4/output-lint-repair/replay-check.mjs` | **0** |
| `logs/03-completion-replay.txt` | `… output-lint-completion/replay.mjs` | **0** |
| `logs/04-completion-negative-control.txt` | `… output-lint-completion/negative-control.mjs` | **0** |
| `logs/05-global-eslint.txt` | `./node_modules/.bin/eslint .` | **0** |
| `logs/06-span-audit-scratch.txt` | ignored scratch characterization of the span audit | **0** |
| `logs/07-historical-readme-unchanged.txt` | §1–§7 byte-comparison of the P3.4 README | 0 |
| `logs/08-c0-positions.txt` | character offsets of both rule literals in the committed checker | **0** |

## What each log shows

- **01** — the forced-DEBUG control: C0–C11 and N1–N6 all pass. The three
  hashes it prints match its README table exactly. C6/C11 are the D1 proof in
  executable form: under the previously committed order the pair stays
  unequal (`130` vs `131`, `154` vs `155` — the `+1` import shift), under the
  repaired order it is equal.
- **02** — the 12-case replay: 12/12, and the D2 repair is visible in the
  labels — eleven cases `byte-identical (zero normalisation)`,
  `ir4-tooling-guard` `equal after permitted normalisation: reporter timings +
  reporter duration line`. A scratch scan of the twelve `after` outputs
  confirmed `ir4-tooling-guard` is the only one whose output contains a
  permitted shape, so every label is exactly truthful, not merely defensible.
- **03** — the completion replay: four baselines, zero normalisation, exit 0.
- **04** — the completion negative control: the verifier rejects a live
  binding and an impure initialiser, so its green is not vacuous.
- **05** — global eslint, exit 0.
- **06** — the span audit fails closed: 0 out-of-span lines with the four
  committed rules, 60 with an added digit-rewriting rule (the first leak is
  the DEBUG line itself, full of digits). Independently reproduces the
  control's N5.
- **07** — the P3.4 README's §1–§7 are byte-identical between `18179fa` and
  `b457db4` except that §7's final line gained a trailing newline; the §8
  addendum is purely additive.
- **08** — the committed checker's line-rule literal sits at char 4526 and the
  path-rule literal at 4614, matching what C0 printed. The control README's
  observed column (4538/4626) is stale by 12 characters; the check itself
  passes on the committed order.

## Scope

Read-only: git, the committed proof and checker, the ignored tool copy
`build/ir4/` (copied, never modified), the ignored model copies, and the
stdout/stderr of the scripts' own runs. Written: this directory, and scratch
under the ignored `build/evidence-replay-ir/` and the scripts' own ignored
`build/evidence-replay-repair/`, `build/evidence-output-lint/` trees. No app,
server, database, model runtime, audio input, display, network or install was
invoked; port 7717 was never contacted; no proof, source, model, card,
config, checkpoint or threshold was edited; nothing was staged or committed.
