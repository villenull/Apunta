import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  BACKUP_DIRNAME,
  BACKUP_STALE_DAYS,
  BACKUP_DIR_SETTING,
  ENCRYPTED_PAYLOAD_NAME,
  KEEP_DAILY_BACKUPS,
  KEEP_MONTHLY_BACKUPS,
  LAST_BACKUP_AT_SETTING,
  LAST_BACKUP_ERROR_SETTING,
  LAST_BACKUP_FILE_SETTING,
  backupFilenameDate,
  classifyBackupDestination,
  type BackupFile,
  type DestinationAdvice,
} from '@apunta/shared';
import type { Database } from 'better-sqlite3';
import { unzipSync } from 'fflate';
import { readFileSync } from 'node:fs';

import { getSetting } from '../db/settings.js';

/**
 * Where archives live, which ones survive, and when the next one is due.
 *
 * The default destination is inside the data dir. That sounds circular — the
 * copy is on the same disk as the original — and it is not, because the
 * failure it defends against most often is *logical* (a bad delete, a bad
 * migration), and because Time Machine promotes it to an off-machine copy for
 * free. What the UI must not do is imply that it is enough on its own
 * (`docs/research/data-at-rest-2026-08.md` §5.4).
 */

export function defaultBackupDir(dataDir: string): string {
  return join(dataDir, BACKUP_DIRNAME);
}

/** The configured destination, or the default. Never a relative path. */
export function resolveBackupDir(db: Database, dataDir: string): string {
  const configured = getSetting<unknown>(db, BACKUP_DIR_SETTING);
  return typeof configured === 'string' && configured.trim().startsWith('/')
    ? configured.trim()
    : defaultBackupDir(dataDir);
}

export function describeDestination(directory: string, dataDir: string): DestinationAdvice {
  return classifyBackupDestination(directory, dataDir, homedir());
}

/** Every Apunta archive in a folder, newest first. Anything else there is ignored. */
/**
 * Everything in the folder that could be restored, not only what this app
 * wrote (day-one rehearsal, 2026-08-30).
 *
 * `listBackups` is keyed to Apunta's own filenames because it feeds the
 * pruner, and the pruner deletes. But restoring has the opposite duty: a
 * practice puts a file here precisely because it came from somewhere else —
 * an old Mac, a memory stick, whoever set the app up — and a browser that
 * appended " (1)" to the download, or a hand that renamed it, must not make
 * an otherwise valid backup invisible with no way to reach it. So restore
 * offers every zip in the folder and lets the archive itself be the judge:
 * `stageRestore` validates the manifest and refuses anything that is not
 * genuinely one of ours.
 *
 * Nothing here reaches the pruner, which still only ever removes files it
 * can prove it created.
 */
export function listRestorableBackups(directory: string): BackupFile[] {
  if (!existsSync(directory)) return [];
  const files: BackupFile[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.zip')) continue;
    const path = join(directory, entry.name);
    const stats = statSync(path);
    files.push({
      filename: entry.name,
      path,
      bytes: stats.size,
      created_at: new Date(stats.mtimeMs).toISOString(),
      encrypted: isEncrypted(path),
    });
  }
  return files.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function listBackups(directory: string): BackupFile[] {
  if (!existsSync(directory)) return [];
  const files: BackupFile[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || backupFilenameDate(entry.name) === null) continue;
    const path = join(directory, entry.name);
    const stats = statSync(path);
    files.push({
      filename: entry.name,
      path,
      bytes: stats.size,
      created_at: new Date(stats.mtimeMs).toISOString(),
      encrypted: isEncrypted(path),
    });
  }
  return files.sort((a, b) => b.filename.localeCompare(a.filename));
}

/**
 * Read the outer zip's entry names only.
 *
 * `unzipSync`'s filter still decompresses nothing when it returns false, so
 * this costs a central-directory walk and no more. A file that will not open
 * is reported as unencrypted rather than crashing the listing — the restore
 * path will say what is actually wrong with it.
 */
function isEncrypted(path: string): boolean {
  try {
    const entries = unzipSync(readFileSync(path), { filter: (file) => file.name === ENCRYPTED_PAYLOAD_NAME });
    return ENCRYPTED_PAYLOAD_NAME in entries;
  } catch {
    return false;
  }
}

/**
 * The ladder from §5.3: keep the newest `KEEP_DAILY_BACKUPS` archives, plus
 * the newest archive of each of the last `KEEP_MONTHLY_BACKUPS` months.
 *
 * Retention of *backups* is a different question from retention of *records*.
 * Nothing here touches a note: the practice keeps everything, and pruning old
 * copies of the same database is not deletion of anything.
 */
export function selectPrunable(files: readonly BackupFile[]): BackupFile[] {
  const sorted = [...files].sort((a, b) => b.filename.localeCompare(a.filename));
  const keep = new Set<string>();

  for (const file of sorted.slice(0, KEEP_DAILY_BACKUPS)) keep.add(file.filename);

  const monthsSeen = new Set<string>();
  for (const file of sorted) {
    const day = backupFilenameDate(file.filename);
    if (day === null) continue;
    const month = day.slice(0, 7);
    if (monthsSeen.has(month)) continue;
    monthsSeen.add(month);
    if (monthsSeen.size <= KEEP_MONTHLY_BACKUPS) keep.add(file.filename);
  }

  return sorted.filter((file) => !keep.has(file.filename));
}

export function pruneBackups(directory: string): string[] {
  const removed: string[] = [];
  for (const file of selectPrunable(listBackups(directory))) {
    rmSync(file.path, { force: true });
    removed.push(file.filename);
  }
  return removed;
}

export function ensureBackupDir(directory: string): string {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  return directory;
}

/** Null when there has never been one. */
export function lastBackupAt(db: Database): string | null {
  const value = getSetting<unknown>(db, LAST_BACKUP_AT_SETTING);
  return typeof value === 'string' && value !== '' ? value : null;
}

export function lastBackupFile(db: Database): string | null {
  const value = getSetting<unknown>(db, LAST_BACKUP_FILE_SETTING);
  return typeof value === 'string' && value !== '' ? value : null;
}

export function lastBackupError(db: Database): string | null {
  const value = getSetting<unknown>(db, LAST_BACKUP_ERROR_SETTING);
  return typeof value === 'string' && value !== '' ? value : null;
}

/** No backup at all, or the newest is older than a week. Settings says so in colour. */
export function isStale(lastAt: string | null, now: Date): boolean {
  if (lastAt === null) return true;
  const age = now.getTime() - Date.parse(lastAt);
  return !Number.isFinite(age) || age > BACKUP_STALE_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Automatic backups run once per day, on the first server start of the day
 * (§5.3). At launch rather than at quit, because she closes the lid.
 *
 * Compared by calendar day in the local timezone: "did today's backup happen"
 * is a question about her day, not about UTC.
 */
export function isDueToday(lastAt: string | null, now: Date): boolean {
  if (lastAt === null) return true;
  const last = new Date(lastAt);
  if (Number.isNaN(last.getTime())) return true;
  return localDay(last) !== localDay(now);
}

function localDay(date: Date): string {
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
