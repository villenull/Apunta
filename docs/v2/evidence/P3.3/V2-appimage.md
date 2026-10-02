# V2 — the test-identity AppImage

Status: **PASS**
Working directory: repository root
Started: 2026-10-02T04:53:32Z
Ended: 2026-10-02T04:54:46Z (74 s)
Exit code: **0**

## Exact command

```
$ export PATH="$HOME/.cargo/bin:$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" \
  && node --version \
  && npm run tauri:build:test
```

`node --version` → `v24.19.0`. The `export` covers `$HOME/.cargo/bin` for the
same reason V1's does, and the Node path because the Tauri CLI shells out to
`cargo` and must find the toolchain in this shell and in the CLI's child.

`tauri:build:test` is `tauri build --features test-identity --config
src-tauri/tauri.test.conf.json`.

## Result

```
    Finished 1 bundle at:
        /home/<owner>/Projects/Apunta/src-tauri/target/release/bundle/appimage/Apunta (test)_0.0.0_amd64.AppImage (169.29 MiB)
```

```
$ ls -l src-tauri/target/release/bundle/appimage/*.AppImage
-rwxr-xr-x 1 <owner> <owner> 177506808 Oct  1 22:54 'Apunta (test)_0.0.0_amd64.AppImage'
```

**Exactly one** `.AppImage`, which is what V3–V5's glob resolution requires (the
harness fails on zero or more than one so a stale AppImage cannot be launched
silently).

## Identity, and the two that must not collide

| Build | Cargo feature | Identity | Port | Data folder |
| --- | --- | --- | --- | --- |
| production | none | `app.apunta.desktop` | 7717 (E5) | the platform default |
| test | `test-identity` | `app.apunta.desktop.test` | `APUNTA_PORT`, refused if absent or 7717 | `APUNTA_DATA_DIR`, refused if absent |

`launch::check_identity` compares the running binary's identifier against what
its Cargo feature implies and **refuses to start** on a mismatch, so a forgotten
`--config` is a refusal with a reason rather than a test app that could focus or
signal the owner's production app. `launch::tests::identity_and_feature_must_agree`
covers both directions.

## S4's anchor

`src-tauri/target/release/bundle/appimage/*.AppImage` exists and was built at
04:54, **after** the last source edit to `src-tauri/` (the signal handlers and
the watchdog, 04:47) and after the rebuilt `build/linux-resources` (04:53). No
`src-tauri` source changed after this build.

## The AppImage contains this card's server

V2 bundles `build/linux-resources/` as a resource
(`tauri.conf.json` → `bundle.resources`), and that folder was rebuilt after the
`shell-bridge` change, so the tested app spawns a server that carries the ready
line and both fatal codes. Verified by reading the rebuilt bundle — see
`README.md`. `spawn()` resolves four overrides inside the bundle
(`APUNTA_SQLITE_BINDING`, `APUNTA_LICENSES_FILE`, `APUNTA_WEB_DIST`,
`APUNTA_WHISPER_BIN`), because `config.ts` would otherwise resolve them by
walking **out** of the bundle folder to its parent, which inside an AppImage is a
directory holding nothing of ours.

## Notes on what the build downloaded

Tauri's AppImage bundler fetched its own tooling during this build
(`AppRun-x86_64`, `linuxdeploy-x86_64.AppImage`,
`linuxdeploy-plugin-appimage-x86_64.AppImage`, all from `github.com`). These are
the bundler's own build tools, downloaded by the A04 CLI as part of running
`tauri build`, not an item this card added to the product. No ACQUISITION row
covers them because they never enter the app or the repository.
`patchelf`, which the instruction review flagged as absent and unbundled, was
**not** needed: the AppImage built cleanly.