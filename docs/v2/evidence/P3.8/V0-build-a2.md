# P3.8 V0 — build the AppImage (attempt 2)

- **Status: PASS** · exit **0**
- Card: P3.8 · attempt 2 of 3 · dispatch base `799597d`, HEAD `f9daac9`
- Port 7860 (not contacted by this row) · no sandbox needed: the row builds the
  shell only and contacts nothing

| Field | Value |
| --- | --- |
| Working directory | repo root (`<repo>`) |
| Start (UTC) | 2026-10-02T21:01:18Z |
| End (UTC) | 2026-10-02T21:02:40Z |

## Exact command

```sh
export PATH="$HOME/.cargo/bin:$PATH" && export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && npm run tauri:build:test && A="src-tauri/target/release/bundle/appimage/Apunta (test)_0.0.0_amd64.AppImage" && { test -f "$A" || { echo "NOT RUN: no AppImage at $A after tauri:build:test"; exit 3; }; }; N=$(find src-tauri -path src-tauri/target -prune -o -path src-tauri/gen -prune -o -type f -newer "$A" -print) && { test -z "$N" || { echo "FAIL: these src-tauri sources are newer than the AppImage, so V3 and V4 would prove nothing:"; echo "$N"; exit 1; }; }
```

## Excerpt

```
v24.19.0

> apunta@0.0.0 tauri:build:test
> tauri build --features test-identity --config src-tauri/tauri.test.conf.json

    Compiling apunta v0.0.0 (<repo>/src-tauri)
    Finished `release` profile [optimized] target(s) in 29.48s
    Bundling Apunta (test)_0.0.0_amd64.AppImage (<repo>/src-tauri/target/release/bundle/appimage/Apunta (test)_0.0.0_amd64.AppImage) (169.30 MiB)
```

## Assertions read from the output

- `node --version` printed exactly `v24.19.0`.
- `npm run tauri:build:test` exited 0 and produced the AppImage at the pinned
  path; the `test -f` clause was satisfied.
- The freshness clause printed nothing: **no `src-tauri/` source is newer than
  the AppImage**, so the binary under test contains attempt 1's change and the
  launching rows prove something about the current source.

## Notes

- `build/linux-resources/` exists and `build/linux-resources/web/dist/index.html`
  is present (checked before the run), which is the path attempt 1's launch
  refused on. The producer was **not** run from this card (Stop condition 2).
- No re-fetch: the Tauri bundler consumed what `build/linux-resources/` already
  held. The producer itself was a coordinator action.
- Full log: `/tmp/opencode/p38/v0.log` (outside the repository, not committed).
