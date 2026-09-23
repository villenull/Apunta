import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Database } from 'better-sqlite3';

/**
 * Migrations are numbered `.sql` files in `server/migrations/`, applied in
 * numeric order at boot. Each one runs inside its own transaction together with
 * the `schema_migrations` row that records it, so a failing migration leaves
 * the database exactly as it was and a restart against an up-to-date database
 * does nothing at all.
 */

const MIGRATION_FILE = /^(\d+)_([A-Za-z0-9_-]+)\.sql$/;

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

export interface MigrationResult {
  /** Highest applied version — what `GET /api/health` reports. */
  readonly level: number;
  /** Versions applied by this call; empty when the database was already current. */
  readonly applied: readonly number[];
}

export function loadMigrations(migrationsDir: string): Migration[] {
  const migrations = readdirSync(migrationsDir)
    .map((file) => ({ file, match: MIGRATION_FILE.exec(file) }))
    .filter((entry): entry is { file: string; match: RegExpExecArray } => entry.match !== null)
    .map(({ file, match }) => ({
      version: Number(match[1]),
      name: match[2] ?? '',
      sql: readFileSync(join(migrationsDir, file), 'utf8'),
    }))
    .sort((a, b) => a.version - b.version);

  const seen = new Set<number>();
  for (const migration of migrations) {
    if (seen.has(migration.version)) {
      throw new Error(`Duplicate migration version ${String(migration.version)} in ${migrationsDir}`);
    }
    seen.add(migration.version);
  }

  return migrations;
}

function ensureMigrationsTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);
}

export function appliedVersions(db: Database): number[] {
  ensureMigrationsTable(db);
  const rows = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as {
    version: number;
  }[];
  return rows.map((row) => row.version);
}

export function migrationLevel(db: Database): number {
  const versions = appliedVersions(db);
  return versions.at(-1) ?? 0;
}

export function migrate(db: Database, migrationsDir: string): MigrationResult {
  ensureMigrationsTable(db);

  const migrations = loadMigrations(migrationsDir);
  const maximum = migrations.at(-1)?.version ?? 0;
  const versions = appliedVersions(db);
  const current = versions.at(-1) ?? 0;
  if (current > maximum) {
    throw new Error(
      `Database schema version ${String(current)} is newer than this build (highest supported migration ${String(maximum)}). Update Apunta before opening this database.`,
    );
  }

  const already = new Set(versions);
  const pending = migrations.filter((migration) => !already.has(migration.version));

  const record = db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)');

  for (const migration of pending) {
    const apply = db.transaction(() => {
      db.exec(migration.sql);
      record.run(migration.version, migration.name, new Date().toISOString());
    });
    apply();
  }

  return { level: migrationLevel(db), applied: pending.map((m) => m.version) };
}
