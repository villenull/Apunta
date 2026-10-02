# P3.8 V4 — lifecycle negative control (attempt 3)

- **Status: PASS** · exit **0**. Printed by the row itself: `V4 PASS`.
- **This is the row attempt 2 could not run, and it ran.** Both of attempt 2's
  causes are gone: the row now forces the X11 backend, so windows are positively
  identifiable, and the pre-`ready` kill is polled at 50 ms.
- Sandbox: `node scripts/v2/sandbox.mjs env --port 7860`, run folder
  `<sandbox>/2026-10-02T22-51-16-122Z-8f8c03f8`. **`env`, never `run`** — `run`
  starts a server of its own and the app then refuses with `data_folder_in_use`.
- All four launches **and every `xdotool` probe** ran inside one
  `xvfb-run -a -s "-screen 0 1400x1000x24"`, so every probe read the same
  display the app was on. Nothing else on the desktop was running concurrently.

| Field | Value |
| --- | --- |
| Working directory | repo root (`<repo>`) |
| Start (UTC) | 2026-10-02T22:51:16Z |
| End (UTC) | 2026-10-02T22:51:30Z |
| Exit code | 0 |
| **Display geometry the row was given** | **1400x1000** (`xdotool getdisplaygeometry` → `1400 1000`), as pinned |
| Port | 7860 (held by the row itself for launch 3, released by pid before launch 4, free at the end) |
| Launch 1 child pid / server pid | 1490387 / 1490420 |
| Port holder pid (the row's own `python3`) | 1491360 |
| Launch 3 child pid (7860 held) | 1491384 |
| Launch 4 child pid / server pid (SIGKILLed pre-`ready`) | 1491651 / 1491687 |
| Wall clock | ~14 s total |

## Exact command

The card's V4 cell verbatim, with the GFM `\|` table escapes de-escaped to `|`
and nothing else changed. The three shell functions the card defines — `snap`,
`appsnap <pid>`, `earlyexit <file>` — were **not** touched: `snap` reads four
separate `xdotool` values per window, `appsnap` selects on the **owner-pid
field** with `grep -E "^[^:]+:$1:"`, and `earlyexit` is still a **loop over the
three words**, emitting no alternation.

## The backend settings: confirmed inherited

This was the one assumption the review could not verify. It is verified here,
positively and from the outside:

- `GDK_BACKEND=x11`, `XDG_BACKEND=x11` and `unset WAYLAND_DISPLAY` are set as
  the row body's first statements, inside `bash -c`, before any launch, so all
  four launches inherit them.
- The consequence is observable in the row's own artefacts: the X server carries
  **named windows owned by each shell pid** (below), which is only possible if
  the app opened X11 windows. Had it inherited the session's Wayland backend
  there would be no compositor under `xvfb-run`, the enumeration would be
  **empty** (the attempt-2 false green, AM-159), and the row's `test -s` gates
  would have stopped it `NOT RUN` naming that cause.
- Corroborating, from launch 1's own stderr: `apunta: the main window will be
  1330x950 physical at 17.5,12.5 logical, on a 1400x1000 display at scale 2` —
  the app read the pinned X display.

## Every window the row identified, by owner pid

`id:owner-pid:title:geometry`

| Launch | Owner pid | Window |
| --- | --- | --- |
| 1 (before the marker request) | 1490387 | `2097153:1490387:apunta:WINDOW=2097153 X=20 Y=20 WIDTH=20 HEIGHT=20` (the hidden GTK helper — differs from the app window's title only by case, and does not match `:Apunta:`) |
| 1 (before the marker request) | 1490387 | **`2097190:1490387:Apunta:WINDOW=2097190 X=36 Y=26 WIDTH=1330 HEIGHT=950`** ← the identified main window, `1330x950`, above the app's 880x600 minimum |
| 1 (after the marker request) | 1490387 | byte-identical to the two above (`diff -q` clean) |
| 1 (3 s after the post-`ready` server kill) | 1490387 | byte-identical again — **the app window survived the server's death** |
| 3 (7860 held by the row) | 1491384 | **`2097190:1491384:Apunta — port_in_use:WINDOW=2097190 X=140 Y=120 WIDTH=1120 HEIGHT=760`** |
| 4 (server SIGKILLed pre-`ready`) | 1491651 | **`2097187:1491651:Apunta — terminated_before_ready:WINDOW=2097187 X=140 Y=120 WIDTH=1120 HEIGHT=760`** |

Every snapshot was non-empty, and the row gates each of the pre-`ready` ones on
being non-empty, so no absence witness was ever read off an empty list. The
whole display also carried the X root `927:::…1400x1000…` and two 1x1 nameless
windows, which `appsnap` excludes structurally (a nameless window cannot produce
`^[^:]+:<pid>:`).

## The seven witnesses

| ID | Witness | Held? | What was observed |
| --- | --- | --- | --- |
| **(a)** no re-navigation (supporting) | exactly one `apunta: the main window is open on …` in launch 1's capture | **yes** | count = **1** |
| **(b)** the window was not re-opened (primary, positive) | whole-display snapshot, app-owned set byte-identical across the marker request, and the identified main window's id still present | **yes** | `snap.before` == `snap.after`; `win.main0` == `win.after`; `2097190:1490387:` present in `win.after`. No second owned window appeared |
| **(c)** `ready` is not swallowed (supporting) | exactly one `ready` line, at a lower line number than the marker | **yes** | count = **1**; `ready` at capture line **5**, marker at line **11** |
| **(d1)** a pre-`ready` `fatal` still paints (primary, no race) | **exactly one** window owned by the shell titled with `port_in_use`, and **no** window owned by it titled `Apunta` | **yes** | `Apunta — port_in_use` present (1120x760); no `:Apunta:` window. Launch 3's capture contains **no** `ready` line — the server could not bind, so nothing settled |
| **(d2)** `ChildGone` before `ready` still paints (primary) | exactly one window owned by the shell titled with one of the shell's own early-exit words, and no `Apunta` window | **yes** | `Apunta — terminated_before_ready` present (1120x760); no `:Apunta:` window. The pid line was caught at 50 ms polling and `SIGKILL`ed; launch 4's capture contains **no** `ready` line, so the pre-`ready` exit really was exercised |
| **(e)** stopping the server after a settled `ready` paints nothing (primary, positive) | 3 s after the post-`ready` `SIGTERM`: whole-display snapshot byte-identical, app-owned set byte-identical, identified main window's id still present | **yes** | `snap.after` == `snap.postkill`; `win.after` == `win.postkill`; `2097190:1490387:` still in `win.postkill`. **No new owned window — nothing was painted — and the app window was not taken down** |
| **(f)** anything after a settled `ready` is logged and ignored (log half, supporting (e)) | the `ChildGone` log line present; no `apunta: the error window could not be opened` | **yes** | 1 × `apunta: the server exited before it was ready (exited_before_ready)`; 0 × `apunta: the error window could not be opened` |

Both **absence** witnesses that attempt 2 recorded as *vacuous* — (b)'s and
(e)'s "nothing new appeared" — are now statements about windows the row
positively named by owner pid and exact title, so they can fail. The row did not
manufacture a post-`ready` `fatal`, and must not: no code path produces one
(`server/src/index.ts` writes `Fatal` only at startup), and a server-side
producer would be Stop condition 2. Clause (c) is therefore asserted over the
events the run can actually produce — the post-`ready` `ChildGone` — as the card
directs.

## Launch 1 stderr, sanitized (`<host>` for the hostname, `<sandbox>` for the run folder, `<nonce>` for the nonce)

```
apunta: spawned the bundled server as pid 1490420
apunta: ignoring a bridge line (Unreadable): {...,"msg":"Server listening at http://127.0.0.1:7860"}
apunta: the server is ready ({"type":"ready","port":7860,"nonce":"<nonce>","version":"0.0.0","protocol":1}), version 0.0.0
apunta: the main window will be 1330x950 physical at 17.5,12.5 logical, on a 1400x1000 display at scale 2
apunta: the main window is open on http://127.0.0.1:7860
apunta: ignoring a bridge line (Unreadable): {...,"req":{"method":"GET","url":"/api/health","host":"127.0.0.1:7860",...},"msg":"incoming request"}
apunta: ignoring a bridge line (Unreadable): {...,"req":{"method":"GET","url":"/api/health?p38marker=<runId>","host":"127.0.0.1:7860",...},"msg":"incoming request"}
... (the page's own asset, font and API requests, forwarded verbatim) ...
apunta: the server exited before it was ready (exited_before_ready)
apunta: a termination signal is closing the app; starting the quit ladder
```

## Launch 3 stderr (the row held 7860), sanitized

```
apunta: spawned the bundled server as pid 1491443
apunta: the server refused to start: {"type":"fatal","code":"port_in_use"}
apunta: the code means: the port was already taken
apunta: a termination signal is closing the app; starting the quit ladder
```

**The early-exit word this launch's error screen actually carried:
`port_in_use`.**

## Launch 4 stderr (server SIGKILLed on the pid line), sanitized

```
apunta: spawned the bundled server as pid 1491687
apunta: the server exited before it was ready (terminated_before_ready)
apunta: a termination signal is closing the app; starting the quit ladder
```

**The early-exit word this launch's error screen actually carried:
`terminated_before_ready`.**

## Cleanup

Every pid the row started was signalled **by pid** and never by pattern; no
`pkill` (C-ISO@1 rule 7). The port holder was released by pid before launch 4
and by the row's `trap … EXIT` on every exit path. After the row: **7860 is
free**, no `Apunta (test)` process and no `Xvfb` process remains, and **7717 was
never contacted**.
