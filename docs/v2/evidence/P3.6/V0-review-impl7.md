# P3.6 V0 — attempt 7 runtime (AM-214), reviewer evidence

| Field | Value |
| --- | --- |
| Row | **V0** — producer + test-identity build + identity guard |
| Reviewer run | once-only, no retry, no rebuild after any outcome |
| Decoded command sha256 | `cdb77a6b26ea2ded0923fd17f85ba1a1ebae75c6ed956d29a19f46a6f54184aa` (backtick span of the dispatch's V0 cell, `bash -n` clean) |
| Started (UTC) | **2026-10-06T19:09:52Z** |
| Ended (UTC) | **2026-10-06T19:12:18Z** |
| Elapsed | 146 s |
| **Exit code** | **0** → **PASS** |
| Raw log | `/tmp/opencode/p36/logs/V0.log` (1793 bytes, sha256 `9758d421b765119e2e54b2129bcb22a106371e01e44ea5ea0e38850669a3044b`) — sandbox-side, not committed |
| HEAD | `f93e27d3cd9931dbc3e5b4726a1ac635d7c660e9`, `git status --porcelain` empty before and after |
| Node | `v24.19.0` (first on `PATH`); cargo `1.99.0` on `$HOME/.cargo/bin` |
| Sandbox | `sandbox.mjs env --port 7879`, `APUNTA_DATA_DIR` inside `/tmp/apunta-v2/<runid>` (`<sandbox>`), `APUNTA_NO_OPEN=1` |
| A06 precondition | `test -x` passed on `~/.cache/apunta-v2/whisper-src/whisper.cpp/build-vulkan/bin/whisper-cli`, 1064648 bytes, mtime 2026-10-02 13:00:05 -0600, mode `-rwxr-xr-x` — untouched by this card |

## Observed output (excerpt, home redacted to `~`)

```
v24.19.0

== Recording the build environment

== Copying the pinned Node tree (A01)
copied ~/.local/share/apunta-node/node-v24.19.0-linux-x64 -> ~/Projects/Apunta/build/linux-resources/node (v24.19.0)
tarball sha256 recorded by P0.1: f625d97cd707df4ff96254916fbc5ff014f09c09effe5a1e0ca8f6d41a8789d4

== Building the server and the web app

== Bundling the server (server/server.mjs)
  build/linux-resources/server/server.mjs  6.9mb ⚠️
⚡ Done in 195ms
injected app version: 0.0.0

== Copying the migrations
== Copying the web build
== Copying better-sqlite3

== Building whisper-cli (A06)
copied whisper-cli and 15 shared libraries into bin/ (RUNPATH \$ORIGIN:)

== Copying the licences
== Writing manifest.json
manifest lists 4805 files

== Done
output: ~/Projects/Apunta/build/linux-resources
node:   v24.19.0
files:  4805

> apunta@0.0.0 tauri:build:test
> tauri build --features test-identity --config src-tauri/tauri.test.conf.json
   Compiling apunta v0.0.0 (~/Projects/Apunta/src-tauri)
    Finished `release` profile [optimized] target(s) in 33.06s
       Built application at: ~/Projects/Apunta/src-tauri/target/release/apunta
    Bundling Apunta (test)_0.0.0_amd64.AppImage (...)
    Finished 1 bundle at:
        ~/Projects/Apunta/src-tauri/target/release/bundle/appimage/Apunta (test)_0.0.0_amd64.AppImage (185.43 MiB)

Apunta (test)_0.0.0_amd64.AppImage
Apunta (test).AppDir
```

## Assertions in the row, all present and all true

| Assertion | Observed |
| --- | --- |
| `node --version` prints exactly `v24.19.0` | yes, first line |
| `test -x` on the A06 candidate | exit 0 |
| work dir is the one outside reclaimable `/tmp` | exit 0 (`~/.cache/apunta-v2/whisper-src`) |
| `sandbox.mjs env --port 7879` exit 0 and sourced | run folder `<sandbox>` created 2026-10-06T19:09:52Z |
| producer `bash scripts/v2/package-linux-resources.sh` | exit 0, 4805 files, manifest written, `npm run build` under the producer's own pinned-Node re-exec |
| `npm run tauri:build:test` | exit 0, 1 bundle |
| `ls -1` of the bundle dir (nothing redirected) | prints `Apunta (test)_0.0.0_amd64.AppImage` and `Apunta (test).AppDir` into the excerpt |
| `test -f "Apunta (test)_${VER}_amd64.AppImage"` with `VER` read from `src-tauri/tauri.conf.json` | `0.0.0`, file present |
| closing count loop over `'Apunta (test)_'*.AppImage` equals 1 | exit 0 — exactly one, no sibling |

## Artefact

| Field | Value |
| --- | --- |
| Path | `src-tauri/target/release/bundle/appimage/Apunta (test)_0.0.0_amd64.AppImage` |
| sha256 | `aebc698eac3aeccbc238df95f431d2ea56e88bdd13a2b897570d04012c64fb24` |
| size | 194439672 bytes (185.43 MiB) |
| mtime | 2026-10-06 13:12:18 -0600 (== 2026-10-06T19:12:18Z) |
| Directory at V0's close | test image **1**, production image **0** |

The production image did not exist when V0 closed; V3's own pre-launch listing
(log lines 2–3) confirms the directory held only the test identity and its
`.AppDir` at 2026-10-06T19:14:00Z.

## Notes

- **No acquisition.** The producer printed no clone, no fetch of a new revision
  and no host lookup in its own stdout; A06's candidate was reused
  (`== Building whisper-cli (A06)` → `copied whisper-cli and 15 shared libraries`).
- Rule B's set was clean before the build and stayed clean: `git status
  --porcelain` over `RULE_B_PATHS` is empty, and no input under the set has an
  mtime newer than the AppImage (only `src-tauri/target/**`, which Rule B names
  as output).
- `build/linux-resources/**`, `server/dist/**` and `web/dist/**` were rewritten
  by this run as designed; they are gitignored artefacts and are not restored.
