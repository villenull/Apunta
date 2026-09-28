import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../config.js';
import { openDatabase } from './index.js';
import { loadMigrations, MigrationSafetyError, migrationLevel } from './migrate.js';
import { prepareDatabaseForStart } from './safety.js';
import { snapshotDatabase } from './snapshot.js';

/**
 * C-UPD@1's migration section, start to start.
 *
 * The order is the whole claim: apply a pending restore, read the schema
 * version without writing to the database, take a verified copy if anything is
 * pending, migrate all of it or none of it, and keep the last three. Each case
 * below is one step of that, with the code the start stops on asserted as a
 * `code` — never as a word inside a message.
 *
 * Every database here is synthetic, made by this file in a temp folder it
 * removes: the prototype's sample people (John Smith, Maria Ruiz) and one
 * invented patient, nothing real (hard rule 2, HS-8). `loadConfig({})` is read
 * for `migrationsDir` alone, exactly as `migrate.test.ts` does — resolving
 * `dataDir` or `dbFile` without `APUNTA_DATA_DIR` would name the live data
 * folder (HS-1).
 */

/** `restore.ts`'s stamp convention, which this card reuses so both sort alike. */
const houseStamp = (now: Date): string => now.toISOString().replace(/[:.]/g, '-');

const migrationsDir = loadConfig({}).migrationsDir;
const SHIPPED = loadMigrations(migrationsDir);
const SHIPPED_MAXIMUM = SHIPPED.at(-1)?.version ?? 0;
const PENDING_AFTER_5 = SHIPPED.filter((migration) => migration.version > 5).map((m) => m.version);

const FORMAT_ID = '0198c0f0-0000-7000-8000-00000000f0de';
const NOTE_ID = '0198c0f0-0000-7000-8000-00000000b0de';
const patientId = (index: number): string => `0198c0f0-0000-7000-8000-00000000000${String(index)}`;

const FIRST_START = new Date('2026-09-27T10:00:00.000Z');
const SECOND_START = new Date('2026-09-27T11:00:00.000Z');
const THIRD_START = new Date('2026-09-27T12:00:00.000Z');
const FOURTH_START = new Date('2026-09-27T13:00:00.000Z');

let dataDir: string;
let temporary: string[];

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'apunta-safety-'));
  temporary = [dataDir];
});

afterEach(() => {
  for (const dir of temporary) rmSync(dir, { recursive: true, force: true });
});

describe('prepareDatabaseForStart', () => {
  it('applies the pending restore, snapshots what the restore put there, and only then migrates', () => {
    const live = practiceAt(dataDir, 5, ['John Smith']);
    // A restore waiting for this start, of a different practice at the same
    // level: the two databases are told apart by their people, so which one the
    // snapshot copied is an observable fact and not an inference.
    const pending = join(dataDir, 'pending-restore');
    mkdirSync(pending, { recursive: true, mode: 0o700 });
    const archive = tempDir('apunta-restore-');
    copyFileSync(practiceAt(archive, 5, ['Maria Ruiz']), join(pending, 'apunta.db'));

    const result = prepareDatabaseForStart({ dataDir, dbFile: live, migrationsDir, now: FIRST_START });

    expect(result.restored.applied).toBe(true);
    expect(result.inspected).toBe(5);
    expect(result.migrations.applied).toEqual(PENDING_AFTER_5);
    expect(result.safetySnapshot).toBe(
      join(dataDir, 'safety', `pre-migrate-5-${String(SHIPPED_MAXIMUM)}-${houseStamp(FIRST_START)}.db`),
    );

    const snapshot = result.safetySnapshot ?? '';
    // The copy is of the **restored** file, so the practice that was there
    // before the restore is not in it...
    expect(patientNames(snapshot)).toEqual(['Maria Ruiz']);
    // ...and it is the **pre-migration** one, so its own schema is still the
    // level-5 schema the inspection read.
    expect(schemaLevel(snapshot)).toBe(5);
    expect(notesIn(snapshot)).toHaveLength(1);

    // The live database is the restored practice, at this build's level.
    expect(patientNames(live)).toEqual(['Maria Ruiz']);
    expect(schemaLevel(live)).toBe(SHIPPED_MAXIMUM);

    // The staged copy was moved, not left behind: its own folder, and no other.
    expect(readdirSync(join(dataDir, 'staging'))).toEqual([]);
  });

  it('refuses a database newer than this build, and writes nothing at all', () => {
    const live = practiceAt(dataDir, 5, ['John Smith']);
    const ahead = new BetterSqlite3(live);
    ahead
      .prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
      .run(SHIPPED_MAXIMUM + 1, 'from_a_newer_build', 'test');
    ahead.close();

    const error = thrown(() =>
      prepareDatabaseForStart({ dataDir, dbFile: live, migrationsDir, now: FIRST_START }),
    );

    expect(error).toBeInstanceOf(MigrationSafetyError);
    expect((error as MigrationSafetyError).code).toBe('newer_schema');
    // Never a downgrade, and never a snapshot of a database nobody may open: no
    // `safety/` folder was created, and the version that caused the refusal is
    // still exactly what the file says.
    expect(existsSync(join(dataDir, 'safety'))).toBe(false);
    expect(existsSync(join(dataDir, 'staging'))).toBe(false);
    expect(schemaLevel(live)).toBe(SHIPPED_MAXIMUM + 1);
    expect(patientNames(live)).toEqual(['John Smith']);
  });

  it('leaves the schema untouched when the safety snapshot cannot be taken', () => {
    const live = practiceAt(dataDir, 5, ['John Smith']);
    const safetyDir = join(dataDir, 'safety');
    mkdirSync(safetyDir, { recursive: true, mode: 0o700 });
    // Only meaningful because this box's `id -u` is 1000: as root the mode
    // below stops nothing and the case would prove nothing at all.
    expect(process.getuid?.()).not.toBe(0);
    chmodSync(safetyDir, 0o500);

    let error: unknown;
    try {
      error = thrown(() =>
        prepareDatabaseForStart({ dataDir, dbFile: live, migrationsDir, now: FIRST_START }),
      );
    } finally {
      chmodSync(safetyDir, 0o700);
    }

    expect(error).toBeInstanceOf(MigrationSafetyError);
    expect((error as MigrationSafetyError).code).toBe('snapshot_failed');
    // The copy is verified before it is moved, so a folder that cannot be
    // written stops the start — and leaves the old schema whole: same level,
    // same rows, no half-applied migration and no stale staging folder.
    expect(schemaLevel(live)).toBe(5);
    expect(patientNames(live)).toEqual(['John Smith']);
    expect(notesIn(live)).toHaveLength(1);
    expect(readdirSync(safetyDir)).toEqual([]);
    expect(readdirSync(join(dataDir, 'staging'))).toEqual([]);
  });

  it('rolls back every pending migration when one of them fails, keeps the snapshot and prunes nothing', () => {
    const live = join(dataDir, 'apunta.db');
    const level0 = new BetterSqlite3(live);
    level0.pragma('journal_mode = WAL');
    level0.exec('CREATE TABLE ledger (id TEXT PRIMARY KEY) STRICT;');
    level0.prepare('INSERT INTO ledger VALUES (?)').run('before');
    level0.close();

    // Three snapshots older than the one this run will take, so retention has
    // something it would delete if it ran.
    const safetyDir = join(dataDir, 'safety');
    const older = [
      writeSnapshotName(safetyDir, '2026-01-01T00-00-00-000Z'),
      writeSnapshotName(safetyDir, '2026-02-02T00-00-00-000Z'),
      writeSnapshotName(safetyDir, '2026-03-03T00-00-00-000Z'),
    ];

    const failing = tempDir('apunta-migrations-');
    writeFileSync(
      join(failing, '001_ok.sql'),
      "INSERT INTO ledger VALUES ('from-001'); CREATE TABLE first_table (id TEXT PRIMARY KEY) STRICT;",
    );
    writeFileSync(
      join(failing, '002_broken.sql'),
      "INSERT INTO ledger VALUES ('from-002'); SELECT no_such_function();",
    );

    const error = thrown(() =>
      prepareDatabaseForStart({ dataDir, dbFile: live, migrationsDir: failing, now: FIRST_START }),
    );

    expect(error).toBeInstanceOf(MigrationSafetyError);
    expect((error as MigrationSafetyError).code).toBe('migration_failed');
    // All or nothing (C-UPD@1 step 4): 001's write and its table are gone with
    // 002's, and `schema_migrations` claims nothing.
    expect(ledger(live)).toEqual(['before']);
    expect(tableExists(live, 'first_table')).toBe(false);
    expect(appliedIn(live)).toEqual([]);

    // The snapshot step 3 took before any of that is still there, and it is a
    // pre-migration image: the undo is available even though the migration did
    // not happen.
    const taken = `pre-migrate-0-2-${houseStamp(FIRST_START)}.db`;
    expect(readdirSync(safetyDir).sort()).toEqual([...older, taken].sort());
    const snapshot = join(safetyDir, taken);
    expect(ledger(snapshot)).toEqual(['before']);
    expect(tableExists(snapshot, 'first_table')).toBe(false);
    // Nothing was deleted: step 5 waits for a migration that succeeded.
    for (const name of older) expect(existsSync(join(safetyDir, name))).toBe(true);
  });

  it('leaves a safety snapshot that is a working database, and can be started from again', () => {
    const live = practiceAt(dataDir, 5, ['John Smith']);

    const first = prepareDatabaseForStart({ dataDir, dbFile: live, migrationsDir, now: FIRST_START });
    const snapshot = first.safetySnapshot ?? '';
    expect(existsSync(snapshot)).toBe(true);

    // Put the snapshot back where the database goes, as a hand restore would,
    // and start again from there: the whole practice comes back at this build's
    // level, and a fresh snapshot of the rollback is taken on the way.
    putOver(live, snapshot);
    const second = prepareDatabaseForStart({ dataDir, dbFile: live, migrationsDir, now: SECOND_START });

    expect(second.inspected).toBe(5);
    expect(second.migrations.applied).toEqual(PENDING_AFTER_5);
    expect(patientNames(live)).toEqual(['John Smith']);
    expect(schemaLevel(live)).toBe(SHIPPED_MAXIMUM);
    expect(readdirSync(join(dataDir, 'safety')).sort()).toEqual(
      [basename(snapshot), basename(second.safetySnapshot ?? '')].sort(),
    );

    // And it is a database the app opens: no migration left to run, and every
    // row of the practice still in it.
    const opened = openDatabase({ file: live, migrationsDir });
    try {
      expect(opened.migrations.applied).toEqual([]);
      expect(opened.migrations.level).toBe(SHIPPED_MAXIMUM);
      expect(opened.db.prepare('SELECT title, status FROM notes').all()).toEqual([
        { title: 'Sleep improved', status: 'draft' },
      ]);
      expect(opened.db.prepare("SELECT value FROM settings WHERE key = 'week_starts_on'").get()).toEqual({
        value: '"monday"',
      });
    } finally {
      opened.db.close();
    }
  });

  it('keeps the last three safety snapshots, ordered by their stamp, and deletes only older ones', () => {
    const live = practiceAt(dataDir, 5, ['John Smith']);
    // A snapshot whose name sorts *after* the four below while its stamp sorts
    // before them — which is the whole reason retention orders by the stamp and
    // not by the file name.
    const oldest = writeSnapshotName(join(dataDir, 'safety'), '2020-01-01T00-00-00-000Z', 9, 9);

    const starts = [FIRST_START, SECOND_START, THIRD_START, FOURTH_START];
    const taken: string[] = [];
    for (const [index, now] of starts.entries()) {
      // Each start begins from the level the snapshot before it was taken at, so
      // there is something pending every time: four real migrations, four real
      // copies, four different stamps.
      if (index > 0) putOver(live, taken[index - 1] ?? '');
      taken.push(prepareDatabaseForStart({ dataDir, dbFile: live, migrationsDir, now }).safetySnapshot ?? '');
    }

    const safetyDir = join(dataDir, 'safety');
    const remaining = readdirSync(safetyDir);
    expect([...remaining].sort()).toEqual(
      taken
        .slice(1)
        .map((path) => basename(path))
        .sort(),
    );
    // The oldest went by its stamp rather than by its name: sorting the names
    // would have kept `pre-migrate-9-9-2020-…` and deleted a real one instead.
    expect(existsSync(join(safetyDir, oldest))).toBe(false);
    expect(existsSync(taken[0] ?? '')).toBe(false);
    expect(remaining).toContain(`pre-migrate-5-${String(SHIPPED_MAXIMUM)}-${houseStamp(FOURTH_START)}.db`);
    expect(remaining).not.toContain(`pre-migrate-5-${String(SHIPPED_MAXIMUM)}-${houseStamp(FIRST_START)}.db`);
  });

  it('writes no safety file on a first run, and so cannot evict a real snapshot', () => {
    // Five snapshots already in the folder — a practice that has been updated
    // before. A first run has nothing to snapshot and nothing to migrate, so it
    // must not touch them.
    const safetyDir = join(dataDir, 'safety');
    const kept = ['01', '02', '03', '04', '05'].map((month) =>
      writeSnapshotName(safetyDir, `2026-${month}-01T00-00-00-000Z`),
    );
    const live = join(dataDir, 'apunta.db');
    expect(existsSync(live)).toBe(false);

    const result = prepareDatabaseForStart({ dataDir, dbFile: live, migrationsDir, now: FIRST_START });

    expect(result.restored.applied).toBe(false);
    expect(result).toMatchObject({
      inspected: 0,
      safetySnapshot: null,
      migrations: { level: 0, applied: [] },
      pruned: [],
    });
    expect(existsSync(live)).toBe(false);
    expect(existsSync(join(dataDir, 'staging'))).toBe(false);
    expect(readdirSync(safetyDir).sort()).toEqual([...kept].sort());

    // Creating the database at the current level is `openDatabase`'s job, and it
    // does exactly that.
    const opened = openDatabase({ file: live, migrationsDir });
    try {
      expect(opened.migrations.level).toBe(SHIPPED_MAXIMUM);
    } finally {
      opened.db.close();
    }
  });

  it('writes no safety file when the database is already at this build’s level', () => {
    const live = practiceAt(dataDir, SHIPPED_MAXIMUM, ['John Smith']);

    const result = prepareDatabaseForStart({ dataDir, dbFile: live, migrationsDir, now: FIRST_START });

    expect(result.inspected).toBe(SHIPPED_MAXIMUM);
    expect(result.safetySnapshot).toBeNull();
    expect(result.migrations.applied).toEqual([]);
    expect(result.pruned).toEqual([]);
    expect(existsSync(join(dataDir, 'safety'))).toBe(false);
    expect(existsSync(join(dataDir, 'staging'))).toBe(false);
    expect(patientNames(live)).toEqual(['John Smith']);
  });

  /**
   * The same start from three different levels, because "pending" means
   * something different at each of them: from 5 the Halaxy import tables and
   * everything after them are still to come, from 6 only the note revision and
   * locale work is, and from 7 a single migration is. Each gets its own data
   * folder, so the three are independent runs and not one another's leftovers.
   */
  for (const level of [5, 6, 7]) {
    it(`migrates a level-${level} database to the current level, snapshotting it first`, () => {
      const dir = tempDir('apunta-safety-');
      const live = practiceAt(dir, level, ['John Smith']);

      const result = prepareDatabaseForStart({ dataDir: dir, dbFile: live, migrationsDir, now: FIRST_START });

      expect(result.inspected).toBe(level);
      expect(result.migrations.applied).toEqual(
        SHIPPED.filter((migration) => migration.version > level).map((m) => m.version),
      );
      expect(result.safetySnapshot).toBe(
        join(
          dir,
          'safety',
          `pre-migrate-${String(level)}-${String(SHIPPED_MAXIMUM)}-${houseStamp(FIRST_START)}.db`,
        ),
      );
      // The copy is the level it was taken at, and the live database is this
      // build's — the two facts that make the snapshot a rollback rather than a
      // second copy.
      expect(schemaLevel(result.safetySnapshot ?? '')).toBe(level);
      expect(schemaLevel(live)).toBe(SHIPPED_MAXIMUM);
      expect(patientNames(live)).toEqual(['John Smith']);
      expect(notesIn(live)).toHaveLength(1);
    });
  }
});

/**
 * The two questions the inspection step's shape rests on, answered against
 * SQLite rather than assumed: what a read-only handle will and will not do, and
 * whether a copy can be taken through one.
 */
describe('the read-only handle the inspection step opens', () => {
  it('is read-only, and `migrationLevel` is not usable on it before the table exists', () => {
    const file = practiceAt(dataDir, 5, ['John Smith']);
    const handle = new BetterSqlite3(file, { readonly: true });
    try {
      expect(() =>
        handle
          .prepare('INSERT INTO patients (id, name, created_at) VALUES (?, ?, ?)')
          .run(patientId(9), 'Nobody', '2026-02-02T09:00:00.000Z'),
      ).toThrow(/readonly/i);
      // With `schema_migrations` in place its `CREATE TABLE IF NOT EXISTS` is a
      // no-op, so reading the level this way works...
      expect(migrationLevel(handle)).toBe(5);
    } finally {
      handle.close();
    }

    // ...and with no table at all it is a write, which is the state every
    // unmigrated database is in. That is why the inspection step selects the
    // table itself instead of calling `migrationLevel`.
    const bare = join(dataDir, 'bare.db');
    const created = new BetterSqlite3(bare);
    created.pragma('journal_mode = WAL');
    created.exec('CREATE TABLE patients (id TEXT PRIMARY KEY, name TEXT NOT NULL) STRICT;');
    created.close();

    const bareReadOnly = new BetterSqlite3(bare, { readonly: true });
    try {
      expect(() => migrationLevel(bareReadOnly)).toThrow(/attempt to write a readonly database/i);
    } finally {
      bareReadOnly.close();
    }
  });

  it('still copies the whole database, the write-ahead log included', () => {
    const file = practiceAt(dataDir, 5, ['John Smith']);
    const writer = new BetterSqlite3(file);
    writer
      .prepare('INSERT INTO patients (id, name, created_at) VALUES (?, ?, ?)')
      .run(patientId(9), 'Ada Kowalski', '2026-02-02T09:00:00.000Z');
    // Committed, deliberately not checkpointed: this row is the one a
    // `copyFileSync` of the database file loses, and the one the step-3
    // snapshot has to carry.
    expect(existsSync(`${file}-wal`)).toBe(true);

    const readOnly = new BetterSqlite3(file, { readonly: true });
    try {
      const copy = join(dataDir, 'copy.db');
      expect(snapshotDatabase(readOnly, copy)).toBe(copy);
      expect(patientNames(copy)).toEqual(['John Smith', 'Ada Kowalski']);
      expect(schemaLevel(copy)).toBe(5);
    } finally {
      readOnly.close();
      writer.close();
    }
  });
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temporary.push(dir);
  return dir;
}

/** A copy of the shipped migrations up to `level`, and nothing after it. */
function migrationSetThrough(level: number): string {
  const dir = tempDir('apunta-migrations-');
  for (const migration of SHIPPED) {
    if (migration.version > level) continue;
    writeFileSync(
      join(dir, `${String(migration.version).padStart(3, '0')}_${migration.name}.sql`),
      migration.sql,
    );
  }
  return dir;
}

/**
 * A synthetic practice at `level`: WAL, one format, one draft note, one setting
 * and the named patients, so a snapshot missing something is missing something
 * observable.
 */
function practiceAt(dir: string, level: number, people: readonly string[]): string {
  const file = join(dir, 'apunta.db');
  const set = migrationSetThrough(level);
  const { db } = openDatabase({ file, migrationsDir: set });
  try {
    for (const [index, name] of people.entries()) {
      db.prepare('INSERT INTO patients (id, name, identifier, created_at) VALUES (?, ?, NULL, ?)').run(
        patientId(index),
        name,
        `2026-01-0${String(index + 1)}T09:00:00.000Z`,
      );
    }
    db.prepare(
      'INSERT INTO note_formats (id, name, sections, source, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(FORMAT_ID, 'Progress note', '["Location","Discussion"]', 'manual', '2026-01-01T09:00:00.000Z');
    db.prepare(
      `INSERT INTO notes (id, patient_id, format_id, title, status, content, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'draft', ?, ?, ?)`,
    ).run(
      NOTE_ID,
      patientId(0),
      FORMAT_ID,
      'Sleep improved',
      'Location: Clinic\n\nDiscussion: Sleep improved.',
      '2026-01-02T09:00:00.000Z',
      '2026-01-02T09:00:00.000Z',
    );
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('week_starts_on', '"monday"');
  } finally {
    db.close();
  }
  return file;
}

/** A name-only stand-in for a snapshot an earlier start would have left. */
function writeSnapshotName(safetyDir: string, stamp: string, from = 5, to = SHIPPED_MAXIMUM): string {
  mkdirSync(safetyDir, { recursive: true, mode: 0o700 });
  const name = `pre-migrate-${String(from)}-${String(to)}-${stamp}.db`;
  writeFileSync(join(safetyDir, name), 'a snapshot from an earlier start');
  return name;
}

/** A restore by hand: the database file replaced, its sidecars gone. */
function putOver(live: string, source: string): void {
  for (const suffix of ['', '-wal', '-shm']) rmSync(`${live}${suffix}`, { force: true });
  copyFileSync(source, live);
}

function thrown(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to throw, and it did not');
}

function read<T>(file: string, sql: string, ...params: unknown[]): T[] {
  const handle = new BetterSqlite3(file, { readonly: true });
  try {
    return handle.prepare(sql).all(...params) as T[];
  } finally {
    handle.close();
  }
}

/** 0 for a database with no `schema_migrations` table at all. */
function schemaLevel(file: string): number {
  return appliedIn(file).at(-1) ?? 0;
}

function appliedIn(file: string): number[] {
  return read<{ version: number }>(file, 'SELECT version FROM schema_migrations ORDER BY version').map(
    (row) => row.version,
  );
}

function patientNames(file: string): string[] {
  return read<{ name: string }>(file, 'SELECT name FROM patients ORDER BY created_at, id').map(
    (row) => row.name,
  );
}

function notesIn(file: string): { id: string }[] {
  return read<{ id: string }>(file, 'SELECT id FROM notes ORDER BY id');
}

function ledger(file: string): string[] {
  return read<{ id: string }>(file, 'SELECT id FROM ledger ORDER BY id').map((row) => row.id);
}

function tableExists(file: string, table: string): boolean {
  return (
    read<{ name: string }>(file, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", table)
      .length > 0
  );
}
