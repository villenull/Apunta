# V5 — single instance, WM-independent

Status: **PASS** (the focus read is `NOT RUN`, with the reason the card names)
Working directory: repository root
Started: 2026-10-02T05:09:17Z
Ended: 2026-10-02T05:09:26Z (9 s)
Exit code: **0**

## Exact command

```
$ export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" \
  && node --version \
  && node scripts/v2/sandbox.mjs env --port 7833 > /tmp/apunta-v2-p3.3-v5.env \
  && . /tmp/apunta-v2-p3.3-v5.env \
  && node scripts/v2/tauri-lifecycle.test.mjs single-instance
```

`node --version` → `v24.19.0` exactly. Run folder `<sandbox>`, `runId`
`2026-10-02T05-09-06-…`.

## Output

```
  display: the inherited X display :99
PASS V5 the first instance reaches the home screen
PASS V5 the first instance owns the run
PASS V5 the first instance created the ownership files
PASS V5 exactly one server process exists for the run
PASS V5 the second launch is reaped inside the 10s quit-ladder budget
PASS V5 still exactly one server process after the second launch
PASS V5 the first instance is untouched
PASS V5 the first instance still answers /api/health
PASS V5 no second lock, database, -wal or -shm
PASS V5 the lock on disk is still the first instance's
NOT RUN V5 focus read: APUNTA_ALLOW_FOCUS_TEST is not set for this run, and a focus read takes the owner focus mid-work
  stopped the first shell (pid <pid>)

11/11 assertions passed, 1 NOT RUN
```

## The single-instance assertions, which are this row's evidence

All WM-independent — none of them reads focus, and none depends on a window
manager existing:

- **exactly one server process exists for the run** — counted from `/proc`, by
  matching `cmdline` for `server.mjs` **and** `linux-resources` **and**, in
  `environ`, this run's `APUNTA_DATA_DIR`. Both halves matter: a second Apunta
  elsewhere on the machine is not counted, and neither is a repository server.
- **the second launch is reaped inside the 10 s quit-ladder budget** — the second
  AppImage's pid is gone within 10 000 ms. That is the card's existing quit
  budget from Fixed decisions, not a new threshold.
- **still exactly one server process after the second launch** — the reaped
  second instance never became a server's parent.
- **the first instance is untouched** — its shell pid is still alive.
- **the first instance still answers `/api/health`** — and the answer's
  `testRunId` is still this run's.
- **no second lock, database, `-wal` or `-shm`** — the snapshot is taken *after*
  the first instance is up (C-OWN@1's files are created by that first launch, so
  comparing against an empty folder would report the first instance's own lock
  and database as a second one), and re-checked after the second launch.
- **the lock on disk is still the first instance's** — the file's bytes are
  identical before and after, same `pid`, same `processStart`, same `nonce`.

## The focus read: `NOT RUN`, never `PASS`

```
NOT RUN V5 focus read: APUNTA_ALLOW_FOCUS_TEST is not set for this run, and a focus read takes the owner focus mid-work
```

The card is explicit that this half "runs only when a focus reader is on `PATH`
(`xdotool` or `wmctrl`) **and** the owner set `APUNTA_ALLOW_FOCUS_TEST=1`". Both
conditions were unmet: `xdotool` **is** on `PATH` (V0), and
`APUNTA_ALLOW_FOCUS_TEST` was **not** granted for this run — it was not set, not
requested, and no attempt was made to obtain it. Under `xvfb-run` there is also
no window manager, so `_NET_ACTIVE_WINDOW` does not exist; the row records that
as the second reason rather than attempting the read anyway.

This assertion never stands in for the single-instance assertions above, and it
does not weaken them: the focus read is a *read*, the assertions above are about
processes and files, and none of them would notice a focused window.

## Aftermath

```
$ pgrep -fa "linux-resources/server/server.mjs|Apunta \(test\)"
no leftovers
$ (bind 7833)  →  7833 free
```

The second launch was reaped by the `tauri-plugin-single-instance` plugin, which
focuses the existing window rather than starting a second server. Data ownership
is C-OWN@1's, not the plugin's — which is exactly what V4's `fatal-folder` case
demonstrates on the same mechanism from the other side.