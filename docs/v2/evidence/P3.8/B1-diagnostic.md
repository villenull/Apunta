# B1 diagnostic — window-title readability under bare `xvfb-run` on this host

Coordinator diagnostic, run 2026-10-02. This answers the one thing
`docs/v2/state/reviews/P3.8-ir4.md` recorded as unverifiable without a live
launch, and it is a coordinator action because the reviewer must not take the
build lease. Card P3.8, attempt 3 is the last, so this had to be known first.

## Question

Attempt 2 recorded an **empty** `getwindowname`, which would make V4's rebuilt
positive identification unable to work. P3.3's harness recorded **real** titles
under the same bare `xvfb-run`. Which was it?

## Answer

**Both were correct, and the difference is the desktop session's backend.**

This host is a Wayland-capable session: `GDK_BACKEND=wayland`,
`WAYLAND_DISPLAY` set, `DISPLAY=:0`. Under `xvfb-run` there is **no Wayland
compositor at all**, so a GTK app that inherits the session's backend opens its
windows on a display no X client can read.

`scripts/v2/tauri-lifecycle.test.mjs` already documents this in its own
comment, and I had not applied it:

> A Wayland-capable session exports WAYLAND_DISPLAY and XDG_BACKEND from the
> desktop, and under `xvfb-run` there is no Wayland compositor at all: the app
> then opens windows on a display nobody can read, and **the window assertions
> see an empty list rather than a failure.**

That last clause is the finding: **the failure mode is an empty list, not an
error.** A card that reads "no window titled `Apunta` is present" as
*absence* would therefore have concluded **"no error window appeared" — a false
green — with the window there all along.**

## Proof

Run with the three settings applied, one AppImage launch, `xvfb-run -a -s
"-screen 0 1400x1000x24"`, inside `sandbox.mjs env --port 7860`:

```
app_pid=1247159
id=927       name=[]          pid=[]          WIDTH=1400 HEIGHT=1000   <- X root
id=2097153   name=[apunta]    pid=[1247159]   WIDTH=20   HEIGHT=20     <- utility
id=2097162   name=[]          pid=[]          WIDTH=1    HEIGHT=1
id=2097190   name=[Apunta]    pid=[1247159]   WIDTH=1330 HEIGHT=950    <- MAIN WINDOW
id=2097191   name=[]          pid=[]          WIDTH=1    HEIGHT=1
```

Without `GDK_BACKEND=x11 XDG_BACKEND=x11` and `WAYLAND_DISPLAY` unset, the same
launch yields `windows_found=0` — while the app **starts correctly and serves
HTTP** (`/api/formats` and `/api/settings` both `200` in
`docs/v2/evidence/../b1-app.log`). So the app is healthy; only the window is
unreadable.

No window manager is present, confirmed twice:
`_NET_SUPPORTING_WM_CHECK: no such atom on any window` and
`_NET_SUPPORTING_WM_CHECK: not found.`

## What this means for V4

1. **The repaired positive identification works** once the backend is forced:
   the main window is titled **exactly** `Apunta`, is **owned by the app's own
   pid**, and is **1330x950** — above the card's 880x600 minimum. All three
   conditions the card names are satisfiable on this host.
2. **The card must set `GDK_BACKEND=x11`, `XDG_BACKEND=x11` and unset
   `WAYLAND_DISPLAY`** for every launching row. It currently does not. Without
   them V4 reports an **empty window list**, which its absence-witnesses read as
   success — so this is a fourth instance of the cannot-fail class, and the
   first that would have produced a **false green on attempt 3**.
3. **Enumeration must tolerate empty names and empty pids.** `xdotool search
   --name '.*'` returns the X root and two 1x1 windows with **no name and no
   pid**. D1's own fix, `grep -E "^[^:]+:$1:"`, happens to exclude these
   correctly, because it requires a non-empty id, then a colon, then the pid,
   then a colon — and a nameless window cannot produce that shape. This is worth
   stating in the card rather than leaving to be rediscovered.
4. The splash is titled `Apunta — starting` at 720x720 and is **gone within
   ~2 s** of the main window appearing, so any witness keyed on the splash title
   must not race the main window.

## Commands and exit codes

| Step | Exit | Note |
| --- | --- | --- |
| `sandbox.mjs env --port 7860` | 0 | `run` was the wrong wrapper — it starts its own server and the app then refuses with `data_folder_in_use` |
| launch, session backend inherited | 0 | app healthy, `windows_found=0` |
| launch, `GDK_BACKEND=x11 XDG_BACKEND=x11`, `WAYLAND_DISPLAY` unset | 0 | 5 windows, titles and pids readable |
| `xprop -root _NET_SUPPORTING_WM_CHECK` | 1 | no window manager, twice confirmed |

Sandbox data directories under `/tmp/apunta-v2/`. No port other than the card's
own 7860. Nothing acquired. No live data directory touched. Nothing committed.

## Not verified here

Whether X window ids are monotonic, so that "a re-shown window is a new owned
id" holds as a proof rather than a plausible argument; every timing margin; and
whether any row passes. Those remain the implementer's to observe.
