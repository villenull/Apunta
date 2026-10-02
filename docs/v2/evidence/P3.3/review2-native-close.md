# P3.3 attempt 2 — the native close, investigated rather than accepted

Reviewer: independent implementation reviewer. **Verification only.** No feature
file, no harness, no threshold and no guard was edited; the helper described
below lives in the git-ignored `build/p33-review2/` and ships nowhere.

## The claim under test

Attempt 2 records the cooperative native close as **NOT RUN** with this cause
(`attempt2-findings-disposition.md`, and the harness's own comment at
`scripts/v2/tauri-lifecycle.test.mjs:798-821`): *"`xdotool windowquit` sends
`_NET_CLOSE_WINDOW`, a window-manager message that nothing routes under
`xvfb-run`, so `CloseRequested` cannot be reached from outside on this host."*

Review 1 accepted that in its assumptions. I was told not to accept it without
investigating, so I did.

## What the local tools can and cannot do

Read first, from what is already on this machine — no install, no new package,
no window manager:

| Route | What it actually sends | Reaches `CloseRequested` under a bare Xvfb? |
| --- | --- | --- |
| `xdotool windowquit` | `_NET_CLOSE_WINDOW` **client message to the root window** — a *window-manager* message. `strings /usr/lib/libxdo.so` shows `XSendEvent[_NET_CLOSE_WINDOW]`. | **No.** Measured: window still listed, process alive, `/api/health` still 200. The harness is right about this route. |
| `xdotool windowclose` | `XDestroyWindow` — a forced destroy, not a request. GDK's X error handler aborts the shell (`BadDrawable`, error_code 9). | No, and never a close. |
| **`XSendEvent` of the ICCCM `WM_DELETE_WINDOW` client message straight to the app's own window** | exactly what a window manager sends when the close button is pressed | **Yes.** |

The third route needs no window manager, no package and no new dependency: the
existing `libX11.so.6` through Python's `ctypes`. The helper reads the window's
`WM_PROTOCOLS` property, refuses to send anything the window does not advertise,
and then sends the `ClientMessage` (`type=33`, `message_type=WM_PROTOCOLS`,
`format=32`, `data.l[0]=WM_DELETE_WINDOW`, `data.l[1]=CurrentTime`, empty event
mask, per ICCCM).

One correction to a thing I got wrong first, recorded because it is the kind of
detail that makes a negative result meaningless: **ICCCM atoms are not
predefined.** This host's `/usr/include/X11/Xatom.h` stops at 68 and has
`XA_WINDOW` at 33; `WM_PROTOCOLS` must be interned by name. My first two helper
versions hard-coded 39 and 33, read `WM_NAME` (6 bytes, format 8) and an absent
property, and reported "the window does not advertise WM_DELETE_WINDOW" — a
false negative produced entirely by the constant. With `XInternAtom` by name it
reads correctly.

## What the app's window actually advertises

```
$ DISPLAY=:96 xprop -id 2097190 WM_PROTOCOLS
WM_PROTOCOLS(ATOM): protocols  WM_DELETE_WINDOW, WM_TAKE_FOCUS, _NET_WM_PING, _NET_WM_SYNC_REQUEST
$ DISPLAY=:96 xprop -id 2097190 _NET_WM_PID WM_CLASS
_NET_WM_PID(CARDINAL) = 429739
WM_CLASS(STRING) = "apunta", "Apunta"

# the ctypes helper, independent of xprop:
WM_PROTOCOLS on 0x200026: rc=0 atoms=[(233, 'WM_DELETE_WINDOW'), (236, 'WM_TAKE_FOCUS'),
                                      (248, '_NET_WM_PING'), (260, '_NET_WM_SYNC_REQUEST')]
WM_DELETE_WINDOW atom = 233; advertised = True
```

`WM_DELETE_WINDOW` (atom 233) **is** advertised, by the shell's own real toplevel
window, on a display with no window manager at all.

## The native close, executed — full containment, same assertions as V3

Real AppImage (`Apunta (test)_0.0.0_amd64.AppImage`, rebuilt in V2), test
identity, `sandbox.mjs env --port 7831`, isolated Xvfb `:96` at 1400×1000×24,
`WAYLAND_DISPLAY` unset and `XDG_BACKEND=GDK_BACKEND=x11` so nothing can reach
the owner's session.

```
DISPLAY=:96 APUNTA_PORT=7831 DATA=<sandbox>/data
dummy pid 429737
ollama before 200
shell pid 429739
window '2097190' geometry: Position: 36,26 (screen: 0) Geometry: 1330x950
display: 1400 1000
screenshot colours: 701
server processes before: 1
send_event 1 mask 0 -> 1                    # ICCCM WM_DELETE_WINDOW, XSync after the send
shell gone on its own: yes (after 300ms)
port free: yes
server processes after: 0
lock file: absent
dummy alive: yes
ollama after 200
```

and the shell's own words, which is the proof that this was the **real**
`CloseRequested` door and not a simulated gate callback:

```
apunta: the main window is open on http://127.0.0.1:7831
apunta: the window close is closing the app; starting the quit ladder
```

Every containment assertion the card's V3 asks for, on a **cooperative close**:
the shell exited **on its own in ~300 ms** — no SIGKILL, no SIGTERM from me, no
harness escalation — the port was released, no bundled server process survived,
`apunta.lock` was removed, the unrelated dummy was still alive, Ollama answered
200 before and after, and no window or AppImage FUSE mount was left behind. The
window that received the message was matched by exact name **and** owning pid,
which is how review 1's D6 was answered.

Reproducibility, honestly reported:

| Attempt | Display | Form | Outcome |
| --- | --- | --- | --- |
| 1 | `:96` | `send_event=1`, `XFlush` only | not acted on within 6 s |
| 2 | `:96` | `send_event=0`, `XFlush` only | **acted on** — ladder ran, everything released |
| 3 | `:96` | `send_event=1`, `XFlush` only, ~30 s uptime | **acted on** |
| 4 | `:96` | `send_event=1`, `XFlush` only, after a root capture | **acted on** |
| 5 | `xvfb-run`'s display | `send_event=0`, `XFlush` only | not acted on within 20 s |
| 6 | `xvfb-run`'s display | `send_event=0`, `XFlush` only, 25 s settle | not acted on within 20 s |
| 7 | `:96` | `send_event=1`, `XFlush` only, 35 s uptime | not acted on within 20 s |
| 8 | `:96` | `send_event=1`, **`XSync` after the send** | **acted on** (the run recorded above) |

Six deliveries, three acted on. The discriminator in the data is **not**
`send_event` (both values produced a real close) and **not** window age: it is
whether the sending connection issues `XSync` before it exits. With `XFlush`
alone the message is not reliably on the wire before the process goes away; with
`XSync` it was 3/3. I did not chase the remaining variance further — it is a
property of my scratch helper, not of Apunta, and the card does not depend on it.

## What this does and does not change

- **D1 is closed on the real door, and I closed the loop myself.** The ladder
  runs on the main window's `CloseRequested`, exits the shell on its own, and
  releases the port, the server process and the data lock. The implementer's
  containment claim does not rest only on the forced-destroy path any more: the
  owner's actual close gesture is verified end to end.
- **The attempt's `NOT RUN` with cause "nothing can send `WM_DELETE_WINDOW`
  here" is too strong.** It is true of `xdotool windowquit` and false of the
  host in general: an isolated Xvfb plus a scratch `ctypes` sender reaches the
  cooperative close, with no window manager, no install and no owner focus. The
  harness is honest about the tool it used; the *generalisation* in the
  disposition's wording is what overreaches.
- **Nothing here is a substitute for the desktop row.** V3's own
  `window-close` mode still records `NOT RUN` when run as written, which is the
  correct outcome for that command on a WM-less display. My route is a scratch
  verification, not a card row, and I have not proposed changing the harness.

## Screenshot content, described (no private data anywhere)

- **Home** (`build/p33-review2/home-persist.png`, 701 colours): teal *Apunta*
  wordmark, two-step progress rail (step 1 teal, step 2 grey), "Add your note
  format", the subtitle, and four option cards — "My standard progress note"
  with a teal `Recommended` chip, "Upload a blank template", "Upload a few
  example notes", "Describe it myself". A real rendered application page.
- **`port_in_use`** (`fatal-port.png`, 695 colours): the A mark on the `#f6f4ef`
  tile, "Apunta could not start.", English and Spanish sentences about the port,
  and a `port_in_use` chip. No spinner; the splash window is gone.
- **`data_folder_in_use`** (`fatal-folder.png`, 712 colours): the same shell,
  "Apunta is already open. …" in English and Spanish, and a
  `data_folder_in_use` chip. No spinner; the splash window is gone.