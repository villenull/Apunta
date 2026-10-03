# Commands run (exact) and exits — P3.5 attempt 2, review-2

Verbatim transcript: `transcript.txt`. Pinned Node throughout:
`~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node` (`v24.19.0`).

| Command (cwd = repo root) | Exit | Purpose |
| --- | --- | --- |
| `node --version` (pinned) | 0 | toolchain identity |
| `node --check scripts/v2/tauri-audio.test.mjs` | 0 | syntax of the candidate's only feature path |
| `node docs/v2/evidence/P3.5/attempt-2/repair-verify.mjs` | 0 | **root re-run of the candidate's own suite: 30/30** |
| `node build/p3.5-review2/d1-numeric-mapping.mjs` | 0 | 30/30 D1 probes |
| `node build/p3.5-review2/d2-current-rectangles.mjs` | 0 | 22/22 D2 probes |
| `npx eslint scripts/v2/tauri-audio.test.mjs docs/v2/evidence/P3.5/attempt-2/repair-verify.mjs` | 0 | source-scope lint clean |
| `npx eslint docs/v2/evidence/P3.5/review-2/*.mjs` | 0 | this review's durable proofs are lint-clean |
| `npx eslint --no-ignore build/p3.5-review2/*.mjs` | 0 | same, before the durable copies were made |
| `npx eslint .` | 1 | 60 errors, none in a file the candidate changed (attribution in `scope-provenance.md`) |
| `npx eslint . -f json` | 1 | per-file/rule breakdown for that attribution |
| `pactl --version` | 0 | `pactl 17.0-98-gb096` — ground truth for the short formats |
| `pactl list short sources` (read-only, column shape only) | 0 | four rows, 7 columns, index first: the table `parseSourceTable` reads |
| `pactl list short source-outputs` (read-only) | 0 | empty on this host; shape taken from the `pactl` format string review-1 established |
| `git show --stat 9e6094b`, `git diff --name-only 46419f5..9e6094b -- …` | 0 | scope |
| structured JSON diff of `docs/v2/state/cards/P3.5.json` at `46419f5`, `9e6094b`, `HEAD` | 0 | checkpoint preservation |

Not run, by grant: `npm run typecheck`, `npm test`, `npm run e2e`, `npm run
eval`, any harness row (V0–V5), `cargo`, `npm run tauri:build:test`, any `pactl`
mutation, anything touching the app, server, database, model, audio,
microphone, display, input, network, installation or port 7717.