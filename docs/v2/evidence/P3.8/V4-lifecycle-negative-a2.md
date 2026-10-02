# P3.8 V4 — lifecycle negative control (attempt 2)

- **Status: NOT RUN** · exit **3**
- Cause, in the row's own words on stdout:
  `NOT RUN: launch 2 wrote ready before the pid line could be signalled, so the
  pre-ready exit was not exercised — NOT RUN, never PASS`
- This is the card's **recorded** race case for (d), and the card's instruction
  for it is explicit: `NOT RUN` with that cause, never a pass. Nothing was
  widened, retimed or repaired to turn it green.
- Launched through `scripts/v2/sandbox.mjs env --port 7860`, both launches and
  every `xdotool` probe inside one `xvfb-run -a`. Display used: **`:99`**
  (`xvfb-run -a` auto-selected; read from the row's companion diagnostic, below).
- Row capture directory `/tmp/apunta-v2-p3.8-v4` (outside the repository, not
  committed); sandbox run folders under `<sandbox>`.

| Field | Value |
| --- | --- |
| Working directory | repo root (`<repo>`) |
| Start (UTC) | 2026-10-02T21:03:49Z |
| End (UTC) | 2026-10-02T21:04:00Z |
| Launch 1 child pid / server pid | 1071966 / 1071996 |
| Launch 2 child pid / server pid | 1073188 / 1073216 (signalled target, from the pid line) |
| Port | 7860 |
| Wall clock | ~11 s total |

## Exact command

The card's V4 cell verbatim — `node scripts/v2/sandbox.mjs env --port 7860 >
/tmp/apunta-v2-p3.8-v4.env && . /tmp/apunta-v2-p3.8-v4.env && xvfb-run -a
bash -c '<row body>'`: launch 1, poll `/api/health`, snapshot every window with
`xdotool search --name '.*'` + `getwindowname` + `getwindowgeometry --shell`,
issue the marker request, `sleep 3`, snapshot again, run assertions (b)(c)(a),
read the server pid from `main.rs:221`, `SIGTERM`/`SIGKILL` that pid alone,
`sleep 3`, snapshot a third time, run (e) and (f), stop launch 1, then launch 2,
poll its capture up to 60 s for the pid line, and — before signalling — assert
that no `ready` line is present.

## Why it stopped: launch 2's race, measured

Launch 2's capture shows the ordering that makes the pre-ready window
unreachable on this host:

```
apunta: spawned the bundled server as pid 1073216
… (about 580 ms later)
apunta: the server is ready ({"type":"ready","port":7860,"nonce":"<nonce>",…})
```

The row polls the capture **once per second** for the pid line, so the pid line
can only be noticed at the first whole second — by which time the bundled server
has already written `ready`. The card anticipated exactly this and made it
`NOT RUN`. The margin was **not** widened: V4(d)'s 20 s poll, V4(e)'s 3 s,
V3's 120 s and launch 2's 60 s are card decisions, and the fix (a tighter poll,
or a signal sent from the pid line without waiting for it) is not this attempt's
to make.

## Launch 1: what the row's own captures contain

`$F` is never printed on this path — the row exits 3 at launch 2 before its
`FAIL:`/`V4 PASS` line — so **the row asserts nothing about launch 1**. The
following is a reading of the artefacts the row itself left in its capture
directory, recorded because the coordinator will ask, and labelled as a reading
rather than as a row result:

| Witness | Row's own artefacts | Reading |
| --- | --- | --- |
| (a) `show_main` exactly once | `grep -c "apunta: the main window is open on" l1.err` = **1**; `grep -c "apunta: the server is ready" l1.err` = **1** | count satisfied, but see the vacuity note: (a) reads the stream the change itself influences |
| (b) window set/geometry unchanged | `snap.before`, `snap.after`, `snap.postkill` are **byte-identical** (`diff -q` clean on both comparisons) | satisfied only vacuously — see below |
| (c) `ready` not swallowed | `ready` at line 6, marker at line 41 of `l1.err`, one `ready` line total | satisfied |
| (d) early exit preserved | launch 2 aborted before its snapshot loop; `snap.d` **does not exist** | **not exercised** |
| (e) no error screen after a settled `ready` | `snap.after` == `snap.postkill`, and no early-exit word in either | satisfied only vacuously — see below |
| (f) post-`ready` `ChildGone` logged, painting nothing | `grep -c "apunta: the server exited before it was ready" l1.err` = **1**; `grep -c "apunta: the error window could not be opened" l1.err` = **0** | satisfied on the logging half; the "paints nothing" half is the vacuous one |

## The vacuity: the window reader saw no title, ever

Every snapshot in this run is the same single window with an **empty name** and
the default geometry:

```
win 927  WINDOW=927
X=0
Y=0
WIDTH=640
HEIGHT=480
SCREEN=0
```

A companion diagnostic — a launch of the same AppImage through the same
`sandbox.mjs env --port 7860` inside `xvfb-run -a`, asserting nothing, recorded
here only to explain the snapshots — read:

```
display=:99
xdotool search --name .*        -> 927
getwindowname 927              -> ""      (empty)
xdotool search --onlyvisible   -> 927
wmctrl                         -> absent
```

So under a bare `xvfb-run` with **no window manager**, exactly one X window
exists and it carries no title; `640x480` is the X default, not a webview size.
The app's own window title (`Apunta`, or `Apunta — <code>` for the error screen)
was never observable in this row.

Consequence, stated plainly: **V4's (b) and (e) "no early-exit-word window
present" checks are vacuous here.** They would pass identically whether the
shell painted `Apunta — exited_before_ready` or nothing at all, which is the
failure mode the card names when it says an unobserved row must be `NOT RUN` and
"the card does not fall back to asserting the behaviour from the source text".
The negative control therefore **did not do its job this attempt**, and no
witness is claimed from it.

Note that the shell's own stderr is *not* silent on the point: `l1.err` contains
no `apunta: the error window could not be opened` line, and the (f) log line is
present. That is consistent with (e)/(f) holding, but it is the change judging
itself and it is reported as such, never as a pass.

## No process remains

Both launches were signalled by pid (`SIGTERM`, then `SIGKILL` on the same pid),
never by pattern; `pkill` was not used anywhere in this row (C-ISO@1 rule 7).
7860 is free afterwards and 7717 was never contacted.
