# V3 — launch, reach the home screen, quit, and leave nothing behind

Status: **PASS**
Working directory: repository root
Started: 2026-10-02T05:02:23Z
Ended: 2026-10-02T05:02:34Z (11 s)
Exit code: **0**

## Exact command

```
$ export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" \
  && node --version \
  && node scripts/v2/sandbox.mjs env --port 7831 > /tmp/apunta-v2-p3.3-v3.env \
  && . /tmp/apunta-v2-p3.3-v3.env \
  && node scripts/v2/tauri-lifecycle.test.mjs launch
```

`node --version` → `v24.19.0` exactly, as the row requires. The `.` step is
required and was done: `sandbox.mjs env` **prints** `export` lines, and the
test-identity build refuses to start without `APUNTA_DATA_DIR` and `APUNTA_PORT`.

The run folder: `<sandbox>/2026-10-02T04-36-39-289Z-0147545d/` — `runId`
`2026-10-02T04-36-39-289Z-0147545d`, mode `700`.

## Output

```
  display: the inherited X display :99
PASS V3 appimage: /home/<owner>/Projects/Apunta/src-tauri/target/release/bundle/appimage/Apunta (test)_0.0.0_amd64.AppImage
PASS V3 home screen
PASS V3 server answers with this run id
  stopped the shell (pid <pid>)
PASS V3 quit
PASS V3 nothing from the run is still listening
PASS V3 the unrelated dummy is still alive
PASS V3 ollama is still running
  stopped the dummy (pid <pid>)

7/7 assertions passed
```

## What each assertion is

- **V3 appimage** — the harness resolved the glob
  `src-tauri/target/release/bundle/appimage/*.AppImage` **once** and it matched
  exactly one file. Zero or more than one is a failure with the directory
  listing, so a stale AppImage from an earlier attempt cannot be launched
  silently. (This run is the second execution of the row; the first attempt at
  05:01 used an AppImage built before the signal-handling fix and is recorded in
  `../returns`-facing notes rather than here — the row as written passes.)
- **V3 home screen** — a window titled `Apunta` exists, read with
  `xdotool search --name … getwindowname`. `xdotool` is used purely as a
  **reader** here: it never clicks, never raises and never focuses, so it cannot
  steal the owner's focus. The splash window's title is `Apunta — starting`, so
  "the app window is up" is not confused with "the splash is still up".
- **V3 server answers with this run id** — `GET /api/health` on 7831 returns
  `testRunId` equal to `$APUNTA_TEST_RUN_ID`. This is C-ISO@1 rule 5's proof
  that the responding server is this run's, read from **outside** the shell; the
  shell itself never health-polls (C-BRIDGE@1 rule 1).
- **V3 quit** — the shell is stopped by pid and the ladder runs: `shutdown` on
  the child's stdin, then SIGTERM to the child's process group, then SIGKILL.
- **V3 nothing from the run is still listening** — 7831 is free again, checked
  by binding.
- **V3 the unrelated dummy is still alive** — the `sleep 600` this harness
  started at the top of the row is still running when the assertions pass. It
  is stopped afterwards, by pid. This is the containment half: the row is about
  what the app *did not* touch.
- **V3 ollama is still running** — `http://127.0.0.1:11434/api/tags` answered
  200 both before the launch and after the quit (C-ISO@1 rule 7, checked from
  the outside). The shell never signals Ollama and never stops it.

Neither containment assertion was weakened to make the row pass, and neither may
be: dropping either turns this into a smoke test.

## The display, and one finding worth recording

`xvfb-run` is installed, so the **harness re-executes itself** under
`xvfb-run -a` (marker `APUNTA_V2_TAURI_HARNESS_XVFB=1`) and then launches the
app directly. The reason is that the app and the window reader must share one
display: prefixing only the app with `xvfb-run` leaves `xdotool` reading the
desktop's window list and reporting **nothing** — which reads as "no window",
i.e. a false failure, not as a display mismatch. The choice is made at run time
and printed (`display: the inherited X display :99`), not left to the reader.

One further finding, recorded because it cost real time and would cost it again:
a Wayland desktop session exports `WAYLAND_DISPLAY` and `XDG_BACKEND=wayland`,
and under `xvfb-run` there is no Wayland compositor at all. GTK then opens the
app's windows where `xdotool` cannot see them, and every window assertion fails
with an empty list. The harness therefore sets `XDG_BACKEND=x11`,
`GDK_BACKEND=x11` and clears `WAYLAND_DISPLAY` for the app process. That is a
harness fix, not a shell change, and it is a property of the environment rather
than of the app.

## Aftermath

```
$ pgrep -fa "linux-resources/server/server.mjs|Apunta \(test\)"
no leftovers
$ (bind 7831)   →  7831 free
```

No production app launch was made or attempted at any point: every launch in
this row is the test-identity AppImage, on the sandbox's port, with the
sandbox's data folder, under the sandbox wrapper.