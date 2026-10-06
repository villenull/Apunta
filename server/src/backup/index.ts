import {
  BACKUP_DIR_SETTING,
  LAST_BACKUP_AT_SETTING,
  LAST_BACKUP_ERROR_SETTING,
  LAST_BACKUP_FILE_SETTING,
  LAST_VERIFIED_RESTORE_SETTING,
  type BackupStatus,
  type CreateBackupResponse,
  type Settings,
} from '@apunta/shared';
import type { Database } from 'better-sqlite3';

import type { AppConfig } from '../config.js';
import { migrationLevel } from '../db/index.js';
import { msg, type Locale } from '../http/locale.js';
import { getSetting, putSettings } from '../db/settings.js';
import { snapshotDatabase, type SnapshotMethod } from '../db/snapshot.js';
import { createBackup, createBackupAsync } from './archive.js';
import { tableCounts } from './dump.js';
import { withBackupLock, withBackupLockSync } from './lock.js';
import {
  describeDestination,
  ensureBackupDir,
  isDueToday,
  isStale,
  lastBackupAt,
  lastBackupFile,
  listRestorableBackups,
  legacyBackupDir,
  pruneBackups,
  resolveBackupDir,
} from './store.js';

export type { BackupLocationConfig } from './store.js';
export { snapshotDatabase, type SnapshotMethod };
export { BackupError, createBackup, createBackupAsync, type BackupOperation } from './archive.js';
export { encryptPayload, decryptPayload, sha256 } from './crypto.js';
export { dumpDatabase, tableCounts, listUserTables } from './dump.js';
export { BACKUP_LOCK_WAIT_MS, withBackupLock, withBackupLockSync } from './lock.js';
export { noteEntries, planEntries, noteFileText } from './readable.js';
export { renderRestoreText, DECRYPT_SCRIPT } from './restore-txt.js';
export {
  applyPendingRestore,
  cancelPendingRestore,
  hasPendingRestore,
  readArchive,
  restoreFromSnapshot,
  RestoreError,
  rollbackAppliedRestore,
  stageRestore,
} from './restore.js';
export {
  defaultBackupDir,
  describeDestination,
  isDueToday,
  isStale,
  legacyBackupDir,
  listBackups,
  listFolders,
  listRestorableBackups,
  pruneBackups,
  rememberBackupDir,
  resolveBackupDir,
  selectPrunable,
} from './store.js';

export interface RunBackupOptions {
  /** Override the configured destination for this run only. */
  readonly directory?: string | undefined;
  readonly passphrase?: string | undefined;
  /** Remember `directory` as the destination from now on. */
  readonly remember?: boolean | undefined;
  readonly now?: Date | undefined;
  /**
   * How long to wait for the backup already running, instead of
   * `BACKUP_LOCK_WAIT_MS`. A seam for tests; production callers omit it, and
   * the production number is the contract's (C-SNAP@1 rule 3, HS-7).
   */
  readonly lockWaitMs?: number | undefined;
}

/**
 * One backup, start to finish: write it, record that it happened, prune.
 *
 * The recorded result is as important as the archive. A failed backup that
 * leaves last week's timestamp in place is a backup that appears to exist —
 * which the research ranks as the single most likely way this practice loses
 * its data — so a failure writes the error into Settings and Settings shows it.
 *
 * The work happens under the backup lock and the bookkeeping is outside it, so
 * a run that lost the wait for another one is recorded as the failure it is.
 * The lock is here rather than in the route so the daily automatic backup is
 * covered by the same rule (C-SNAP@1 rule 3).
 */
export function runBackup(
  db: Database,
  config: AppConfig,
  options: RunBackupOptions = {},
): CreateBackupResponse {
  const now = options.now ?? new Date();
  const directory = options.directory ?? resolveBackupDir(db, config);
  const destination = describeDestination(directory, config);

  try {
    return withBackupLockSync(() => {
      ensureBackupDir(directory);
      const created = createBackup({
        db,
        dataDir: config.dataDir,
        directory,
        appVersion: config.version,
        passphrase: options.passphrase,
        now,
      });

      const settings: Settings = {
        [LAST_BACKUP_AT_SETTING]: now.toISOString(),
        [LAST_BACKUP_FILE_SETTING]: created.path,
        [LAST_BACKUP_ERROR_SETTING]: '',
      };
      if (options.remember === true) settings[BACKUP_DIR_SETTING] = directory;
      putSettings(db, settings);

      return {
        file: {
          filename: created.filename,
          path: created.path,
          bytes: created.bytes,
          created_at: now.toISOString(),
          encrypted: created.manifest.encrypted,
        },
        manifest: created.manifest,
        destination,
        pruned: pruneBackups(directory),
      };
    }, options.lockWaitMs);
  } catch (error) {
    putSettings(db, {
      [LAST_BACKUP_ERROR_SETTING]: backupFailure(error, now),
    });
    throw error;
  }
}

/** Async HTTP/startup counterpart; compression runs off the event loop. */
export async function runBackupAsync(
  db: Database,
  config: AppConfig,
  options: RunBackupOptions = {},
): Promise<CreateBackupResponse> {
  const now = options.now ?? new Date();
  const directory = options.directory ?? resolveBackupDir(db, config);
  const destination = describeDestination(directory, config);

  try {
    return await withBackupLock(async () => {
      ensureBackupDir(directory);
      const created = await createBackupAsync({
        db,
        dataDir: config.dataDir,
        directory,
        appVersion: config.version,
        passphrase: options.passphrase,
        now,
      });

      const settings: Settings = {
        [LAST_BACKUP_AT_SETTING]: now.toISOString(),
        [LAST_BACKUP_FILE_SETTING]: created.path,
        [LAST_BACKUP_ERROR_SETTING]: '',
      };
      if (options.remember === true) settings[BACKUP_DIR_SETTING] = directory;
      putSettings(db, settings);

      return {
        file: {
          filename: created.filename,
          path: created.path,
          bytes: created.bytes,
          created_at: now.toISOString(),
          encrypted: created.manifest.encrypted,
        },
        manifest: created.manifest,
        destination,
        pruned: pruneBackups(directory),
      };
    }, options.lockWaitMs);
  } catch (error) {
    putSettings(db, {
      [LAST_BACKUP_ERROR_SETTING]: backupFailure(error, now),
    });
    throw error;
  }
}

export async function maybeRunDailyBackupAsync(
  db: Database,
  config: AppConfig,
  now: Date = new Date(),
): Promise<CreateBackupResponse | null> {
  if (!isDueToday(lastBackupAt(db), now)) return null;
  const counts = tableCounts(db);
  if ((counts['patients'] ?? 0) === 0) return null;
  return runBackupAsync(db, config, { now });
}

/**
 * The daily automatic backup, run once on the first start of the day.
 *
 * An empty practice is skipped: an archive of nothing is not a backup, and
 * writing one on every CI boot would only teach whoever reads the folder to
 * ignore it.
 */
export function maybeRunDailyBackup(
  db: Database,
  config: AppConfig,
  now: Date = new Date(),
): CreateBackupResponse | null {
  if (!isDueToday(lastBackupAt(db), now)) return null;
  const counts = tableCounts(db);
  if ((counts['patients'] ?? 0) === 0) return null;
  return runBackup(db, config, { now });
}

export function backupStatus(
  db: Database,
  config: AppConfig,
  now: Date = new Date(),
  locale: Locale = 'en',
): BackupStatus {
  const directory = resolveBackupDir(db, config);
  const lastAt = lastBackupAt(db);
  const oldest = db.prepare('SELECT MIN(created_at) AS oldest FROM notes').get() as {
    oldest: string | null;
  };

  return {
    directory,
    destination: describeDestination(directory, config),
    last_backup_at: lastAt,
    last_backup_file: lastBackupFile(db),
    // Read through `getSetting` rather than `store.ts`'s `lastBackupError`,
    // which is typed `string | null` and would answer null for this card's
    // object. The legacy string still comes back as a string, so the renderer
    // sees both shapes and no other module has to change.
    last_backup_error: renderBackupError(getSetting<unknown>(db, LAST_BACKUP_ERROR_SETTING), locale),
    stale: isStale(lastAt, now),
    last_verified_restore: readString(db, LAST_VERIFIED_RESTORE_SETTING),
    backups:
      directory === legacyBackupDir(config.dataDir)
        ? listRestorableBackups(directory)
        : [...listRestorableBackups(directory), ...listRestorableBackups(legacyBackupDir(config.dataDir))],
    counts: tableCounts(db),
    oldest_note_at: oldest.oldest,
    db_bytes: databaseBytes(db),
  };
}

/**
 * What a failed backup stores, from this card on: a catalogue key, the
 * parameters it renders, and the ISO stamp.
 *
 * GET /api/backup renders stored failures in the request's language while
 * keeping its last_backup_error wire field a string.
 *
 * `{detail}` is the failure's own words — a `BackupError`'s message, which
 * names a path or a parser's complaint and is data rather than copy this card
 * may translate. The frame around it is `backup.failure`, and the stamp is a
 * `date` parameter, so it comes out through `Intl` like every other date.
 */
// A `type` and not an `interface`: `putSettings` takes `Settings`, whose value
// type is `z.json()`, and only a type alias carries the implicit index signature
// that makes an object literal assignable to it.
type StoredBackupFailure = {
  code: 'backup.failure';
  params: { detail: string };
  at: string;
};

function backupFailure(error: unknown, now: Date): StoredBackupFailure {
  return {
    code: 'backup.failure',
    params: { detail: error instanceof Error ? error.message : String(error) },
    at: now.toISOString(),
  };
}

/**
 * The wire string for `last_backup_error`.
 *
 * A row this card wrote is re-rendered in `locale`; **a row that predates it is
 * displayed exactly as stored** — never re-rendered, never re-translated,
 * never rewritten. The two are told apart by shape rather than by a marker: the
 * new row is a JSON object, and a legacy row is the `<iso> — <message>` string,
 * which does not parse. A row that parses but is not this card's shape is also
 * shown as it stands, so a hand-edited value is never fed to `t()` as a key.
 * No migration deletes or rewrites either.
 */
function renderBackupError(stored: unknown, locale: Locale): string | null {
  // Absent, or the empty string a successful backup writes: no failure.
  if (stored === undefined || stored === null || stored === '') return null;
  // A legacy row is a plain string, and the only thing this card may do with
  // one is show it.
  if (typeof stored === 'string') return stored;
  if (typeof stored !== 'object') return String(stored);
  const row = stored as { code?: unknown; params?: { detail?: unknown }; at?: unknown };
  if (row.code !== 'backup.failure' || typeof row.at !== 'string') return null;
  if (typeof row.params?.detail !== 'string') return null;
  return msg(locale, 'backup.failure', { at: row.at, detail: row.params.detail });
}

/** Pages × page size, which is the file's own account of its size. */
function databaseBytes(db: Database): number {
  const pages = db.pragma('page_count', { simple: true }) as number;
  const size = db.pragma('page_size', { simple: true }) as number;
  return pages * size;
}

function readString(db: Database, key: string): string | null {
  const value = getSetting<unknown>(db, key);
  return typeof value === 'string' && value !== '' ? value : null;
}

export { migrationLevel };
