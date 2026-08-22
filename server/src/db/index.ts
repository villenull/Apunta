import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import BetterSqlite3, { type Database } from 'better-sqlite3';

import { migrate, migrationLevel, type MigrationResult } from './migrate.js';

export type { Database };

export interface OpenDatabaseOptions {
  /** Absolute path to the SQLite file, or `:memory:`. */
  readonly file: string;
  /** Directory holding the numbered `.sql` migrations. */
  readonly migrationsDir: string;
}

export interface OpenedDatabase {
  readonly db: Database;
  readonly migrations: MigrationResult;
}

/**
 * Open (creating if needed) the practice database and bring it up to date.
 *
 * WAL keeps a long-running read (the UI polling) from blocking a write, and
 * `foreign_keys` must be turned on per connection — SQLite defaults it off,
 * and every cascade in the schema depends on it.
 */
export function openDatabase({ file, migrationsDir }: OpenDatabaseOptions): OpenedDatabase {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });

  const db = new BetterSqlite3(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  const migrations = migrate(db, migrationsDir);
  return { db, migrations };
}

export { migrate, migrationLevel };
export type { MigrationResult };
