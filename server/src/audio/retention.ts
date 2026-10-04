import { readdir, rm, stat } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';

import type { Database } from 'better-sqlite3';

import { AUDIO_DIRNAME } from '../config.js';

/**
 * Retention of kept recordings (bug #7).
 *
 * `keep_audio` is off by default, but when it is on a recording is a real file
 * in `audioDir` whose only reference is `transcripts.audio_filename`. Deleting
 * the note or patient cascades the rows away and, before this module, left the
 * file behind forever — the one copy of a session nothing in the app could
 * reach. A process killed mid-upload or mid-transcription leaves the same kind
 * of file with no row at all.
 *
 * Everything here is deliberately shape-only about what it reports: a filename
 * is opaque and may never be logged, so callers log counts.
 */

interface AudioFilenameRow {
  readonly filename: string;
}

/** What to read `transcripts.audio_filename` for. */
export type AudioFilenameTarget =
  | { readonly kind: 'notes'; readonly ids: readonly string[] }
  | { readonly kind: 'patient'; readonly id: string }
  | { readonly kind: 'all' };

/**
 * Every non-empty `audio_filename` the given target references.
 *
 * Read *before* the cascade that deletes the transcript rows: afterwards there
 * is nothing left to say which files belonged to the note or patient.
 */
export function collectAudioFilenames(db: Database, target: AudioFilenameTarget): string[] {
  if (target.kind === 'all') {
    const rows = db
      .prepare(
        `SELECT DISTINCT audio_filename AS filename
           FROM transcripts
          WHERE audio_filename IS NOT NULL AND audio_filename <> ''`,
      )
      .all() as AudioFilenameRow[];
    return rows.map((row) => row.filename);
  }

  if (target.kind === 'patient') {
    const rows = db
      .prepare(
        `SELECT DISTINCT t.audio_filename AS filename
           FROM transcripts t
           JOIN notes n ON n.id = t.note_id
          WHERE n.patient_id = ? AND t.audio_filename IS NOT NULL AND t.audio_filename <> ''`,
      )
      .all(target.id) as AudioFilenameRow[];
    return rows.map((row) => row.filename);
  }

  if (target.ids.length === 0) return [];
  const placeholders = target.ids.map(() => '?').join(', ');
  const rows = db
    .prepare(
      `SELECT DISTINCT audio_filename AS filename
         FROM transcripts
        WHERE note_id IN (${placeholders}) AND audio_filename IS NOT NULL AND audio_filename <> ''`,
    )
    .all(...target.ids) as AudioFilenameRow[];
  return rows.map((row) => row.filename);
}

/**
 * Where recordings live, derived from the open database handle.
 *
 * `config.audioDir` is `join(dataDir, AUDIO_DIRNAME)` and the database file is
 * `join(dataDir, DB_FILENAME)`, so the directory is the database file's sibling.
 * `db.name` is the path `openDatabase` was handed — always `config.dbFile` — so
 * this is the same directory without threading `AppConfig` through the route
 * registrations.
 */
export function audioDirFor(db: Database): string {
  return join(dirname(db.name), AUDIO_DIRNAME);
}

export interface AudioRemovalResult {
  readonly removed: number;
  readonly failed: number;
  /** Names refused because they were not plain basenames inside `audioDir`. */
  readonly rejected: number;
}

/**
 * A name that can only ever point inside `audioDir`.
 *
 * Anything with a separator, `..` or a NUL is refused rather than normalised:
 * a stored filename is data, and a traversal must be a leak we drop, never a
 * file outside the audio directory we delete.
 */
function isPlainBasename(name: string): boolean {
  return (
    name !== '' &&
    name !== '.' &&
    name !== '..' &&
    !name.includes('/') &&
    !name.includes('\\') &&
    !name.includes('\0') &&
    basename(name) === name
  );
}

/**
 * Delete the given recordings from `audioDir`, ignoring missing files.
 *
 * Never throws: a file that cannot be removed is a leak to report, not a reason
 * to fail the request whose rows are already gone. `force` makes ENOENT a
 * success, which is the normal case for a recording that was already swept.
 */
export async function removeAudioFiles(
  audioDir: string,
  filenames: readonly string[],
): Promise<AudioRemovalResult> {
  let removed = 0;
  let failed = 0;
  let rejected = 0;

  for (const name of filenames) {
    if (!isPlainBasename(name)) {
      rejected += 1;
      continue;
    }
    try {
      await rm(join(audioDir, name), { force: true });
      removed += 1;
    } catch {
      failed += 1;
    }
  }

  return { removed, failed, rejected };
}

export interface SweepOrphanAudioOptions {
  /** Delete a file only once it is at least this old. */
  readonly olderThanMs: number;
  /** Injectable clock (epoch milliseconds) so a test is not racing wall time. */
  readonly now?: number;
}

export interface SweepAudioResult {
  readonly removed: number;
  readonly failed: number;
}

/**
 * Delete `.wav` files in `audioDir` that no transcript references and that are
 * older than `olderThanMs`.
 *
 * Only `.wav` is swept: that is the only name the recorder writes, and leaving
 * everything else alone keeps this from touching a file it does not understand.
 * A referenced file is never a candidate however old it is, and a fresh orphan
 * is left for a later sweep — an upload in progress has a file on disk before
 * its transcript row exists, and deleting it mid-write would corrupt it.
 *
 * Not wired into boot here; the caller decides when to run it.
 */
export async function sweepOrphanAudio(
  db: Database,
  audioDir: string,
  options: SweepOrphanAudioOptions,
): Promise<SweepAudioResult> {
  const now = options.now ?? Date.now();
  const referenced = new Set(collectAudioFilenames(db, { kind: 'all' }));

  let entries: string[];
  try {
    entries = await readdir(audioDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { removed: 0, failed: 0 };
    throw error;
  }

  let removed = 0;
  let failed = 0;

  for (const name of entries) {
    if (extname(name).toLowerCase() !== '.wav') continue;
    if (referenced.has(name)) continue;

    let ageMs: number;
    try {
      const info = await stat(join(audioDir, name));
      if (!info.isFile()) continue;
      ageMs = now - info.mtimeMs;
    } catch {
      failed += 1;
      continue;
    }
    if (ageMs < options.olderThanMs) continue;

    try {
      await rm(join(audioDir, name), { force: true });
      removed += 1;
    } catch {
      failed += 1;
    }
  }

  return { removed, failed };
}
