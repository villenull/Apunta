# Independent review evidence — output-lint cleanup (`39c6723` + `83b32e0`)

Supporting logs for `docs/v2/state/reviews/evidence-output-lint-ir.md`. All
commands used the pinned interpreter
`/home/villenull/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node`
(`v24.19.0`). No app, server, build, DB, model runtime, audio, input, `pactl`,
network or install was run; port 7717 was never contacted.

## Result

All substantive criteria PASS. Two bounded tooling/reporting defects (D1, D2)
are recorded in the review; neither affects the byte-exact replay, the deleted-
binding proof, the `exit 2` preservation or global lint.

## Logs

| File | What it shows |
| --- | --- |
| `logs/01-global-eslint.txt` | `eslint .` exit 0 |
| `logs/02-p34-replay-check.txt` | 12/12 P3.4 cases byte-exact vs `3bd142f`, exit 0 |
| `logs/03-completion-replay.txt` | 4 comparisons vs `39c6723`, zero normalisation, exit 0 |
| `logs/04-negative-control.txt` | replay + verifier negative controls, exit 0 |
| `logs/05-dead-binding-verify.txt` | `absent` on working tree and `check` on `e88a13a` blobs, exit 0 |
| `logs/06-transform-reproduction.txt` | committed transform applied to pre-edit blobs; 12/14 byte-exact, other 2 only the dead-const lines |
| `logs/07-forced-debug-control.txt` | forced-DEBUG line bytes identical; stack shift exactly +1; NORMALISED order bug |
| `logs/08-hashes.txt` | report hash tables independently recomputed; all match |
| `logs/09-source-outputs-two-baselines.txt` | `exit 0` under `46419f5`, `exit 2` under today's harness, both sides |
| `logs/10-deleted-constants.txt` | both names have one occurrence (their declarator) at `e88a13a`, none now |

## Defects

- **D1:** `docs/v2/evidence/P3.4/output-lint-repair/replay-check.mjs` NORMALISED
  orders the `<TESTFILE>` pattern before the `:<line>` pattern, so the
  line-number pattern is inert; the code comment and
  `output-lint-completion/README.md` §3.1 claim a `+1` stack-line normalisation
  the committed tool does not perform. Main replay unaffected (timing-only is
  all it needs). Fix: swap the last two entries.
- **D2:** the per-case success line prints `byte-identical` even when
  normalisation was applied (`ir4-tooling-guard`).
