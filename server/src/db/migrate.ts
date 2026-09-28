import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Database } from 'better-sqlite3';

/**
 * Migrations are numbered `.sql` files in `server/migrations/`, applied in
 * numeric order at boot. All the pending ones run inside **one** transaction
 * together with the `schema_migrations` rows that record them, so a failing
 * migration leaves the database exactly as it was — including the ones that
 * already succeeded in the same start — and a restart against an up-to-date
 * database does nothing at all.
 *
 * The all-or-nothing shape is C-UPD@1 step 4, and it is a safety property
 * rather than a tidiness one: a half-migrated practice is one whose schema
 * matches no version of the app, which is the state the whole pre-migration
 * snapshot exists to be able to undo.
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

/**
 * The three words a start can stop on because of the schema (C-UPD@1 steps 2,
 * 3 and 4). A test sees the `code`, never a substring of the message, and the
 * boot-error page is handed the message — so the code is for callers and the
 * message is for her.
 *
 * It is modelled on `BackupError` (`server/src/backup/archive.ts:50-62`) and is
 * not an HTTP status and not a member of `ApiErrorCodeSchema`: nothing here is
 * reachable over the API, because a database that cannot be opened never gets
 * as far as serving one.
 */
export type MigrationSafetyCode = 'newer_schema' | 'snapshot_failed' | 'migration_failed';

export class MigrationSafetyError extends Error {
  constructor(
    message: string,
    readonly code: MigrationSafetyCode,
  ) {
    super(message);
    this.name = 'MigrationSafetyError';
  }
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
    // Never a downgrade: a database written by a newer Apunta keeps its
    // columns, its rows and its meaning, and the refusal says which build to
    // update to rather than touching a single byte of it.
    throw new MigrationSafetyError(
      `Database schema version ${String(current)} is newer than this build (highest supported migration ${String(maximum)}). Update Apunta before opening this database.`,
      'newer_schema',
    );
  }

  const already = new Set(versions);
  const pending = migrations.filter((migration) => !already.has(migration.version));

  const record = db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)');

  /**
   * C-UPD@1 step 4. One outer transaction around every pending migration, and
   * the bookkeeping row inside it — so `schema_migrations` cannot ever claim a
   * migration that the schema does not have. `better-sqlite3` nests with
   * SAVEPOINT, but nesting is not wanted here: a failure has to undo the
   * migrations that ran before it, not just its own.
   */
  const applyAll = db.transaction(() => {
    for (const migration of pending) {
      db.exec(migration.sql);
      record.run(migration.version, migration.name, new Date().toISOString());
    }
  });
  try {
    // Nothing pending, nothing opened: a restart against an up-to-date database
    // does not so much as begin a transaction.
    if (pending.length > 0) applyAll();
  } catch (error) {
    throw new MigrationSafetyError(
      `the database could not be migrated to level ${String(maximum)} (${pending
        .map((migration) => String(migration.version))
        .join(', ')} pending) and was left exactly as it was: ${describe(error)}`,
      'migration_failed',
    );
  }

  return { level: migrationLevel(db), applied: pending.map((m) => m.version) };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
