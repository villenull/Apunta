import type { Database } from 'better-sqlite3';

import { sweepOrphanAudio } from './audio/retention.js';
import type { AppConfig } from './config.js';

/**
 * AM-206: the orphan recording sweep runs once at startup.
 *
 * A kept recording is a real file whose only reference is a transcript row, so
 * a process killed mid-upload or a note deleted before retention existed leaves
 * one with no row at all. The sweep is deliberately conservative — only `.wav`,
 * only unreferenced, only older than an hour — so a recording being written
 * right now is never touched. It is maintenance, not a gate: every failure is
 * caught and logged as a count, because an audio folder that cannot be read
 * must never stop Apunta from starting.
 */
export const STARTUP_ORPHAN_AUDIO_AGE_MS = 60 * 60 * 1000;

/** Counts only, never a filename: a recording's name is a practice's data. */
export type StartupMaintenanceLog = (detail: Record<string, unknown>, message: string) => void;

export async function runStartupMaintenance(
  db: Database,
  config: Pick<AppConfig, 'audioDir'>,
  log: StartupMaintenanceLog,
): Promise<void> {
  // A logger that throws must not undo the promise below: reporting is
  // best effort, starting is not.
  const report: StartupMaintenanceLog = (detail, message) => {
    try {
      log(detail, message);
    } catch {
      // Nothing to do: the sweep's outcome is already settled.
    }
  };
  try {
    const { removed, failed } = await sweepOrphanAudio(db, config.audioDir, {
      olderThanMs: STARTUP_ORPHAN_AUDIO_AGE_MS,
    });
    if (removed > 0 || failed > 0) {
      report({ removed, failed }, 'swept orphaned recordings no transcript references');
    }
  } catch (error) {
    // The code, not the error: a Node fs error carries the path it failed on,
    // and a path here would name a practice's recording.
    const code = (error as NodeJS.ErrnoException | null)?.code;
    report(typeof code === 'string' ? { code } : {}, 'the orphaned recording sweep did not run');
  }
}
