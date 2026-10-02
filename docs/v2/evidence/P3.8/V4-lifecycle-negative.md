# V4 — lifecycle negative control: NOT RUN

- Status: **NOT RUN**
- Working directory: repo root (`~/Projects/Apunta`)
- Command: the card's V4 command verbatim, `sandbox.mjs env --port 7860`,
  `. /tmp/apunta-v2-p3.8-v4.env`, then the whole body — both launches and every
  `xdotool` probe — inside one `xvfb-run -a bash -c`
- Start: 2026-10-02T20:54:21Z · End: 2026-10-02T20:56:25Z · Exit code: **3**
- Port: 7860 · Launch 1 child pid: 1020509 · Launch 2: never reached · Server pid:
  **none** in either launch, so `main.rs:221`'s line does not exist
- Run folder: `<sandbox>`
- Display: `xvfb-run -a` assigned one for the row; recorded rather than guessed.
  It is not the reason the row stopped.

The row was run, not skipped, so its status is measured rather than assumed.

## Cause

```
launch1-child-pid=1020509
NOT RUN: /api/health never answered 200 within 120s
```

and from `<sandbox>/l1.err`, byte-identical in substance to V3's:

```
apunta: refusing to start: the bundled runtime is not at <mount>/usr/lib/Apunta (test)/linux-resources:
build/linux-resources must exist (scripts/v2/package-linux-resources.sh). …
thread 'main' (1020509) panicked at .../tauri-2.12.1/src/app.rs:1444:11:
Failed to setup app: error encountered during setup hook: …
```

Same cause as [V3-forwarding.md](V3-forwarding.md): `build/linux-resources/web`
is empty, so `ChildPaths::resolve` refuses and the shell exits in its setup
hook. The first launch's 120 s health poll is where the row stopped, so **no
window snapshot was ever taken**.

## The four witnesses: none observed, none passed

| Witness | Assertion | Result |
| --- | --- | --- |
| (a) | exactly one `apunta: the main window is open on …` | **NOT RUN** — no launch |
| (b) | window set and geometry byte-identical before and after the marker; no early-exit title | **NOT RUN** — no snapshot |
| (c) | exactly one `ready` line, its line number below the marker's | **NOT RUN** — neither line exists |
| (d) | a second launch's **pre-`ready`** stop still paints `exited_before_ready` | **NOT RUN** — launch 2 never started |
| (e) | a **post-`ready`** stop paints nothing, window set unchanged | **NOT RUN** — no post-`ready` kill happened |
| (f) | the post-`ready` `ChildGone` is logged (`apunta: the server exited before it was ready …`) and paints nothing | **NOT RUN** — no `ChildGone` was ever received |

None of these is a failure of the change and none is a pass. The row's `$F`
accumulator was never reached, because the row exited `3` at the row's own
`NOT RUN` branch before any assertion ran.

**The window reader found zero windows** — not because `xdotool` reported none
on a working display, but because the row never got as far as calling it. That
distinction matters and is recorded rather than collapsed: an empty window list
would have been `NOT RUN` in any case, never a pass.

Fixed decision 6's reachability clauses (a), (b), (c) and (c-ii) remain
**unproven on this host** and are the reason this card cannot be approved on V4
alone. Nothing was asserted from a reading of the source in their place.

Cleanup: child pids signalled, 7860 free afterwards, no process from the run
remained.