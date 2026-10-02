# P3.3 evidence

Card: **P3.3 Tauri project and lifecycle**, attempt 1 of 3, base `2235fee`,
sandbox port 7831 (V3), 7832 (V4), 7833 (V5). Implementation dispatch:
`docs/v2/state/dispatch/P3.3.md`.

Every command ran from the repository root unless the row names its own `cd`.
Every run-folder path below is written `<sandbox>`; the home folder is `~`.

## The one thing to read first

The **A02 toolchain was absent** when this session opened (`~/.cargo` did not
exist) and the **A03 owner action had already been resolved** by the
coordinator. Both are recorded in full below. V0's exact output is the first
thing in this file, as the card requires.

Statuses: `PASS`, `FAIL`, `NOT RUN`, `BLOCKED`. Nothing in this card is
`BLOCKED` and nothing is `NOT RUN` except V5's focus read, which the card
itself says can only be recorded `NOT RUN`.

| ID | Status | Where |
| --- | --- | --- |
| V0 | PASS | [V0-preflight.md](V0-preflight.md) |
| V1 | PASS | [V1-rust-toolchain.md](V1-rust-toolchain.md) |
| V2 | PASS | [V2-appimage.md](V2-appimage.md) |
| V3 | PASS | [V3-launch.md](V3-launch.md) |
| V4 | PASS | [V4-fatal.md](V4-fatal.md) |
| V5 | PASS (focus read `NOT RUN`) | [V5-single-instance.md](V5-single-instance.md) |
| V6 | PASS | [V6-lint-typecheck-tests.md](V6-lint-typecheck-tests.md) |

Acquisitions: [acquisition-A02-A04-A05.md](acquisition-A02-A04-A05.md).

## Pinned ports, all free before and after each row

```
7831 free / 7832 free / 7833 free   (checked by binding, immediately before dispatch)
7831 free / 7832 free / 7833 free   (checked again after V3, V4 and V5 completed)
```

No port was substituted. No process from any run of this card was left behind:
`pgrep -fa "linux-resources/server/server.mjs|Apunta \(test\)"` returned
`no leftovers` after each of V3, V4 and V5.

## The bundled runtime was rebuilt, not assumed

`build/linux-resources/manifest.json` on disk was dated 2026-09-29 and did not
contain this card's server changes (`shell-bridge.ts` did not exist then), so
the bundle was rebuilt before V2 through P3.1's own script, which copies the
pinned Node tree, rebuilds `server/dist` and `web/dist`, re-bundles
`server/server.mjs` with esbuild, re-runs the A06 whisper build and rewrites the
manifest. Verified in the rebuilt bundle:

```
$ node -e "const s=require('fs').readFileSync('build/linux-resources/server/server.mjs','utf8'); \
  for (const t of ['data_folder_in_use','APUNTA_SHELL_NONCE','port_in_use','shell bridge']) console.log(t, s.includes(t))"
data_folder_in_use true
APUNTA_SHELL_NONCE true
port_in_use true
shell bridge true
```

The manifest after the rebuild: `nodeVersion 24.19.0`, 4804 files.