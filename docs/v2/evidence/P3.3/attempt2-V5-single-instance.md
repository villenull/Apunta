# V5 — single instance, and the focus read that is deliberately not run (attempt 2)

**Status: PASS (focus read `NOT RUN`). Exit 0, 11/11 + 1 NOT RUN.**
Working directory: repository root. Port 7833. Run id:
`<sandbox>/2026-10-02T06-49-10-820Z-…`. Display: `xvfb-run -a -screen 0
1400x1000x24`, printed in the row. Start 2026-10-02T06:49Z, end
2026-10-02T06:49Z (UTC).

Exact command:

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && \
node scripts/v2/sandbox.mjs env --port 7833 > build/p33-correct-v5.env && \
. build/p33-correct-v5.env && \
node scripts/v2/tauri-lifecycle.test.mjs single-instance
```

`node --version` printed exactly `v24.19.0`. Full log:

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
  stopped the first shell (pid 332922) with SIGTERM

11/11 assertions passed, 1 NOT RUN
```

## The single-instance assertions (this row's reason to exist)

- **exactly one server process** for the run, counted from `/proc` by matching
  *both* P3.1's bundled server (`server.mjs` under `linux-resources`) *and* this
  run's `APUNTA_DATA_DIR` in that process's environment — so an unrelated Apunta
  elsewhere on the machine cannot be counted, and this run's own server cannot be
  missed;
- the **first instance owns the run** (`testRunId` ownership, C-ISO@1 rule 5);
- the **second launch is reaped inside the existing 10 s budget** — a card value,
  not a threshold this card invented;
- it was reaped **without ever becoming a server's parent**: still exactly one
  server process, the first shell alive, and the first instance still answering
  `/api/health` with this run's id;
- **no second** `apunta.lock`, `apunta.db`, `-wal` or `-shm`, and the lock on disk
  is byte-for-byte the first instance's (same size, same pid inside it).

## The focus read: `NOT RUN`, never `PASS`

The card requires the focus read to run only when a focus reader is on `PATH`
**and** the owner set `APUNTA_ALLOW_FOCUS_TEST=1` for that run, and to be recorded
`NOT RUN` otherwise — never `PASS`, and never standing in for the assertions
above. `xdotool` **is** on `PATH`; `APUNTA_ALLOW_FOCUS_TEST` was **not** set, and
it was not requested, because it takes the owner's focus mid-work. It is
recorded `NOT RUN` with that reason.

Independently of the permission: `xvfb-run` has **no window manager**, so
`xdotool getactivewindow` cannot work either — there is no `_NET_ACTIVE_WINDOW`
to read. Both facts are named in the row's evidence, and neither was worked
around by clicking, focusing or raising anything. **No owner focus was taken at
any point in this card.**

## What changed in this row

One thing: the home-screen assertion now uses the same exact-name / owning-pid /
size / inside-the-display check as V3 (`findAppWindow`), instead of a
case-insensitive title search that a hidden 20×20 helper window could satisfy at
GTK init. No threshold was relaxed and no assertion was removed.