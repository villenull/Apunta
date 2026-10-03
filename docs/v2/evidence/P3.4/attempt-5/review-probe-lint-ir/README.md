# review-probe-lint-ir — independent review of the attempt-5 review-probe lint cleanup

EVIDENCE ONLY. This bundle is not an acceptance row, not a waiver, and not a
source correction. It asserts nothing about P3.4's runtime verdict: the final
P3.4 V4 row stays FAIL, once, and was not rerun here.

Candidate under review:
`docs/v2/evidence/P3.4/attempt-5/review/03-independent-integration-probe.mjs`
BEFORE git blob `7a7ff09` (sha256 `e41e73aa…`) → AFTER worktree
(sha256 `a2a734ca…`). Reviewed against the pass's own report in
`docs/v2/evidence/P3.4/attempt-5/review-probe-lint-repair/`.

VERDICT: **CLEAR** — the edit is faithful and non-weakening; two cosmetic
findings (F2, F3) remain open and neither blocks anything.

| File | What it establishes |
| --- | --- |
| `00-scope-and-authority.txt` | role, exclusive NEW writes, constraints honored |
| `01-hash-baseline.txt` | BEFORE `e41e73aa…`, AFTER `a2a734ca…`, harness `865ccab3…`, all reproduced from git |
| `02-diff-fidelity.txt` | the edit is exactly the six declared items; `ok()` sites, budgets, counter, exit expression all byte-identical; no rule suppression |
| `03-dead-code-zero-ref.txt` | `frameFrom` 1 occurrence, `factLine` 1 occurrence, both at their own import/definition; harness still exports `frameFrom` at 2450; removed code was pure |
| `04-byte-exact-replay.txt` | stdout `bbc286f9…` identical across 4 runs (2 before, 2 after), stderr empty, exit 0, 19 PASS + ALL PASS, 1348 bytes; write()+exit() truncation bounded to 1 MB |
| `05-equivalence-and-no-weakening.txt` | `console.log(x)` ≡ `format('%s',x)+'\n'` proven over 10 adversarial strings; full no-weakening audit |
| `06-lint-status.txt` | scoped eslint 4→0 matching the V4 cause; repo-wide `eslint .` green after relocation; prettier's silence on the durable path explained |
| `07-defects-preservation-concurrency.txt` | F1 (resolved scratch-location defect), F2/F3 open cosmetics, preservation, V4 FAIL retained, concurrency, attribution caveat |

Scratch (ignored, NOT under the repo's tracked tree):
`build/p34-review-probe-lint-ir/` — the four stdout and four stderr captures,
relocated byte-identically out of `scratchbuild/` at the event boundary.
`git check-ignore -q build/p34-review-probe-lint-ir/out.before.1.txt` → exit 0
(`.gitignore:55 build/`). `scratchbuild/` no longer exists. The author's
preserved scratch is `build/p34-review-probe-lint-preserved/` (root's
relocation, 11 files, hashes re-verified in 07).

No app, server, database, model, audio, microphone, input, display, pactl,
network, install or port 7717 was used; no build, no `npm test`, no V row, no
global typecheck, no runtime lease. Nothing staged, committed or pushed. The
candidate was never executed at its durable path in place — only on ignored
copies with the import path repointed. Every execution used pinned Node
v24.19.0.

Reproduce the replay:

```bash
export PATH=/home/villenull/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH
cd /home/villenull/Projects/Apunta
mkdir -p build/p34-review-probe-lint-ir/replay
git cat-file blob 7a7ff09 > build/p34-review-probe-lint-ir/replay/before.mjs
cp docs/v2/evidence/P3.4/attempt-5/review/03-independent-integration-probe.mjs \
   build/p34-review-probe-lint-ir/replay/after.mjs
sed -i "s|'../../../../../../scripts/v2/tauri-security.test.mjs'|'../../../scripts/v2/tauri-security.test.mjs'|" \
   build/p34-review-probe-lint-ir/replay/*.mjs
node build/p34-review-probe-lint-ir/replay/before.mjs | sha256sum   # bbc286f9…
node build/p34-review-probe-lint-ir/replay/after.mjs  | sha256sum   # bbc286f9…
```