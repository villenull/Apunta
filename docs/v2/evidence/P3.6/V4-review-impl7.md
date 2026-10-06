# P3.6 V4 — attempt 7 runtime (AM-214), reviewer evidence

| Field | Value |
| --- | --- |
| Row | **V4** — production AppImage extracted; licences and icons asserted **inside** the squashfs |
| Order | last of S3 (V0 → V3 → V1 → V4); needs no display and launches no application |
| Decoded command sha256 | `c7c68855beea1e08e52e43c665a238272bfdca1ee3221a11a76f66960dfa201b` |
| Started (UTC) | **2026-10-06T19:19:48Z** |
| Ended (UTC) | **2026-10-06T19:19:49Z** |
| Elapsed | 1 s |
| **Exit code** | **0** → **PASS** |
| Raw log | `/tmp/opencode/p36/logs/V4.log` (51 bytes, sha256 `3193a9f87c1d0257bae1752904189ea11c19b9620d82d0a2e39b3da470b5bf3a`) |
| HEAD | `f93e27d3cd9931dbc3e5b4726a1ac635d7c660e9`, tree clean |
| Sandbox | `sandbox.mjs env --port 7879`; `APUNTA_PORT=7879`, `APUNTA_NO_OPEN=1`, `APUNTA_DATA_DIR` inside `<sandbox>` asserted by the row before the extraction |

## Observed output (complete)

```
v24.19.0
Apunta_0.0.0_amd64.AppImage
Apunta.AppDir
```

## Assertions in the row, all present and all true

| Assertion | Observed |
| --- | --- |
| three sandbox containment conjuncts | exit 0 |
| `ls -1` of the bundle dir, nothing redirected | `Apunta_0.0.0_amd64.AppImage`, `Apunta.AppDir` (the test image was already gone — see V1) |
| count loop over `Apunta_*.AppImage` = 1 | exit 0 |
| `test -f "$B/Apunta_${VER}_amd64.AppImage"`, `VER` from the config | `0.0.0` |
| `"$A" --appimage-extract` | exit 0, `squashfs-root/` written to `/tmp/apunta-v2-p3.6-v4` |
| `squashfs-root/usr/lib/Apunta/linux-resources` exists | yes |
| `THIRD-PARTY-LICENSES.md` present and non-empty | **253144 bytes** |
| carries `<!-- npm-dependencies:start -->` and `<!-- npm-dependencies:end -->` | both present |
| carries `^# What Apunta is built from` | present |
| bundled copy **≥** the repository's copy | 253144 ≥ 253144 (equal), and byte-identical: sha256 `65db0bc093ba59ef06ad3ed440aa072d75ede0c9bc918ec81a43e645e840ef58` on both sides |
| `squashfs-root/Apunta.png` non-empty | **12139 bytes** |
| `squashfs-root/usr/share/icons/hicolor/128x128/apps/apunta.png` non-empty | **5670 bytes** |
| `THIRD-PARTY-LICENSES.md` **absent** beside the AppImage | absent (assertion holds) |

## Notes

- The row runs the AppImage **runtime** with `--appimage-extract`; the
  **application** was never launched — no server, no window, no port, no data
  folder touched by this row beyond its own sandbox env.
- `extract.log` in the extraction folder is 0 bytes (the runtime printed
  nothing), and `squashfs-root/` is mode `drwx------`.
- Licences and icons are proved **inside the image**, which is what V2 alone
  could not show: V2 compares the source trees, V4 reads the shipped artefact.
- The extraction folder `/tmp/apunta-v2-p3.6-v4` is outside the repository and is
  left as the row created it; it is not restored, repaired or hand-edited.
