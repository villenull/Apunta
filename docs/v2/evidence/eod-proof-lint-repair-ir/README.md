# Evidence — independent review of `71cb8245` proof lint repair

Companion to `docs/v2/state/reviews/eod-proof-lint-repair-ir.md`.
All artifacts below were produced by the reviewer on 2026-10-03 with the pinned
interpreter `~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node`.
`SHA256SUMS.txt` covers every file except itself.

## Artifacts

| file | what it is |
|---|---|
| `replay-adapted.mjs` | the packet's `replay.mjs`, copied verbatim except the scratch constant `build/eod-proof-lint` → `build/eod-proof-lint-ir` (lines 51 and 158 only). Lets the review run without writing into the author's scratch. |
| `replay.stdout` | stdout of that replay; matches the README §5 transcript, ends `PASS: 0 problem(s).` |
| `replay.stderr` | 0 bytes |
| `repro13-eslint.out` | `npx eslint --no-ignore` over the three pre-repair blobs extracted from git: 13 errors, 0 warnings, exit 1 — the frozen `07-V4.txt` FAIL reproduced |
| `eslint-dot.out` | `npx eslint .` over the whole repository, stock config: 0 bytes, exit 0 (hygiene check; not the P3.4 V4 row) |
| `final-before.stdout`, `final-after.stdout` | captured verifier stdout, both `c4dce3b0…` (1458 bytes, identical) |
| `silence-before.stdout`, `silence-after.stdout` | captured verifier stdout, both `4f1b5811…` (6266 bytes, identical) |
| `silence-control.stdout` | negative control (`'PASS'`→`'PASSX'`), `ab253cd5…`, differs |

## Commands

```
NODE=~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node

# 1. replay (independent scratch path only)
$NODE docs/v2/evidence/eod-proof-lint-repair-ir/replay-adapted.mjs \
  > build/eod-proof-lint-ir/replay.stdout 2> build/eod-proof-lint-ir/replay.stderr

# 2. historical 13-error FAIL
npx eslint --no-ignore build/eod-proof-lint-ir/repro13/ > build/eod-proof-lint-ir/repro13.out

# 3. whole-repo hygiene
npx eslint . > build/eod-proof-lint-ir/eslint-dot.out

# 4. repaired verifiers (0 problems) and raw witness (1 warning, unlintable)
npx eslint --no-ignore \
  docs/v2/evidence/P3.5/attempt-4/final-completion-ir/verify.mjs \
  docs/v2/evidence/P3.5/silence-completion-ir/verify.mjs
npx eslint --no-ignore \
  docs/v2/evidence/P3.5/silence-completion-ir/v5-program-own-extraction.mjs.txt
```

No `npm test`, `npm run typecheck`, `npm run lint`, build, native app, model,
audio, pactl, network, 7717 or V4 row was run.
