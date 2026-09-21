import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../config.js';
import { openDatabase } from './index.js';
import { appliedVersions, loadMigrations, migrate, migrationLevel } from './migrate.js';

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

    expect(migrations.applied).toEqual([1, 2, 3, 4]);
    expect(migrations.level).toBe(4);
    expect(appliedVersions(db)).toEqual([1, 2, 3, 4]);

    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
        name: string;
      }[]
    ).map((row) => row.name);

    expect(tables).toEqual(
      expect.arrayContaining([
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
    expect(second.migrations.level).toBe(4);
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

  it('reports level 0 for a database no migration has touched', () => {
    const db = new BetterSqlite3(':memory:');

    expect(migrationLevel(db)).toBe(0);

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
});
