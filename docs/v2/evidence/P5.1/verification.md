# P5.1 verification evidence

Card: **P5.1 Consistent backup snapshots**, base commit `68f8786`
("Add P5.1 checkpoint; IR CLEAR"). All three rows ran at that HEAD, with the
working tree carrying only this card's edits; nothing was committed, pulled,
merged, rebased or reset.

Every command ran from the repository root with Node **24.19.0** first on
`PATH`:

```text
$ export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version
v24.19.0
```

No server was started, no database opened outside a test's own `mkdtempSync`
directory, and no app launched, so HS-2's non-launching allowance covers every
command here. Port 7717 was never contacted, `scripts/recover-current-linux.mjs`
and `scripts/smoke-live.mjs` were not run, and no sandbox run folder was used,
so none is recorded — the card's Verification section states that all three
rows run bare (in-process vitest, eslint/prettier, `tsc`).

**The pre-implementation result is recorded in
[`pre-implementation.md`](pre-implementation.md)** — the three cases as written
before any source change, and what they said on the base commit.

---

## V1 — the backup module, `db/snapshot.test.ts`

| Field | Value |
| --- | --- |
| Working directory | repository root |
| Command | `export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && npm run build:shared && npx vitest run server/src/backup server/src/db/snapshot.test.ts --reporter=verbose` |
| Exit code | **0** (`build:shared` 0, `vitest` 0) |
| Start / end | 2026-09-26T16:04:27Z → 2026-09-26T16:04:30Z |

Excerpt (the four files V1 names, and the totals):

```text
 ✓ |server| src/db/snapshot.test.ts > snapshotDatabase > returns the path of a readable copy — vacuum-into
 ✓ |server| src/db/snapshot.test.ts > snapshotDatabase > includes the row the write-ahead log is still holding — vacuum-into
 ✓ |server| src/db/snapshot.test.ts > snapshotDatabase > returns the path of a readable copy — online-backup
 ✓ |server| src/db/snapshot.test.ts > snapshotDatabase > includes the row the write-ahead log is still holding — online-backup
 ✓ |server| src/db/snapshot.test.ts > snapshotDatabase > leaves the source exactly as it was — still open, still writable, still holding its own row
 ✓ |server| src/db/snapshot.test.ts > snapshotDatabase > is not the same as copying the database file, which is the case the copy exists for
 ✓ |server| src/db/snapshot.test.ts > snapshotDatabase > says which copy failed, rather than passing SQLite's own words on
 ✓ |server| src/db/snapshot.test.ts > snapshotDatabase > refuses to overwrite a copy that is already there
 ✓ |server| src/backup/backup.test.ts > the archive > carries no -wal or -shm, and its copy holds the row the WAL was keeping
 ✓ |server| src/backup/backup.test.ts > the archive > leaves no staging copy of the database behind, on success and on failure
 ✓ |server| src/backup/backup.test.ts > one moment (C-SNAP@1) > keeps a write that lands mid-backup out of every part of the archive — createBackup
 ✓ |server| src/backup/backup.test.ts > one moment (C-SNAP@1) > keeps a write that lands mid-backup out of every part of the archive — createBackupAsync
 ✓ |server| src/backup/backup.test.ts > one backup at a time (C-SNAP@1 rule 3) > still waits 60 s before giving up
 ✓ |server| src/backup/backup.test.ts > one backup at a time (C-SNAP@1 rule 3) > answers a second backup with backup_in_progress, and the first still succeeds
 ✓ |server| src/backup/backup.test.ts > one backup at a time (C-SNAP@1 rule 3) > makes the daily automatic backup wait for the same lock, not the route
 ✓ |server| src/backup/backup.test.ts > one backup at a time (C-SNAP@1 rule 3) > tidies an empty backups/.staging from an older install, and never one holding a copy
 ✓ |server| src/backup/backup.test.ts > one backup at a time (C-SNAP@1 rule 3) > deletes only its own staging folder, so one run cannot erase the other
 ✓ |server| src/backup/restore.test.ts > restoring an archive taken mid-write > carries the whole archive, so the assertions below are about the right file
 ✓ |server| src/backup/restore.test.ts > restoring an archive taken mid-write > restores a database that passes its own integrity check
 ✓ |server| src/backup/restore.test.ts > restoring an archive taken mid-write > restores exactly the notes the archive describes, and not the one that arrived mid-backup

 Test Files  5 passed (5)
      Tests  52 passed (52)
```

The three cases the card names, and where each one lives:

- **consistency**, against **both** `createBackup` and `createBackupAsync` —
  `backup.test.ts` → `one moment (C-SNAP@1)`, two cases generated from one body
  so the two entry points cannot drift apart. Each asserts that a note written
  in `onCopied` (after the copy, before any derivation) is absent from the
  manifest counts, from `data.json`, from the readable notes **and** from the
  archive's own `.db` opened read-only, while the live database is one note
  further on.
- **WAL** — the pre-existing case at what was `backup.test.ts:120-133`,
  extended rather than duplicated: the row committed without a checkpoint is now
  read out of the archive's `.db` (not counted from the live handle), and the
  zip still carries no `-wal`/`-shm` entry.
- **overlap** — `one backup at a time (C-SNAP@1 rule 3)`: the 409 observed
  through the `lockWaitMs` override, the production number still `60_000`, the
  daily automatic backup waiting on the same lock, per-operation staging
  folders, and the legacy `.staging` tidy-up.

`server/src/db/snapshot.test.ts` and `server/src/backup/restore.test.ts` are
both new in this card and both are collected — 5 files, 52 cases, 0 skipped.
`No test files found` does not appear anywhere in the run.

## V2 — the restore of a mid-write archive

| Field | Value |
| --- | --- |
| Working directory | repository root |
| Command | `export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && npm run build:shared && npx vitest run server/src/backup/restore.test.ts --reporter=verbose` |
| Exit code | **0** (`build:shared` 0, `vitest` 0) |
| Start / end | 2026-09-26T16:04:30Z → 2026-09-26T16:04:31Z |

```text
 ✓ |server| src/backup/restore.test.ts > restoring an archive taken mid-write > carries the whole archive, so the assertions below are about the right file
 ✓ |server| src/backup/restore.test.ts > restoring an archive taken mid-write > restores a database that passes its own integrity check
 ✓ |server| src/backup/restore.test.ts > restoring an archive taken mid-write > restores exactly the notes the archive describes, and not the one that arrived mid-backup

 Test Files  1 passed (1)
      Tests  3 passed (3)
```

1 file, 3 cases, **0 skipped**. The three assertions V2 names:

1. the step-1 archive is restored into a fresh `mkdtempSync` data directory
   through `stageRestore` + `applyPendingRestore`;
2. `PRAGMA integrity_check` on the restored database (through the project's own
   `integrityCheck`, which opens read-only) is `ok`;
3. the restored notes equal the archive's readable notes — `noteEntries` on the
   restored database is compared entry for entry, path and text, with the
   archive's `notes/` entries — **and** the note step 1 injected is absent from
   both the restored database and the restored readable notes.

Case 3 is the one `backup.test.ts:167`'s round trip does not check, and it is
asserted twice over: `titles` for John Smith is checked directly, and the full
`noteEntries` equality fails if the note is in there by any path.

## V3 — the whole suite, lint and typecheck

| Field | Value |
| --- | --- |
| Working directory | repository root |
| Command | `export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && npm test && npm run lint && npm run typecheck` |
| Exit code | **0** for all three (`npm test` 0, `npm run lint` 0, `npm run typecheck` 0) |
| Start / end | 2026-09-26T16:04:35Z → 2026-09-26T16:04:55Z |

```text
effective time zone: America/Mexico_City (TZ=<unset>)

 Test Files  141 passed (141)
      Tests  1801 passed (1801)

Checking formatting...
All matched files use Prettier code style!
THIRD-PARTY-LICENSES.md lists all 111 shipped packages.
TOTAL 0
```

`grep -c "error TS"` over the `typecheck` output: **0**. This is where the 409
lives or dies, and it lives: `backup_in_progress` is a member of the closed
`ApiErrorCodeSchema`, so `new HttpError(409, 'backup_in_progress', …)` in
`server/src/routes/backup.ts` typechecks; had the member been left out, that
line would not compile. `server/src/db/snapshot.ts` and
`server/src/backup/lock.ts` are the new modules and both are covered by the
same run. No file outside the card's May-edit list was touched, so there was no
red lint or typecheck to escalate (HS-9).

---

## Tripwires: the new cases were each proved able to fail

A case that cannot fail is not evidence, so each of rules 2 and 3 was broken on
purpose, the row re-run, and the source restored byte for byte
(`diff` of the restored file against the implemented version: identical). The
mutations were applied to the working tree only; nothing was committed.

| # | Mutation | Row re-run | Result |
| --- | --- | --- | --- |
| 1 | `finishPreparation` reads the manifest, dump, plans and notes from `options.db` again instead of the read-only copy (rule 2) | `vitest run server/src/backup/backup.test.ts server/src/backup/restore.test.ts -t "mid-backup"` | **exit 1**, 3 cases fail. `expected 5 to be 4` at `expect(manifest.counts['notes']).toBe(4)` — the manifest counts the late note while the archive's database does not contain it. The restore case fails on the same interleaving. |
| 2 | `createBackup`'s cleanup removes the whole `<dataDir>` instead of its own `<op>-<uuid>` folder (rule 3) | `vitest run server/src/backup/backup.test.ts -t "staging"` | **exit 1**, 2 cases fail: `expected [] to deeply equal [ Array(1) ]` — the concurrent run's folder was erased with the data directory. |
| 3 | `runBackupAsync` no longer takes the lock (rule 3) | `vitest run server/src/backup/backup.test.ts -t "one backup at a time"` | **exit 1**, 2 cases fail: `promise resolved … instead of rejecting` and `expected true to be false` (the daily backup stopped waiting). |
| 4 | `removeLegacyStaging` deletes `backups/.staging` without checking whether it is empty (decision 5) | `vitest run server/src/backup/backup.test.ts -t "staging"` | **exit 1**, 1 case fails: `expected false to be true` — the leftover copy was gone. |

Mutation 2 is the one worth singling out. The **first** version of that case
asserted only "no `<op>-<uuid>` folder is left at the end", and mutation 2
**passed** against it: deleting the entire staging root also leaves no folder
behind, so the case was watching a property both behaviours shared. It was
rewritten to start a second backup, leave it mid-copy, run a failing and then a
successful backup to completion around it, and assert that the *other* run's
folder is still there after each — which is what makes it a tripwire, and it is
the same class of vacuous assertion decision 8 warns about for the re-pointed
`leaves no staging copy of the database behind` case.

---

## A HEAD drift during the session, reported as the card requires

`git log -1` was the card's base commit `68f8786` at the start of this session
and all of the work was done against it. **HEAD then moved by nine commits,
every one of them another card's:**

```text
$ git log --oneline 68f8786..HEAD
3e2e4e7 Add one platform-path policy (card P4.2)
aaebc4d S2.4 attempt 2: restore English text, extend Import test
3088ed4 Add P4.1 checkpoint
ba63695 P4.1: correct V1 tripwire base count to 130 (IR r3 note)
0d3ce0f P4.1: fix union contradiction and empty-redirect-host stop (IR r2)
fe6d1c9 P3.1: fix not_found code, format prerequisite, boot-error failure case (IR r2)
4718e7e Add P4.2 checkpoint; IR CLEAR
c085343 Commit S2.4 allowlist (AM-040); record S2.4 CHANGES REQUESTED
368fbe9 Repair P4.1 card text per IR round 1 (AM-024)
```

`git diff --name-only 68f8786..HEAD` lists 34 paths, and **none of them is in
this card's May-edit list**: they are `docs/v2/**` for P3.1/P4.1/P4.2/S2.4,
`installer/src/cli*.ts`, `scripts/check-ui-strings.allow.json`,
`scripts/v2/sandbox.mjs`, `server/src/config*.ts`, `shared/src/i18n/en.ts`,
`shared/src/i18n/es-MX.ts`, `shared/src/index.ts`,
`shared/src/platform-paths.ts`, `web/src/components/NotesColumn.tsx`,
`web/src/components/PatientDirectory.tsx`, `web/src/routes/Import.tsx` and
`web/src/routes/Import.test.tsx`. This agent ran no `pull`, `merge`, `rebase`,
`reset` or `commit`; its only git commands were `log`, `diff`, `status`,
`show` and the final `add` of this card's explicit paths.

All three rows were therefore **re-run in full at the new HEAD `3e2e4e7`**, with
the same commands and the same code, and all three pass again:

| Row | Command | Exit | Start / end (UTC) |
| --- | --- | --- | --- |
| V1 | `npm run build:shared && npx vitest run server/src/backup server/src/db/snapshot.test.ts --reporter=verbose` | 0 (52 cases) | 16:07:10Z → 16:07:14Z |
| V2 | `npm run build:shared && npx vitest run server/src/backup/restore.test.ts --reporter=verbose` | 0 (3 cases, 0 skipped) | 16:07:14Z → 16:07:15Z |
| V3 | `npm test && npm run lint && npm run typecheck` | 0 / 0 / 0 (141 files, 1801 tests) | 16:07:15Z → 16:07:40Z |

**Every criterion passes at both `68f8786` and `3e2e4e7`**, and no drifted
commit touches a source, test or shared file this card edits.

| Decision | Where it is |
| --- | --- |
| 1 — one snapshot function | `server/src/db/snapshot.ts`, `snapshotDatabase(source, destination[, method])`, returning the copy's path. `archive.ts` calls it and holds no copy mechanics; `vacuumInto`/`backupInto` are thin wrappers that keep the backup's own `BackupError` vocabulary. |
| 2 — the lock is in the module, the route only names the status | `server/src/backup/lock.ts` wrapping `runBackup` and `runBackupAsync` (`server/src/backup/index.ts`), so `POST /api/backup` and `maybeRunDailyBackupAsync` (`server/src/index.ts:94`) are both covered; `BackupError`'s union gains `backup_in_progress`; `routes/backup.ts` maps that one code to `new HttpError(409, 'backup_in_progress', …)` and leaves every other `BackupError` at `badRequest`. |
| 3 — `onCopied?` on both paths | `CreateBackupOptions.onCopied`, invoked in `finishPreparation` after `integrityCheck` and before the copy handle is used, which is the single body `prepareBackup` and `prepareBackupAsync` share. Step 1's assertions run against both entry points. |
| 4 — the online backup API is the primitive, both entry points stay | `backupInto` and `vacuumInto` are both kept and both tested; the copy always lands inside `<dataDir>`, so `backup.test.ts`'s "writes nothing into TMPDIR" case stays green and did. |
| 5 — `<op>` and the staging root | `<dataDir>/staging/<op>-<uuid>/`, `mkdirSync(…, { recursive: true, mode: 0o700 })` for both the root and the operation folder, `op` is `backup` (default) or `pre-migrate`; `backups/.staging` is removed only while empty, and that guard is the tripwire of mutation 4. |
| 6 — every derived field from the copy | `finishPreparation` opens the copy read-only and takes `migration_level` (the copy's `schema_migrations` table, via `migrationLevel`), `sqlite_version`, `counts`, `data.json`, the readable notes and the plans from it. Only `app_version`, `generated_at`, `encrypted` and the caller's own inputs come from the request. |
| 7 — 60 s with a test seam | `BACKUP_LOCK_WAIT_MS = 60_000` exported from `server/src/backup/lock.ts`, released in a `finally`; one case asserts it is still `60_000`, and `RunBackupOptions.lockWaitMs` overrides it so the 409 arrives in ~20 ms. No test sleeps a minute and no fake timer is involved. |
| 8 — the staging case re-pointed, not deleted | `leaves no staging copy of the database behind, on success and on failure` now watches `<dataDir>/staging` and asserts after both a successful and a failed run. |

## Notes for the reviewer

1. **The route's 409 case uses a spy, not a real wait.** Rule 3's 60 s belongs
   to the contract and a test may not shorten it (HS-7), so
   `server/src/routes/backup.test.ts` mocks `runBackupAsync` (pass-through
   spy: `vi.fn(actual.runBackupAsync)`, so every other case in the file still
   writes a real archive) and rejects once with
   `new BackupError('another backup is already running…', 'backup_in_progress')`.
   What that case tests is the **mapping**: 409, the
   `backup_in_progress` body, and no archive and no `last_backup_at`. That the
   lock really refuses is proved in `backup.test.ts`, through the real
   `lockWaitMs` override. A first attempt drove this case with
   `vi.useFakeTimers()` and the request never completed — fastify's
   `inject` does not settle under vitest's fake clock, and the leak then
   hung the ten cases after it. The spy is the smaller, sturdier instrument.
2. **The daily-path case asserts that it waits, not that it is refused.**
   `maybeRunDailyBackupAsync` takes no options, so there is no way to give it a
   short wait without a 60-second test, and the case instead proves the
   coverage decision 2 asks for: the daily backup is still unresolved 50 ms
   into a 200 ms hold, and completes once the hold is released. The refusal
   itself is the previous case, on `runBackupAsync` directly.
3. **`withBackupLock` and `withBackupLockSync` are exported** from the backup
   module. The lock is production code the tests need to hold and release
   directly; without an exported handle the only way to be "the other backup"
   is to start a real one and hope it is slow enough, which is timing, not
   evidence.
4. **`onCopied` is called while the copy is open read-only.** For the async
   path the copy is in WAL mode, so opening it read-only creates `-wal`/`-shm`
   sidecars *inside the operation's staging folder*; they go with the folder at
   cleanup and never reach the zip, which still carries one `apunta.db` entry
   (asserted by the WAL case).
