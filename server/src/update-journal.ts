/**
 * The update journal (C-UPD@1 "Recovery startup"): one small JSON file in the
 * data folder that survives the relaunch an update needs.
 *
 * - `pending`: the old server wrote it after the pre-update safety snapshot was
 *   durable and before it acknowledged `snapshot_result{ok:true}`.
 * - `health_attempted`: the first boot of the target version claimed its one
 *   normal attempt, before opening the database.
 * - `recovery`: a boot found an attempt that never confirmed health and entered
 *   recovery mode instead of trying a normal start again.
 *
 * Writes are atomic (temp file, fsync, rename, fsync of the folder), so a crash
 * leaves either the old journal or the new one, never half of either.
 */
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, rmSync, writeSync } from 'node:fs';
import { join } from 'node:path';

export const UPDATE_JOURNAL_NAME = 'update-journal.json';

export type JournalPhase = 'pending' | 'health_attempted' | 'recovery';

export interface UpdateJournal {
  readonly phase: JournalPhase;
  /** Opaque id shared by the snapshot request and the relaunch handoff. */
  readonly updateId: string;
  readonly fromVersion: string;
  readonly toVersion: string;
  /** Absolute path of the pre-update safety snapshot. */
  readonly snapshotPath: string;
  /** UTC ISO-8601. */
  readonly createdAt: string;
  /** Explicitly restored data may boot this version once, with the matching shell handoff. */
  readonly recoveryTarget?: string;
}

const PHASES: readonly JournalPhase[] = ['pending', 'health_attempted', 'recovery'];

export function journalPath(dataDir: string): string {
  return join(dataDir, UPDATE_JOURNAL_NAME);
}

/**
 * The journal, `null` when there is none, or `'corrupt'` when a file exists
 * but cannot be read as one. A corrupt journal is never treated as absent:
 * the caller must fail closed (recovery), because absence means "normal boot".
 */
export function readJournal(dataDir: string): UpdateJournal | null | 'corrupt' {
  let raw: string;
  try {
    raw = readFileSync(journalPath(dataDir), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return 'corrupt';
  }
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const strings = ['updateId', 'fromVersion', 'toVersion', 'snapshotPath', 'createdAt'] as const;
    if (!PHASES.includes(value['phase'] as JournalPhase)) return 'corrupt';
    for (const key of strings) {
      if (typeof value[key] !== 'string' || value[key] === '') return 'corrupt';
    }
    if (
      value['recoveryTarget'] !== undefined &&
      (value['phase'] !== 'recovery' ||
        typeof value['recoveryTarget'] !== 'string' ||
        value['recoveryTarget'] === '')
    )
      return 'corrupt';
    return {
      phase: value['phase'] as JournalPhase,
      updateId: value['updateId'] as string,
      fromVersion: value['fromVersion'] as string,
      toVersion: value['toVersion'] as string,
      snapshotPath: value['snapshotPath'] as string,
      createdAt: value['createdAt'] as string,
      ...(typeof value['recoveryTarget'] === 'string' ? { recoveryTarget: value['recoveryTarget'] } : {}),
    };
  } catch {
    return 'corrupt';
  }
}

/** Atomically replaces the journal and makes the replacement durable. */
export function writeJournal(dataDir: string, journal: UpdateJournal): void {
  const target = journalPath(dataDir);
  const temp = `${target}.tmp`;
  const fd = openSync(temp, 'w', 0o600);
  try {
    writeSync(fd, `${JSON.stringify(journal)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temp, target);
  syncDir(dataDir);
}

/** Removes the journal durably. Absent is not an error. */
export function clearJournal(dataDir: string): void {
  rmSync(journalPath(dataDir), { force: true });
  syncDir(dataDir);
}

function syncDir(dir: string): void {
  // fsync on a directory is POSIX; Windows cannot open one for it, and there
  // the rename itself is the durability boundary.
  if (process.platform === 'win32') return;
  const fd = openSync(dir, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
