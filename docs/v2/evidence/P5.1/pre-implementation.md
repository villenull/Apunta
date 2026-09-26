# P5.1 — the three cases before any source change

Card step 1 says **test first**: write the consistency case, run it, and record
the result. Steps 2 and 3 are cases too, so all three were written before any
production file was touched, and this is what they said on the base commit
`68f8786`.

Every command ran from the repository root with Node 24.19.0 first on `PATH`.
No server was started and no database outside a test's own `mkdtempSync`
directory was opened (HS-2); port 7717 was never contacted (HS-1). The raw logs
are not committed (`*.log` is gitignored); the excerpts below are the runs.

## Run 1 — the consistency case alone, `npx vitest run server/src/backup --reporter=verbose`

Start 2026-09-26T15:51:41Z, end 15:51:44Z, **exit 1**.

```text
 FAIL  |server| src/backup/backup.test.ts > one moment (C-SNAP@1) > keeps a write that lands mid-backup out of every part of the archive — createBackup
AssertionError: expected 4 to be 5 // Object.is equality

- Expected
+ Received

- 5
+ 4

 ❯ src/backup/backup.test.ts:268:34
    266|       // The write really did land: the live database is one note furt…
    268|       expect(count(db, 'notes')).toBe(5);
       |                                  ^

 Test Files  1 failed | 2 passed (3)
      Tests  2 failed | 34 passed (36)
```

**The card's first stop condition does not apply, and the reason is worth
being exact about.** It says: *"V1's consistency test passes on the base
commit: record it (the risk did not reproduce), keep the test, still apply
rules 2 and 3."* The test does not pass — it cannot even be constructed. The
interleaving is injected through `CreateBackupOptions.onCopied`, a field that
does not exist on the base commit, so the write never happens: the live database
is still at 4 notes and the first assertion is the one that fails. The risk was
therefore **not shown to be absent**; it was shown to be unobservable from
outside, which is the same thing R14 already records — the card's own
Confidence field says *"source-backed consistency risk, not reproduced end to
end"*.

What the base commit does say, read directly, is that every derived
representation came from the live handle: `finishPreparation` computed
`migrationLevel(options.db)`, `sqliteVersion(options.db)`,
`tableCounts(options.db)`, `dumpDatabase(options.db, …)`, `planEntries(options.db)`
and `noteEntries(options.db)` after the copy had been made
(`server/src/backup/archive.ts:119-148` at `68f8786`). With no seam between the
copy and that derivation, the property depended entirely on there being no
interleaving point — and on the async path there is one, because
`better-sqlite3`'s online backup yields between page batches while the rest of
the body is synchronous. Mutation 1 in `verification.md` is the demonstration:
putting the reads back on `options.db` makes the new cases fail with
`expected 5 to be 4`.

## Run 2 — all three cases plus the two new test files, exactly V1's and V2's commands

`npm run build:shared` (exit 0) then V1 and V2. Start 2026-09-26T15:53:53Z, end
15:53:58Z. **V1 exit 1, V2 exit 1.**

```text
 FAIL  |server| src/db/snapshot.test.ts [ server/src/db/snapshot.test.ts ]
Error: Cannot find module './snapshot.js' imported from <repo>/server/src/db/snapshot.test.ts
 ❯ src/db/snapshot.test.ts:8:1
Serialized Error: { code: 'ERR_MODULE_NOT_FOUND' }

 FAIL  |server| src/backup/backup.test.ts > one moment (C-SNAP@1) > keeps a write that lands mid-backup out of every part of the archive — createBackup
AssertionError: expected 4 to be 5 // Object.is equality
 ❯ src/backup/backup.test.ts:274:34
    274|       expect(count(db, 'notes')).toBe(5);

 FAIL  |server| src/backup/backup.test.ts > one moment (C-SNAP@1) > keeps a write that lands mid-backup out of every part of the archive — createBackupAsync
AssertionError: expected 4 to be 5 // Object.is equality
 ❯ src/backup/backup.test.ts:274:34

 FAIL  |server| src/backup/backup.test.ts > one backup at a time (C-SNAP@1 rule 3) > still waits 60 s before giving up
AssertionError: expected undefined to be 60000 // Object.is equality
 ❯ src/backup/backup.test.ts:331:33
    331|     expect(BACKUP_LOCK_WAIT_MS).toBe(60_000);

 FAIL  |server| src/backup/backup.test.ts > one backup at a time (C-SNAP@1 rule 3) > answers a second backup with backup_in_progress, and the first still succeeds
TypeError: withBackupLock is not a function
 ❯ src/backup/backup.test.ts:336:21

 FAIL  |server| src/backup/backup.test.ts > one backup at a time (C-SNAP@1 rule 3) > covers the daily automatic backup too, because the lock is not in the route
TypeError: withBackupLock is not a function
 ❯ src/backup/backup.test.ts:358:21

 FAIL  |server| src/backup/backup.test.ts > one backup at a time (C-SNAP@1 rule 3) > deletes only its own staging folder, so a failing run cannot erase the other one
TypeError: You must provide a Promise to expect() when using .rejects, not 'undefined'.
 ❯ src/backup/backup.test.ts:396:29

 FAIL  |server| src/backup/restore.test.ts > restoring an archive taken mid-write > carries the whole archive, so the assertions below are about the right file
AssertionError: expected 4 to be 5 // Object.is equality
 ❯ src/backup/restore.test.ts:88:86

 Test Files  3 failed | 2 passed (5)
      Tests  7 failed | 36 passed (43)
```

V2 on its own, `npx vitest run server/src/backup/restore.test.ts --reporter=verbose`,
15:53:58Z, **exit 1**, 1 failed and 2 passed: the restored-notes case passes on
the base commit, which is exactly the pre-existing round-trip behaviour the card
warns about — it passes on the strength of a restore that never had a mid-write
note to exclude. The two cases that assert the exclusion fail, because the
`onCopied` seam does not exist yet.

Every failure above is a missing mechanism rather than a wrong answer: no
`onCopied`, no `BACKUP_LOCK_WAIT_MS`, no `withBackupLock`, no
`db/snapshot.ts`, and a staging case watching `<dataDir>/staging` before
anything writes there.

Two of these cases were **rewritten while implementing**, for the reasons given
in `verification.md` § "Notes for the reviewer" and § "Tripwires":
`covers the daily automatic backup too` became `makes the daily automatic
backup wait for the same lock, not the route` (it asserted a refusal that could
only be provoked by a 60-second wait, and a real run that simply waited its turn
is what the coverage actually needs to show), and the first version of
`deletes only its own staging folder` became the case that starts a second
backup and leaves it mid-copy — the first version passed even when the cleanup
was widened to delete the whole data directory. The names above are the ones
this run used.
