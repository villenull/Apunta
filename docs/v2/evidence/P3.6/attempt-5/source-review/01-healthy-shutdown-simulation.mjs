/**
 * Source-review evidence for P3.6 attempt 5 (D2).
 *
 * Simulates the end state of a HEALTHY run against the harness's own
 * exported helpers, with no server, no AppImage and no lock protocol:
 *
 *  - the baseline is taken while the server runs (WAL mode, connection
 *    open), so all four C-OWN@1 files are present;
 *  - the stop is SIGTERM, which the server answers with `app.close()`
 *    (`server/src/index.ts:147-149`), whose `onClose` hook runs
 *    `db.close()` and `lock.release()` (`server/src/index.ts:99-106`);
 *  - `db.close()` as the last WAL connection makes SQLite checkpoint and
 *    **delete** `apunta.db-wal` and `apunta.db-shm`;
 *  - `lock.release()` unlinks `apunta.lock` (C-OWN@1 rule 5).
 *
 * The question: does `ownershipIdentityDiff` pass that end state?
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ownershipContainment,
  ownershipIdentityDiff,
  ownershipIdentitySnapshot,
  snapshotDataDirNames,
} from '/home/villenull/Projects/Apunta/scripts/v2/tauri-e2e-smoke.test.mjs';

process.env['APUNTA_DATA_DIR'] = mkdtempSync(join(tmpdir(), 'p36-source-review-'));
process.env['APUNTA_PORT'] = '7879';
process.env['APUNTA_TEST_RUN_ID'] = 'p36-attempt5-source-review';

const dir = process.env['APUNTA_DATA_DIR'];
for (const name of ['apunta.lock', 'apunta.db', 'apunta.db-wal', 'apunta.db-shm']) {
  writeFileSync(join(dir, name), `${name} contents`);
}

const baseline = ownershipIdentitySnapshot(dir);
console.log('baseline present:', baseline.map((file) => `${file.name}=${file.present}`).join(' '));

// The healthy shutdown: SQLite deletes the WAL pair, rule 5 releases the lock.
rmSync(join(dir, 'apunta.db-wal'));
rmSync(join(dir, 'apunta.db-shm'));
rmSync(join(dir, 'apunta.lock'));

const after = ownershipIdentitySnapshot(dir);
console.log('after present:   ', after.map((file) => `${file.name}=${file.present}`).join(' '));

const diff = ownershipIdentityDiff(baseline, after);
console.log('identity diff ok:', diff.ok);
console.log('identity diff why:', diff.why);
console.log('lost:', JSON.stringify(diff.lost));
console.log('released:', JSON.stringify(diff.released));

// The pre-existing name-set check, same end state.
const names = snapshotDataDirNames(dir);
const own = ownershipContainment(
  ['apunta.db', 'apunta.db-shm', 'apunta.db-wal', 'apunta.lock'],
  names,
);
console.log('name-set vanished:', JSON.stringify(own.vanished));

rmSync(dir, { recursive: true, force: true });

process.exitCode = diff.ok ? 0 : 1;
