# V4 — both fatal codes, against the real bundled server

Status: **PASS**
Working directory: repository root
Started: 2026-10-02T05:08:11Z
Ended: 2026-10-02T05:08:30Z (19 s)
Exit code: **0**

## Exact command

```
$ export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" \
  && node --version \
  && node scripts/v2/sandbox.mjs env --port 7832 > /tmp/apunta-v2-p3.3-v4.env \
  && . /tmp/apunta-v2-p3.3-v4.env \
  && node scripts/v2/tauri-lifecycle.test.mjs fatal
```

`node --version` → `v24.19.0` exactly. Run folder `<sandbox>`, `runId`
`2026-10-02T05-02-44-267Z-6a60f030`.

## Output

```
  display: the inherited X display :99
PASS fatal-port the error screen names the code
PASS fatal-port the code is port_in_use and not data_folder_in_use
PASS fatal-port the splash is gone
PASS fatal-port the dummy listener on the port is still alive
  stopped the shell (pid <pid>)
PASS fatal-port the dummy stopped and 7832 is free
PASS fatal-folder holder owns the run
PASS fatal-folder the error screen names the code
PASS fatal-folder the code is data_folder_in_use and not port_in_use
PASS fatal-folder the splash is gone
PASS fatal-folder the lock holder is still alive
  stopped the shell (pid <pid>)
  stopped the lock holder (pid <pid>)
PASS V4 nothing of this run is still listening on the port

11/11 assertions passed
```

## The two cases run in sequence, as the row requires

`fatal-port` first, its dummy stopped and 7832 proven free **before** the lock
holder binds — `PASS fatal-port the dummy stopped and 7832 is free` is that
assertion, and it is between the two cases in the output.

### `fatal-port`

A dummy `net` listener holds 7832 and answers nothing. The app is launched; the
real bundled server reaches `app.listen` and fails with `EADDRINUSE`;
`server/src/index.ts` writes `{"type":"fatal","code":"port_in_use"}` on **stdout**
synchronously (`fs.writeSync(1, …)`) before exiting.

- the fatal line arrived carrying `port_in_use` **and not** `data_folder_in_use` —
  asserted as both halves, on the error window's title, which the shell sets to
  `Apunta — <code>`;
- the splash window is gone (no window titled `Apunta — starting` remains);
- **containment: the dummy is still listening** when those assertions pass. It
  is a listener this harness started and nothing in the app's path touched it;
- then the dummy is stopped, by its own handle, and 7832 is proven free.

### `fatal-folder`

The lock holder is **not** a second app launch — the single-instance plugin
would reap that before a server ever existed. It is a plain server process the
harness starts itself, before the launch, on the same `APUNTA_DATA_DIR`:

```
<bundle>/node/bin/node <bundle>/server/server.mjs
  cwd:            /
  PATH:           /usr/bin:/bin          (no host Node)
  APUNTA_DATA_DIR, APUNTA_PORT, APUNTA_NO_OPEN=1, APUNTA_V2=1, APUNTA_TEST_RUN_ID
  APUNTA_SQLITE_BINDING, APUNTA_LICENSES_FILE, APUNTA_WEB_DIST, APUNTA_WHISPER_BIN
```

i.e. P3.1's bundled server under P3.1's launch contract
(`cards/P3.1.md:271-279`), which the shell's own child uses identically.

**Before the app is launched**, the harness polls the holder's `/api/health` for
up to 30 s and proceeds only when `testRunId` equals `$APUNTA_TEST_RUN_ID` —
`PASS fatal-folder holder owns the run`. That is C-ISO@1 rule 5's ownership check
and P3.1's own harness budget (`cards/P3.1.md:280-286`). Only then is the app
the second launch; it hits the real refusal and `server/src/index.ts` writes
`{"type":"fatal","code":"data_folder_in_use"}` before `process.exit(75)`.

- the fatal line arrived carrying `data_folder_in_use` **and not** `port_in_use`;
- the splash is gone;
- **containment: the lock holder is still running** when those assertions pass;
- then the holder is stopped, by pid, and nothing of the run is left listening.

### Why the second case's code is deterministic, not a race

`acquireDataFolderLock` runs at `server/src/index.ts:33`, strictly before
`app.listen` at `:134`, so the second launch refuses with exit 75 and never
reaches the listen whose failure would write `port_in_use`. Both the holder and
the app's child take this run's port (7832); the lock is what decides, not the
port.

## Cleanup, on the success path and on failure

`runFatalCase`'s `finally` stops the shell (by pid) and the holder (by pid or by
its own `close()`), on both paths. `PASS V4 nothing of this run is still
listening on the port` is checked after both cases. No `pkill`, anywhere
(C-ISO@1 rule 7): every process stopped is one this harness started.

This matters for repeatability — `sandbox.mjs env` stops nothing, so a leftover
dummy would make the next run hit `refusing port 7832: already in use`, and the
card forbids substituting a port. Confirmed after the row:

```
$ pgrep -fa "linux-resources/server/server.mjs|Apunta \(test\)"
no leftovers
$ (bind 7832)  →  7832 free
```

## One harness correction worth recording

The first execution of this row failed, correctly and informatively: the harness
applied C-ISO@1 rule 5's ownership poll to **`fatal-port`'s dummy listener**,
which by construction answers nothing, so the poll waited 30 s and failed. The
fix is that the poll belongs to `fatal-folder` only — its holder is a real
server, so there is an ownership to prove; `fatal-port`'s holder is a dummy that
answers nothing, and polling it for health would be waiting for the very thing
the case is about. The poll was moved, not removed, and no assertion was
weakened: `PASS fatal-folder holder owns the run` is still asserted and still
gates the launch.