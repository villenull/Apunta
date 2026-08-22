import type { CreateTranscriptInput, Transcript } from '@apunta/shared';
import type { Database } from 'better-sqlite3';

import { uuidv7 } from './uuid.js';

/**
 * Transcripts are written by `POST /api/generate` (M3) and `POST /api/transcribe`
 * (M5). M1 owns the table and this repository so the cascade from notes is
 * settled and covered by tests before anything depends on it.
 */

const COLUMNS = 'id, note_id, source, raw_text, audio_filename, duration_seconds, created_at';

export function createTranscript(db: Database, input: CreateTranscriptInput): Transcript {
  const transcript: Transcript = {
    id: uuidv7(),
    note_id: input.note_id,
    source: input.source,
    raw_text: input.raw_text,
    audio_filename: input.audio_filename ?? null,
    duration_seconds: input.duration_seconds ?? null,
    created_at: new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO transcripts (${COLUMNS})
     VALUES (@id, @note_id, @source, @raw_text, @audio_filename, @duration_seconds, @created_at)`,
  ).run(transcript);

  return transcript;
}

export function listTranscriptsForNote(db: Database, noteId: string): Transcript[] {
  return db
    .prepare(`SELECT ${COLUMNS} FROM transcripts WHERE note_id = ? ORDER BY created_at ASC, id ASC`)
    .all(noteId) as Transcript[];
}
