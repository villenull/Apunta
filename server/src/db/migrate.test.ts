import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../config.js';
import { undoImportBatch } from './import-batches.js';
import { openDatabase } from './index.js';
import { appliedVersions, loadMigrations, migrate } from './migrate.js';

const migrationsDir = loadConfig({}).migrationsDir;

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'apunta-migrate-'));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe('loadMigrations', () => {
  it('reads the shipped migrations in numeric order', () => {
    const migrations = loadMigrations(migrationsDir);

    expect(migrations.length).toBeGreaterThan(0);
    expect(migrations.map((m) => m.version)).toEqual(
      [...migrations.map((m) => m.version)].sort((a, b) => a - b),
    );
    expect(migrations[0]?.version).toBe(1);
  });

  it('rejects two files claiming the same version', () => {
    writeFileSync(join(dataDir, '001_one.sql'), 'SELECT 1;');
    writeFileSync(join(dataDir, '001_two.sql'), 'SELECT 1;');

    expect(() => loadMigrations(dataDir)).toThrow(/Duplicate migration version 1/);
  });

  it('ignores files that are not numbered .sql migrations', () => {
    writeFileSync(join(dataDir, 'README.md'), '# not a migration');
    writeFileSync(join(dataDir, 'notes.sql'), 'SELECT 1;');

    expect(loadMigrations(dataDir)).toEqual([]);
  });
});

describe('migrate', () => {
  it('creates the schema and records what it applied', () => {
    const file = join(dataDir, 'apunta.db');
    const { db, migrations } = openDatabase({ file, migrationsDir });

    const shippedVersions = loadMigrations(migrationsDir).map((migration) => migration.version);
    expect(migrations.applied).toEqual(shippedVersions);
    expect(migrations.level).toBe(shippedVersions.at(-1));
    expect(appliedVersions(db)).toEqual(shippedVersions);

    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
        name: string;
      }[]
    ).map((row) => row.name);

    expect(tables).toEqual(
      expect.arrayContaining([
        'brainstorm_messages',
        'chat_messages',
        'import_batch_notes',
        'import_batch_patients',
        'import_batches',
        'note_formats',
        'notes',
        'patients',
        'plan_goals',
        'schema_migrations',
        'session_briefs',
        'settings',
        'transcripts',
        'treatment_plans',
      ]),
    );

    db.close();
  });

  it('is a no-op against an already migrated database, and keeps its data', () => {
    const file = join(dataDir, 'apunta.db');

    const first = openDatabase({ file, migrationsDir });
    first.db
      .prepare(
        'INSERT INTO patients (id, name, identifier, created_at, archived_at) VALUES (?, ?, NULL, ?, NULL)',
      )
      .run('01920000-0000-7000-8000-000000000000', 'John Smith', '2026-08-22T09:00:00.000Z');
    const appliedAtFirstRun = first.db
      .prepare('SELECT applied_at FROM schema_migrations WHERE version = 1')
      .get() as { applied_at: string };
    first.db.close();

    // Restarting the server runs migrate() again against the same file.
    const second = openDatabase({ file, migrationsDir });

    expect(second.migrations.applied).toEqual([]);
    // The shipped level, written out. 011 (where a group sits among the others)
    // is the migration that made `10` stale; the expectation stays exactly as
    // strict — this is the assertion that fails when a migration is added and
    // not accounted for.
    expect(second.migrations.level).toBe(11);
    expect(
      (
        second.db.prepare('SELECT applied_at FROM schema_migrations WHERE version = 1').get() as {
          applied_at: string;
        }
      ).applied_at,
    ).toBe(appliedAtFirstRun.applied_at);
    expect(second.db.prepare('SELECT COUNT(*) AS count FROM patients').get()).toEqual({ count: 1 });

    second.db.close();
  });

  it('refuses a database newer than the highest shipped migration', () => {
    const db = new BetterSqlite3(':memory:');
    db.exec(
      'CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL) STRICT',
    );
    db.prepare('INSERT INTO schema_migrations VALUES (?, ?, ?)').run(99, 'future_change', 'test');
    const maximum = loadMigrations(migrationsDir).at(-1)?.version ?? 0;

    expect(() => migrate(db, migrationsDir)).toThrow(
      `Database schema version 99 is newer than this build (highest supported migration ${String(maximum)})`,
    );

    db.close();
  });

  it('leaves the database untouched when a migration fails', () => {
    const db = new BetterSqlite3(':memory:');
    writeFileSync(join(dataDir, '001_ok.sql'), 'CREATE TABLE a (id TEXT PRIMARY KEY) STRICT;');
    writeFileSync(
      join(dataDir, '002_broken.sql'),
      'CREATE TABLE b (id TEXT PRIMARY KEY) STRICT; SELECT nope();',
    );

    expect(() => migrate(db, dataDir)).toThrow();
    // 002 rolled back whole: neither its table nor its bookkeeping row survives.
    expect(appliedVersions(db)).toEqual([1]);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'b'").get()).toBeUndefined();

    db.close();
  });
  it('migrates existing import batches transactionally and preserves Claude undo', () => {
    const file = join(dataDir, 'halaxy-migration.db');
    const db = new BetterSqlite3(file);
    db.pragma('foreign_keys = ON');
    db.exec(
      'CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL) STRICT',
    );
    const migrations = loadMigrations(migrationsDir);
    const record = db.prepare('INSERT INTO schema_migrations VALUES (?, ?, ?)');
    for (const migration of migrations.filter((item) => item.version <= 5)) {
      db.exec(migration.sql);
      record.run(migration.version, migration.name, 'test');
    }
    db.prepare('INSERT INTO patients (id, name, created_at) VALUES (?, ?, ?)').run(
      'patient-1',
      'John Smith',
      '2026-01-01',
    );
    db.prepare(
      'INSERT INTO note_formats (id, name, sections, source, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run('format-1', 'Progress', '[]', 'manual', '2026-01-01');
    db.prepare(
      'INSERT INTO notes (id, patient_id, format_id, title, status, content, created_at, updated_at, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run('note-1', 'patient-1', 'format-1', 'Imported', 'draft', 'Body', '2026-01-01', '2026-01-01', null);
    db.prepare('INSERT INTO import_batches (id, source, created_at) VALUES (?, ?, ?)').run(
      'batch-1',
      'assistant',
      '2026-01-01',
    );
    db.prepare('INSERT INTO import_batch_notes (batch_id, note_id) VALUES (?, ?)').run('batch-1', 'note-1');
    db.prepare('INSERT INTO import_batch_patients (batch_id, patient_id) VALUES (?, ?)').run(
      'batch-1',
      'patient-1',
    );

    const migration = migrations.find((item) => item.version === 6)!;
    expect(() =>
      db.transaction(() => {
        db.exec(migration.sql);
        throw new Error('simulated migration failure');
      })(),
    ).toThrow('simulated migration failure');
    expect(db.prepare('SELECT source FROM import_batches WHERE id = ?').get('batch-1')).toEqual({
      source: 'assistant',
    });

    db.transaction(() => db.exec(migration.sql))();
    expect(db.prepare('SELECT COUNT(*) AS count FROM import_batches').get()).toEqual({ count: 1 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM import_batch_notes').get()).toEqual({ count: 1 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM import_batch_patients').get()).toEqual({ count: 1 });
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);

    expect(undoImportBatch(db, 'batch-1')).toMatchObject({ notes_deleted: 1, patients_deleted: 1 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM notes').get()).toEqual({ count: 0 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM patients').get()).toEqual({ count: 0 });
    db.close();
  });

  /**
   * C-LANG@1 rule 3's legacy clause, on a real level-7 database: 008 adds the
   * `locale` column and changes nothing else about the rows it finds.
   *
   * The comparison is over **named** columns, and it is written out by name
   * rather than as a blob, because "content unchanged byte for byte" is not an
   * observable after an `ALTER TABLE` — what is observable is each value in
   * each named column, before and after, and `locale` reading `'en'`.
   */
  it('adds locale as English to every existing note and format, and moves nothing else', () => {
    const file = join(dataDir, 'apunta.db');
    // A directory holding copies of the shipped 001–007 and nothing else, so the
    // first open stops at the level this migration starts from.
    const before008 = mkdtempSync(join(tmpdir(), 'apunta-migrations-'));
    for (const migration of loadMigrations(migrationsDir)) {
      if (migration.version > 7) continue;
      writeFileSync(
        join(before008, `${String(migration.version).padStart(3, '0')}_${migration.name}.sql`),
        migration.sql,
      );
    }

    const first = openDatabase({ file, migrationsDir: before008 });
    expect(first.migrations.level).toBe(7);
    first.db
      .prepare('INSERT INTO patients (id, name, created_at) VALUES (?, ?, ?)')
      .run('0198c0f0-0000-7000-8000-00000000c0de', 'John Smith', '2026-01-01T09:00:00.000Z');
    first.db
      .prepare(
        'INSERT INTO note_formats (id, name, sections, instructions, source, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        '0198c0f0-0000-7000-8000-00000000f0de',
        'Progress note',
        '["Location","Discussion"]',
        '',
        'manual',
        '2026-01-01T09:00:00.000Z',
      );
    first.db
      .prepare(
        `INSERT INTO notes (id, patient_id, format_id, title, status, content, created_at, updated_at, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        '0198c0f0-0000-7000-8000-00000000b0de',
        '0198c0f0-0000-7000-8000-00000000c0de',
        '0198c0f0-0000-7000-8000-00000000f0de',
        'Progress note',
        'draft',
        'Location: Clinic\n\nDiscussion: Sleep improved.',
        '2026-01-02T09:00:00.000Z',
        '2026-01-02T09:00:00.000Z',
        null,
      );

    const NOTE_COLUMNS =
      'id, patient_id, format_id, title, status, content, created_at, updated_at, published_at, revision';
    const FORMAT_COLUMNS = 'id, name, sections, instructions, source, created_at';
    const noteBefore = first.db.prepare(`SELECT ${NOTE_COLUMNS} FROM notes`).get();
    const formatBefore = first.db.prepare(`SELECT ${FORMAT_COLUMNS} FROM note_formats`).get();
    first.db.close();

    // Re-open with the shipped directory: 008 is the first pending migration,
    // and 009, 010 and 011 follow it in the same call, so all four are listed —
    // this test is about what 008 did to the notes, and the later migrations'
    // own effects on the same data are asserted separately below.
    const second = openDatabase({ file, migrationsDir });
    try {
      expect(second.migrations.applied).toEqual([8, 9, 10, 11]);
      expect(second.migrations.level).toBe(11);

      // The new column is last in each table and is the only one that is new.
      expect(Object.keys(second.db.prepare('SELECT * FROM notes').get() as object)).toEqual([
        ...NOTE_COLUMNS.split(', '),
        'locale',
      ]);
      expect(Object.keys(second.db.prepare('SELECT * FROM note_formats').get() as object)).toEqual([
        ...FORMAT_COLUMNS.split(', '),
        'locale',
      ]);

      // Every existing row is English (D11), and no row is translated or
      // relabelled: each named column holds the value it held before.
      expect(second.db.prepare('SELECT locale FROM notes').get()).toEqual({ locale: 'en' });
      expect(second.db.prepare('SELECT locale FROM note_formats').get()).toEqual({ locale: 'en' });
      expect(second.db.prepare(`SELECT ${NOTE_COLUMNS} FROM notes`).get()).toEqual(noteBefore);
      expect(second.db.prepare(`SELECT ${FORMAT_COLUMNS} FROM note_formats`).get()).toEqual(formatBefore);
    } finally {
      second.db.close();
      rmSync(before008, { recursive: true, force: true });
    }
  });

  /**
   * 009 (patient groups, owner, 2026-09-27) runs against a practice that
   * already has patients, notes and an archive flag. Three things have to be
   * true afterwards and none of them is visible in the app if it is not the
   * case, so they are asserted here rather than eyeballed in a preview:
   *
   * 1. **Nothing is lost or rewritten.** The column is added nullable with no
   *    default, so every pre-existing row is the row it was — including the
   *    archived one, which is the row a rewrite is most likely to drop.
   * 2. **Nobody is silently filed.** `group_id` is NULL everywhere, because the
   *    new table starts empty and "no group" has to mean what it says.
   * 3. **The foreign key is real.** A patient cannot be filed under a group that
   *    does not exist, and emptying a group cannot fail or strand them.
   */
  it('adds groups without moving, rewriting or filing a single patient', () => {
    const file = join(dataDir, 'apunta.db');
    // A directory holding the shipped 001–008 and nothing else, so the first
    // open stops at the level this migration starts from.
    const before009 = mkdtempSync(join(tmpdir(), 'apunta-migrations-'));
    for (const migration of loadMigrations(migrationsDir)) {
      if (migration.version > 8) continue;
      writeFileSync(
        join(before009, `${String(migration.version).padStart(3, '0')}_${migration.name}.sql`),
        migration.sql,
      );
    }

    const PATIENT_COLUMNS = 'id, name, identifier, created_at, archived_at, name_guessed';
    const first = openDatabase({ file, migrationsDir: before009 });
    expect(first.migrations.level).toBe(8);
    first.db
      .prepare(
        'INSERT INTO patients (id, name, identifier, created_at, archived_at) VALUES (?, ?, ?, ?, NULL)',
      )
      .run('0198c0f0-0000-7000-8000-00000000c0de', 'John Smith', 'CHART-1', '2026-01-01T09:00:00.000Z');
    // An archived patient too: the row a rewrite is most likely to lose.
    first.db
      .prepare('INSERT INTO patients (id, name, created_at, archived_at) VALUES (?, ?, ?, ?)')
      .run(
        '0198c0f0-0000-7000-8000-00000000c1de',
        'Maria Ruiz',
        '2026-01-02T09:00:00.000Z',
        '2026-02-02T09:00:00.000Z',
      );
    const patientsBefore = first.db
      .prepare(`SELECT ${PATIENT_COLUMNS} FROM patients ORDER BY created_at`)
      .all();
    expect(patientsBefore).toHaveLength(2);
    first.db.close();

    const second = openDatabase({ file, migrationsDir });
    try {
      expect(second.migrations.applied).toEqual([9, 10, 11]);
      expect(second.migrations.level).toBe(11);

      // Its own new column, then 010's. Both are additive and both are null, and
      // that is the whole preservation claim: nothing existing is rewritten.
      const columns = Object.keys(second.db.prepare('SELECT * FROM patients').get() as object);
      expect(columns).toEqual([...PATIENT_COLUMNS.split(', '), 'group_id', 'group_position']);
      expect(second.db.prepare('SELECT COUNT(*) AS count FROM patient_groups').get()).toEqual({
        count: 0,
      });

      // 1 & 2: every row is byte-identical and nobody gained a group.
      expect(second.db.prepare(`SELECT ${PATIENT_COLUMNS} FROM patients ORDER BY created_at`).all()).toEqual(
        patientsBefore,
      );
      expect(second.db.prepare('SELECT group_id FROM patients ORDER BY created_at').all()).toEqual([
        { group_id: null },
        { group_id: null },
      ]);

      // 3: the key is enforced, and clearing a group cannot strand anybody.
      const group = second.db
        .prepare('INSERT INTO patient_groups (id, name, created_at) VALUES (?, ?, ?)')
        .run('0198c0f0-0000-7000-8000-00000000a0de', 'Family therapy', '2026-03-01T09:00:00.000Z');
      expect(group.changes).toBe(1);
      expect(() =>
        second.db
          .prepare("UPDATE patients SET group_id = '0198c0f0-0000-7000-8000-00000000ffffffff' WHERE id = ?")
          .run('0198c0f0-0000-7000-8000-00000000c0de'),
      ).toThrow();

      second.db
        .prepare('UPDATE patients SET group_id = ? WHERE id = ?')
        .run('0198c0f0-0000-7000-8000-00000000a0de', '0198c0f0-0000-7000-8000-00000000c0de');
      expect(
        second.db
          .prepare('SELECT group_id FROM patients WHERE id = ?')
          .get('0198c0f0-0000-7000-8000-00000000c0de'),
      ).toEqual({ group_id: '0198c0f0-0000-7000-8000-00000000a0de' });

      // `ON DELETE SET NULL`: emptying a group puts the patient back where
      // ungrouped patients sit, and does not fail.
      second.db
        .prepare('DELETE FROM patient_groups WHERE id = ?')
        .run('0198c0f0-0000-7000-8000-00000000a0de');
      expect(
        second.db
          .prepare('SELECT group_id FROM patients WHERE id = ?')
          .get('0198c0f0-0000-7000-8000-00000000c0de'),
      ).toEqual({ group_id: null });
    } finally {
      second.db.close();
      rmSync(before009, { recursive: true, force: true });
    }
  });
});
