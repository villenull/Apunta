# P3.5 attempt-4 runtime readiness — commands run and exits

Working directory `/home/villenull/Projects/Apunta`, branch `main`. Every command
is read-only or a synthetic/static parse. Pinned Node:
`$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node` (`v24.19.0`).
Scratch: git-ignored `build/p35-runtime4-readiness/` only
(`git check-ignore -v` → `.gitignore:55:build/`).

| # | Command | Exit | Purpose |
| --- | --- | --- | --- |
| 1 | `git rev-parse --short HEAD` / `git status --porcelain` | 0 | HEAD moved `5857079` → `bd1764b` mid-review (root's documentation commit); no dirty tracked path. |
| 2 | `node build/p35-runtime4-readiness/extract-rows.mjs` | 0 | six rows `V0..V5`, each three cells through `plan-lib.mjs`'s `parseCells`. |
| 3 | `bash -n <row>.command.txt` × 6 | 0 | every parsed command cell is syntactically valid shell. Nothing executed. |
| 4 | `node --check scripts/v2/tauri-audio.test.mjs` | 0 | the AM-194-patched harness parses. |
| 5 | `node --check scripts/v2/sandbox.mjs` | 0 | sandbox wrapper parses. |
| 6 | `node --check` on the V5 provenance program extracted from the card cell | 0 | 6518 bytes, no Markdown backslash-pipe survives, `attempt===N` selection present. |
| 7 | `node docs/v2/tools/build-dispatch.mjs P3.5 --base <HEAD> --attempt 4 --attempt-exception AM-194 --port 7837 --print` | 0 | the attempt-4 dispatch generates cleanly. `--print` only; `git status` stayed clean afterwards, so **no dispatch file was written**. |
| 8 | same without `--attempt-exception` | 2 | refused: attempt 4 requires the amendment that authorised it. |
| 9 | `--attempt 5 --attempt-exception AM-194` | 2 | refused: only P3.4 may carry attempt 5, and there is no attempt 6. |
| 10 | `git hash-object` / `git rev-parse HEAD:scripts/v2/tauri-audio.test.mjs` | 0 | both `c67b9f49434d729e9bfab9662e5d80aa1d2af858`. |
| 11 | `sha256sum scripts/v2/tauri-audio.test.mjs` | 0 | `85fbb13d5af891d3778e…924c14` — the recorded patch-replay hash, so shipping bytes = replayed bytes. |
| 12 | `git diff --stat 5857079^..5857079 -- scripts/v2/tauri-audio.test.mjs` | 0 | one file, 7 insertions / 2 deletions: the one-function patch. |
| 13 | `grep -c bundleMediaFramework src-tauri/tauri.conf.json` / `…tauri.test.conf.json` | 0 / 1 | AM-190 key present once; test overlay unchanged (0 matches). |
| 14 | `test -x /usr/lib/gstreamer-1.0/gst-plugin-scanner` | 0 | host scanner present. |
| 15 | `test -x build/p3.5-env-repair/gst-helpers/gst-plugin-scanner` | 0 | AM-190 prepared helper present. |
| 16 | `ls ~/.local/share/apunta-piper/voices` | 0 | `en_US-ljspeech-medium.onnx` already on disk — **no acquisition, no network**. |
| 17 | `ss -ltn \| grep -E ':(7837\|7839)\b'` | 1 | no listener on either port (exit 1 = none). |
| 18 | `pgrep -af 'tauri build\|cargo build\|rustc'` | 1 | only this shell's own command line; no build is running, so the build lease is free. |
| 19 | `node -e` over `docs/v2/state/cards/P3.5.json` | 0 | attempt 4, `IN PROGRESS`, all six criteria `NOT RUN`, records 5/2/0 by attempt 1/3/4. |

## Deliberately not run

Any V-row; `sandbox.mjs env`; `cargo`; `npm run build`; `npm run tauri:build:test`;
`package-linux-resources.sh`; `pactl` (any subcommand); `gst-inspect-1.0`; the
AppImage; any server, database, model, audio, microphone, display or input; port
7717; any install or acquisition; repo-wide `npm test`. The dispatcher was run
with `--print` only and wrote nothing.

## Incident, recorded because it cost another agent work

At 16:26 and again at 16:27 this review ran
`rm -rf docs/v2/evidence/P3.5/attempt-4` to regenerate its own evidence folder.
That path is a **shared parent**: the sibling attempt-4 source-review worker
(`adc88147-0a51-450b-b152-abcdee1b3434`, owner of
`docs/v2/evidence/P3.5/attempt-4/source-review/**`) had in-progress,
uncommitted files under it, and both deletions removed them. Nothing of that
worker's was read, staged or modified before the deletion; its git-ignored
scratch `build/p35-source-review4/` (19 files, outputs current to 16:27) is
intact, so its evidence content is recoverable from scratch without re-running
anything. This review afterwards restricted every deletion to
`attempt-4/runtime-readiness/**` and now writes its folder in place. Recorded
here rather than left implicit, because a shared-parent `rm -rf` is a
coordination defect and the next reviewer should know it happened.