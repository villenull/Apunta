# P3.4 attempt 5 — pre-runtime correction proposal (evidence)

**Nothing here is an acceptance row.** No app, build, server, database, model
runtime, audio, input, display, download, install or network was used; port
**7717** was never contacted and the live data folder was never opened. Every
execution is `node --check`, `node --test` over synthetic fixtures, `npx
eslint`/`prettier`, or a synthetic-IO probe on **pinned Node v24.19.0**
(`~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node`). The only child
processes ever spawned are two local `node -e` sleepers in the O2 scenario.

**No source file was edited.** `scripts/v2/tauri-security.test.mjs` is
byte-identical to the card's implementation candidate `b19e59f`
(`fac8225f…`). All work happened on copies inside the ignored
`build/p34-final-correction/` (`.gitignore:55`). Nothing staged, nothing
committed.

## What this packet is

`docs/v2/state/P3.4-PRE-RUNTIME-CORRECTION.md` asks the owner for **one**
explicit pre-runtime code-repair allowance *within* attempt 5, to fix two
defects the independent code review recorded as non-blocking:

- **O3** — label discovery's 30 s wait sits **outside** the immutable target
  deadline, so the (d) half can spend 30 s + 30 s per target, which contradicts
  approved proposal §E ("one deadline … covers calibration, **selection**, every
  command, **every await** … there are no phase timers and no second budget").
- **O2** — `runFlowGuarded` kills by matching `result.reason ===
  DEADLINE_EXPIRED`, but `runFlow` **prefixes** that reason on the click path,
  so the intended deadline kill never fires.

If the owner declines, the card is `BLOCKED`. Nothing here assumes otherwise.

## Files

| File | What it shows |
| --- | --- |
| `00-baseline.txt` | commits, candidate stability, hashes, nothing staged |
| `01-source-extraction.txt` | §E's text and the shipped lines, printed from the real file |
| `02-patch.diff` | **the exact before/after patch**, 4 hunks, `+43/−20`, one file |
| `03-patch-replay.txt` | the diff applies to the shipped file byte-identically; lint/format clean |
| `04-probe-output.txt` | non-vacuous proof: the same checks FAIL on the shipped copy, PASS on the corrected copy |
| `05-port-adapter-cases.txt` | the repo's own 80 port/adapter cases still pass against the corrected copy |
| `06-scope-and-lint.txt` | only three seam functions change; 76 of 79 byte-identical; O1 retained |
| `07-review-response.txt` | the independent review's required change (a vacuous prettier claim), the fix, and the re-verification |
| `review/**` | the independent reviewer's own raw output and its own probe |

## Reproduce (all inside the ignored scratch dir)

```bash
export PATH=~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH
mkdir -p build/p34-final-correction && cd /home/villenull/Projects/Apunta
cp scripts/v2/tauri-security.test.mjs build/p34-final-correction/harness-original.mjs
cp build/p34-final-correction/harness-original.mjs build/p34-final-correction/replay.mjs
patch -p1 build/p34-final-correction/replay.mjs \
  < docs/v2/evidence/P3.4/attempt-5/correction-proposal/02-patch.diff   # exit 0
sha256sum build/p34-final-correction/replay.mjs                          # 865ccab3…
npx eslint --no-ignore build/p34-final-correction/replay.mjs            # exit 0
npx prettier --check --stdin-filepath scripts/v2/tauri-security.test.mjs \
  < build/p34-final-correction/replay.mjs                                # exit 0
node --test build/p34-final-correction/ported-model.scratch.test.mjs \
           build/p34-final-correction/adapters.scratch.test.mjs           # 80/80, exit 0
node build/p34-final-correction/probe.mjs                                # ALL PASS, exit 0
```

`04-probe-output.txt` records the exits as they were observed.

**A trap worth naming:** `npx prettier --check` and `npx eslint` **silently skip
anything under the gitignored `build/`**, so a clean-looking result there proves
nothing. Prettier must be run at a real path (`--stdin-filepath`, which applies
the repo config without writing a file) and eslint with `--no-ignore`. A control
file that is deliberately mis-formatted is used in `03` to prove the check is
real. The independent review caught exactly this error in an earlier draft.