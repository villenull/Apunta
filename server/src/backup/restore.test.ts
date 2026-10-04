import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DB_ENTRY_NAME,
  DATA_JSON_FILENAME,
  MANIFEST_FILENAME,
  PENDING_RESTORE_DIRNAME,
  RESTORE_FILENAME,
  type BackupManifest,
} from '@apunta/shared';
import BetterSqlite3 from 'better-sqlite3';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig, type AppConfig } from '../config.js';
import { listFormats } from '../db/formats.js';
import { createNote, listNotesForPatient } from '../db/notes.js';
import { listPatients } from '../db/patients.js';
import { openDatabase, type Database } from '../db/index.js';
import { seedDatabase } from '../seed.js';
import { createBackup, integrityCheck, type CreatedBackup } from './archive.js';
import { noteEntries } from './readable.js';
import {
  applyPendingRestore,
  hasPendingRestore,
  rollbackAppliedRestore,
  stageRestore,
  type RestoreStep,
} from './restore.js';

/**
 * C-SNAP@1 rule 2, seen from the far end: what a restore actually gets.
 *
 * The archive is taken while a write is landing, and then restored into a
 * fresh data directory. The criterion is the one the pre-existing round-trip in
 * `backup.test.ts` does not check: the note that arrived mid-backup is absent
 * from the restored **database** and from the restored **readable notes**. A
 * round trip that passes on the strength of "a note came back, character for
 * character" says nothing about which moment it came from.
 */

const LATE_NOTE_TITLE = 'Late Session Note';

let dataDir: string;
let db: Database;
let fresh: string;

function open(dir: string): { config: AppConfig; db: Database } {
  const loaded = loadConfig({ APUNTA_DATA_DIR: dir, APUNTA_FAKE_AI: '1' });
  const { db: opened } = openDatabase({ file: loaded.dbFile, migrationsDir: loaded.migrationsDir });
  return { config: loaded, db: opened };
}

function entries(path: string): Record<string, Uint8Array> {
  return unzipSync(readFileSync(path));
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'apunta-restore-snap-'));
  db = open(dataDir).db;
  seedDatabase(db);
  fresh = mkdtempSync(join(tmpdir(), 'apunta-restore-snap-target-'));
});

afterEach(() => {
  db.close();
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(fresh, { recursive: true, force: true });
});

/** One backup, taken while a write lands between the copy and the derivation. */
function archiveWithALateWrite(): CreatedBackup {
  return createBackup({
    db,
    dataDir,
    directory: join(dataDir, 'backups'),
    appVersion: '1.2.3',
    onCopied: () => {
      const john = listPatients(db).find((patient) => patient.name === 'John Smith');
      const format = listFormats(db)[0];
      createNote(db, {
        patient_id: john?.id ?? '',
        format_id: format?.id ?? '',
        title: LATE_NOTE_TITLE,
        content: 'Written after the database had already been copied.',
      });
    },
  });
}

describe('restoring an archive taken mid-write', () => {
  it('carries the whole archive, so the assertions below are about the right file', () => {
    const created = archiveWithALateWrite();
    const body = entries(created.path);

    expect(Object.keys(body)).toEqual(
      expect.arrayContaining(['apunta.db', DATA_JSON_FILENAME, MANIFEST_FILENAME, RESTORE_FILENAME]),
    );
    // The write landed on the live database; the archive is a moment earlier.
    expect((db.prepare('SELECT COUNT(*) AS n FROM notes').get() as { n: number }).n).toBe(5);
    const manifest = JSON.parse(strFromU8(body[MANIFEST_FILENAME] ?? new Uint8Array())) as BackupManifest;
    expect(manifest.counts['notes']).toBe(4);
  });

  it('restores a database that passes its own integrity check', () => {
    const created = archiveWithALateWrite();
    stageRestore({
      archivePath: created.path,
      dataDir: fresh,
      maxMigrationLevel: created.manifest.migration_level,
    });
    expect(applyPendingRestore(fresh).applied).toBe(true);

    const restored = open(fresh);
    try {
      expect(integrityCheck(restored.config.dbFile)).toBe('ok');
    } finally {
      restored.db.close();
    }
  });

  it('restores exactly the notes the archive describes, and not the one that arrived mid-backup', () => {
    const created = archiveWithALateWrite();
    const archiveNotes = Object.entries(entries(created.path))
      .filter(([path]) => path.startsWith('notes/'))
      .map(([path, text]) => ({ path, text: strFromU8(text) }));
    expect(archiveNotes).toHaveLength(4);

    stageRestore({
      archivePath: created.path,
      dataDir: fresh,
      maxMigrationLevel: created.manifest.migration_level,
    });
    expect(applyPendingRestore(fresh).applied).toBe(true);

    const restored = open(fresh);
    try {
      const john = listPatients(restored.db).find((patient) => patient.name === 'John Smith');
      const titles = listNotesForPatient(restored.db, john?.id ?? '').map((note) => note.title);
      expect(titles).not.toContain(LATE_NOTE_TITLE);
      expect(titles).toHaveLength(3);

      // The restored readable notes are the archive's, entry for entry.
      expect(noteEntries(restored.db)).toEqual(archiveNotes);
    } finally {
      restored.db.close();
    }
  });
});

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/**
 * The child this section's cases start from: it commits five rows in WAL
 * mode with autocheckpoint off, and then `process.exit(0)`s without ever
 * closing — a crash, a kill, power loss. What it leaves is the state a
 * restore used to walk into: `apunta.db` without the rows, all of them in
 * `apunta.db-wal` and nowhere else.
 */
const UNCHECKPOINTED_WRITER = `
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(process.env['APUNTA_WAL_TARGET']);
  db.pragma('journal_mode = WAL');
  db.pragma('wal_autocheckpoint = 0');
  db.exec('CREATE TABLE wal_rows (id INTEGER PRIMARY KEY, label TEXT NOT NULL)');
  const insert = db.prepare('INSERT INTO wal_rows (label) VALUES (?)');
  for (let i = 1; i <= 5; i += 1) insert.run('row-' + String(i));
  process.exit(0);
`;

/** The labels `UNCHECKPOINTED_WRITER` commits, in order. */
const FIVE_ROWS = ['row-1', 'row-2', 'row-3', 'row-4', 'row-5'];

/** Every label in `wal_rows`, read through whatever SQLite does on open. */
function walRows(file: string): string[] {
  return readWithLog(file, (handle) =>
    (handle.prepare('SELECT label FROM wal_rows ORDER BY id').all() as { label: string }[]).map(
      (row) => row.label,
    ),
  );
}

/** Whether the database has a table of this name, read the way SQLite reads it — log included. */
function hasTable(file: string, name: string): boolean {
  return readWithLog(
    file,
    (handle) =>
      handle.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined,
  );
}

/**
 * Read `file` the way SQLite reads it, through whatever log is beside it, and
 * put the folder back as it was. Opening a WAL database creates empty
 * `-wal`/`-shm` files even read-only — SQLite's doing, not the code under
 * test's — so the ones that were not there before are taken away again, and
 * the file-state assertions around these helpers see only what the code under
 * test did.
 */
function readWithLog<T>(file: string, read: (handle: InstanceType<typeof BetterSqlite3>) => T): T {
  const present = ['-wal', '-shm']
    .map((suffix) => `${file}${suffix}`)
    .filter((sidecar) => existsSync(sidecar));
  const handle = new BetterSqlite3(file, { readonly: true });
  try {
    return read(handle);
  } finally {
    handle.close();
    for (const suffix of ['-wal', '-shm']) {
      const sidecar = `${file}${suffix}`;
      if (!present.includes(sidecar) && existsSync(sidecar)) rmSync(sidecar, { force: true });
    }
  }
}

/**
 * Spawn the child against `file`, then pin the state it leaves behind: the
 * log exists, and the database file on its own does not contain the rows.
 * Every case below stands on that, so it is asserted rather than assumed.
 */
function writeRowsWithoutCheckpointing(file: string): void {
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', UNCHECKPOINTED_WRITER], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, APUNTA_WAL_TARGET: file },
  });
  if (child.status !== 0) {
    throw new Error(`the child exited with ${String(child.status)}: ${child.stderr}`);
  }
  expect(existsSync(`${file}-wal`)).toBe(true);

  const alone = mkdtempSync(join(tmpdir(), 'apunta-wal-alone-'));
  try {
    copyFileSync(file, join(alone, DB_ENTRY_NAME));
    expect(() => walRows(join(alone, DB_ENTRY_NAME))).toThrow(/no such table/i);
  } finally {
    rmSync(alone, { recursive: true, force: true });
  }
}

describe('a pending restore over a database whose log was never checkpointed', () => {
  it('folds the log into the safety copy, so the rows only it held survive the swap', () => {
    const created = archiveWithALateWrite();
    const live = join(fresh, DB_ENTRY_NAME);
    writeRowsWithoutCheckpointing(live);

    stageRestore({
      archivePath: created.path,
      dataDir: fresh,
      maxMigrationLevel: created.manifest.migration_level,
    });
    const applied = applyPendingRestore(fresh);

    expect(applied.applied).toBe(true);
    expect(hasPendingRestore(fresh)).toBe(false);
    const safetyCopy = applied.safetyCopy ?? '';
    expect(safetyCopy).not.toBe('');
    // Folded into the copy — not left beside the restored file, and not
    // thrown away with the log they came from.
    expect(existsSync(`${safetyCopy}-wal`)).toBe(false);
    expect(existsSync(`${live}-wal`)).toBe(false);
    expect(walRows(safetyCopy)).toEqual(FIVE_ROWS);
    // And `apunta.db` is the archive again: the child's table is not in it.
    expect(() => walRows(live)).toThrow(/no such table/i);
  });

  it('rolls back to a safety copy that still has every row', () => {
    const created = archiveWithALateWrite();
    const live = join(fresh, DB_ENTRY_NAME);
    writeRowsWithoutCheckpointing(live);

    stageRestore({
      archivePath: created.path,
      dataDir: fresh,
      maxMigrationLevel: created.manifest.migration_level,
    });
    const applied = applyPendingRestore(fresh);
    const safetyCopy = applied.safetyCopy ?? '';
    expect(walRows(safetyCopy)).toEqual(FIVE_ROWS);
    expect(() => walRows(live)).toThrow(/no such table/i);

    rollbackAppliedRestore(fresh, safetyCopy);

    // The copy was moved back rather than copied, and it came back whole:
    // its rows are inside the file itself, so there is no log beside it to
    // replay.
    expect(existsSync(safetyCopy)).toBe(false);
    expect(existsSync(`${live}-wal`)).toBe(false);
    expect(walRows(live)).toEqual(FIVE_ROWS);
  });

  it('carries the sidecars beside the safety copy when the live file cannot be opened', () => {
    const created = archiveWithALateWrite();
    const live = join(fresh, DB_ENTRY_NAME);
    writeFileSync(live, 'not really a database');
    writeFileSync(`${live}-wal`, 'stale log');
    writeFileSync(`${live}-shm`, 'stale index');

    stageRestore({
      archivePath: created.path,
      dataDir: fresh,
      maxMigrationLevel: created.manifest.migration_level,
    });
    const applied = applyPendingRestore(fresh);
    const safetyCopy = applied.safetyCopy ?? '';

    // The file travels as it was, and its sidecars travel with it: SQLite
    // derives a log's name from the database's, so beside the copy they
    // replay into it on the first open instead of being lost here.
    expect(readFileSync(safetyCopy, 'utf8')).toBe('not really a database');
    expect(readFileSync(`${safetyCopy}-wal`, 'utf8')).toBe('stale log');
    expect(readFileSync(`${safetyCopy}-shm`, 'utf8')).toBe('stale index');
    expect(existsSync(`${live}-wal`)).toBe(false);
    expect(existsSync(`${live}-shm`)).toBe(false);
    // And the restore itself went through.
    expect(integrityCheck(live)).toBe('ok');
  });

  it('carries the log when the checkpoint cannot run, and hands it back on rollback', () => {
    const created = archiveWithALateWrite();
    const live = join(fresh, DB_ENTRY_NAME);
    writeRowsWithoutCheckpointing(live);

    stageRestore({
      archivePath: created.path,
      dataDir: fresh,
      maxMigrationLevel: created.manifest.migration_level,
    });
    // A binding path that does not exist: the fold cannot even open the
    // file, which is the failure the log has to come through.
    const applied = applyPendingRestore(fresh, join(fresh, 'no-such-binding.node'));
    const safetyCopy = applied.safetyCopy ?? '';

    expect(existsSync(`${safetyCopy}-wal`)).toBe(true);
    expect(existsSync(`${live}-wal`)).toBe(false);
    // The rows are in the log beside the copy, and SQLite replays it when
    // the copy is opened...
    expect(walRows(safetyCopy)).toEqual(FIVE_ROWS);

    // ...and the same is true of the file after a rollback.
    rollbackAppliedRestore(fresh, safetyCopy);
    expect(walRows(live)).toEqual(FIVE_ROWS);
    expect(existsSync(`${live}-wal`)).toBe(true);
  });
});

/**
 * A restore is several steps that cannot be undone together, so the promise
 * "the rows an unclean exit left only in the log are never lost" is a claim
 * about crashes: at each step there is a state a kill can leave behind, and
 * each of those states has to be recoverable at the next start.
 *
 * The states are built two ways, deliberately. Where the module offers a step
 * to crash at, the crash is real — the function throws exactly where a lost
 * process would have stopped — and the next boot is the function called again,
 * which is what `index.ts` and `db/safety.ts` do before anything opens the
 * file. Where a state is older than a code path (a hold taken by a build that
 * has since changed), it is assembled by hand from the files that code
 * produced, which is the only honest way to pin what such a build left.
 */

/** Every step `applyPendingRestore` announces, in the order it announces them. */
const APPLY_STEPS: readonly RestoreStep[] = [
  'interrupted-rollback-reconciled',
  'held-sidecars-restored',
  'wal-holds-copied',
  'wal-folded',
  'sidecars-settled',
  'live-database-moved-aside',
  'restored-database-in-place',
  'pending-folder-cleared',
];

/** And every step `rollbackAppliedRestore` announces, likewise. */
const ROLLBACK_STEPS: readonly RestoreStep[] = [
  'live-sidecars-removed',
  'live-database-removed',
  'safety-copy-moved-back',
  'safety-sidecars-moved-back',
];

/**
 * A data folder of its own with five rows committed in a log that was never
 * checkpointed, and an archive staged over it.
 *
 * Its own folder rather than the shared `fresh`, because the cases below build
 * several of these inside one test — a second apply on a folder the first one
 * already restored is a different state entirely, not the same one twice.
 */
const scratchDirs: string[] = [];

function stagedOverACrashedDatabase(): { readonly dir: string; readonly created: CreatedBackup } {
  const created = archiveWithALateWrite();
  const dir = mkdtempSync(join(tmpdir(), 'apunta-restore-crash-'));
  scratchDirs.push(dir);
  writeRowsWithoutCheckpointing(join(dir, DB_ENTRY_NAME));
  stageRestore({
    archivePath: created.path,
    dataDir: dir,
    maxMigrationLevel: created.manifest.migration_level,
  });
  return { dir, created };
}

afterEach(() => {
  for (const dir of scratchDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Every database-shaped file in `dir`, holds and sidecars excluded. */
function databaseFiles(dir: string): string[] {
  return readdirSync(dir).filter(
    (name) =>
      (name === DB_ENTRY_NAME || name.startsWith(`${DB_ENTRY_NAME}.before-restore-`)) &&
      !name.endsWith('-wal') &&
      !name.endsWith('-shm'),
  );
}

/**
 * True when some file in the data folder yields every row the crashed write
 * committed. Deliberately not "the live database has them": a rollback cut
 * short leaves the practice's records in the safety copy under its own name,
 * which is the file a user is told to keep, and the promise is that nothing is
 * lost rather than that one particular name holds it at every moment.
 */
function everyRowRecoverable(dir: string): boolean {
  return databaseFiles(dir).some((name) => {
    try {
      return JSON.stringify(walRows(join(dir, name))) === JSON.stringify(FIVE_ROWS);
    } catch {
      return false;
    }
  });
}

/** Crash at one step of a call, the way a lost process stops there. */
const crashAt =
  (step: RestoreStep) =>
  (reached: RestoreStep): void => {
    if (reached === step) throw new Error(`crashed at ${reached}`);
  };

describe('a restore interrupted at each of its steps', () => {
  it('keeps every row the crashed write committed, whichever step the crash came at', () => {
    // Both fold outcomes, because they are two different shapes of the same
    // promise: a folded log ends up inside the safety copy, an un-foldable one
    // ends up beside it, and a crash between the two loses rows if only one of
    // them was tested.
    for (const binding of [undefined, 'no-such-binding']) {
      for (const step of APPLY_STEPS) {
        const { dir } = stagedOverACrashedDatabase();
        expect(() => applyPendingRestore(dir, binding && join(dir, binding), crashAt(step)), step).toThrow(
          'crashed',
        );

        // The next start, which is the call itself: the data folder is locked,
        // nothing has opened the database, and this is the first thing that
        // happens.
        const booted = applyPendingRestore(dir);
        // It either finishes the restore, or finds the swap already done and
        // nothing left to apply. Both are the same end state.
        expect(booted.applied || !hasPendingRestore(dir), `${String(binding)} ${step}`).toBe(true);
        expect(everyRowRecoverable(dir), `${String(binding)} ${step}`).toBe(true);
        // The restore is finished, whatever it took: the staged database is
        // live and the pending folder is gone.
        expect(integrityCheck(join(dir, DB_ENTRY_NAME)), `${String(binding)} ${step}`).toBe('ok');
        expect(existsSync(join(dir, PENDING_RESTORE_DIRNAME)), `${String(binding)} ${step}`).toBe(false);
      }
    }
  });

  it('keeps every row the crashed write committed, whichever step the rollback was cut at', () => {
    for (const step of ROLLBACK_STEPS) {
      // The fold is made unavailable so the log travels beside the safety copy,
      // which is the shape that has a rollback step at all: a self-contained
      // copy has one step and nothing to interrupt.
      const { dir } = stagedOverACrashedDatabase();
      const applied = applyPendingRestore(dir, join(dir, 'no-such-binding.node'));
      expect(applied.applied, step).toBe(true);
      const safetyCopy = applied.safetyCopy ?? '';
      expect(walRows(safetyCopy), step).toEqual(FIVE_ROWS);

      expect(() => rollbackAppliedRestore(dir, safetyCopy, crashAt(step)), step).toThrow('crashed');

      const booted = applyPendingRestore(dir);
      // From `live-database-removed` on, the database the rollback was putting
      // back is what the practice must come up with. What had to be done to
      // get there is counted and logged, never named — a path in a log line
      // names a practice's files.
      if (step === 'live-database-removed') {
        expect(walRows(join(dir, DB_ENTRY_NAME)), step).toEqual(FIVE_ROWS);
        expect(booted.recoveredAfterCrash, step).toEqual({ databases: 1, sidecars: 2 });
      }
      if (step === 'safety-copy-moved-back') {
        expect(walRows(join(dir, DB_ENTRY_NAME)), step).toEqual(FIVE_ROWS);
        // The interrupted half: the database went home and its log did not.
        expect(booted.recoveredAfterCrash, step).toEqual({ databases: 0, sidecars: 2 });
      }
      // The first and last steps leave a state that needs nothing put back:
      // the safety copy and its log are already a whole pair where they
      // stand, and a finished rollback has nothing left over.
      if (step === 'live-sidecars-removed' || step === 'safety-sidecars-moved-back') {
        expect(booted, step).toEqual({ applied: false });
      }
      expect(everyRowRecoverable(dir), step).toBe(true);
      // Nothing is left half-swapped: where a pre-restore copy still exists,
      // the log that belongs to it is still beside it, and where it is gone
      // the log went home with it rather than lying beside a database it was
      // not written for.
      expect(existsSync(`${safetyCopy}-wal`), step).toBe(existsSync(safetyCopy));
      expect(existsSync(join(dir, PENDING_RESTORE_DIRNAME)), step).toBe(false);
    }
  });

  it('recovers the rows a boot finds as a hold and a database with no log beside it', () => {
    const { dir } = stagedOverACrashedDatabase();
    const live = join(dir, DB_ENTRY_NAME);
    const pending = join(dir, PENDING_RESTORE_DIRNAME);
    // What a build that takes the hold and then loses the process leaves: the
    // holds are on disk, and SQLite's own close took the sidecars with it.
    copyFileSync(`${live}-wal`, join(pending, `${DB_ENTRY_NAME}-wal.held`));
    copyFileSync(`${live}-shm`, join(pending, `${DB_ENTRY_NAME}-shm.held`));
    rmSync(`${live}-wal`, { force: true });
    rmSync(`${live}-shm`, { force: true });
    expect(() => walRows(live)).toThrow(/no such table/i);

    const applied = applyPendingRestore(dir);

    expect(applied.applied).toBe(true);
    // The safety copy is the whole database, log and all.
    expect(walRows(applied.safetyCopy ?? '')).toEqual(FIVE_ROWS);
    // And the hold, whose whole job was to survive until that, is gone with
    // the folder that held it: a log left lying there is how a later fold
    // mistakes a stale log for a live one, and nothing else wants it.
    expect(existsSync(pending)).toBe(false);
  });

  it('leaves a settled pending folder alone while it holds a log nothing else has', () => {
    const pending = join(fresh, PENDING_RESTORE_DIRNAME);
    mkdirSync(pending, { recursive: true });
    const hold = join(pending, `${DB_ENTRY_NAME}-wal.held`);
    writeFileSync(hold, 'the only copy of a log');
    // The safety copy the manifest names is not there, so nothing can say
    // where those rows went.
    writeFileSync(
      join(pending, MANIFEST_FILENAME),
      JSON.stringify({
        safety_copy: join(fresh, `${DB_ENTRY_NAME}.before-restore-1970-01-01T00-00-00-000Z`),
      }),
    );

    expect(applyPendingRestore(fresh)).toEqual({ applied: false });
    expect(readFileSync(hold, 'utf8')).toBe('the only copy of a log');
  });

  it('clears a settled pending folder once the log it held is beside the safety copy', () => {
    const { dir } = stagedOverACrashedDatabase();
    // The fold is unavailable, so the log travels with the safety copy and the
    // holds are still in the folder when the crash comes.
    expect(() =>
      applyPendingRestore(dir, join(dir, 'no-such-binding.node'), crashAt('restored-database-in-place')),
    ).toThrow('crashed');
    const pending = join(dir, PENDING_RESTORE_DIRNAME);
    expect(existsSync(pending)).toBe(true);
    expect(readdirSync(pending).sort()).toEqual([
      `${DB_ENTRY_NAME}-shm.held`,
      `${DB_ENTRY_NAME}-wal.held`,
      MANIFEST_FILENAME,
    ]);

    // The next boot. The restore is already done, so there is nothing to
    // apply; the folder is what a crash left behind, and every hold in it is
    // accounted for by the log beside the safety copy — which is what makes
    // deleting it safe rather than a loss.
    expect(applyPendingRestore(dir)).toEqual({ applied: false });
    expect(existsSync(pending)).toBe(false);
    // And the rows it held are still recoverable.
    expect(everyRowRecoverable(dir)).toBe(true);
  });

  it('refuses a safety copy that names the live database, and keeps the old one', () => {
    const { dir } = stagedOverACrashedDatabase();
    const live = join(dir, DB_ENTRY_NAME);
    writeFileSync(
      join(dir, PENDING_RESTORE_DIRNAME, MANIFEST_FILENAME),
      JSON.stringify({ safety_copy: live }),
    );

    const applied = applyPendingRestore(dir);

    // Not the live name — moved there, the practice's only copy of its records
    // would be overwritten by the archive restored over it.
    expect(applied.safetyCopy).not.toBe(live);
    expect(applied.safetyCopy).toMatch(/apunta\.db\.before-restore-/);
    expect(walRows(applied.safetyCopy ?? '')).toEqual(FIVE_ROWS);
    expect(integrityCheck(live)).toBe('ok');
  });

  it('refuses a safety copy outside the data folder', () => {
    const { dir } = stagedOverACrashedDatabase();
    const outside = mkdtempSync(join(tmpdir(), 'apunta-outside-'));
    try {
      writeFileSync(
        join(dir, PENDING_RESTORE_DIRNAME, MANIFEST_FILENAME),
        JSON.stringify({ safety_copy: join(outside, 'apunta.db.before-restore-1970-01-01T00-00-00-000Z') }),
      );

      const applied = applyPendingRestore(dir);

      expect(dirname(applied.safetyCopy ?? '')).toBe(dir);
      expect(existsSync(outside)).toBe(true);
      expect(readdirSync(outside)).toEqual([]);
      expect(walRows(applied.safetyCopy ?? '')).toEqual(FIVE_ROWS);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('holds a log at 600, not at whatever mode the copy left it', () => {
    const { dir } = stagedOverACrashedDatabase();
    const pending = join(dir, PENDING_RESTORE_DIRNAME);

    expect(() => applyPendingRestore(dir, undefined, crashAt('wal-holds-copied'))).toThrow('crashed');

    // The live database and its log are created by SQLite at 644; a hold is a
    // copy of a practice's log in a folder, and is 600 like the staged
    // database beside it.
    expect(statSync(join(dir, DB_ENTRY_NAME)).mode & 0o777).toBe(0o644);
    expect(statSync(join(pending, DB_ENTRY_NAME)).mode & 0o777).toBe(0o600);
    for (const suffix of ['-wal', '-shm']) {
      expect(statSync(join(pending, `${DB_ENTRY_NAME}${suffix}.held`)).mode & 0o777).toBe(0o600);
    }
  });

  /**
   * A pre-restore name says *a* rollback wrote something there, not that what
   * is there now was written for the database it is about to be put beside. The
   * case that makes the difference is the owner tidying up: deleting an old
   * safety copy takes its database and leaves its log, and the two files that
   * leaves on disk are indistinguishable from a rollback that died between
   * moving the database home and moving the log. Attaching on the strength of
   * the name alone replays one practice's rows into another's tables, which is
   * the one outcome this module exists to prevent.
   */
  it('leaves a stranded pre-restore log alone when nothing proves it belongs to the live database', () => {
    const { dir } = stagedOverACrashedDatabase();
    // The fold is unavailable, so the log travels with the safety copy.
    const applied = applyPendingRestore(dir, join(dir, 'no-such-binding.node'));
    const copy = applied.safetyCopy ?? '';
    expect(existsSync(`${copy}-wal`)).toBe(true);

    // The owner tidies up an old safety copy, and the pattern-miss takes the
    // database with it. No rollback was interrupted; there is no record of one.
    rmSync(copy);
    const live = join(dir, DB_ENTRY_NAME);
    expect(hasTable(live, 'wal_rows')).toBe(false);

    const booted = applyPendingRestore(dir);

    // Not moved: the log is still whole where it was, beside a name nothing
    // opens, and the live database has no log at all.
    expect(existsSync(`${copy}-wal`)).toBe(true);
    expect(existsSync(`${live}-wal`)).toBe(false);
    expect(existsSync(`${live}-shm`)).toBe(false);
    // And the rows that were only in that log did not arrive in this database.
    expect(hasTable(live, 'wal_rows')).toBe(false);
    expect(integrityCheck(live)).toBe('ok');
    // Counted, so the boot says out loud that it left something behind...
    expect(booted.recoveredAfterCrash).toEqual({
      databases: 0,
      sidecars: 0,
      unattachedLogs: 2,
    });
    // ...without naming it: a path in a log line names a practice's files.
    expect(JSON.stringify(booted)).not.toMatch(new RegExp(DB_ENTRY_NAME.split('.').join('\\.')));
  });

  /**
   * The reconcile repairs a folder it can recognise and never blocks a boot on
   * one it cannot. A directory carrying a pre-restore log's name is not a log
   * — renaming it onto `apunta.db-wal` leaves a database nothing can ever open
   * — and a folder that needs no repair has to keep booting over it.
   */
  it('boots over a directory named like a stranded pre-restore log, and leaves the folder alone', () => {
    const { db: healthy } = open(fresh);
    healthy.close();
    const live = join(fresh, DB_ENTRY_NAME);
    const mistaken = join(fresh, `${DB_ENTRY_NAME}.before-restore-1999-01-01T00-00-00-000Z-wal`);
    mkdirSync(mistaken, { recursive: true });
    writeFileSync(join(mistaken, 'a note to self'), 'not a database');

    expect(applyPendingRestore(fresh)).toEqual({ applied: false });

    // The boot came up, and no folder was renamed onto a name the engine would
    // then read as its own write-ahead log. (Checked before the integrity
    // check, which opens the database and leaves SQLite's own empty sidecar
    // behind it.)
    expect(existsSync(`${live}-wal`)).toBe(false);
    expect(existsSync(`${live}-shm`)).toBe(false);
    expect(integrityCheck(live)).toBe('ok');
    expect(statSync(mistaken).isDirectory()).toBe(true);
    expect(readFileSync(join(mistaken, 'a note to self'), 'utf8')).toBe('not a database');
  });

  /**
   * The copy of the database about to be replaced is the one file a restore
   * cannot lose, so a name that is already taken is not a name to write to:
   * `renameSync` replaces on POSIX, and what it would replace is an older
   * restore's copy, whose own rollback may still need it.
   */
  it('keeps an older safety copy the manifest names, and takes a name of its own', () => {
    const { dir } = stagedOverACrashedDatabase();
    const manifest = JSON.parse(
      readFileSync(join(dir, PENDING_RESTORE_DIRNAME, MANIFEST_FILENAME), 'utf8'),
    ) as { safety_copy: string };
    // An earlier restore's copy is already at the name this one's manifest
    // names — two restores inside one millisecond, or one applied twice.
    const older = manifest.safety_copy;
    copyFileSync(join(dir, DB_ENTRY_NAME), older);
    const olderBefore = readFileSync(older);

    const applied = applyPendingRestore(dir);

    expect(applied.applied).toBe(true);
    expect(dirname(applied.safetyCopy ?? '')).toBe(dir);
    expect(applied.safetyCopy).not.toBe(older);
    expect(applied.safetyCopy).toMatch(/apunta\.db\.before-restore-/);
    // The older copy is byte for byte what it was...
    expect(readFileSync(older).equals(olderBefore)).toBe(true);
    // ...and this restore's copy is a whole database of its own.
    expect(walRows(applied.safetyCopy ?? '')).toEqual(FIVE_ROWS);
    expect(integrityCheck(join(dir, DB_ENTRY_NAME))).toBe('ok');
  });
});
