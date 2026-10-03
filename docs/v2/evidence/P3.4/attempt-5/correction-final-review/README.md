# correction-final-review — independent final review of the P3.4 pre-runtime correction

Nothing here is an acceptance row and nothing here is authority. No app, build,
server, database, model runtime, audio, microphone, input, display, pactl,
download, install or network was used; port 7717 was never contacted and the live
data folder was never opened. Everything ran on pinned Node v24.19.0. The only
child processes were the reviewer probe's own local `node -e` sleepers. No source
file was edited; the patch was applied only to gitignored scratch copies; nothing
was staged or committed by this review.

Full verdict and reasoning: `docs/v2/state/reviews/P3.4-correction-final.md`.

## Files

| File | What it shows |
| --- | --- |
| `00-scope-and-authority.txt` | role, HEAD (8d4fa54 -> 768cc15 mid-review), write list, constraints |
| `01-source-and-patch.txt` | source still `fac8225f…`; patch applies to a fresh b19e59f copy; 4 hunks; `865ccab3…` |
| `02-scope-functions-constants.txt` | 3 functions changed, 76 identical, O1 byte-identical, 28 constants unchanged, own-pid kill |
| `03-format-lint-nonvacuous.txt` | prettier/eslint at the real path with a mis-format control; the wrap is load-bearing |
| `04-port-adapter-model.txt` | 80/80 port+adapter and 73/73 model against my patched copy; what they do/don't prove |
| `05-synthetic-proof.txt` | O3 + O2 before/after, foreign-child survival, static §E 13 -> 0 |
| `06-probe-cleanup-fidelity.txt` | durable probe cleanup is output-only; eslint 11 -> 0; the false util.format argument |
| `07-citations-and-counts.txt` | bounded findings F1–F6 with exact remedies |

## Reproduce (scratch, gitignored)

```bash
export PATH=~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH
cd /home/villenull/Projects/Apunta
mkdir -p build/p34-correction-final-ir && cd build/p34-correction-final-ir

# 1. source untouched; patch applies to a fresh b19e59f copy
cd /home/villenull/Projects/Apunta
git show b19e59f:scripts/v2/tauri-security.test.mjs > build/p34-correction-final-ir/shipped.mjs
cp build/p34-correction-final-ir/shipped.mjs build/p34-correction-final-ir/patched.mjs
patch -p1 build/p34-correction-final-ir/patched.mjs \
  < docs/v2/evidence/P3.4/attempt-5/correction-proposal/02-patch.diff   # exit 0, 865ccab3…

# 2. format/lint at the REAL path (build/ is skipped by prettier => vacuous)
npx prettier --check --stdin-filepath scripts/v2/tauri-security.test.mjs \
  < build/p34-correction-final-ir/patched.mjs                            # exit 0
npx eslint --stdin --stdin-filename scripts/v2/tauri-security.test.mjs \
  < build/p34-correction-final-ir/patched.mjs                            # exit 0

# 3. 80 port/adapter + 73 model (import repointed to ./patched.mjs)
cp docs/v2/evidence/P3.4/attempt-5/implementation/ported-model.test.mjs .
cp docs/v2/evidence/P3.4/attempt-5/implementation/adapters.test.mjs .
#   repoint the one import line to './patched.mjs', then:
node --test ported-model.test.mjs adapters.test.mjs                      # 80/80, exit 0
node --test ../p3.4-spec-v5-repair2/model.test.mjs                       # 73/73, exit 0

# 4. synthetic proof: the reviewer's probe next to the reviewer's proof modules
mkdir -p replay && cd replay
cp ../../p34-correction-ir/shipped-proof.mjs ../../p34-correction-ir/patched-proof.mjs .
cp ../../p34-correction-final-prep/probe-before.mjs ../../p34-correction-final-prep/probe-after.mjs .
node probe-before.mjs   # exit 0, ALL PASS
node probe-after.mjs    # exit 0, ALL PASS (diff = observed ms only)
```
