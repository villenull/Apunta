# AM-190 — commands run and exits

Working directory for every command: `/home/villenull/Projects/Apunta`, branch
`main` at `375d3c1`. Node is the pinned
`$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node` (v24.19.0).
The full captured transcript, including the complete check output, is in
`build/p3.5-env-apply/commands-run.txt` (git-ignored scratch); the committed
copies of the two long outputs are `output.txt` and
`config-parse-check-output.txt`.

| # | Command | Exit | Purpose |
| --- | --- | --- | --- |
| 1 | `git cat-file -s $(git rev-parse HEAD:src-tauri/tauri.conf.json)` | 0 | baseline size, 737 bytes |
| 2 | `git show HEAD:src-tauri/tauri.conf.json \| sha256sum` | 0 | baseline hash `3ff6aa5a…cd563` |
| 3 | `sha256sum src-tauri/tauri.conf.json src-tauri/tauri.test.conf.json` | 0 | applied hashes `e91c7e57…de923`, `3e109252…a1760` |
| 4 | `git diff -- src-tauri/tauri.conf.json` | 0 | one hunk, five added lines; saved as `config.diff` |
| 5 | `node docs/v2/evidence/P3.5/environment-application/apply-checks.mjs` | **0** | 41 checks, `ALL CHECKS PASS`; output in `output.txt` |
| 6 | `node docs/v2/evidence/P3.5/environment-proposal/config-parse-check.mjs` | **0** | the proposal's own installed-schema check, run unmodified; output in `config-parse-check-output.txt` |
| 7 | `./node_modules/.bin/prettier --check src-tauri/tauri.conf.json docs/v2/evidence/P3.5/environment-application/apply-checks.mjs` | 0 | formatting of the config and of the new evidence script |
| 8 | `./node_modules/.bin/eslint docs/v2/evidence/P3.5/environment-application/apply-checks.mjs` | 0 | lint of the new evidence script |
| 9 | `git status --short` | 0 | scope: only `src-tauri/tauri.conf.json` of mine; the other writer's paths untouched |
| 10 | `git diff --cached --name-only` | 0 | empty — nothing staged, nothing committed |
| 11 | `git check-ignore -v build/p3.5-env-apply` | 0 | scratch is ignored via `.gitignore:55` (`build/`) |

## Deliberately not run

`pacman`, `pkexec`, any install or download; `tauri build`, `tauri bundle`,
`cargo`, `npm run tauri:build`, `npm run tauri:build:test`, `npm run dev`,
`npm run seed`; the proposal's §7 step 0 preflight and its `gst-inspect-1.0`,
`patchelf` and scanner checks; any app, capture, server, database, model, audio,
microphone, `pactl`, PipeWire module, sandbox run, network call or connection to
port 7717; any attempt 4 row. Each belongs to the install/build/serialisation
the root owns.

## Note for the next reader

`apply-checks.mjs` asserts that the only changed file under `src-tauri/`,
`scripts/`, `web/`, `server/`, `shared/` and `installer/` is the shipping
config. That assertion is about those paths only. Two other writers are active in
this tree (`docs/v2/tools/build-dispatch.mjs`,
`docs/v2/tools/build-dispatch.test.mjs` and `docs/v2/evidence/P3.4/attempt-5/`,
visible in row 9); if one of them later writes inside those six paths while this
check is re-run, that single assertion will fail for a reason that is not this
session's edit. Everything else in the script is independent of concurrent
writers.