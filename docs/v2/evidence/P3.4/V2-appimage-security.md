# P3.4 — V2, the AppImage security row

Status: **FAIL** (exit 1) — **16 assertions PASS, 5 NOT RUN**, all five from
one cause. The five `NOT RUN`s are (a), (b), (c), (d)'s handler half and (e),
which the card says together block approval until the coordinator decides.

- Working directory: `/home/villenull/Projects/Apunta` (repository root)
- Start: 2026-10-02T19:07:48Z
- End: 2026-10-02T19:08:41Z
- Exit code: 1
- Sandbox run id: `2026-10-02T19-07-48-964Z-b166043b`, port **7835**
- The AppImage was stopped **by pid** (`stopped the shell (pid 464154) with
  SIGTERM`). No `pkill`, anywhere.

## Exact command

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && node scripts/v2/sandbox.mjs env --port 7835 > /tmp/apunta-v2-p3.4-v2.env && . /tmp/apunta-v2-p3.4-v2.env && node scripts/v2/tauri-security.test.mjs security
```

`node --version` printed exactly `v24.19.0`. `sandbox.mjs env` printed
`port=7835 data=<sandbox>/2026-10-02T19-07-48-964Z-b166043b/data`; those export
lines were sourced, so the child had `APUNTA_DATA_DIR`, `APUNTA_PORT` and
`APUNTA_NO_OPEN`.

## What passed

```
PASS V2 appimage: src-tauri/target/release/bundle/appimage/Apunta (test)_0.0.0_amd64.AppImage
PASS V2 the AppImage is newer than every Rule B input
PASS V2 no Rule B path named by git is newer than the AppImage
PASS V2 the app's own window is up
PASS V2 the server answers with this run id
PASS V2 (d) header: the SPA fallback HTML carries rule 6's six directives
PASS containment no server process from the run survives
PASS containment no second lock, database, -wal or -shm
PASS containment the sandbox port is free afterwards
PASS containment the observation channel is gone, and cannot ship
PASS containment ollama is still running
16/16 assertions passed, 5 NOT RUN
```

**The first three lines are what attempt 2 did not have.** Both Rule B
freshness assertions now hold, and (d)'s header half — the assertion the card
says "fails on an unmodified tree" — passes against the launched binary. All
five containment assertions pass. The fixture note was created over HTTP
(`format, patient and note all 201`) and was not opened, because opening it and
reading the page both need the channel.

## What did not run, and the precise cause

All five report the same cause, verbatim from the row:

> no `/api/p3.4-observe` line ever appeared in the AppImage child's captured
> stderr while the app window was up and the server was answering (0 marker
> line(s) read), so the observation hook publishes nothing this harness can
> read.

That sentence is the card's own stop condition, so all five are recorded
`NOT RUN` and **none is `PASS`**. No config-level reading was substituted for
any of them, and no threshold, count or assertion was relaxed (HS-7).

**The re-bundle is not the cause this time.** V0 ran, the bundle is fresh, and
the hook is demonstrably inside the shipped AppImage: the AppDir's
`usr/lib/Apunta (test)/linux-resources/web/dist/assets/index-DXrud9Kw.js`
contains `p3.4-observe` (1 occurrence, 1 of 16 bundles; the gate string in 0).
So the page V2 launched is the flagged page, and the hook's code did run.

### Why nothing arrived: the delivery leg is closed after `ready`

Three facts, each measured, none of them an assumption.

**1. The publisher works, with this exact CSP and this exact server.** The same
flagged bundle, the same bundled server and the same CSP were driven through a
real browser engine **inside a sandbox run** on the pinned port, with the
server's own log read afterwards. Six `/api/p3.4-observe` lines arrived, the
first of them the fact set:

```
p3.4-observe?href=http%3A%2F%2F127.0.0.1%3A7835%2F&title=Apunta&tauri=undefined
  &tauriInternals=undefined&probe=undefined&scriptText=false
  &styleAttr=color-scheme%3A+dark%3B&styleComputed=dark&attempt=
p3.4-observe?rects=1&batch=0&i0_x=0&i0_y=0&i0_w=0&i0_h=0&i0_l=Apunta
p3.4-observe?href=http%3A%2F%2F127.0.0.1%3A7835%2Fonboarding%2Fformat&title=Apunta&…
```

Two things are proved at once by that line: **the hook runs and publishes**, and
**`connect-src 'self'` permits the fetch**, so rule 6's CSP is not what silences
it. `styleComputed=dark` against `styleAttr=color-scheme: dark;` is also V2(e)'s
assertion read directly — a style attribute applied — had the channel carried
it.

**2. The server logs every such request to its stdout, in the bundled server.**
A request to `/api/p3.4-observe?href=…` produces, in the run folder's
`logs/server.log`:

```json
{"level":30,…,"req":{"method":"GET","url":"/api/p3.4-observe?href=http%3A%2F%2F127.0.0.1%2F&title=diag&tauri=undefined&tauriInternals=undefined&attempt=",…},"msg":"incoming request"}
{"level":30,…,"res":{"statusCode":404},…,"msg":"request completed"}
```

So the Fixed-decision chain's **first** leg (server stdout) holds for exactly
the URL the hook uses.

**3. The shell stops forwarding that stdout to stderr the moment it sees
`ready`.** `src-tauri/src/main.rs:319-325` is the whole of the second leg, and
the `Ready` arm `break`s out of `drive`'s loop. Everything the child writes
after that break is never printed, and once the receiver is gone the reader
thread's `reader_tx.send` fails and it exits too. The captured stderr from the
V2 run shows the shape of this exactly: it carries the **pre-`ready`** pino line
(`apunta: ignoring a bridge line (Unreadable): {"level":30,…,"msg":"Server listening at http://127.0.0.1:7835"}`)
and then nothing — not even the `incoming request` lines for the page's own HTML
and sixteen asset requests, which certainly happened after `ready`, because the
window was up and answering.

The ordering is what makes this structural rather than unlucky: the page cannot
load, and therefore the hook cannot publish, until *after* `ready` — the one
moment at which the forwarding stops.

### The remedy is one of the three the card forbids

Closing this gap means not breaking out of `drive` on `Ready`, or draining the
child's stdout for the life of the app: an edit to `src-tauri/src/main.rs`. The
card forbids, by name, "any `src-tauri/**` edit made to open a channel", and
forbids a second hook, a second marker path and any change to the gate. **No
file was edited for this**, and S4 was not entered: no guard was shown not to
hold — the five assertions were unreadable, not false.

So the card's own stop condition stands and the decision is the coordinator's:
the delivery path in Fixed decisions ("the reader thread drains line by line and
re-emits to stderr") does not carry anything after `ready`, and V2(a)–(c),
(d)'s handler half and (e) cannot be read through it as written.

## What a reviewer should press on

- **This is not attempt 1's failure.** Attempt 1's in-page channel was never
  readable (no reply across sixteen framings and thirteen method names). Here
  the publisher is proved to work and the transport is proved to be closed. A
  different defect, in a different leg, with the same visible symptom.
- **The diagnostic was deliberately outside the row.** The browser run and the
  server-log run are not assertions and changed nothing: no second hook, no
  second marker path, no new file in the repository, no change to any assertion.
  They exist only to tell the coordinator *which* leg is broken, because "no
  marker line" alone would be ambiguous between a hook that does not run and a
  channel that does not carry. Both scratch scripts lived outside the
  repository and were deleted.
- **`__TAURI__` and `__TAURI_INTERNALS__` were `undefined` in that diagnostic
  page too** — the first line's `tauri=undefined&tauriInternals=undefined` — so
  (a)'s expected reading is the one the engine produces. It is still `NOT RUN`
  in V2, because the card requires it to be read in the shipped binary through
  this channel and not somewhere else.

## Diagnostics run, for the record

| Purpose | Command (abridged) | Port | Result |
| --- | --- | --- | --- |
| server logs a marker request to stdout | `sandbox.mjs run --port 7835 -- bash -c 'curl …/api/p3.4-observe?…; curl …/'` then read the run's `logs/server.log` | 7835 | `incoming request` with the full marker URL present |
| the hook runs and publishes under this CSP | `sandbox.mjs run --port 7835 --` with `APUNTA_WEB_DIST` set to the flagged bundle, loading `/` in a local Chromium | 7835 | 6 marker lines; fact set and rect batch both delivered |

Both ran inside `scripts/v2/sandbox.mjs`, in `/tmp/apunta-v2/<runId>/`, on the
card's pinned port. No live data directory was opened and port 7717 was never
contacted.