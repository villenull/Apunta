# V4 — both fatal codes, against the real bundled server (attempt 2)

**Status: PASS. Exit 0, 11/11.** Working directory: repository root. Port 7832.
Run id: `<sandbox>/2026-10-02T06-49-01-586Z-…`. Display: `xvfb-run -a
-screen 0 1400x1000x24`, chosen by the harness and printed in the row. Start
2026-10-02T06:49Z, end 2026-10-02T06:49Z (UTC).

Exact command:

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && \
node scripts/v2/sandbox.mjs env --port 7832 > build/p33-correct-v4.env && \
. build/p33-correct-v4.env && \
node scripts/v2/tauri-lifecycle.test.mjs fatal
```

`node --version` printed exactly `v24.19.0`. Full log:

```
  display: the inherited X display :99
PASS fatal-port the error screen names the code
PASS fatal-port the code is port_in_use and not data_folder_in_use
PASS fatal-port the splash is gone
PASS fatal-port the dummy listener on the port is still alive
  stopped the shell (pid 332368) with SIGTERM
PASS fatal-port the dummy stopped and 7832 is free
PASS fatal-folder holder owns the run
PASS fatal-folder the error screen names the code
PASS fatal-folder the code is data_folder_in_use and not port_in_use
PASS fatal-folder the splash is gone
PASS fatal-folder the lock holder is still alive
  stopped the shell (pid 332680) with SIGTERM
  stopped the lock holder (pid 332619) with SIGTERM
PASS V4 nothing of this run is still listening on the port

11/11 assertions passed
```

Both cases run against the **real** AppImage and the **real** bundled server.
There is no stub, no fake bridge line and no test hook: the only way this row can
see a `fatal` line is for the shell to have read one out of its own child's
stdout.

- `fatal-port` — a dummy listener holds 7832 before the launch, so the real
  `app.listen` fails with `EADDRINUSE` and `server/src/index.ts` writes
  `{"type":"fatal","code":"port_in_use"}` on **stdout**. The assertion is
  "carrying that code **and not the other one**", both halves.
- `fatal-folder` — the holder is a **plain server process** this harness starts
  itself (not a second app launch, which the single-instance plugin would reap
  before a server existed): P3.1's bundled server under P3.1's launch contract —
  `cd /`, `PATH=/usr/bin:/bin` with no host Node, and this run's
  `APUNTA_DATA_DIR`/`APUNTA_PORT`. Before the app is launched the harness polls
  the holder's `/api/health` for up to 30 s and proceeds **only** when
  `testRunId` equals `$APUNTA_TEST_RUN_ID` (C-ISO@1 rule 5) — asserted as
  `PASS fatal-folder holder owns the run`, not assumed. The app is then the
  second launch, hits the real C-OWN@1 refusal and `index.ts` writes
  `{"type":"fatal","code":"data_folder_in_use"}` before exiting 75.

## What changed in this row, and what did not

One thing changed, and it is the D6 defect:

- **The window list is now exact.** The error screen's name is matched as a
  string from a full `xdotool` window list with each window's geometry and owning
  pid, rather than through a case-insensitive `--name` search that could match a
  helper window. The "the splash is gone" assertion compares exact names
  (`Apunta — starting`), for the same reason.
- **Nothing was weakened.** Both holders are still asserted **alive** at the
  moment each case's assertions pass (`PASS fatal-port the dummy listener on the
  port is still alive`, `PASS fatal-folder the lock holder is still alive`), both
  are still stopped **by pid** and never with `pkill` (C-ISO@1 rule 7), and the
  row still ends by asserting nothing of this run is still listening on 7832.
  That last assertion is what makes the row repeatable: `sandbox.mjs env` stops
  nothing, so a leftover dummy would make the next attempt fail with
  `refusing port 7832: already in use`.

## Containment

Nothing the shell started outlived it: each case stops only the shell it
launched, and the run ends with 7832 free. The unrelated dummy and the lock
holder are stopped by pid on both the success and the failure path. Ollama was
not touched (asserted in V3). No live data, no port 7717.