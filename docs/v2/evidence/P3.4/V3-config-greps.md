# V3 — the three configuration greps

**Status: PASS.** Each command's result is recorded separately, because the row's
own exit code is the last one's.

- Working directory: the repository root.
- Command:

  ```sh
  grep -rn "invoke_handler\|withGlobalTauri\": true" src-tauri/src src-tauri/tauri.conf.json src-tauri/tauri.test.conf.json src-tauri/build.rs; test ! -e src-tauri/capabilities; ! grep -rn "WEBKIT_INSPECTOR" src-tauri/src src-tauri/tauri.conf.json src-tauri/tauri.test.conf.json src-tauri/build.rs
  ```

- Row exit code: **0**.
- Start / end time: 2026-10-02T17:04:41Z / 2026-10-02T17:04:41Z.

## Each command's own result

| # | Command | Exit | Verdict |
| --- | --- | --- | --- |
| 1 | `grep -rn "invoke_handler\|withGlobalTauri\": true" …` | **1** | **the pass** — no matches, so no custom `invoke_handler` and no `withGlobalTauri: true` |
| 2 | `test ! -e src-tauri/capabilities` | **0** | **the pass** — the directory is absent, so no capability exists for any webview origin |
| 3 | `! grep -rn "WEBKIT_INSPECTOR" …` | **0** | **the pass** — nothing under `src-tauri/` names the inspector variable, so no build can bake an inspector socket in |

Row exit code 1 from command 1, 0 from command 2 and 0 from command 3, so the
row's own exit code is 0.

## Why command 3 exists

It is S3's bound asserted in the repository and not only at run time. The harness
sets `WEBKIT_INSPECTOR_SERVER` **in the environment of the AppImage child process
it spawns** (`scripts/v2/tauri-security.test.mjs`, `launchApp`) and nowhere else;
a copy of the string under `src-tauri/` would be compiled into the binary and
would open an inspector socket in *any* build, which is precisely what the card
requires to be impossible in a release build.

`src-tauri/tauri.test.conf.json` and `src-tauri/build.rs` are in all three file
lists because `tauri:build:test` merges the former into the config the AppImage is
built from, so a `withGlobalTauri: true` there would reach the binary while a grep
that never looked at it stayed green.
