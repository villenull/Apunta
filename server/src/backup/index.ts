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
import { getSetting, putSettings } from '../db/settings.js';
import { createBackup } from './archive.js';
import { tableCounts } from './dump.js';
import {
  describeDestination,
  ensureBackupDir,
  isDueToday,
  isStale,
  lastBackupAt,
  lastBackupError,
  lastBackupFile,
  listRestorableBackups,
  pruneBackups,
  resolveBackupDir,
} from './store.js';

export { BackupError, createBackup } from './archive.js';
export { encryptPayload, decryptPayload, sha256 } from './crypto.js';
export { dumpDatabase, tableCounts, listUserTables } from './dump.js';
export { noteEntries, planEntries, noteFileText } from './readable.js';
export { renderRestoreText, DECRYPT_SCRIPT } from './restore-txt.js';
export {
  applyPendingRestore,
  cancelPendingRestore,
  hasPendingRestore,
  readArchive,
  RestoreError,
  stageRestore,
} from './restore.js';
export {
  defaultBackupDir,
  describeDestination,
  isDueToday,
  isStale,
  listBackups,
  listRestorableBackups,
  pruneBackups,
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
}

/**
 * One backup, start to finish: write it, record that it happened, prune.
 *
 * The recorded result is as important as the archive. A failed backup that
 * leaves last week's timestamp in place is a backup that appears to exist —
 * which the research ranks as the single most likely way this practice loses
 * its data — so a failure writes the error into Settings and Settings shows it.
 */
export function runBackup(
  db: Database,
  config: AppConfig,
  options: RunBackupOptions = {},
): CreateBackupResponse {
  const now = options.now ?? new Date();
  const directory = options.directory ?? resolveBackupDir(db, config.dataDir);
  const destination = describeDestination(directory, config.dataDir);

  try {
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
  } catch (error) {
    putSettings(db, {
      [LAST_BACKUP_ERROR_SETTING]: `${now.toISOString()} — ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
    throw error;
  }
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

export function backupStatus(db: Database, config: AppConfig, now: Date = new Date()): BackupStatus {
  const directory = resolveBackupDir(db, config.dataDir);
  const lastAt = lastBackupAt(db);
  const oldest = db.prepare('SELECT MIN(created_at) AS oldest FROM notes').get() as {
    oldest: string | null;
  };

  return {
    directory,
    destination: describeDestination(directory, config.dataDir),
    last_backup_at: lastAt,
    last_backup_file: lastBackupFile(db),
    last_backup_error: lastBackupError(db),
    stale: isStale(lastAt, now),
    last_verified_restore: readString(db, LAST_VERIFIED_RESTORE_SETTING),
    backups: listRestorableBackups(directory),
    counts: tableCounts(db),
    oldest_note_at: oldest.oldest,
    db_bytes: databaseBytes(db),
  };
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
