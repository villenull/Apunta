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
  /**
   * Where `better_sqlite3.node` is, when it is not where npm put it (M8).
   *
   * Apple's bundle layout wants a Mach-O in `Contents/Helpers/`, not in
   * `Contents/Resources/` beside the bundled JavaScript — putting compiled
   * code in `Resources/` is the failure mode Apple's own guidance calls out.
   * So the packaged app names the addon rather than letting the module
   * search for it. Undefined everywhere else.
   */
  readonly nativeBinding?: string | undefined;
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
export function openDatabase(options: OpenDatabaseOptions): OpenedDatabase {
  const { file, migrationsDir } = options;
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });

  const db =
    options.nativeBinding === undefined
      ? new BetterSqlite3(file)
      : new BetterSqlite3(file, { nativeBinding: options.nativeBinding });
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');

    // Three pragmas from `docs/research/data-at-rest-2026-08.md` §9.
    db.pragma('temp_store = MEMORY');
    db.pragma('secure_delete = ON');
    db.pragma('journal_size_limit = 6291456');

    const migrations = migrate(db, migrationsDir);

    /**
     * C-OWN@1 rule 4's backstop, and it is deliberately not a lock file:
     * a process that ignores `apunta.lock` — a v1 server, an older copy of
     * this one, something run by hand — still cannot write to a database
     * this process holds. It answers SQLITE_BUSY instead.
     *
     * After `migrate`, never before: migrations write, and the exclusive lock
     * has to be taken once the schema is in place. SQLite takes the lock at
     * the first read or write after this pragma, so the backstop is fully
     * effective from the first write the app makes.
     */
    db.pragma('locking_mode = EXCLUSIVE');

    return { db, migrations };
  } catch (error) {
    db.close();
    throw error;
  }
}

export { migrate, migrationLevel };
export type { MigrationResult };
