# V3 — the config greps

**Status: PASS.** Each of the row's three commands recorded separately, because
the row's own exit code is the last one's.

- Working directory: the repository root.
- Command: `grep -rn "invoke_handler\|withGlobalTauri\": true" src-tauri/src src-tauri/tauri.conf.json src-tauri/tauri.test.conf.json src-tauri/build.rs; test ! -e src-tauri/capabilities; ! grep -rn "VITE_APUNTA_TEST_IDENTITY\|p3.4-observe" src-tauri/src src-tauri/tauri.conf.json src-tauri/tauri.test.conf.json src-tauri/build.rs`
- Exit code: **0** (the third command's).
- Start / end time: 2026-10-02T18:18:28Z / 2026-10-02T18:18:28Z.
- Sandbox: none.

| # | Command | Exit | Meaning |
| --- | --- | --- | --- |
| 1 | `grep -rn "invoke_handler\|withGlobalTauri\": true" src-tauri/src src-tauri/tauri.conf.json src-tauri/tauri.test.conf.json src-tauri/build.rs` | **1** | no matches — **exit 1 is the pass**. No custom `invoke_handler` command and no `withGlobalTauri: true`, in either config. `tauri.test.conf.json` is in the list because `tauri:build:test` merges it into the config the AppImage V2 launches is built from, so a `true` there would reach the binary while a grep that never looked would still be green. |
| 2 | `test ! -e src-tauri/capabilities` | **0** | the directory is absent. This is the row that fails if a capability is ever added: the pattern list above would still pass on a capability file and only this command sees it. |
| 3 | `! grep -rn "VITE_APUNTA_TEST_IDENTITY\|p3.4-observe" src-tauri/src src-tauri/tauri.conf.json src-tauri/tauri.test.conf.json src-tauri/build.rs` | **0** | the `!` inverts, so exit 0 means **grep found nothing**. |

## What command 3 is asserting, and why it is on this row

This command is new in this card's repair and it **replaces** the bound the row
used to carry for the in-page channel it has now dropped. It asserts the same
thing the inspector variable was asserted against, for the mechanism that
replaced it:

> neither the gate string nor the marker path may appear anywhere in the files
> the AppImage is built from.

A gate string under `src-tauri/` would be baked into every build of the shell, and
a marker path there would name a channel in a shipped binary. The gate is resolved
by Vite at **web build** time and the hook exists only in a flagged bundle; V0's
release invariant asserts that bundle never reaches `web/dist`, and this grep is
the other half, on the shell side. Together they are what makes
"impossible in a release build" a property of the repository rather than a claim
about one row.

`test ! -e` is used rather than `ls` so that a missing directory is the pass.

Nothing in this row was relaxed to make it pass (HS-7). The greps were run over
the file list the card names, and no pattern was narrowed.