# P3.2 verification evidence

Card: **P3.2 Data-folder ownership** (contract C-OWN@1, message code
`data_folder_in_use`, exit code **75**), base commit `337f11a`.

Every command ran from the repository root with the provisioned **Node
24.19.0** first on `PATH`:

```text
$ export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version
v24.19.0
```

The box default is v26.8.2, outside the root `engines: ">=24.19.0 <25"`, so
every row below quotes the version it actually ran on rather than assuming it.

**Sanitising.** `<sandbox>` means `/tmp/apunta-v2/<runId>` for that row; the run
ids are listed so the raw logs in the run folders can be found. `~` is the home
folder. No hostname, username, key or real name appears below; the server logs
this card quotes were filtered to the refusal line for that reason.

**Ports.** 7829 was the sandbox server (the wrapper's own, from the card),
**7830** the second server (this card's), 7810 the owner's preview and 7717 the
live instance were never contacted. Nothing outside `/tmp/apunta-v2/` was
opened, and no `server/` process was started outside the wrapper (HS-2).

**Hard stops.** HS-1 (live data, port 7717, `recover-current-linux.mjs`,
`smoke-live.mjs`) and HS-10 (the live v1 instance) were not touched: no such
command was run. HS-3 (downloads) — nothing was acquired; see the return file.
HS-4 (git) — no pull, merge, rebase, reset or commit was run; the only git
commands were `log`, `diff`, `status`, `add` and `ls-files`. HS-6 — no network
call of any kind; the lock module reaches only `node:*` and one local `ps`.
HS-7 — nothing was loosened: the only code changes are the card's own, and the
three mutations below were reverted byte for byte (`md5sum -c` after each).
HS-8 — every fixture is synthetic: a `settings` row and a JSON blob, and the
child processes carry no note text at all. HS-9 — the changed paths are listed
in the return file and are all inside May edit.

---

## A HEAD drift during the session, reported as the card requires

`git log -1` was the card's base commit when the session started:

```text
$ git log -1 --format='%H %s'
337f11a68bfd54dbd6ded73fc4135df7ed3f5887 Set P3.2 checkpoint base dbe3579
```

**HEAD then moved by two commits while the work was in progress, both of them
another card's:**

```text
$ git log --oneline 337f11a..HEAD
26b4350 Record card P4.2 APPROVED (v2 state)
b9b651b Repair S2.5 card text per IR round 1 (AM-024)

$ git diff --name-only 337f11a..HEAD
docs/v2/cards/S2.5.md
docs/v2/state/PROGRESS.json
docs/v2/state/cards/P4.2.json
docs/v2/state/dispatch/P4.2-review.md
docs/v2/state/reviews/P4.2-impl.md
```

Every one of those five paths is Markdown or v2 bookkeeping, and **none of them
is in this card's May-edit list** nor in anything the three rows exercise. All
three rows below therefore ran at `26b4350`, and the only difference from the
base is documentation this card does not read. This agent ran no `pull`,
`merge`, `rebase`, `reset` or `commit`; the dirty tree in `git status` belongs
to the cards in flight and was left alone.

---

## Sandbox run ids

| Row | Run id | Notes |
| --- | --- | --- |
| V1 | `2026-09-26T16-36-28-863Z-ec2aa59f` | `env` only: the run folder is created, no server is started by this row. `APUNTA_DATA_DIR` was `<sandbox>/data` (mode 700) and each of the five cases made its own `mkdtemp` subfolder **there** |
| V2 | `2026-09-26T16-36-35-122Z-57de3d50` | the wrapper's server on 7829 (pid 915028) and the second server on 7830 (pid 915049) |
| supplementary | `2026-09-26T16-35-13-544Z-49b9ed7e` | the crash-and-restart check in the last section: first server pid 914116 (killed), second pid 914136 |

V1 and V2 were each run twice: once early, and once again after the Prettier
fix described under V3, so the rows recorded here are the ones that match the
tree being submitted, byte for byte. V1's earlier run id was
`2026-09-26T16-33-26-221Z-cadf2728` and V2's `2026-09-26T16-33-39-104Z-5c368a90`;
both passed then too, with the same five cases and the same ten helper
assertions.

The V1 run folder's `data/` is **empty** after the row: the file's `afterEach`
removes the subfolders it made, so nothing — database, `-wal`, `-shm` or
`apunta.lock` — is left in the run folder or anywhere else. V1 launches no
server, so nothing was listening afterwards.

---

## V1 — the five cases, under the wrapper's run folder

| Field | Value |
| --- | --- |
| Working directory | repository root |
| Command | `export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && npm run build:shared && node scripts/v2/sandbox.mjs env --port 7829 > /tmp/apunta-v2-p3.2-v1.env && . /tmp/apunta-v2-p3.2-v1.env && npx vitest run server/src/platform/data-lock.test.ts` |
| Exit code | **0** (`node --version` 0, `build:shared` 0, `vitest` 0) |
| Start / end | 2026-09-26T16:36:28Z → 2026-09-26T16:36:29Z |

Excerpt (run with `--reporter=verbose` as well, same five cases, exit 0):

```text
 RUN  v4.1.11 ~/Projects/Apunta

 ✓ |server| src/platform/data-lock.test.ts > one owner of one data folder (C-OWN@1) > refuses a second in-process acquisition and rewrites nothing 2ms
 ✓ |server| src/platform/data-lock.test.ts > one owner of one data folder (C-OWN@1) > takes over a stale lock whose pid is dead, and takes it with a new nonce 15ms
 ✓ |server| src/platform/data-lock.test.ts > one owner of one data folder (C-OWN@1) > takes over a lock whose pid is alive but whose start time has moved on 0ms
 ✓ |server| src/platform/data-lock.test.ts > one owner of one data folder (C-OWN@1) > leaves exactly one owner when two processes race for the same folder 38ms
 ✓ |server| src/platform/data-lock.test.ts > one owner of one data folder (C-OWN@1) > refuses a second process that ignores the lock file (SQLITE_BUSY on write) 279ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
   Start at  10:36:29
   Duration  531ms (transform 91ms, setup 0ms, import 145ms, tests 335ms, environment 0ms)
```

`No test files found` appears nowhere, and nothing is skipped: 1 file, 5 cases,
`Tests 5 passed (5)`. What each case asserts, against the card's list:

1. **two in-process acquisitions** — the second throws `DataFolderInUseError`
   with `code === 'data_folder_in_use'` and `pid === process.pid`, and the
   file on disk still equals the first acquirer's contents `pid`, `nonce`,
   `processStart` and `appVersion` byte for byte (`expect(after).toEqual(before)`),
   so nothing was rewritten. `release()` then removes the file.
2. **stale lock from a dead PID, taken over** — the fixture's pid is a child
   the test spawns with `process.execPath` and reaps, and it probes
   `process.kill(pid, 0) === 'ESRCH'` before writing the fixture, so it is never
   a hard-coded number. The child's *own* start time is read by the child (its
   own `/proc/self/stat` field 22, or `ps -o lstart=` off macOS) and written into
   the fixture, so a "stale" lock whose pid is not stale cannot slip through.
   After acquisition the file carries this process's pid and the **new** nonce,
   and a start time that is not the dead child's.
3. **stale lock whose PID is alive but start time differs, taken over** — the
   fixture carries this process's real pid with a `processStart` that provably
   differs (a real lock of our own, with four zeros appended), so the takeover
   branch is the one taken and the same nonce assertion holds. This is the case
   that collapses into case 2 if the comparison stops being a comparison.
4. **race of two concurrent acquirers** — two **processes**, each importing the
   real module (Node 24 strips the annotations, as `sandbox.mjs` does for
   `shared/src/platform-paths.ts`), started back to back on one folder. Exactly
   one reports `acquired` and one `refused` with the message code, the loser's
   `ownerPid` is the winner's pid, and the file carries the winner's nonce. Each
   racer holds its lock until the other has reported, because a racer that
   exited first would leave a *genuinely* stale lock and both processes would
   report success — which is what the first version of this case did.
5. **SQLite backstop** — a second **child process** (`process.execPath`, its own
   `better-sqlite3` handle, **no lock file at all**) opens the database that has
   already been migrated, `open` is `ok`, and its `INSERT` fails with
   `SQLITE_BUSY`. The owner's row is absent afterwards and the owner can still
   write.

The stability of case 4 is recorded because it is where the card's own risk
lives. It was run 15 more times with all 8 cores saturated (`yes` × 8) after the
fix described below: 15 of 15 passed.

## V2 — the second launch, on the same folder

| Field | Value |
| --- | --- |
| Working directory | repository root |
| Command | `export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && npm run build && node scripts/v2/sandbox.mjs run --port 7829 -- node scripts/v2/second-start.mjs` |
| Exit code | **0** (`node --version` 0, `npm run build` 0, the wrapper 0) |
| Start / end | 2026-09-26T16:36:32Z → 2026-09-26T16:36:35Z |

`npm run build` ran **before** the wrapper, as the card insists: the checkout
ships a `server/dist/index.js`, and the wrapper refuses only when that file is
*missing*, so a V2 without the build would silently have exercised the pre-card
server, which has no lock in it.

Excerpt (the wrapper's line and the whole of the helper's output):

```text
sandbox 2026-09-26T16-36-35-122Z-57de3d50 on 127.0.0.1:7829 data <sandbox>/data
ok       the first server holds a lock before the second launch
second server: pid 915049, port 7830, exit 75, signal null
ok       the second server exits 75
ok       nothing is listening on the second port afterwards
ok       the second server created nothing in the run folder
ok       the second server touched nothing in the run folder
ok       the second server created no apunta.db, apunta.db-wal, apunta.db-shm
ok       the lock still carries the first server, byte for byte
ok       the lock does not name the second server
ok       the first server still answers /api/health with this run id
ok       the refusal is logged with the message code
log:     data_folder_in_use: another Apunta (pid 915028) is already using the data folder <sandbox>/data
second-start: every assertion held
```

The helper's own log file (`<sandbox>/logs/second-server.log`) holds that one
line and nothing else, which is the whole of what P3.2 promises: **exit 75**,
**no listener on 7830**, **nothing created and nothing touched** in the run
folder (so rule 1's ordering held — the restore and the open never ran), **the
first server's lock untouched and its pid still live**, and **the first server
still answering `/api/health` with this run's `testRunId`**. That is C-OWN@1's
rejection example: the second launch refuses and the first keeps running
untouched.

The first server's own shutdown is visible in the same run folder: the wrapper
ends it with `SIGTERM`, which goes through `app.close()` and the `onClose` hook
at `index.ts`, and afterwards

```text
$ ls -a <sandbox>/data
.  ..  apunta.db
```

— no `apunta.lock`, and no `-wal`/`-shm` either. That is the `release()` the
card's fourth Fixed decision names, observed end to end on the real server.

`scripts/v2/second-start.mjs` refuses (exit 2, before starting anything) when
`APUNTA_DATA_DIR`/`APUNTA_TEST_RUN_ID`/`APUNTA_PORT` are missing, when
`server/dist/index.js` is absent, when 7830 is busy, and when 7830 is the port
the wrapper already holds. It validates its own port with the **wrapper's**
`validatePort` and its freeness with the wrapper's `assertPortFree`, imported
from `./sandbox.mjs` rather than copied, and it stops only the process it
started (its own process group, C-ISO@1 rule 7).

## V3 — the whole suite, lint and typecheck

| Field | Value |
| --- | --- |
| Working directory | repository root |
| Command | `export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && npm test && npm run lint && npm run typecheck` |
| Exit code | **0** for all three (`npm test` 0, `npm run lint` 0, `npm run typecheck` 0) |
| Start / end | 2026-09-26T16:34:10Z → 2026-09-26T16:34:30Z |

```text
effective time zone: America/Mexico_City (TZ=<unset>)

 Test Files  142 passed (142)
      Tests  1806 passed (1806)

Checking formatting...
All matched files use Prettier code style!
THIRD-PARTY-LICENSES.md lists all 111 shipped packages.
TOTAL 0
```

`grep -c "error TS"` over the `typecheck` output: **0**. V3 is the row that
runs `data-lock.test.ts` with **no** wrapper around it, so the file's
`os.tmpdir()` fallback is the path that executes here — the card's reason for
having one. A test that refused to run without the wrapper would fail this row
everywhere.

**One first attempt at this row failed and is recorded rather than hidden:**
`npm run lint` exited 1 with

```text
[warn] scripts/v2/second-start.mjs
[warn] Code style issues found in the above file. Run Prettier with --write to fix.
```

Prettier formatting of the new helper, nothing else. The file was formatted
(`npx prettier --write`, `npx eslint` clean) and the **whole row was re-run
from `node --version`**, which is the run recorded above. No test, no type
error and no other lint rule was involved.

---

## Tripwires: the cases were each proved able to fail

A case that cannot fail is not evidence, so the implementation was broken on
purpose three times, the file re-run, and the source restored. `md5sum -c`
after each mutation:

```text
server/src/platform/data-lock.ts: OK
server/src/db/index.ts: OK
```

| # | Mutation | Result |
| --- | --- | --- |
| 1 | `processStart` written as `new Date().toISOString()` instead of the raw kernel value — the mistake the card's first Fixed decision exists to prevent | **exit 1**, 2 cases fail: `refuses a second in-process acquisition` (`expected undefined to be an instance of DataFolderInUseError` — the live owner's lock was declared stale and taken over) and the two-process race (`expected [ { pid: … }, …(1) ] to have a length of 1 but got 2`, i.e. two owners). Cases 2 and 3 still passed, exactly as the card predicts: a wrong unit makes *every* lock look stale |
| 2 | the `ESRCH` branch removed from `processIsAlive` (every pid looks alive) | **exit 1**, 1 case fails: `takes over a stale lock whose pid is dead` — the dead pid's start time cannot be read, the "cannot be read means alive" rule then applies, and the case refuses instead of taking over |
| 3 | `db.pragma('locking_mode = EXCLUSIVE')` removed from `server/src/db/index.ts` | **exit 1**, 1 case fails: `refuses a second process that ignores the lock file` — `expected 'ok' to be 'SQLITE_BUSY'`, the second process wrote freely |

Mutation 1 is the one worth reading twice: the card's warning is that a wrong
`processStart` unit makes a **live** owner's lock look stale, and that is
precisely what the two failing cases show — case 1 (in-process, same pid) and
case 4 (two processes) both end with two owners of one folder. Cases 2 and 3
would have passed with a wrong unit, which is why the card asks for both kinds
of case and this file has both.

## A fourth race, found by case 4 and fixed rather than slept through

Case 4 failed on its first full-suite run (`npm test`, 142 files in parallel):
both racers reported `acquired`. The cause was the create path. Rule 2's
exclusive create was `open(path, 'wx')` **followed by** the write, and between
those two calls the file exists and is **empty**. A second process that read it
in that window saw something that is not a lock, concluded "stale", took the
folder over — and both processes believed they owned one practice's records.

The create is now a private temporary file, `link()`ed into place: it still
fails with `EEXIST` (so it is still an exclusive create, and the rule's
guarantee is unchanged) but it cannot expose an empty or partial name. Two
things go with it:

- a fallback to `open(wx)` for filesystems with no hard links, because a data
  folder on exFAT or some network volumes is a documented, supported setup
  (`APUNTA_DATA_DIR` on an external drive, `data-at-rest-2026-08.md` §2.2) and
  on those `link()` fails with `EPERM`/`ENOSYS`;
- `readLockFile` re-reads a file that exists but does not parse, three times at
  40 ms, before calling it garbage. That covers the fallback's window and the
  one a `SIGKILL` between create and write can leave behind, so a corrupt or
  half-written lock is still recoverable rather than a folder that cannot be
  opened at all.

With that in place, case 4 was run 15 times with all 8 cores saturated by
`yes`: 15 of 15 passed, and `npm test` passed twice more.

## Supplementary: a crash, a takeover and a clean release (integration)

Not one of the three rows, and reported as extra. Its value is that it is the
only place the **real built server** is made to crash, which the five cases can
only simulate with a reaped child. It ran as the command of one wrapper run
(`node scripts/v2/sandbox.mjs run --port 7829 -- <script>`, exit 0,
2026-09-26T16:35:13Z), so the wrapper owned the first server and the script
started and stopped only what it started itself:

```text
sandbox 2026-09-26T16-35-13-544Z-49b9ed7e on 127.0.0.1:7829 data <sandbox>/data
ok       the crashed server is gone
ok       a crash leaves the lock file behind (rule 5) — pid 914116
ok       the lock still names the dead process
ok       a second server starts on the folder of a crashed owner — pid 914136
ok       the lock now names the new process — pid 914136
ok       the new lock carries a different nonce
ok       the new lock records the new process start time
ok       a clean SIGTERM removes the lock file (rule 5)
ok       no temporary lock file was left behind
```

So: a `SIGKILL`ed server leaves the file behind (rule 5), a new server on that
folder takes the stale lock over, records its **own** pid, nonce and kernel
start time, and serves normally (rule 3), and a `SIGTERM` removes the file
through the `onClose` hook.

---

## The card's Fixed decisions, and where each one is

| Decision | Where it is |
| --- | --- |
| `processStart` is a raw kernel number, written as read, compared as a string; unreadable means alive | `server/src/platform/data-lock.ts` — `linuxProcessStart` (field 22 of `/proc/<pid>/stat`, counted from the **last** `)` because `comm` may contain spaces and parentheses), `macProcessStart` (`ps -o lstart=`), `processStartOf`, and `ownerIsAlive` returning `true` when the live pid's start cannot be read |
| `acquireDataFolderLock(dataDir)` → `{ nonce, release() }`, throwing `DataFolderInUseError` with `code === 'data_folder_in_use'` and the owner's pid; `DATA_FOLDER_IN_USE` exported; no other module state | the same module: `acquireDataFolderLock`, `DataFolderInUseError`, `DATA_FOLDER_IN_USE`. The nonce is generated inside and returned on the handle, so rule 3's re-read compares the file against the caller's own nonce. `release()` is idempotent (a `released` flag in the closure, no singleton), and every case releases between cases rather than resetting anything |
| the refusal exits 75, binds nothing, and does not go through `serveBootError` | `server/src/index.ts`: the `catch` opens with `if (error instanceof DataFolderInUseError) { console.error(...); process.exit(75); }` — before the rollback, before `storageBootMessage`, before `serveBootError`, and so before `buildApp`, `app.listen`, `applyPendingRestore` and `openDatabase`. A genuine storage failure still takes today's boot-error page |
| release happens in the existing `onClose` hook, idempotent, unlinking only while the file still carries this nonce | `server/src/index.ts`, `app.addHook('onClose', …)` beside `db.close()` — the same hook the `SIGINT`/`SIGTERM` handlers already reach through `app.close()`. `release()` reads the file first and unlinks only on a nonce match |
| the message code is defined and exported here; carrying it is P3.3's | `DATA_FOLDER_IN_USE` is exported and used as the logged word. No `fatal{code}` line, no file written to carry the code, **no i18n string** — `shared/src/i18n/**` is untouched, and `shared/src/i18n/en.ts` still has no "Apunta is already open" key |
| rule 1's pre-migration snapshot is P5.1's; this card only orders the lock before the restore | `server/src/index.ts` acquires between `ensureDataDir` and `applyPendingRestore`. No snapshot is called and this card does not block on one |
| V1's databases and its child processes live in the sandbox run folder; `os.tmpdir()` only when there is no wrapper | `parentFolder()` in `data-lock.test.ts` reads `APUNTA_DATA_DIR` and falls back to `tmpdir()`; each case's `mkdtemp` subfolder is inside it, and the two racers and the SQLite child inherit it through `process.env`. Nothing in this card is written under `/tmp/apunta-lock-…` |
| rule 4's SQLite backstop, after migration | `server/src/db/index.ts`: `db.pragma('locking_mode = EXCLUSIVE')` immediately after `migrate`, with the reason it is after rather than before |

## Measured, and worth the reviewer knowing

- **When the exclusive lock actually takes effect.** SQLite takes the
  `locking_mode = EXCLUSIVE` lock at the first read **or write** after the
  pragma. Measured on this box: a write after the pragma makes a second
  process's `INSERT` fail with `SQLITE_BUSY` on every one of 5 runs, while a
  read alone did not. C-OWN@1 rule 4 asks for the database to be *opened* with
  `locking_mode = EXCLUSIVE`, and that is exactly what the code does; the
  backstop is fully effective from the app's first write, which is what case 5
  drives. Reported because it is a property of SQLite, not of the contract,
  and a reader should not have to guess it.
- **Nothing opens a second connection to the live database**, so the card's
  stop condition did not trigger. `openDatabase` is called from
  `server/src/index.ts`, `server/src/seed-cli.ts` and the test harness, and
  each of them closes before the next opens (`db/migrate.test.ts:96` closes
  `first.db` before opening `second`). P5.1's snapshot and the backup's
  integrity check both work on the **same handle** or on a copy in another
  file. `npm test` — 1806 tests, including every backup and restore case — is
  green with the pragma in place, and so is `npm run build`.
- **Two residuals, both inherited from rule 3 as the contract states it**, and
  neither of which any of the five cases can reach: (a) two processes that both
  find the lock *garbage* can both rename over it and both read their own nonce
  back, so the re-read cannot separate them; the only primitive that would is
  outside the contract (`flock`, or a lock **directory**), and the window needs
  a corrupt or half-written lock to be open at all. (b) A folder on a
  filesystem without hard links falls back to the `open(wx)` create described
  above, whose empty-name window is closed by the settle rather than by the
  kernel.
