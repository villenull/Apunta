# P3.4 — V0, the re-bundle

Status: **PASS** (exit 0). This is the row attempt 2 could not run.

- Working directory: `/home/villenull/Projects/Apunta` (repository root)
- Start: 2026-10-02T19:04:28Z
- End: 2026-10-02T19:07:38Z (3 min 10 s)
- Exit code: 0
- Trigger: **Rule B** — the base-to-head and uncommitted diff both name paths in
  its set (`web/src/main.tsx`), so a re-bundle was required.

## Exact command

The row's command, verbatim, run from the repository root:

```sh
export PATH="$HOME/.cargo/bin:$PATH" && export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && export APUNTA_WHISPER_WORK_DIR="$HOME/.cache/apunta-v2/whisper-src" && node --version && P34_FLAGGED="$PWD/build/p3.4-web" && trap 'rm -rf "$P34_FLAGGED" build/linux-resources/web/dist' EXIT INT TERM HUP && test -x "${APUNTA_WHISPER_WORK_DIR:-/tmp/apunta-v2/whisper-src}/whisper.cpp/build-${APUNTA_WHISPER_BACKEND:-vulkan}/bin/whisper-cli" && mkdir -p build/p3.4-web && VITE_APUNTA_TEST_IDENTITY=1 npm --prefix web run build -- --outDir ../build/p3.4-web/dist --emptyOutDir && node -e "…includes('p3.4-observe')…" build/p3.4-web/dist && bash scripts/v2/package-linux-resources.sh && node -e "…requires 0…" web/dist && rm -rf build/linux-resources/web/dist && cp -R build/p3.4-web/dist build/linux-resources/web/dist && node -e "…any bundle at all…" build/linux-resources/web/dist && npm run tauri:build:test
```

(the three `node -e` predicates are the row's own, abbreviated here only for the
`…`; the log lines they print are quoted verbatim below)

## The four assertions the row makes, in order

| # | Assertion | Observed |
| --- | --- | --- |
| 0 | `node --version` prints exactly `v24.19.0` | `v24.19.0` |
| 1 | the `whisper-cli` precondition (`test -x`) | **exit 0** — S0's acquisition made it executable, so no `git fetch` ran below |
| 2 | the **flagged** bundle carries the marker | `marker bundles in build/p3.4-web/dist: 1` (exit 0) |
| 3 | the **shipping** `web/dist` carries none | `marker bundles in web/dist: 0` (exit 0) |
| 4 | the copy put into the shipping directory carries bundles | `marker bundles in build/linux-resources/web/dist: 16` (exit 0) |
| 5 | an AppImage exists under `src-tauri/target/release/bundle/appimage/` | `Finished 1 bundle at: src-tauri/target/release/bundle/appimage/Apunta (test)_0.0.0_amd64.AppImage (169.30 MiB)` |

The producer's own log, between them:

```
== Building the server and the web app
== Bundling the server (server/server.mjs)
  build/linux-resources/server/server.mjs  6.8mb
== Copying the migrations
== Copying the web build
== Copying better-sqlite3
== Building whisper-cli (A06)
copied whisper-cli and 15 shared libraries into bin/ (RUNPATH $ORIGIN:)
== Writing manifest.json
manifest lists 4804 files
```

`== Building whisper-cli (A06)` **copied** the candidate S0 built; the
precondition is what stops the producer from cloning or fetching anything, so
this row touched **no network at all**.

## Proof that the re-bundle actually happened

Three independent facts, and the first is the one attempt 1 lacked:

1. **The bundle is fresh.** The AppImage is 2026-10-02T19:05:45Z;
   `web/src/main.tsx` — the newest input in Rule B's set — is earlier than that.
   V2 re-checked this from the other side and reported
   `PASS V2 the AppImage is newer than every Rule B input` and
   `PASS V2 no Rule B path named by git is newer than the AppImage`.
2. **The shipping directory stayed clean on every path.** `web/dist` carries
   **0** marker bundles; the flagged bundle was built in `build/p3.4-web`, which
   the row's own `trap` removed on exit (`build/p3.4-web` no longer exists), and
   `build/linux-resources/web/dist` — the copy the producer would have made —
   was replaced only **after** the producer ran and was likewise removed on
   exit. `git status` shows no build output as modified.
3. **The hook is inside the shipped binary.** The AppDir next to the AppImage —
   what was actually bundled — contains it:

   ```
   src-tauri/target/release/bundle/appimage/Apunta (test).AppDir/
     usr/lib/Apunta (test)/linux-resources/web/dist/assets/index-DXrud9Kw.js:1   ← 'p3.4-observe'
     16 js bundles total, 0 of them containing 'VITE_APUNTA_TEST_IDENTITY'
   ```

   So the marker is in the bundle the AppImage serves (one bundle, the entry
   chunk) and the gate string is in none of them — the dead branch really is
   dropped in the flagged build too.

## Notes

- The row was run **twice**. The first run (19:01:13Z) completed the whole
  chain and built the AppImage, but it was launched with `nohup`, so its exit
  code was not captured; the second run above is byte-for-byte the same command
  and its exit code **0** is what this record reports. Both runs made the same
  three marker counts and both left `web/dist` unflagged.
- Nothing was weakened: no count was lowered, no predicate was dropped, and the
  row's `trap` ran on both exits.