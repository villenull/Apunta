# P3.6 V2 — attempt 7 runtime (AM-214), reviewer evidence

| Field | Value |
| --- | --- |
| Row | **V2** — icon set byte-identical between asset source and `src-tauri/icons/` |
| Order | may run at any point; run first (before any build), 2026-10-06T19:09:31Z |
| Decoded command sha256 | `2b902435d1569a1bcec2c1e9dd23cb2094d700a996890e3973301637f30715db` |
| Started (UTC) | **2026-10-06T19:09:31Z** |
| Ended (UTC) | **2026-10-06T19:09:31Z** |
| Elapsed | 0 s |
| **Exit code** | **0** → **PASS** |
| Raw log | `/tmp/opencode/p36/logs/V2.log` (9 bytes, sha256 `b7677d3ec37ee1897ba07dc2cfe8292fe421c9ac93396cca5bbece486d1a2a41`) |
| HEAD | `f93e27d3cd9931dbc3e5b4726a1ac635d7c660e9`, tree clean |

## Command, verbatim

```
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && diff -r docs/v2/assets/tauri-icons/ src-tauri/icons/
```

## Observed output (complete)

```
v24.19.0
```

`node --version` printed `v24.19.0` exactly; `diff -r` printed **nothing**, and
an empty `diff -r` exits 0, so the chain reached the end.

## What the empty diff covers

| Side | Members |
| --- | --- |
| `docs/v2/assets/tauri-icons/` | **17** |
| `src-tauri/icons/` | **17** |

```
128x128@2x.png  128x128.png  32x32.png  64x64.png  icon.icns  icon.ico  icon.png
Square30x30Logo.png  Square44x44Logo.png  Square71x71Logo.png  Square89x89Logo.png
Square107x107Logo.png  Square142x142Logo.png  Square150x150Logo.png
Square284x284Logo.png  Square310x310Logo.png  StoreLogo.png
```

Both directories, both lists identical, no file added, removed or differing in
content — `diff -r` compares names, types and bytes, so this is the whole set
and nothing narrower.

## Notes

- No sandbox was needed by this row and none was started by it; it touches no
  port, no data folder, no process.
- This is S1's icon anchor executed as a row rather than as prose, and it is the
  only assertion in the card that the icon **source tree** matches. V4 is the one
  that proves the icons are **inside the shipped image**.
