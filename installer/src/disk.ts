import { statfsSync } from 'node:fs';

import { formatBytes } from './bytes.js';

/**
 * "Is there room?", answered before anything is downloaded.
 *
 * M8 deliverable 3's first requirement, and the one most likely to be got
 * wrong quietly: a check that measures the wrong volume, or that fills the
 * disk to the last byte and leaves macOS unable to write a swap file, is worse
 * than no check because it looks like one.
 */

/**
 * Room left over after the download.
 *
 * macOS needs free space for swap, snapshots and its own housekeeping, and a
 * therapist whose Mac is full is not a support problem this app can solve. 5 GB
 * is deliberately generous: the alternative to refusing is a machine that
 * becomes unusable while our progress bar looks healthy.
 */
export const DISK_HEADROOM_BYTES = 5 * 1000 * 1000 * 1000;

export interface DiskCheckInput {
  readonly freeBytes: number;
  readonly requiredBytes: number;
  readonly headroomBytes?: number;
}

export interface DiskCheck {
  readonly ok: boolean;
  readonly freeBytes: number;
  readonly requiredBytes: number;
  readonly headroomBytes: number;
  /** How much more room is needed. 0 when the check passes. */
  readonly shortfallBytes: number;
  /** Plain language, with the numbers in it. Shown verbatim in the window. */
  readonly message: string;
}

/**
 * Pure arithmetic, so it can be tested without a disk.
 *
 * The refusal names three numbers — what is needed, what is free, and how much
 * has to be cleared — because "not enough disk space" alone leaves someone
 * guessing at how much to delete.
 */
export function checkDiskSpace(input: DiskCheckInput): DiskCheck {
  const headroomBytes = input.headroomBytes ?? DISK_HEADROOM_BYTES;
  const needed = input.requiredBytes + headroomBytes;
  const ok = input.freeBytes >= needed;
  const shortfallBytes = ok ? 0 : needed - input.freeBytes;

  const message = ok
    ? `${formatBytes(input.requiredBytes)} to download, ${formatBytes(input.freeBytes)} free.`
    : `Apunta needs about ${formatBytes(input.requiredBytes)} for its models, plus ` +
      `${formatBytes(headroomBytes)} of room for macOS to keep working. This Mac has ` +
      `${formatBytes(input.freeBytes)} free, so about ${formatBytes(shortfallBytes)} has to be ` +
      'cleared first. Emptying the Trash is usually the quickest place to start.';

  return {
    ok,
    freeBytes: input.freeBytes,
    requiredBytes: input.requiredBytes,
    headroomBytes,
    shortfallBytes,
    message,
  };
}

/**
 * Free bytes on the volume holding `path`, or null when it cannot be read.
 *
 * `bavail`, not `bfree`: the difference is the reserve only root may use, and
 * counting it would promise space the user cannot have. The path is the data
 * directory rather than `/` — on a Mac with an external drive named as
 * `APUNTA_DATA_DIR`, the boot volume's free space is the wrong answer.
 */
export function freeBytesFor(path: string): number | null {
  try {
    const stats = statfsSync(path);
    const free = Number(stats.bavail) * Number(stats.bsize);
    return Number.isFinite(free) && free >= 0 ? free : null;
  } catch {
    return null;
  }
}
