import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { DB_ENTRY_NAME } from '@apunta/shared';
import BetterSqlite3, { type Database } from 'better-sqlite3';

import { integrityCheck } from '../backup/archive.js';
import { applyPendingRestore, type AppliedRestore } from '../backup/restore.js';
import { loadMigrations, migrate, MigrationSafetyError, type MigrationResult } from './migrate.js';
import { snapshotDatabase } from './snapshot.js';
import { uuidv7 } from './uuid.js';

/**
 * C-UPD@1's migration section, as one function.
 *
 * The contract's steps are not advice about *which* migrations to run; they
 * are the order, and the order is the safety property. A pending restore is
 * applied, the database is read for its schema version **without writing to
 * it**, a verified copy of it is taken if anything is pending, and only then
 * does anything change. Every failure stops the start with one of three codes
 * and leaves the old schema exactly as it was, with the copy beside it.
 *
 * `server/src/index.ts` calls this between `applyPendingRestore` and
 * `openDatabase`, which is where C-OWN@1 rule 1 puts it: the folder is owned
 * before this runs, and the database is opened for writing after it.
 *
 * Nothing here copies the database by itself. The copy is
 * `snapshotDatabase` (C-SNAP@1 rule 1, one primitive), staged in this
 * operation's own `staging/pre-migrate-<uuid>/` folder at mode 700 and
 * integrity-checked, exactly as a backup is; then the verified file is moved
 * into `safety/`, where it is the thing C-UPD@1 step 4 promises to keep when a
 * migration fails.
 */

/**
 * Re-exported so the card's import path is the one that works, and defined in
 * `migrate.ts` because that is where two of the three codes are raised — this
 * module imports `migrate`, and the class living here too would make the two
 * files import each other in a cycle.
 */
export { MigrationSafetyError, type MigrationSafetyCode } from './migrate.js';

/** Sibling of `backups/`, not a child of it. */
const SAFETY_DIRNAME = 'safety';
/** C-SNAP@1 rule 1's staging root, shared with the backup module. */
const STAGING_DIRNAME = 'staging';
/** The operation name C-SNAP@1's `BackupOperation` already reserves for this. */
const PRE_MIGRATE_OP = 'pre-migrate';
/** C-UPD@1 step 5. */
const SAFETY_SNAPSHOTS_KEPT = 3;

/**
 * `<from>-<to>-<utc>.db` — and the capture is the stamp alone, because that is
 * what retention orders by. The house convention is `restore.ts`'s: an ISO
 * string with `:` and `.` replaced, which sorts lexically.
 */
const SAFETY_SNAPSHOT_NAME = /^pre-migrate-(\d+)-(\d+)-(.+)\.db$/;

export interface PrepareDatabaseOptions {
  /** Where the lock file, `safety/` and `staging/` live. */
  readonly dataDir: string;
  /** The database itself. Created by `openDatabase` when it is not there yet. */
  readonly dbFile: string;
  readonly migrationsDir: string;
  /** Passed through to `better-sqlite3` by the packaged app (M8). */
  readonly nativeBinding?: string | undefined;
  /** Injected so a test can give four runs four stamps. */
  readonly now?: Date | undefined;
}

export interface PreparedDatabase {
  /** What step 1's pending restore did, whether or not there was one. */
  readonly restored: AppliedRestore;
  /** The level read through the read-only handle, before anything wrote. */
  readonly inspected: number;
  /** `safety/pre-migrate-<from>-<to>-<utc>.db`, or null when nothing was pending. */
  readonly safetySnapshot: string | null;
  readonly migrations: MigrationResult;
  /** Snapshots step 5 deleted, oldest first. Empty unless a migration ran. */
  readonly pruned: readonly string[];
}

export function prepareDatabaseForStart(options: PrepareDatabaseOptions): PreparedDatabase {
  // Step 1's tail. `index.ts` also calls this, and deliberately keeps its own
  // result: it needs the `safetyCopy` to roll the restore back if the open
  // fails, and it logs it. This second call finds nothing pending — the first
  // one removed `pending-restore/` — so it is a no-op in production, and the
  // sequence below is a sequence that is correct on its own.
  const restored = applyPendingRestore(options.dataDir);

  // A data folder with no `apunta.db` is a first run, not an inspect case: no
  // read-only open, no `newer_schema`, no `safety/` folder, no snapshot, and —
  // because retention only runs after a migration — nothing evicted either.
  // Creating it is `openDatabase`'s job, called next, and it already does
  // exactly that.
  if (!existsSync(options.dbFile)) {
    return {
      restored,
      inspected: 0,
      safetySnapshot: null,
      migrations: { level: 0, applied: [] },
      pruned: [],
    };
  }

  const migrations = loadMigrations(options.migrationsDir);
  const maximum = migrations.at(-1)?.version ?? 0;

  // Step 2. The handle is read-only and stays read-only for the whole
  // inspection *and* the step-3 copy, which `VACUUM INTO` can take from a
  // read-only source: nothing on the path to a safety snapshot can write to a
  // practice's database.
  const inspection = openReadOnlyHandle(options.dbFile, options.nativeBinding);
  try {
    // The table is read directly rather than through `migrationLevel`, which
    // issues `CREATE TABLE IF NOT EXISTS` first: against a read-only handle
    // that is a no-op when the table is there and `SQLITE_READONLY` when it is
    // not, and a database with no `schema_migrations` at all is exactly the
    // level-0 case this must not refuse. `safety.test.ts` pins both halves.
    const applied = readAppliedVersions(inspection);
    const inspected = applied.at(-1) ?? 0;

    if (inspected > maximum) {
      throw new MigrationSafetyError(
        `Database schema version ${String(inspected)} is newer than this build (highest supported migration ${String(maximum)}). Update Apunta before opening this database.`,
        'newer_schema',
      );
    }

    // Pending by the same rule `migrate` uses — the versions absent from the
    // table, not "greater than the level" — so this can never take a snapshot
    // for a migration that is not going to run, or skip one that is.
    const pending = migrations.filter((migration) => !applied.includes(migration.version));
    if (pending.length === 0) {
      return {
        restored,
        inspected,
        safetySnapshot: null,
        migrations: { level: inspected, applied: [] },
        pruned: [],
      };
    }

    const to = pending.at(-1)?.version ?? inspected;

    // Step 3, and its failure is the one that stops the start with the old
    // schema intact. A copy that cannot be verified is not a safety snapshot.
    const safetySnapshot = takeSafetySnapshot(options, inspection, inspected, to, options.now ?? new Date());
    return {
      restored,
      inspected,
      safetySnapshot,
      migrations: runMigrations(options),
      // Step 5, and only now: the migration that made the oldest snapshots
      // redundant has actually succeeded.
      pruned: pruneSafetySnapshots(options.dataDir),
    };
  } finally {
    inspection.close();
  }
}

/**
 * `schema_migrations` is read, never created. A database without the table has
 * had no migration applied, which is level 0 — the state every fresh install
 * starts in — and saying so is what lets the migration below create it.
 *
 * Any other failure to read it is read as level 0 too, and that is the safe
 * direction rather than a shrug: a snapshot is taken first, and a table too
 * broken to insert into then fails the migration, which rolls back and stops the
 * start. It can never read as "already current", which is the answer that would
 * let a database through untouched.
 */
function readAppliedVersions(db: Database): number[] {
  try {
    const rows = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as {
      version: number;
    }[];
    return rows.map((row) => row.version);
  } catch {
    return [];
  }
}

function takeSafetySnapshot(
  options: PrepareDatabaseOptions,
  source: Database,
  from: number,
  to: number,
  now: Date,
): string {
  const stagingRoot = join(options.dataDir, STAGING_DIRNAME);
  const staging = join(stagingRoot, `${PRE_MIGRATE_OP}-${uuidv7()}`);
  const safetyDir = join(options.dataDir, SAFETY_DIRNAME);
  const destination = join(safetyDir, `${PRE_MIGRATE_OP}-${String(from)}-${String(to)}-${stamp(now)}.db`);

  try {
    mkdirSync(stagingRoot, { recursive: true, mode: 0o700 });
    mkdirSync(staging, { recursive: true, mode: 0o700 });
    const copyPath = join(staging, DB_ENTRY_NAME);
    snapshotDatabase(source, copyPath);

    const integrity = integrityCheck(copyPath);
    if (integrity !== 'ok') {
      throw new Error(`the safety snapshot failed its integrity check (${integrity})`);
    }

    mkdirSync(safetyDir, { recursive: true, mode: 0o700 });
    // `snapshotDatabase` refuses to overwrite, and the move below is a move
    // rather than a copy for the same reason: two runs landing on one name is
    // a caller's bug, never something to solve by deleting a snapshot.
    if (existsSync(destination)) {
      throw new Error(`a safety snapshot is already at ${destination}`);
    }
    renameSync(copyPath, destination);
    return destination;
  } catch (error) {
    // `snapshotDatabase` and `integrityCheck` throw plain `Error`s; the code
    // the start stops with is this card's vocabulary, so the cause is wrapped
    // rather than re-thrown and its words are carried into the message.
    throw new MigrationSafetyError(
      `the pre-migration safety snapshot could not be taken, so the schema was left exactly as it was: ${describe(error)}`,
      'snapshot_failed',
    );
  } finally {
    // Its own staging folder and nothing else, as C-SNAP@1 rule 3 promises.
    rmSync(staging, { recursive: true, force: true });
  }
}

/** Step 4: every pending migration, in one transaction, or none of them. */
function runMigrations(options: PrepareDatabaseOptions): MigrationResult {
  const db = openWritableHandle(options.dbFile, options.nativeBinding);
  try {
    // The pragmas `openDatabase` sets before it migrates, so a migration taken
    // here runs under the connection settings it has always run under.
    // Deliberately absent: `locking_mode = EXCLUSIVE`. C-OWN@1 rule 4 takes
    // that once the schema is in place, which is the next thing that happens.
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    db.pragma('temp_store = MEMORY');
    db.pragma('secure_delete = ON');
    db.pragma('journal_size_limit = 6291456');

    try {
      return migrate(db, options.migrationsDir);
    } catch (error) {
      // `newer_schema` and `migration_failed` arrive already coded; anything
      // else — a migrations directory that cannot be read, a `schema_migrations`
      // table too broken to insert into — is a failed migration all the same,
      // and it is reported in the only three words a caller has.
      if (error instanceof MigrationSafetyError) throw error;
      throw new MigrationSafetyError(
        `the database could not be brought up to this build's schema, and nothing was changed: ${describe(error)}`,
        'migration_failed',
      );
    }
  } finally {
    db.close();
  }
}

/**
 * C-UPD@1 step 5: keep the last three, delete the rest, oldest first.
 *
 * Ordered by the stamp, which sorts lexically, and only files this module's own
 * naming scheme claims — an unrelated file in `safety/` is not ours to delete,
 * which is the same rule the staging cleanup follows.
 */
function pruneSafetySnapshots(dataDir: string): string[] {
  const safetyDir = join(dataDir, SAFETY_DIRNAME);
  const snapshots: { readonly stamp: string; readonly path: string }[] = [];
  for (const name of readdirSync(safetyDir)) {
    const match = SAFETY_SNAPSHOT_NAME.exec(name);
    if (match === null) continue;
    snapshots.push({ stamp: match[3] ?? '', path: join(safetyDir, name) });
  }
  snapshots.sort((a, b) => (a.stamp < b.stamp ? -1 : a.stamp > b.stamp ? 1 : 0));

  const pruned: string[] = [];
  for (const old of snapshots.slice(0, Math.max(0, snapshots.length - SAFETY_SNAPSHOTS_KEPT))) {
    rmSync(old.path, { force: true });
    pruned.push(old.path);
  }
  return pruned;
}

/** `restore.ts`'s convention, so every stamp in the data folder sorts alike. */
function stamp(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-');
}

function openReadOnlyHandle(file: string, nativeBinding: string | undefined): Database {
  return nativeBinding === undefined
    ? new BetterSqlite3(file, { readonly: true })
    : new BetterSqlite3(file, { readonly: true, nativeBinding });
}

function openWritableHandle(file: string, nativeBinding: string | undefined): Database {
  return nativeBinding === undefined ? new BetterSqlite3(file) : new BetterSqlite3(file, { nativeBinding });
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
