# P3.4 — V3, the config-level greps

Status: **PASS** (exit 0). Each command's result is recorded separately, because
the row's own exit code is only the last one's.

- Working directory: `/home/villenull/Projects/Apunta` (repository root)
- Start: 2026-10-02T19:14:37Z
- End: 2026-10-02T19:14:37Z
- Exit code of the row: 0 (the third command)

## Exact command

```sh
grep -rn "invoke_handler\|withGlobalTauri\": true" src-tauri/src src-tauri/tauri.conf.json src-tauri/tauri.test.conf.json src-tauri/build.rs
test ! -e src-tauri/capabilities
! grep -rn "VITE_APUNTA_TEST_IDENTITY\|p3.4-observe" src-tauri/src src-tauri/tauri.conf.json src-tauri/tauri.test.conf.json src-tauri/build.rs
```

## Results

| # | Command | Exit | Reading |
| --- | --- | --- | --- |
| 1 | `grep -rn "invoke_handler\|withGlobalTauri\": true" …` | **1** | **exit 1 from this grep is the pass** — no matches, so no custom `invoke_handler` and no `withGlobalTauri: true` in either config or in `build.rs` |
| 2 | `test ! -e src-tauri/capabilities` | **0** | the directory is absent, which is the pass |
| 3 | `! grep -rn "VITE_APUNTA_TEST_IDENTITY\|p3.4-observe" …` | **0** | the `!` grep found nothing: **neither the gate string nor the marker path appears anywhere in the files the AppImage is built from** |

Each command wrote nothing to the log, which is why this file is three exit
codes and no output.

**What command 3 is worth saying again:** the hook's bound is asserted in the
repository and not only at run time. A gate string under `src-tauri/` would be
baked into every build of the shell and a marker path there would name a
channel in a shipped binary; both must match nothing. The gate is resolved by
Vite at **web build** time and the hook exists only in a flagged bundle, and V0
asserts that bundle never reaches `web/dist` — this grep is the other half, on
the shell side.

These are the config-level readings the card calls a **report** and never a
substitute for (a), (b), (c), (d)'s handler half and (e). They are recorded
here as what they are, and V2's five `NOT RUN`s are not downgraded because of
them.