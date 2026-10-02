# V3 — forwarding after `ready`, end to end: NOT RUN

- Status: **NOT RUN**
- Working directory: repo root (`~/Projects/Apunta`)
- Command: the card's V3 command verbatim, `sandbox.mjs env --port 7860`,
  `. /tmp/apunta-v2-p3.8-v3.env`, then the whole body — launch and every probe —
  inside one `xvfb-run -a bash -c`
- Start: 2026-10-02T20:50:57Z · End: 2026-10-02T20:53:01Z · Exit code: **3**
- Port: 7860 · Child pid: 1005434 (AppImage) · Server pid: **none** — the shell
  never spawned one, so `main.rs:221`'s line does not exist
- Run folder: `<sandbox>` (mode 700, created by `sandbox.mjs`)

## Cause

```
child-pid=1005434
NOT RUN: /api/health never answered 200 within 120s
```

and from the captured child stderr at `<sandbox>/child.err`:

```
apunta: refusing to start: the bundled runtime is not at <mount>/usr/lib/Apunta (test)/linux-resources:
build/linux-resources must exist (scripts/v2/package-linux-resources.sh). The shell spawns the bundled
server and never the checkout's.

thread 'main' (1005434) panicked at .../tauri-2.12.1/src/app.rs:1444:11:
Failed to setup app: error encountered during setup hook: the bundled runtime is not at ...
```

The shell refused in its setup hook, before any window, before any child. The
row's own 120 s poll is what reported it.

## Measurement: what is actually missing

`build/linux-resources/` **exists** and `manifest.json` is present, so Stop
condition 6's "absent" form does not match and V0 was allowed to run. But the
folder is **incomplete**: its `web/` subtree is empty.

```
$ ls -la build/linux-resources/web/
total 0                      # 0 files
$ node -e "…manifest.json…files.filter(f=>f.path.startsWith('web/')).length"
28                          # the manifest lists 28 web files, e.g. web/dist/assets/About-4nE69ox7.js
$ find build/linux-resources/web -type f | wc -l
0
```

`ChildPaths::resolve` (`src-tauri/src/launch.rs:57-70`) requires
`web/dist/index.html` to be a file alongside `native/better_sqlite3.node`,
`THIRD-PARTY-LICENSES.md` and `bin/whisper-cli`; that is the refusal above. The
AppDir the AppImage was built from has the same empty `web/`, so the AppImage is
faithful to what was packaged and the gap is upstream of this card. The `web/`
directory's mtime predates this session.

## Why this card does not repair it

- `scripts/v2/package-linux-resources.sh` is the producer and is named as
  off-limits: Stop condition 2, Stop condition 6's remedy ("let the coordinator
  run P3.1's V1"), and it is L3 work that re-fetches A06 (HS-3).
- Copying `web/dist` into `build/linux-resources/` by hand is an edit outside May
  edit (`build/**` is listed as not-May-edit) and would be fabricating bundle
  state the manifest's checksums are supposed to attest.
- No other mechanism was substituted: no new log line, no route, no env var, no
  build flag, no capability, no `tauri.conf.json` edit. Each of those is a stop
  condition and none was used.

## What this row therefore does and does not establish

- **Marker on stderr: not observed.** No line naming `p38marker` reached stderr,
  because no request was ever served — the server never ran. This is *not* the
  card's recorded `NOT RUN` for "the observed line does not name the request at
  all"; the row died earlier, so the query-string mechanism itself remains
  **unproven on this host**, and the round-3 review's reading of
  `originalUrl = raw.url` in `pino-std-serializers` is still a reading.
- **`ready` line: absent**, because the shell refused before spawning.
- **`show_main`: never reached.**
- The defect's own control does not apply here: the row never reached the point
  where the unmodified base and the changed tree would differ.
- Cleanup: the child pid was signalled, 7860 was free afterwards, and no process
  from the run remained.

**Coordinator action:** re-run P3.1's producer row so `build/linux-resources/web`
matches its own 28-entry manifest section, then re-dispatch.