# P5.2 verification evidence

Card: **P5.2 Safe migration at every start**, base commit `88ef838`
("Preserve reviewed redirect diagnostics repair and record remaining blocker").
Every command below ran at that HEAD with the working tree carrying only this
card's edits, plus the coordinator's dirty documentation, which was not touched
and not staged. Nothing was committed, pulled, merged, rebaseated or reset.

All commands ran from the repository root with Node **24.19.0** first on
`PATH`:

```text
$ export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version
v24.19.0
```

The box's default is v26.8.2, outside root `engines` (`>=24.19.0 <25`), so
every row names the pinned binary.

Port **7717** was never contacted. `scripts/recover-current-linux.mjs` and
`scripts/smoke-live.mjs` were not run. The live data folder, its backups, the
owner's Claude export and the Halaxy PDFs were never opened, listed or copied.
The owner preview on **7867** was checked as listening before and after this
pass and was never contacted. No model was pulled, run or inferred from, and no
network call was made. Every database opened here was a synthetic one created
by this pass inside a temp folder it removed, or inside a sandbox run folder
under `<sandbox>`.

**Load.** A model study is running on this box. `/proc/loadavg` (8 cores) read
6.55 / 6.77 / 7.06 at 23:45:54Z, 7.20 / 7.11 / 7.17 at 23:47:24Z, 7.27 / 7.31 /
7.24 at 23:50:22Z, 9.74 / 8.58 / 7.77 at 23:53:05Z. The only CPU this card
spent is the two rows below (vitest, eslint, prettier, tsc) and three short
sandbox starts; no browser was launched. **No claim is made about model
timings**: this pass neither measured nor disturbed them, and a load average
that reached 9.74 on 8 cores while the rows ran is a fact about the box, not
evidence about anything else.

**Sandbox run folders used** (raw logs stay inside them and are not committed):

| Run id | Port | What it was for |
| --- | --- | --- |
| `2026-09-27T23-40-09-783Z-e4c6305b` | 7835 | `sandbox.mjs env` only, for the two read-only-handle probes below |
| `2026-09-27T23-47-33-909Z-0e8e4df6` | 7835 | one real boot on an empty sandbox data folder (first run) |
| `2026-09-27T23-48-07-826Z-a23abe78` | 7836 | one real boot over a synthetic level-5 database (a migration with pending work) |

---

## The two unknowns the design rested on, settled before writing it

Readiness findings **F5** and **F6** said two things were unknown and unprovable
without opening a database: whether `VACUUM INTO` works from a **read-only**
handle, and whether `migrationLevel` — which runs `CREATE TABLE IF NOT EXISTS`
— can be called on one. Both were probed first, through the sandbox wrapper, in
a temporary probe file that was deleted afterwards (`server/src/db/zz-probe*.ts`,
never committed, not in the final tree).

| Field | Value |
| --- | --- |
| Working directory | repository root |
| Command | `node scripts/v2/sandbox.mjs env --port 7835 > /tmp/p52-sandbox.env && . /tmp/p52-sandbox.env && npx vitest run server/src/db/zz-probe.test.ts` then the same for `zz-probe2.test.ts` |
| Exit code | **0** both times |
| Start / end | 23:40:12Z and 23:43:43Z |

```text
PROBE migrationLevel(readonly, table present) = 5
PROBE migrationLevel(readonly, no table) THREW SqliteError: attempt to write a readonly database
PROBE direct SELECT on readonly, no table THREW SqliteError: no such table: schema_migrations
PROBE VACUUM INTO from readonly OK /tmp/apunta-probe-l4uVNW/copy.db exists=true
PROBE rows in the copy = [{"name":"John Smith"},{"name":"Second, still in the WAL"}]
PROBE2 readonly open of a crashed WAL db OK rows=[{"name":"John Smith"},{"name":"Only in the log"}] versions=[{"version":5}]
PROBE2 VACUUM INTO from that handle OK rows=[{"name":"John Smith"},{"name":"Only in the log"}]
PROBE3 VACUUM INTO with a writer open OK rows=[{"name":"John Smith"},{"name":"Still in the log"}]
```

What the implementation does with each answer, and where it is pinned
permanently:

- **F5 — resolved in favour of the read-only handle.** `VACUUM INTO` succeeds
  from a read-only source, includes committed write-ahead-log content, and works
  both with another writer attached and on a database a crash left with an
  unrecovered `-wal`. So the inspection handle is also the handle step 3 copies
  from: nothing on the path to a safety snapshot can write to the practice's
  database. Pinned by
  `the read-only handle the inspection step opens > still copies the whole database, the write-ahead log included`.
- **F6 — resolved against `migrationLevel`.** With the table present its DDL is
  a no-op; with **no** `schema_migrations` table — the state of every
  unmigrated database — the same call is `SQLITE_READONLY`. Reading the version
  that way would have made `newer_schema` detection fail on a path that must
  never fail, and would have made a level-0 database refuse to start. So the
  inspection step selects the table itself and treats "no such table" as level
  0. Pinned by
  `is read-only, and \`migrationLevel\` is not usable on it before the table exists`.

---

## V1 — the database module, including the new `safety.test.ts`

| Field | Value |
| --- | --- |
| Working directory | repository root |
| Command | `export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && npm run build:shared && npx vitest run server/src/db --reporter=verbose` |
| Exit code | **0** (`node --version` 0, `build:shared` 0, `vitest` 0) |
| Start / end | 2026-09-27T23:52:30Z → 2026-09-27T23:52:31Z |

Totals: **7 files, 64 tests, all passed.** The ten cases the card's Steps name,
by name, so the row is not "all passed":

```text
 ✓ |server| src/db/safety.test.ts > prepareDatabaseForStart > applies the pending restore, snapshots what the restore put there, and only then migrates
 ✓ |server| src/db/safety.test.ts > prepareDatabaseForStart > refuses a database newer than this build, and writes nothing at all
 ✓ |server| src/db/safety.test.ts > prepareDatabaseForStart > leaves the schema untouched when the safety snapshot cannot be taken
 ✓ |server| src/db/safety.test.ts > prepareDatabaseForStart > rolls back every pending migration when one of them fails, keeps the snapshot and prunes nothing
 ✓ |server| src/db/safety.test.ts > prepareDatabaseForStart > leaves a safety snapshot that is a working database, and can be started from again
 ✓ |server| src/db/safety.test.ts > prepareDatabaseForStart > keeps the last three safety snapshots, ordered by their stamp, and deletes only older ones
 ✓ |server| src/db/safety.test.ts > prepareDatabaseForStart > writes no safety file on a first run, and so cannot evict a real snapshot
 ✓ |server| src/db/safety.test.ts > prepareDatabaseForStart > writes no safety file when the database is already at this build’s level
 ✓ |server| src/db/safety.test.ts > prepareDatabaseForStart > migrates a level-5 database to the current level, snapshotting it first
 ✓ |server| src/db/safety.test.ts > prepareDatabaseForStart > migrates a level-6 database to the current level, snapshotting it first
 ✓ |server| src/db/safety.test.ts > prepareDatabaseForStart > migrates a level-7 database to the current level, snapshotting it first
 ✓ |server| src/db/safety.test.ts > the read-only handle the inspection step opens > is read-only, and `migrationLevel` is not usable on it before the table exists
 ✓ |server| src/db/safety.test.ts > the read-only handle the inspection step opens > still copies the whole database, the write-ahead log included
 ✓ |server| src/db/migrate.test.ts > migrate > refuses a database newer than the highest shipped migration
 ✓ |server| src/db/migrate.test.ts > migrate > rolls back every pending migration when one of them fails
```

The other 51 are the pre-existing `server/src/db` cases, all still passing.

---

## V2 — the whole repo

| Field | Value |
| --- | --- |
| Working directory | repository root |
| Command | `export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && npm test && npm run lint && npm run typecheck` |
| Exit code | **0** (`node --version` 0, `npm test` 0, `npm run lint` 0, `npm run typecheck` 0) |
| Start / end | 2026-09-27T23:52:35Z → 2026-09-27T23:53:05Z |

```text
 Test Files  155 passed (155)
      Tests  2093 passed (2093)
   Duration  14.88s
```

```text
> eslint . && prettier --check . && node scripts/check-no-external-urls.mjs && node scripts/collect-licenses.mjs --check && node scripts/check-ui-strings.mjs
Checking formatting...
All matched files use Prettier code style!
THIRD-PARTY-LICENSES.md lists all 111 shipped packages.
TOTAL 0
```

`npm run typecheck` — `@apunta/shared`, `@apunta/server`, `@apunta/installer`,
`@apunta/web`, `@apunta/e2e` — printed no diagnostics and exited 0.

**The UI lane (readiness F7).** `npm test` collects the `web` project, so this
row is exposed to whatever the UI agent is doing. At 23:50:22Z and again at
23:52:35Z `git status --porcelain` showed **no `web/**` path modified or
untracked** — only this card's three modified server files, the two new
`server/src/db/safety*` files, and the coordinator's documentation. The tree was
therefore not mid-edit in the UI lane when the row ran, and all 155 files /
2093 tests passed.

Both rows were run twice: once at 23:50 on the tree as it stood after the last
test was added, and once more at 23:52 after a final comment-only edit to
`server/src/db/safety.ts`, so the numbers above belong to the tree exactly as
it is now. Both runs were 0.

**Not run, and not part of this card's criteria:** `npm run e2e` (L2; the card
names `V1` and `V2` only), `TZ=` variants, `npm run eval`, `cargo`, and the
four L2 parent-review rows. No e2e browser was launched, so nothing here spent
a browser's worth of CPU.

---

## Beyond the two rows: the real boot path, once per interesting shape

Not a card criterion, and labelled as such — but a unit test cannot catch a
module that only breaks in the built bundle, so the boot sequence was exercised
twice through the sandbox wrapper on the two ports assigned to this card, with
`APUNTA_FAKE_AI=1` so no model runtime was contacted. The server was built
first (`npm run build --workspace @apunta/server`, exit **0**, 23:47:24Z).

**1. First run — nothing to inspect (run `…23-47-33-909Z-0e8e4df6`, port 7835).**

| Field | Value |
| --- | --- |
| Command | `APUNTA_FAKE_AI=1 node scripts/v2/sandbox.mjs run --port 7835 -- node /tmp/p52-boot-check.mjs` |
| Exit code | **0** (ownership check passed, then the child) |
| Start / end | 23:47:33Z → 23:47:39Z |

```text
sandbox 2026-09-27T23-47-33-909Z-0e8e4df6 on 127.0.0.1:7835 data <sandbox>/2026-09-27T23-47-33-909Z-0e8e4df6/data
HEALTH {"testRunId":"2026-09-27T23-47-33-909Z-0e8e4df6"}
DATA DIR entries: ["apunta.db","apunta.db-shm","apunta.db-wal","apunta.lock"]
safety/ present: false
staging/ present: false
```

No `safety/` and no `staging/`: with no `apunta.db` the inspection is skipped
entirely and `openDatabase` creates the database, which is the card's "a data
folder with no `apunta.db` is not an inspect case".

**2. A pending migration — the whole sequence on a synthetic level-5 practice
(run `…23-48-07-826Z-a23abe78`, port 7836).** The data folder was seeded by
hand with the shipped migrations 001–005 and one prototype patient (John
Smith), then the built server was started on it.

```text
SEEDED level-5 practice at <sandbox>/2026-09-27T23-48-07-826Z-a23abe78/data/apunta.db
{"level":30,"msg":"Server listening at http://127.0.0.1:7836"}
{"level":30,"fakeAi":true,"msg":"Apunta on http://127.0.0.1:7836"}
{"level":30,"file":"apunta-backup-2026-09-27.zip","bytes":9356,"pruned":0,"msg":"daily backup written"}
{"level":30,"res":{"statusCode":200},"msg":"request completed"}
```

```text
$ ls <sandbox>/…/data
apunta.db  apunta.db-shm  apunta.db-wal  apunta.lock  backups  safety  staging
$ ls -l <sandbox>/…/data/safety
-rw-r--r-- 1 … 184320 … pre-migrate-5-11-2026-09-27T23-48-18-995Z.db
$ ls -l <sandbox>/…/data/staging        # empty: the staged copy was moved, not left
total 0
```

Read back after the server stopped (while it was running, the live database was
`SQLITE_BUSY` — C-OWN@1 rule 4's exclusive lock doing its job, which is why the
live figures below are from after the stop):

```text
snapshot {"level":5,"versions":[1,2,3,4,5],"people":["John Smith"],"integrity":[{"integrity_check":"ok"}],"patient_groups":0}
live     {"level":11,"people":["John Smith"],"patient_groups_table":1,"integrity":[{"integrity_check":"ok"}]}
```

So through the real binary: the safety copy is a **level-5** database that
passes its own integrity check and holds the practice, the live database is
**level 11** with the patient intact and the tables 006–011 added, and the
staging folder was cleaned up.

**A guard that fired, and was not worked around.** A second start over the
first run's data folder was attempted with `APUNTA_DATA_DIR` pointing at it, and
the wrapper refused **before creating anything**:

```text
$ APUNTA_DATA_DIR=<previous run's data> node scripts/v2/sandbox.mjs run --port 7836 -- …
refusing data folder <sandbox>/…: it equals (or sits inside) the platform default …
SANDBOX RUN EXIT=2
```

That is the wrapper doing its job (the override is what it compares against the
platform default), so the second start was done the legitimate way instead: a
fresh run folder with a level-5 database seeded into it, as above.

**One observation, outside this card, no action taken.** The server started by
hand on 7836 did not exit on a single `SIGTERM`: it was still listening about
25 s later. It was terminated with `SIGKILL` at 23:49:0xZ and both 7835 and
7836 were verified free afterwards. `server/src/index.ts` installs
`process.once(signal, () => void app.close().then(() => process.exit(0)))` and
the log shows no shutdown line at all, so where it hangs is in the existing
clean-shutdown path, which this card may not edit and this change does not
touch. The wrapper's own `run` (7835) stopped its server as designed, because
`stopServer` escalates to `SIGKILL` after 5 s. Recorded so the next reader is
not surprised; not a finding against this card.

---

## Tree state at the end

`git status --porcelain`, everything left uncommitted as instructed:

```text
 M docs/v2/ORCHESTRATION-LOG.md          (coordinator's, untouched)
 M docs/v2/state/PROGRESS.json           (coordinator's, untouched)
 M docs/v2/state/cards/P5.2.json         (coordinator's, untouched)
 M server/src/db/migrate.test.ts         (this card)
 M server/src/db/migrate.ts              (this card)
 M server/src/index.ts                   (this card)
?? docs/v2/state/dispatch/P5.2.md        (the dispatch, untracked already)
?? docs/v2/state/reviews/P3.1-AM058-ir.md (another reviewer's, never read or touched)
?? server/src/db/safety.test.ts          (this card, new)
?? server/src/db/safety.ts               (this card, new)
?? docs/v2/evidence/P5.2/verification.md (this file, new)
?? docs/v2/state/returns/P5.2.md         (this card's return, new)
```

`server/dist/` and `shared/dist/` were rebuilt by `npm run build:shared`,
`npm run typecheck` and the server build; both are git-ignored. HEAD is still
`88ef838` and the branch is still `feature/v2`.
