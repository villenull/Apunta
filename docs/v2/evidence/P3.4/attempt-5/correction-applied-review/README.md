# correction-applied-review — independent review of the AM-192 applied correction

Nothing here is an acceptance row and nothing here is authority. No app, build,
server, database, model, audio, microphone, input, display, pactl, download,
install or network was used; port 7717 was never contacted and the live data
folder was never opened. Everything ran on pinned Node v24.19.0. The only child
processes were the synthetic O2 probe's own local `node -e` sleepers. No source
file was edited; the patch was applied only to gitignored scratch copies; nothing
was staged, committed or pushed by this review.

Full verdict and reasoning: `docs/v2/state/reviews/P3.4-correction-applied.md`.

This pass answers the question AM-192 leaves open: **does the shipping source
equal the exact granted patch, with no wider edit, and does it still hold the
contract and fixtures?** It re-derives the answer from the git blobs and its own
runs; it does not redo the documentation review (the four documentation remedies
were handled by the root's addendum to the final review).

## Files

| File | What it shows |
| --- | --- |
| `00-scope-and-authority.txt` | role, AM-192 grant, HEAD 291372f, write list, constraints |
| `01-source-and-patch.txt` | shipping `865ccab3…`; baseline `fac8225f…`; replay `865ccab3…`; applied diff == patch body; 4 hunks, +44/-20 |
| `02-scope-functions-constants.txt` | 3 functions changed, 76 identical, O1 + killActiveCommands byte-identical, 28 constants unchanged |
| `03-format-lint-syntax.txt` | real-path prettier/eslint/node --check exit 0; mis-format control proves non-vacuous |
| `04-port-adapter-80.txt` | 80/80 against the shipping imports, run in place |
| `05-synthetic-proof.txt` | O3 + O2 before/after, foreign-child survival, §E static 13 -> 0, ALL PASS |
| `06-git-scope-no-wider-edit.txt` | correction commit scope; web/ and e2e/ unchanged; worktree clean |

## Reproduce (scratch, gitignored)

```bash
export PATH=~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH
cd /home/villenull/Projects/Apunta
mkdir -p build/p34-correction-applied-ir && cd build/p34-correction-applied-ir

git -C /home/villenull/Projects/Apunta show b19e59f:scripts/v2/tauri-security.test.mjs > baseline.mjs
cp baseline.mjs replay.mjs
cp /home/villenull/Projects/Apunta/scripts/v2/tauri-security.test.mjs shipping.mjs
patch -p1 replay.mjs < /home/villenull/Projects/Apunta/docs/v2/evidence/P3.4/attempt-5/correction-proposal/02-patch.diff
sha256sum replay.mjs                              # 865ccab3…
diff replay.mjs shipping.mjs                      # empty

cd /home/villenull/Projects/Apunta
npx prettier --check scripts/v2/tauri-security.test.mjs
npx eslint scripts/v2/tauri-security.test.mjs
node --test docs/v2/evidence/P3.4/attempt-5/implementation/ported-model.test.mjs \
            docs/v2/evidence/P3.4/attempt-5/implementation/adapters.test.mjs   # 80/80

# synthetic proof: build the two additive-export copies, then run the probe
cd build/p34-correction-applied-ir
cp baseline.mjs baseline-proof.mjs && cp shipping.mjs shipping-proof.mjs
printf '\nexport { runFlowGuarded, waitForLabel };\n' >> baseline-proof.mjs
printf '\nexport { runFlowGuarded, waitForLabel };\n' >> shipping-proof.mjs
cp /home/villenull/Projects/Apunta/build/p34-final-correction/probe.mjs probe.mjs
#   re-point its two imports and two file constants to baseline-proof/shipping-proof/baseline/shipping
node probe.mjs                                    # ALL PASS, exit 0
```
