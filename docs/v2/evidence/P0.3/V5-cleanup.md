# P0.3 evidence — V5 (run folder exists; no server process remains)

- Working directory: repo root (`~`)
- Observed: 2026-09-26 ~01:44 UTC, immediately after the V3 run above.
- Full V3 output (one stderr line): `sandbox <runId> on 127.0.0.1:7801 data
  <sandbox>/data` — see `V3-sandbox-run.txt`.

## Commands and exit codes

- `ls /tmp/apunta-v2/` — exit 0, output: one run folder (`<runId>`).
- `ps -ef | grep "server/dist/index.js" | grep -v grep` — exit 1, no output:
  no server process from the run remains.
- `ss -tln | grep -E "78[0-8]"` — no output: no listeners on 7800-7889.

## Incident during verification (fixed, re-verified)

The first V3 run (exit 0, health answered with the right `testRunId`) left
its server listening on 7801 afterwards: `cmdRun` called `process.exit(code)`
inside the `try`, and `process.exit()` never runs `finally` blocks, so the
`finally { await stopServer(server); }` cleanup was skipped. Fixed by
stopping the server before exiting (the `finally` stays as the
exception-path net). The stray process (the wrapper's own child, killed by
explicit PID with SIGTERM, confirmed gone via `ss`) was removed, and V3+V5
were re-run from a clean `/tmp/apunta-v2/`: exit 0, run folder present, no
process, no listener. The `node --test` suite and `npm run selftest` were
re-run after the fix (6/6 and 6/6).
