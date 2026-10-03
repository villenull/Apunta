# owner-packages application IR — commands, exits, write paths

Reviewer session, 2026-10-03. Working dir `/home/villenull/Projects/Apunta`,
`main` at `507c026` (clean tree at start; `git status --porcelain` empty).
Pinned Node `$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node`
(`v24.19.0`); the box default is `v26.8.2`.

No app, server, database, model, audio, microphone, `pactl`, install, network,
port 7717, sandbox, or build was run. No card, config, tool, source, checkpoint
or `AMENDMENTS.md` was edited. Nothing staged or committed. Scratch is
git-ignored `build/owner-package-ir/`.

| # | Command | Exit | Output |
| --- | --- | --- | --- |
| 1 | `node docs/v2/evidence/P3.4/attempt-5/tooling/guard-matrix.mjs` | 0 | `113/113 rows as expected; 0 mismatches` — `guard-matrix.txt` |
| 2 | `node --test docs/v2/tools/build-dispatch.test.mjs` | 0 | 26 tests, 26 pass (12 prior + 14 new) — `build-dispatch-tests.txt` |
| 3 | `node --test docs/v2/tools/plan-lib.test.mjs` | 0 | 9 pass — `plan-lib-tests.txt` |
| 4 | `node --test docs/v2/tools/check-plan.test.mjs` | 0 | 4 pass — `check-plan-tests.txt` |
| 5 | `APUNTA_TOOL_DIR=$PWD/docs/v2/tools node --test docs/v2/evidence/P3.4/proposal-ir4/tooling-guard.test.mjs` | 0 | 14 pass (reviewed probe, unmodified) — `ir4-probe.txt` |
| 6 | `node docs/v2/tools/check-plan.mjs --no-write` | 0 | `71 cards, 12 parent reviews, 14 contracts, R01-R20 covered, no cycles` — `check-plan.txt` |
| 7 | `node docs/v2/evidence/P3.5/environment-application/apply-checks.mjs` (at committed HEAD) | 1 | **40 PASS / 1 FAIL** (`the only changed file … is the shipping config — none`) — `apply-checks-at-head.txt` |
| 8 | same script in a scratch `c8abfc5` checkout with the one-key edit applied but uncommitted | 0 | **41 PASS, `ALL CHECKS PASS`** — `apply-checks-precommit-sim.txt` |
| 9 | `node docs/v2/evidence/P3.5/environment-proposal/config-parse-check.mjs` | 0 | 4 VALID + 2 INVALID controls — `config-parse-check.txt` |
| 10 | `node docs/v2/tools/build-dispatch.mjs P3.4 --base 6974943 --port 7841 --attempt 5 --attempt-exception AM-189 --print` | 0 | attempt-5 line `… AM-189 … there is no attempt 6`; `git status` clean after (nothing written) — `print-attempt5.txt` |
| 11 | `bash -n` on every verification row command (287 rows; scratch extractor) | 0 for P3.4 V0–V4 and P3.5 V0–V5 | `bash-n.txt` |
| 12 | `./node_modules/.bin/eslint` + `prettier --check` on the four changed/added scripts and `tauri.conf.json` | 0 | `scoped-lint.txt` |
| 13 | `git show`/`sha256sum` on baseline and applied configs; `git log`/`diff` on the range | 0 | `scope-and-hashes.txt` |
| 14 | `node docs/v2/tools/check-plan.mjs` (no `--no-write`, accidental) | 0 | rewrote `docs/v2/DEPENDENCIES.md`; diff saved to `DEPENDENCIES-regenerated.diff`, file restored with `git checkout --` |

## Write paths

- `docs/v2/state/reviews/owner-packages-application-ir.md` (this review)
- `docs/v2/evidence/owner-packages-application-review/**` (this directory)
- git-ignored `build/owner-package-ir/` (scratch: command outputs and the
  `c8abfc5` reproduction checkout)
