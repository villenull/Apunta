# P3.5 — V2, the flagged test build and the shipping AppImage

- Working directory: repository root
- First run: 2026-10-03T02:27:00Z → 02:27:52Z, **exit 1** (see "the first run")
- Second run: 2026-10-03T02:28:15Z → 02:29:39Z, exit **0**
- `node --version`: `v24.19.0`
- Status: **PASS**

## Exact command

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && P35_FLAGGED="$PWD/build/p3.5-web" && trap 'rm -rf "$P35_FLAGGED" build/linux-resources/web/dist' EXIT INT TERM HUP && npm run build:shared && mkdir -p build/p3.5-web && VITE_APUNTA_TEST_IDENTITY=1 npm --prefix web run build -- --outDir ../build/p3.5-web/dist --emptyOutDir && node -e "…marker count, exit n>0…" build/p3.5-web/dist && bash scripts/v2/package-linux-resources.sh && node -e "…marker count, exit n===0…" web/dist && rm -rf build/linux-resources/web/dist && cp -R build/p3.5-web/dist build/linux-resources/web/dist && node -e "…marker count, exit n>0…" build/linux-resources/web/dist && npm run tauri:build:test
```

(the three `node -e` probes are the card's verbatim; each prints `marker bundles in <path>: <n>`)

## The three counts

| Count | Path | Value | Meaning |
| --- | --- | --- | --- |
| ≥ 1 | `build/p3.5-web/dist/assets/*.js` | **1** | the hook survived the flagged build, so V3/V4 have a trigger at all |
| exactly 0 | `web/dist/assets/*.js` (after the producer) | **0** | no shippable `web/dist` carries the marker |
| ≥ 1 | `build/linux-resources/web/dist/assets/*.js` | **1** | the bytes inside the AppImage |

Verbatim from the run:

```
marker bundles in build/p3.5-web/dist: 1
marker bundles in web/dist: 0
marker bundles in build/linux-resources/web/dist: 1
```

The trap fired on exit and removed **both** `build/p3.5-web` and
`build/linux-resources/web/dist`; re-checked afterwards, `build/p3.5-web` does
not exist, `build/linux-resources/web/dist` does not exist, and
`web/dist/assets/*.js` still reads **0** for the marker string.

## The AppImage

```
   Compiling apunta v0.0.0 (<repo>/src-tauri)
    Finished `release` profile [optimized] target(s) in 28.40s
       Built application at: <repo>/src-tauri/target/release/apunta
    Bundling Apunta (test)_0.0.0_amd64.AppImage (<repo>/src-tauri/target/release/bundle/appimage/Apunta (test)_0.0.0_amd64.AppImage)
    Finished 1 bundle at:
        <repo>/src-tauri/target/release/bundle/appimage/Apunta (test)_0.0.0_amd64.AppImage (169.29 MiB)
```

The producer's own summary, verbatim:

```
output: <repo>/build/linux-resources
node:   v24.19.0
files:  4804
```

## the first run

The literal command **as written in the card** cannot finish its last step on
this host: `npm run tauri:build:test` runs `cargo`, and the desktop session's
`PATH` holds no `~/.cargo/bin` (`which cargo` is empty outside this row). The
first run therefore failed at exactly that step with

```
failed to run 'cargo metadata' command to get workspace directory: … No such file or directory (os error 2)
```

Everything before it had already succeeded — the flagged build, all three marker
counts and the producer. The second run is the same command with
`~/.cargo/bin` added to `PATH`, the pinned-`PATH` discipline every other row in
this card already uses (V0 exports it for `cargo test`), and it exits 0. **No
other difference**, and nothing in `package.json`, `web/package.json`,
`web/vite.config.ts`, `scripts/v2/package-linux-resources.sh` or
`src-tauri/tauri.conf.json` was touched. This is a PATH fact about the desktop
session, disclosed rather than worked around.

## Consequence, restated so nothing is discovered by surprise

After V2, `build/linux-resources/web/dist` does not exist. Any later release
build must re-run the producer directly in front of `npm run tauri:build`, and
the only correct invocation is the literal
`bash scripts/v2/package-linux-resources.sh` (there is no `npm run` wrapper, and
`package.json` is Must-not-edit for this card). A release build that skips the
producer has no web bundle to ship — a visible failure, not a flagged one.
