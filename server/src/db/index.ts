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
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  // Three pragmas from `docs/research/data-at-rest-2026-08.md` §9.
  //
  // `temp_store = MEMORY` keeps SQLite's scratch files out of `TMPDIR`. The
  // working set here is kilobytes, so it costs nothing, and the alternative is
  // a directory nothing in this project manages holding fragments of clinical
  // notes — or, if `TMPDIR` is unset under a LaunchAgent, `/var/tmp` (§2.3).
  //
  // `secure_delete` overwrites freed pages instead of leaving deleted note
  // text in the file. It is hygiene, not a security boundary: APFS snapshots
  // and Time Machine keep the old bytes regardless, which is why the honest
  // sentence in the delete confirmation matters more than this line does.
  //
  // `journal_size_limit` stops the WAL — which holds recently written note
  // text — growing without bound after a large write.
  db.pragma('temp_store = MEMORY');
  db.pragma('secure_delete = ON');
  db.pragma('journal_size_limit = 6291456');

  const migrations = migrate(db, migrationsDir);
  return { db, migrations };
}

export { migrate, migrationLevel };
export type { MigrationResult };
