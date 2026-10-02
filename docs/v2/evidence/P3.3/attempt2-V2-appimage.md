# V2 — the AppImage build (attempt 2)

**Status: PASS. Exit 0.** Working directory: repository root (the Tauri CLI
resolves its own project). Start 2026-10-02T06:47Z, end 2026-10-02T06:48Z (UTC).

Exact command:

```sh
export PATH="$HOME/.cargo/bin:$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && npm run tauri:build:test
```

Excerpt (`build/p33-correct-v2-build.log`, git-ignored):

```
> apunta@0.0.0 tauri:build:test
> tauri build --features test-identity --config src-tauri/tauri.test.conf.json

        Info Looking up installed tauri packages to check mismatched versions...
   Compiling apunta v0.0.0 (~/Projects/Apunta/src-tauri)
    Finished `release` profile [optimized + debuginfo] target(s) in 31.62s
       Built application at: ~/Projects/Apunta/src-tauri/target/release/apunta
        Info Patching ~/Projects/Apunta/src-tauri/target/release/apunta with bundle type information: appimage
    Bundling Apunta (test)_0.0.0_amd64.AppImage (…/src-tauri/target/release/bundle/appimage/Apunta (test)_0.0.0_amd64.AppImage)
    Finished 1 bundle at:
        …/src-tauri/target/release/bundle/appimage/Apunta (test)_0.0.0_amd64.AppImage (169.29 MiB)
exit=0
```

## Provenance: the bundle is newer than everything it is built from

| Artefact | Size | mtime (local) |
| --- | --- | --- |
| `src-tauri/target/release/bundle/appimage/Apunta (test)_0.0.0_amd64.AppImage` | 177 515 000 B | 2026-10-02 00:48:23 |
| newest `src-tauri/src/*.rs` (`main.rs`) | — | 2026-10-02 00:46:42 |
| `src-tauri/src/quit.rs` | — | 2026-10-01 23:53:32 |
| `build/linux-resources/` (P3.1's runtime, rebuilt this attempt) | — | 2026-10-02 00:04 |

`find src-tauri/src src-tauri/Cargo.toml src-tauri/tauri*.json -newer
<the AppImage>` returns **nothing**: no source file, manifest or config is newer
than the bundle. Every V3–V5 row below ran against this exact file.

The bundled runtime was rebuilt first, because `server/src/shell-bridge.ts` and
`server/src/index.ts` changed and the bundle embeds `server.mjs`:

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && bash scripts/v2/package-linux-resources.sh   # exit 0
```

…reporting `node: v24.19.0`, `files: 4804`. That script copies the A01 tree and
better-sqlite3's prebuilt addon and installs nothing.

## Exactly one AppImage, so nothing stale can be launched

`src-tauri/target/release/bundle/appimage/` holds one `.AppImage`. The harness
resolves it once by glob and **fails** on zero or more than one match
(`resolveAppImage`), so a stale bundle from attempt 1 could not have been
launched silently — and every V3/V4/V5 log line above prints the path it used.

## Review D4: the build is now reproducible from a clean install

Attempt 1's V2 was reproducible only on a machine where someone had run
`npm install @tauri-apps/cli` by hand: `package.json` never declared it, so a
clean checkout had no `tauri` binary and `tauri:build:test` would have failed.

`package.json` now carries `"@tauri-apps/cli": "^2.12.1"` in `devDependencies`,
matching the range the lockfile's root entry already resolved. The check was run
in an **isolated copy** with no `node_modules`, from the npm cache
(`--offline`), so nothing was downloaded and the working `node_modules` was not
touched:

```sh
mkdir -p build/p33-correct-clean && cp package.json package-lock.json build/p33-correct-clean/
cd build/p33-correct-clean && npm ci --dry-run --offline
```

```
add @tauri-apps/cli-linux-x64-gnu 2.12.1
add @tauri-apps/cli 2.12.1
…
added 157 packages in 259ms
exit=0
```

Both the wrapper and the platform binary it selects are in the plan. In the
working tree, `npm ls @tauri-apps/cli` reports `apunta@0.0.0 → @tauri-apps/cli@2.12.1`
(no longer `extraneous`) and `node_modules/.bin/tauri` resolves.

**The lockfile pins are untouched.** `git diff --stat package-lock.json` is the
same `+234/−1` A04 change attempt 1 recorded; declaring the dependency in
`package.json` reconciled `package.json` **to** the lock, not the other way
round, so no re-resolution and no `npm install` happened.