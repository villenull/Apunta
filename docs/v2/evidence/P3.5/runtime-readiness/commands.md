# P3.5 runtime-readiness — commands run and exits

All commands are read-only or synthetic parses. Working directory:
`/home/villenull/Projects/Apunta`, branch `main`, HEAD `888bcc4`.
Pinned Node: `$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node`.

| # | Command | Exit | Purpose |
| --- | --- | --- | --- |
| 1 | `git rev-parse HEAD` / `git status --porcelain` | 0 | HEAD `888bcc4`, clean tree (0 dirty paths). |
| 2 | `grep -n bundleMediaFramework src-tauri/tauri.conf.json` | 0 | AM-190 key present (1). |
| 3 | `grep -c bundleMediaFramework src-tauri/tauri.test.conf.json` | 1 | overlay unchanged (0 matches; exit 1 on zero count). |
| 4 | `test -x build/p3.5-env-repair/gst-helpers/gst-plugin-scanner` | 0 | prepared scanner helper present-executable. |
| 5 | `test -x /usr/lib/gstreamer-1.0/gst-plugin-scanner` | 0 | host scanner present-executable. |
| 6 | `node -e "…require('./docs/v2/state/cards/P3.5.json')…"` | 0 | checkpoint: attempt 3, BLOCKED, 5 sandboxRuns, 5 attempt-1 records, 0 at attempt 3. |
| 7 | `ss -ltn | grep -E ':(7837|7839)\b'` | 1 | no listener on 7837/7839 (exit 1 = none). |
| 8 | `pgrep -af 'tauri build --features test-identity'` | 0 | P3.4 build pids present (3); build lease held. |
| 9 | `node --check scripts/v2/tauri-audio.test.mjs` | 0 | harness parses. |
| 10 | `node --check scripts/v2/sandbox.mjs` | 0 | sandbox parses. |
| 11 | `node --check build/p35-runtime-readiness/v5-provenance.unescaped.mjs` | 0 | V5 provenance program (card, unescaped) parses. |
| 12 | `grep -c GSTREAMER_HELPERS_DIR docs/v2/state/dispatch/P3.5.md` | 1 | stale dispatch: 0 (predates AM-190). |
| 13 | `grep -c stream_loop docs/v2/state/dispatch/P3.5.md` | 1 | stale dispatch: 0. |
| 14 | `grep -c appointa_p35 docs/v2/cards/P3.5.md` | 1 | current card: 0 (AM-185 fixed). |
| 15 | `grep -c apunta_p35 docs/v2/cards/P3.5.md` | 0 | current card: 16. |
| 16 | `sed -n '22p' docs/v2/ACQUISITION.md` | 0 | A10 row admits the exact nine AM-191 names. |

## Deliberately not run

Any V-row; `sandbox.mjs env`; any `tauri`/`cargo`/`npm run build`; any `pactl`;
any `gst-inspect-1.0`; any app/server/database/model/audio/microphone/input/
display/network; port 7717; any install; global `npm test` or repo-wide lint
(a concurrent P3.4 writer owns the tree's evidence output). Each belongs to the
root's serialised runtime after the build lease releases.
