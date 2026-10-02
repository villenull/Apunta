# P3.8 V3 — forwarding end to end, in the real AppImage (attempt 2)

- **Status: PASS** · exit **0** · `V3 PASS` on stdout
- Launched through `scripts/v2/sandbox.mjs env --port 7860`, inside one
  `xvfb-run -a`. Display used: **`:99`** (`xvfb-run -a` auto-selected it; the
  row prints no `DISPLAY`, this was read from the row's companion diagnostic,
  see V4's file).
- Run folder: `<sandbox>/2026-10-02T21-03-30-537Z-3b3f9710/` (path sanitized).
  The row's own capture directory is `/tmp/apunta-v2-p3.8-v3` (outside the
  repository, not committed).

| Field | Value |
| --- | --- |
| Working directory | repo root (`<repo>`) |
| Start (UTC) | 2026-10-02T21:03:30Z |
| End (UTC) | 2026-10-02T21:03:40Z |
| Child pid | 1070280 |
| Server pid (`main.rs:221`) | 1070309 |
| Port | 7860 |
| Wall clock | ~10 s, well inside the row's 120 s poll |

## Exact command

The command is the card's V3 cell verbatim — `node scripts/v2/sandbox.mjs env
--port 7860 > /tmp/apunta-v2-p3.8-v3.env && . /tmp/apunta-v2-p3.8-v3.env &&
xvfb-run -a bash -c '<row body>'`, the body being: launch `$A` with stderr
captured to `$E`, poll `http://127.0.0.1:7860/api/health` up to 120 times at 1 s
intervals, require the sandbox `testRunId` in the body, issue
`GET /api/health?p38marker=$APUNTA_TEST_RUN_ID`, `sleep 3`, read the
`apunta: spawned the bundled server as pid <N>` line out of `$E`, `SIGTERM` that
pid alone, `sleep 2`, `SIGTERM` the child, escalate to `SIGKILL` on the same two
pids only, `cat` the capture, and accumulate `a-`/`b-`/`c-` failures into `$F`.

## Excerpt — the two lines the assertions are read from

`ready`, at line **6** of the capture:

```
apunta: the server is ready ({"type":"ready","port":7860,"nonce":"<nonce>","version":"0.0.0","protocol":1}), version 0.0.0
```

the marker, at line **12**, verbatim apart from the run id and hostname:

```
apunta: ignoring a bridge line (Unreadable): {"level":30,"time":1790975014852,"pid":<pid>,"hostname":"<hostname>","reqId":"req-2","req":{"method":"GET","url":"/api/health?p38marker=<runId>","host":"127.0.0.1:7860","remoteAddress":"127.0.0.1","remotePort":<ephemeral>},"msg":"incoming request"}
```

and the tail of the capture, after the post-`ready` server kill:

```
apunta: the server exited before it was ready (exited_before_ready)
apunta: a termination signal is closing the app; starting the quit ladder
```

## Assertions, and where each was read

- **(a) `ready` line present, before the marker** — `grep -n` on the capture:
  `ready` at line 6, marker at line 12, so `6 -lt 12`. The line is the shell's
  own `apunta: the server is ready (…)`, written by the `eprintln!` at
  `main.rs:292`, which still fires on the only `ready` line in the run
  (Fixed decision 4).
- **(b) a line naming `p38marker` appears** — the excerpt above. **The
  query-string mechanism works on this host.** The bundled server's own request
  logger writes each request's `url` to fd 1, the reader thread hands the line
  on, and `drive` forwards it — which is the arm at `main.rs:321-325`
  (`Event::Bridge(Err(rejection), line)`), reached only because the loop now
  survives `ready`. No server edit, no new route, no env var, no build flag, no
  bundle marker was involved or added (Fixed decision 7).
- **(c) the line is the URL the request logger wrote, and nothing else is** —
  the forwarded line is the pino `incoming request` record for
  `GET /api/health?p38marker=…`; its `"url"` carries the query string. It is the
  only `p38marker` line in the capture.
- **(d) it arrived after the window was up** — the marker request is issued only
  after `/api/health` answered, and the capture shows
  `apunta: the main window is open on http://127.0.0.1:7860` at line 5,
  before both the `ready` line's consumer act and the marker request. The
  (a)+(b) ordering is the evidence.

## Incidental observation, reported not repaired

The forwarding arms print the pino line with the prefix
`apunta: ignoring a bridge line (Unreadable):`. That is the `Rejection` arm's
existing wording (C-BRIDGE@1 rule 2: unknown lines are logged and ignored) and
it is unchanged by this card — the same prefix appears **before** `ready` in the
same capture, so it is not caused by the change. P3.4's harness may care how
these lines are worded; that is a finding, not a defect, and no wording was
touched.

## Cleanup

`SIGTERM` to the server pid then the child pid, `SIGKILL` escalation on those
same two pids only, never a pattern. After the run: no `apunta` process remains,
7860 is free, 7717 was never contacted.
