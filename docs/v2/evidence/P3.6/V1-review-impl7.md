# P3.6 V1 — attempt 7 runtime (AM-214), reviewer evidence

| Field | Value |
| --- | --- |
| Row | **V1** — production producer + `npm run tauri:build` + production identity guard |
| Order | run **after V3** (S3: V0 → V3 → V1 → V4), never concurrently with V0 |
| Decoded command sha256 | `afd5a9e2244441f490a36972ecb58fc90c8b2f913371db6751aa150d5a7e547e` |
| Started (UTC) | **2026-10-06T19:17:20Z** |
| Ended (UTC) | **2026-10-06T19:19:42Z** |
| Elapsed | 142 s |
| **Exit code** | **0** → **PASS** |
| Raw log | `/tmp/opencode/p36/logs/V1.log` (1688 bytes, sha256 `a9efbcb12eda3bf92658269b5e46a151952637ae0b5dda7a979ace257a5676db`) |
| HEAD | `f93e27d3cd9931dbc3e5b4726a1ac635d7c660e9`, tree clean |
| Node / cargo | `v24.19.0` / `1.99.0` (`$HOME/.cargo/bin` exported by the row itself) |
| Sandbox | `sandbox.mjs env --port 7879`, `<sandbox>` under `/tmp/apunta-v2/` |
| A06 precondition | `test -x` passed on the same candidate; no acquisition |

## Observed output (excerpt, home redacted)

```
v24.19.0
... producer, identical stage list to V0 ...
== Writing manifest.json
manifest lists 4805 files
== Done
output: ~/Projects/Apunta/build/linux-resources
node:   v24.19.0
files:  4805

> apunta@0.0.0 tauri:build
> tauri build
   Compiling apunta v0.0.0 (~/Projects/Apunta/src-tauri)
    Finished `release` profile [optimized] target(s) in 31.70s
       Built application at: ~/Projects/Apunta/src-tauri/target/release/apunta
    Bundling Apunta_0.0.0_amd64.AppImage (...)
    Finished 1 bundle at:
        ~/Projects/Apunta/src-tauri/target/release/bundle/appimage/Apunta_0.0.0_amd64.AppImage (185.43 MiB)

Apunta_0.0.0_amd64.AppImage
Apunta.AppDir
```

## Assertions in the row, all present and all true

| Assertion | Observed |
| --- | --- |
| `node --version` = `v24.19.0` | yes |
| `test -x` A06 candidate | exit 0 |
| `sandbox.mjs env --port 7879` sourced | run folder created 2026-10-06T19:17:20Z |
| producer run **before** this Tauri build | yes — the producer's stage list is in the log, immediately ahead of `npm run tauri:build` |
| `ls -1` of the bundle dir, nothing redirected | `Apunta_0.0.0_amd64.AppImage`, `Apunta.AppDir` |
| `test -f "$B/Apunta_${VER}_amd64.AppImage"` with `VER` from `src-tauri/tauri.conf.json` | `0.0.0`, present |
| closing count loop over `Apunta_*.AppImage` equals 1 | exit 0 — exactly one production member |

## Artefact

| Field | Value |
| --- | --- |
| Path | `src-tauri/target/release/bundle/appimage/Apunta_0.0.0_amd64.AppImage` |
| sha256 | `39cc92a38e96eecad720783aabd8e9343666ba5a980da86652898dbfadc9f1d0` |
| size | 194439672 bytes (185.43 MiB) |
| mtime | 2026-10-06 13:19:42 -0600 (== 2026-10-06T19:19:42Z) |

**Distinct-identity observation, recorded because it is a fact the card's Stop 3
text anticipates but does not state.** When V1 closed, the bundle directory held
`Apunta_0.0.0_amd64.AppImage` and `Apunta.AppDir` **only**: the test-identity
image V0 built was **gone**, removed by `tauri build`'s own bundling step rather
than sitting beside the production image as the card's S3 note expects. V1's
closing count is unaffected (its pattern cannot match the test name either way),
and V4's count is unaffected for the same reason — each identity counts its own
pattern. The practical consequence is for a **resumed** session: there is no test
image left on this machine, so a later V3 needs a fresh V0 first. Nothing was
deleted by this reviewer; the removal is the bundler's, and it is the behaviour
AM-149 records as the unresolved clean-or-add question.
