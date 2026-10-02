# P3.8 V0 — build the AppImage and assert it is not stale (attempt 3)

- **Status: PASS** · exit **0**
- Base `5f0b730` (dispatch) · HEAD `ff62552` · card port **7860**
- `build/linux-resources/manifest.json` exists, so the row ran; the producer was
  **not** run (`scripts/v2/package-linux-resources.sh` and
  `scripts/build-whisper-candidate.sh` untouched — Stop condition 2, HS-3).

| Field | Value |
| --- | --- |
| Working directory | repo root (`<repo>`) |
| Start (UTC) | 2026-10-02T22:48:44Z |
| End (UTC) | 2026-10-02T22:50:00Z |
| Exit code | 0 |
| Wall clock | ~76 s |

## Exact command

The card's V0 cell, with the `$HOME/.cargo/bin` `export` the cell's Expected
paragraph describes as load-bearing (**the cell's literal command omits it** —
see Deviations in the return file). De-escaped for the pipe characters only:

```sh
export PATH="$HOME/.cargo/bin:$PATH" && export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && npm run tauri:build:test && A="src-tauri/target/release/bundle/appimage/Apunta (test)_0.0.0_amd64.AppImage" && { test -f "$A" || { echo "NOT RUN: no AppImage at $A after tauri:build:test"; exit 3; }; }; N=$(find src-tauri -path src-tauri/target -prune -o -path src-tauri/gen -prune -o -type f -newer "$A" -print) && { test -z "$N" || { echo "FAIL: these src-tauri sources are newer than the AppImage, so V3 and V4 would prove nothing:"; echo "$N"; exit 1; }; }
```

## Excerpt

```
v24.19.0
...
    Bundling Apunta (test)_0.0.0_amd64.AppImage (<repo>/src-tauri/target/release/bundle/appimage/Apunta (test)_0.0.0_amd64.AppImage)
    Finished 1 bundle at:
        <repo>/src-tauri/target/release/bundle/appimage/Apunta (test)_0.0.0_amd64.AppImage (169.30 MiB)
V0 OK
```

- `node --version` printed exactly `v24.19.0`.
- `npm run tauri:build:test` exited 0 and re-bundled the AppImage. **No
  re-bundle by this card's own action** — `tauri.conf.json` declares no
  `beforeBuildCommand`, so the bundle took whatever `build/linux-resources/`
  already held (Fixed decision 9).
- The AppImage exists at the pinned path.
- **The freshness clause found no `src-tauri/` source newer than the AppImage**,
  so the binary that V3 and V4 launched contains the committed change at
  `799597d`. This is the assertion that stops a stale-binary false pass
  (AM-131), and it held.
