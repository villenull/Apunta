# V3 — launch, and the three ways this app can be asked to stop (attempt 2)

**Summary**

| Case | Harness mode | Exit | Result |
| --- | --- | --- | --- |
| signal (`SIGTERM`) | `launch` | 0 | **12/12 PASS** |
| cooperative window close | `window-close` | 0 | 7/7 PASS, **1 NOT RUN** (undeliverable here — measured below) |
| forced destroy (`XDestroyWindow`) | `forced-close` | 0 | **12/12 PASS** |

Ports: 7831 for all three (the card's V3 pin). Working directory: repository
root. Display: `xvfb-run -a -s '-screen 0 1400x1000x24'`, chosen and recorded by
the harness at run time. Run ids: `<sandbox>/2026-10-02T06-48-27-898Z-…`
(signal), `<sandbox>/2026-10-02T06-48-40-562Z-…` (window close),
`<sandbox>/2026-10-02T06-48-51-235Z-…` (forced destroy).

Exact command, per case (the `. env` step is the card's, and it is required —
`sandbox.mjs env` *prints* export lines):

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && \
node scripts/v2/sandbox.mjs env --port 7831 > build/p33-correct-v3-<mode>.env && \
. build/p33-correct-v3-<mode>.env && \
node scripts/v2/tauri-lifecycle.test.mjs <launch|window-close|forced-close>
```

`node --version` printed exactly `v24.19.0` for all three.

## First: what `xdotool`'s two close commands actually are

The review's D1 was reproduced with `xdotool windowclose` and described as a
window close. It is not one, and the distinction changes what the row can claim.
Both facts come from the installed tools on this host, not from memory.

**`xdotool windowclose` — a forced destroy.** From `man xdotool` on this machine:

```
     windowclose [window]
         Close a window. This action will destroy the window, but will not try
         to kill the client controlling it.
```

`XDestroyWindow` gives the application no chance to respond at all. What the app
sees is GDK's X error handler aborting the process — and it does, every time:

```
(apunta:319629): Gdk-WARNING **: 00:45:29.046: The program 'apunta' received an X Window System error.
  The error was 'BadDrawable (invalid Pixmap or Window parameter)'.
    (Details: serial 969 error_code 9 request_code 14 (core protocol) minor_code 0)
```

**`xdotool windowquit` — a request, to the window manager.** From the same man
page:

```
     windowquit [window]
         Close a window gracefully. This action sends a request, allowing the
         application to apply close confirmation mechanics.
```

The message it sends is `_NET_CLOSE_WINDOW`, established from the installed
binary rather than assumed:

```sh
strings /usr/lib/libxdo.so* | grep -E 'NET_CLOSE|WM_DELETE|WM_PROTOCOLS'
#   _NET_CLOSE_WINDOW
#   XSendEvent[_NET_CLOSE_WINDOW]
```

`_NET_CLOSE_WINDOW` is a **window-manager** message: a WM is supposed to receive
it and then send the application a `WM_DELETE_WINDOW` request in turn. Under
`xvfb-run` there is no window manager, so nothing routes it.

Measured twice on the app itself, on this host: after `xdotool windowquit
<the app's window>` the window was still in the window list, the process was
still alive, and `GET /api/health` still answered **200**. It is not that the
app ignored a close; nothing delivered one. (`windowkill`, which is
`XKillClient`, does kill the client — a third, different thing.)

**Consequence, stated plainly.** The cooperative native close **cannot be
exercised on this host**, and this attempt does not claim otherwise. It is
recorded `NOT RUN` with that cause. On the owner's desktop session, which has a
window manager, the same command routes properly and the same harness mode runs
for real; nothing in the harness needs changing for that.

## The window assertions (review D6), which are no longer satisfiable by a helper

The old row searched `xdotool search --name '^Apunta$'` and took the first match.
`--name` is **case-insensitive** and the app has a hidden **20×20 GTK helper
window named `apunta`**, which matches first — so the assertion could be
satisfied at GTK init, before any bridge line. Measured on the built AppImage:

```
saw [" 1400x1000@0,0 pid=0","apunta 20x20@20,20 pid=168697"," 1x1@-1,-1 pid=0","Apunta 1760x1200@36,26 pid=168697"," 1x1@15,11 pid=0"]
```

The new assertion requires **all** of: the name is exactly `Apunta` (compared as
a string, so the lowercase helper cannot match), the **owning pid** is this run's
shell, the window is at least 400×300 (so nothing 20×20 qualifies), and the
window lies **inside the display**. It also has to be *visible* content, not just
a title — see below.

### The window was genuinely off-screen, and that was a real defect

The review noted the real window was "mostly off-screen" on a 1400×1000 display
and that nothing asserted it. Once asserted, it failed — and the cause was the
app, not the harness:

```
Apunta 2560x1720@-960,-620        # attempt 1's bundle, on a 1400x1000 display
Apunta 1760x1200@36,26            # after fitting the requested size…
Apunta 1330x950@36,26             # …and after fitting the *minimum* size too
```

A fixed `inner_size(1280, 860)` plus `min_inner_size(880, 600)` plus `center()`
puts a window **off the screen** whenever the monitor is smaller than the
requested size — and on a scaled display the 880×600 *logical* floor is 1760×1200
*physical*, which clamps the window back **up** to its own minimum and hangs it
off the display again. On a 1400×1000 display, and on any small laptop, the app
was unusable.

`main_window_geometry()` now computes the size **and the position** from the
monitor, in physical pixels, divided by the monitor's scale factor before they
reach the builder (which takes logical units) — and the minimum size is fitted
too, because a floor bigger than the screen is no floor. Every run prints the
arithmetic:

```
apunta: the main window will be 1330x950 physical at 17.5,12.5 logical, on a 1400x1000 display at scale 2
```

### Render evidence: three pieces, because one would not do

A uniform screenshot proves very little and a non-uniform one proves less than it
looks: **a splash and an error screen are non-uniform too**. So the row now
asserts three independent things:

1. **A capture with real content, polled.** A webview that has just been mapped
   has not painted yet: the first capture measured **2** distinct colours and the
   same window measured **700** fifteen seconds later. The harness therefore
   polls (30 s budget) and requires ≥ 8 distinct colours, and prints the count:
   `179 distinct colours`, `290`, `271` across the three runs. What this rules
   out is the failure the old row could not rule out at all — a webview that
   never painted, which is one flat colour.
2. **The document the server actually served** at that origin: HTTP 200,
   `text/html`, 1265 bytes, containing the app's own `id="root"`. That is what
   the window is displaying, read over the same loopback origin C-BRIDGE@1
   confines it to.
3. **The title, owning pid, size and geometry** above.

## The quit assertions (review D7), which are no longer satisfied by SIGKILL

Attempt 1's `stopPid` sent `SIGTERM`, waited 5 s, then **SIGKILL**, and printed
`PASS V3 quit` — so the pass was the harness's own escalation, and the SIGTERM
rung was never asserted. `stopPid` now **returns whether it escalated**, and each
case asserts:

```
PASS V3 signal-quit the shell exits on its own, with no SIGKILL from this harness
```

…after waiting 20 s and requiring the shell to be gone **without** the harness
signalling it. Then the containment the quit was supposed to achieve, each its
own assertion:

```
PASS V3 signal-quit the port is released
PASS V3 signal-quit no server process from the run survives
PASS V3 signal-quit the data lock is released
```

- **the port** — `127.0.0.1:7831` free, or the row is unrepeatable.
- **the server process itself**, not just the socket, polled for 15 s: this is
  the reparented orphan D1 left behind, and a free port alone would not see it.
- **the data lock**: gone, or present and naming a pid that is **not** alive
  (parsed out of `apunta.lock`'s JSON, not matched as a substring).

And the containment that makes this a containment row, unchanged and unweakened:

```
PASS V3 signal-quit the unrelated dummy is still alive
PASS V3 signal-quit ollama is still running
```

### Full log, signal case (12/12)

```
  display: the inherited X display :99
PASS V3 signal-quit appimage: …/Apunta (test)_0.0.0_amd64.AppImage
PASS V3 signal-quit the app's own window is up, inside the display
PASS V3 signal-quit the window has rendered content
PASS V3 signal-quit the window is showing the app's own document
  V3 signal-quit window: 1330x950 at 36,26 on a 1400x1000 display, 179 distinct colours, document 1265 bytes
PASS V3 signal-quit server answers with this run id
PASS V3 signal-quit exactly one server process before the quit
PASS V3 signal-quit the shell exits on its own, with no SIGKILL from this harness
PASS V3 signal-quit the port is released
PASS V3 signal-quit no server process from the run survives
PASS V3 signal-quit the data lock is released
PASS V3 signal-quit the unrelated dummy is still alive
PASS V3 signal-quit ollama is still running
  --- the app's stderr ---
  apunta: spawned the bundled server as pid 324307
  MESA-EGL: warning: DRI3 error: Could not get DRI3 device
  MESA-EGL: warning: Ensure your X server supports DRI3 to get accelerated rendering
  apunta: ignoring a bridge line (Unreadable): {"level":30,…,"msg":"Server listening at http://127.0.0.1:7831"}
  apunta: the server is ready ({"type":"ready","port":7831,"nonce":"18daa…","version":"0.0.0","protocol":1}), version 0.0.0
  apunta: the main window will be 1330x950 physical at 17.5,12.5 logical, on a 1400x1000 display at scale 2
  apunta: the main window is open on http://127.0.0.1:7831
  apunta: a termination signal is closing the app; starting the quit ladder
  stopped the dummy (pid 324259) with SIGTERM

12/12 assertions passed
```

(`C-BRIDGE@1` rule 1 says the server prints "exactly one JSON line" on stdout;
the pino log line that arrives on the same stream is read, rejected as
`Unreadable`, logged and ignored — review D13's observation, unchanged.)

### Forced destroy (12/12) — the D1 failure, reproduced and then contained

```
PASS V3 forced-destroy the app's own window is up, inside the display
PASS V3 forced-destroy the window has rendered content
PASS V3 forced-destroy the window is showing the app's own document
  V3 forced-destroy window: 1330x950 at 36,26 on a 1400x1000 display, 271 distinct colours, document 1265 bytes
PASS V3 forced-destroy server answers with this run id
PASS V3 forced-destroy exactly one server process before the quit
  sent XDestroyWindow via xdotool windowclose (exit 0); this is a forced destroy, not a close request
PASS V3 forced-destroy the shell exits on its own, with no SIGKILL from this harness
PASS V3 forced-destroy the port is released
PASS V3 forced-destroy no server process from the run survives
PASS V3 forced-destroy the data lock is released
PASS V3 forced-destroy the unrelated dummy is still alive
PASS V3 forced-destroy ollama is still running
  --- the app's stderr ---
  … Gdk-WARNING **: received an X Window System error. The error was 'BadDrawable …'
12/12 assertions passed
```

The shell dies where it always did — GDK aborts it, and no code of ours runs. The
difference is what happens to the server afterwards. The shell holds the write
end of the child's stdin pipe; when it dies, the child sees **end-of-file** and
now closes itself (`server/src/shell-bridge.ts`'s `onParentGone`, wired in
`server/src/index.ts`). The port is released, no server process survives, and the
data lock is released — **without** the shell's ladder and without any signal,
because there is no shell left to send one. This is asserted, not assumed.

That containment is what the review called for when it said not to "merely assume
added `CloseRequested` handles fatal exits". It does not: `CloseRequested` never
fires here. It is a second, independent mechanism, and the row proves it works by
running the case where the first one cannot.

### Cooperative window close (7/7 + 1 NOT RUN)

```
PASS V3 window-quit the app's own window is up, inside the display
PASS V3 window-quit the window has rendered content
PASS V3 window-quit the window is showing the app's own document
  V3 window-quit window: 1330x950 at 36,26 on a 1400x1000 display, 290 distinct colours, document 1265 bytes
PASS V3 window-quit server answers with this run id
PASS V3 window-quit exactly one server process before the quit
  sent _NET_CLOSE_WINDOW via xdotool windowquit
NOT RUN V3 window-quit cooperative native close: the request was never delivered: xdotool windowquit sends
  _NET_CLOSE_WINDOW, a window-manager message, and this display has no window manager to route it. The app is
  untouched (window up, still serving), so nothing about it was tested. Recorded from the xdotool binary itself
  (strings libxdo: XSendEvent[_NET_CLOSE_WINDOW]).

7/7 assertions passed, 1 NOT RUN
```

The harness distinguishes "the app ignored the close" from "nothing here can
deliver it": after sending, it waits 5 s and checks whether the app is still up
**and** still serving. If both are true it records `NOT RUN` with the cause; if
either changed, the request *did* arrive and the result is a real one. `NOT RUN`
is never `PASS`, and the mode still exits 0 because the criterion could not run —
the card's rule, not an excuse.

**What covers the `CloseRequested` path instead.** The implementation is in
`src-tauri/src/main.rs` (a `WindowEvent::CloseRequested` handler that prevents the
close and hands the same `begin_quit` gate the other two doors use) and its
one-shot property is proven by the gate's own tests including an 8-thread race —
`attempt2-V1-rust-toolchain.md`. It is exercised end-to-end on any display with a
window manager, which this host does not have.

## Sandbox and containment

Every launch went through `scripts/v2/sandbox.mjs env --port 7831` with the
**test identity** (`app.apunta.desktop.test`) and a sandbox data folder. Nothing
touched port 7717, the live data folder, the owner's export or any Halaxy PDF.
Only pids this harness started were signalled; no `pkill` (C-ISO@1 rule 7) is in
the harness. 7831 was free before and after each case. The two harnesses-started
processes (the unrelated `sleep` dummy and the app) are the only things stopped.

Scratch: `build/p33-correct-v3-*.env`, `build/p33-correct-v3-*.log`,
`build/p33-correct-harness/` (window captures, deleted after counting), all under
the git-ignored `build/`.

## Honest note about this row's earlier executions

Several V3 runs during this attempt **failed before passing**, and the reasons
are worth recording rather than removing: a leftover app instance from an earlier
debug launch reaped the new one through the single-instance plugin (an empty
window list and a silent exit 0 — which looked exactly like a startup failure),
and `xvfb-run`'s default 640×480 screen is smaller than the app's minimum window,
which is why the harness now names its own screen size. Both were harness/host
state, not app defects; neither was worked around by weakening an assertion.