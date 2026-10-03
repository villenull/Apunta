# P3.5 client-column sentinel proposal — IR evidence

Independent review evidence for `docs/v2/state/reviews/P3.5-client-sentinel-proposal-ir.md`.
All commands run read-only against the repository; no app, server, build,
database, model, audio, microphone, input, display, live `pactl`, network,
install or port 7717. Scratch lived in git-ignored `build/p35-client-proposal-ir/`
(`.gitignore:55:build/`). The author's files and the shipping source were not
modified.

| file | what it shows |
| --- | --- |
| `scope-and-source-unchanged.txt` | HEAD, `git status`, shipping-source sha256, hashes of the author's family as reviewed, scratch ignore proof, empty `git diff` |
| `patch-replay-and-lint.txt` | concrete actual-source patch, `patch -p1` replay, replay hash, `node --check`, `prettier --check`, scoped `eslint --stdin` (all real filepath), source unchanged after |
| `actual-source.patch` | the reviewer's concrete one-hunk patch against `scripts/v2/tauri-audio.test.mjs` (remedy for IR-1) |
| `sentinel-proof-run.txt` | the author's `sentinel-proof.mjs` re-run: 75 passed / 0 failed, byte-identical to the committed output |
| `adversarial-checks.mjs` | independent adversarial checker (own extractor, own cases) |
| `adversarial-output.txt` | 19/19 checks pass: sentinel only in the client column, real-mic leak still detected, unknown source still fails, numeric baseline preserved, one-region scope |
| `eslint-author-family.txt` | `eslint` on the two author `.mjs` files: 13 errors, exit 1 (finding IR-2) |
| `primary-format-recheck.txt` | read-only binary re-check of the source-outputs `-` sentinel and JSON member names; appendix notes the sources-offset transposition (finding IR-4) |

Verdict: **DEFECT** at package level (IR-1/IR-2/IR-3); the source patch logic is
independently verified sound. See the review for bounded remedies and the
preserved unknowns.
