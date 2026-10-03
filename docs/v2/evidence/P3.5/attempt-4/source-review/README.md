# P3.5 attempt-4 source review — evidence index

Independent SOURCE review of the owner-authorized AM-194 client-sentinel patch.
Reviewer: `adc88147-0a51-450b-b152-abcdee1b3434` (LongCat 2.5 free, high).
Stable source commit under review: **5857079**, shipping
`scripts/v2/tauri-audio.test.mjs` sha256
`85fbb13d5af891d3778eab1c1a167b2bdcb3493b27bf4f156e4832a748924c14`; baseline
`caa6e18` sha256
`b886f8bbc7006765a50911874f3188a79e4235a26863c419b41a24adb8931cdb`.

No app, server, build, database, model, audio, microphone, input, display, live
`pactl`, network, install or port 7717 was used. Scratch is the git-ignored
`build/p35-source-review4/` (`git check-ignore -v` → `.gitignore:55:build/`).

| file | what it shows |
| --- | --- |
| `01-source-and-patch.txt` | baseline + `candidate.patch` (4350f5ec…) == shipping byte-identical; one contiguous hunk, 7+/2- inside `classifySourceOutputs`; only non-doc file changed is the harness |
| `02-checkpoint.txt` | `priorAttempt3Criteria === caa6e18.criteria`; sideEffectsDone/sandboxRuns/priorAttempt1Criteria/plannedSideEffects unchanged; attempt 3→4, no reset; current V0–V5 NOT RUN |
| `03-proof-75.txt` | committed 75-case proof re-run with BEFORE repointed to the ignored baseline (b886f8bb); 75 passed / 0 failed, byte-identical to the committed output; shipping slice == candidate-after witness |
| `04-adversarial-35.txt` | reviewer's own 35 adversarial mechanism checks, 35 passed / 0 failed, exit 0 |
| `05-lint-format.txt` | `node --check`, `prettier --check`, `eslint` all exit 0 on the shipping source and on `independent-adversarial.mjs` |
| `06-owner-grant.txt` | AM-194 text and proposal §6 Option A: exactly three new capture anchors, V5 read-only adds none, no fifth/reset/retry/schema/threshold/Expected relaxation |
| `independent-adversarial.mjs` | the reviewer's runnable checker (lint/prettier clean) |

Verdict and reasoning: `docs/v2/state/reviews/P3.5-impl4.md`.
