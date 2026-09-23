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

    expect(migrations.applied).toEqual([1, 2, 3, 4, 5, 6]);
    expect(migrations.level).toBe(6);
    expect(appliedVersions(db)).toEqual([1, 2, 3, 4, 5, 6]);

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
    expect(second.migrations.level).toBe(6);
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
});
