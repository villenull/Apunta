# P3.8 V3 — the child's stdout is forwarded after `ready` (attempt 3)

- **Status: PASS** · exit **0**. Printed by the row itself: `V3 PASS`.
- Sandbox: `node scripts/v2/sandbox.mjs env --port 7860`, run folder
  `<sandbox>/2026-10-02T22-50-51-736Z-702422ea`. **`sandbox.mjs env`, never
  `run`** — `run` starts a server of its own and the app then refuses with
  `data_folder_in_use`.
- The whole row — the launch and every probe — ran inside one `xvfb-run -a`
  (auto-selected display; this row opens no window it reads by name, so it does
  not pin the screen and does not record a geometry).

| Field | Value |
| --- | --- |
| Working directory | repo root (`<repo>`) |
| Start (UTC) | 2026-10-02T22:50:51Z |
| End (UTC) | 2026-10-02T22:51:01Z |
| Exit code | 0 |
| Child pid (the AppImage, `$!`) | 1489374 |
| Server pid, from `main.rs:221` | 1489403 |
| Port | 7860 |
| Wall clock | ~10 s total; `/api/health` answered in ~2 s of the 120 s budget |

## Exact command

The card's V3 cell verbatim, with the GFM `\|` table escapes de-escaped to `|`
and nothing else changed:

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && node scripts/v2/sandbox.mjs env --port 7860 > /tmp/apunta-v2-p3.8-v3.env && . /tmp/apunta-v2-p3.8-v3.env && xvfb-run -a bash -c '<row body: launch, poll /api/health, marker request, sleep 3, take the server pid from main.rs:221, SIGTERM then SIGKILL that pid alone, SIGTERM then SIGKILL the child pid alone, then assertions (a)(b)(c)>'
```

## Excerpt — the captured child stderr (`<sandbox>/../child.err`), sanitized

```
child-pid=1489374
server-pid=1489403
apunta: spawned the bundled server as pid 1489403
MESA-EGL: warning: DRI3 error: Could not get DRI3 device
apunta: ignoring a bridge line (Unreadable): {"level":30,...,"msg":"Server listening at http://127.0.0.1:7860"}
apunta: the server is ready ({"type":"ready","port":7860,"nonce":"<nonce>","version":"0.0.0","protocol":1}), version 0.0.0
apunta: the main window is open on http://127.0.0.1:7860
...
apunta: ignoring a bridge line (Unreadable): {...,"req":{"method":"GET","url":"/api/health?p38marker=<runId>","host":"127.0.0.1:7860",...},"msg":"incoming request"}
apunta: ignoring a bridge line (Unreadable): {...,"reqId":"req-d","res":{"statusCode":200},"responseTime":18.99...,"msg":"request completed"}
...
apunta: the server exited before it was ready (exited_before_ready)
apunta: a termination signal is closing the app; starting the quit ladder
V3 PASS
```

## What the row's own assertions read (from the row's artefacts, not from this prose)

| Assertion | Artefact | Value |
| --- | --- | --- |
| (a) `ready` line present | `<D>/ready.line` | capture line **6** |
| (b) a line naming `p38marker` present | `<D>/marker.line` | capture line **34** |
| (c) the marker follows `ready` | 6 < 34 | **held**; the row prints `V3 PASS` |

## Counts

- **`ready` lines in the capture: 1.**
- **`apunta: the main window is open on …` lines (`show_main` executions): 1.**
- No second `ready`, so Stop condition 1 was not reached, and no guard was added
  to the `ready` arm (that would be a third part).

## Note on the child's own exit

The row's last act is to signal the server pid, and the capture then ends
`apunta: the server exited before it was ready (exited_before_ready)` — the
`ChildGone` **log line**, which the card requires to be present (logged, not
swallowed). The *painted* half of that claim — that nothing was painted — is not
readable from a log and is V4(e)'s job. V4 passed, so it is witnessed; V3 alone
would not establish it, and the change judging its own log is not a control.
