import type { Note } from '@apunta/shared';
import type { Database } from 'better-sqlite3';

import { uuidv7 } from './uuid.js';

const COLUMNS = 'id, patient_id, format_id, title, status, content, created_at, updated_at, published_at';

/** Newest first, as the prototype's notes column shows them. */
export function listNotesForPatient(db: Database, patientId: string): Note[] {
  return db
    .prepare(
      `SELECT ${COLUMNS} FROM notes
        WHERE patient_id = ?
        ORDER BY created_at DESC, id DESC`,
    )
    .all(patientId) as Note[];
}

export function getNote(db: Database, id: string): Note | undefined {
  return db.prepare(`SELECT ${COLUMNS} FROM notes WHERE id = ?`).get(id) as Note | undefined;
}

export interface CreateNoteInput {
  readonly patient_id: string;
  readonly format_id: string;
  readonly title: string;
  readonly content?: string;
  /** Seeding backdates notes to the prototype's dates; the API never sets this. */
  readonly created_at?: string;
}

export function createNote(db: Database, input: CreateNoteInput): Note {
  const timestamp = input.created_at ?? new Date().toISOString();
  const note: Note = {
    id: uuidv7(),
    patient_id: input.patient_id,
    format_id: input.format_id,
    title: input.title,
    status: 'draft',
    content: input.content ?? '',
    created_at: timestamp,
    updated_at: timestamp,
    published_at: null,
  };

  db.prepare(
    `INSERT INTO notes (${COLUMNS})
     VALUES (@id, @patient_id, @format_id, @title, @status, @content, @created_at, @updated_at, @published_at)`,
  ).run(note);

  return note;
}

export interface UpdateNoteInput {
  readonly title?: string;
  readonly content?: string;
}

/**
 * Content edits on a published note are refused at the route layer (409,
 * "unlock first"); this function is the mechanical write.
 */
export function updateNote(db: Database, id: string, patch: UpdateNoteInput): Note | undefined {
  const current = getNote(db, id);
  if (!current) return undefined;

  const next: Note = {
    ...current,
    title: patch.title ?? current.title,
    content: patch.content ?? current.content,
    updated_at: new Date().toISOString(),
  };

  db.prepare(
    'UPDATE notes SET title = @title, content = @content, updated_at = @updated_at WHERE id = @id',
  ).run(next);

  return next;
}

/** Sets `status` and `published_at` together — the schema requires they agree. */
export function setNotePublished(
  db: Database,
  id: string,
  published: boolean,
  /** Seeding backdates the sample notes; the API always uses "now". */
  at?: string,
): Note | undefined {
  const current = getNote(db, id);
  if (!current) return undefined;

  const now = at ?? new Date().toISOString();
  const next: Note = {
    ...current,
    status: published ? 'published' : 'draft',
    published_at: published ? now : null,
    updated_at: now,
  };

  db.prepare(
    `UPDATE notes SET status = @status, published_at = @published_at, updated_at = @updated_at
      WHERE id = @id`,
  ).run(next);

  return next;
}

/** Cascades to the note's transcripts and chat messages. */
export function deleteNote(db: Database, id: string): boolean {
  return db.prepare('DELETE FROM notes WHERE id = ?').run(id).changes > 0;
}

export function countNotesForPatient(db: Database, patientId: string): number {
  const row = db.prepare('SELECT COUNT(*) AS count FROM notes WHERE patient_id = ?').get(patientId) as {
    count: number;
  };
  return row.count;
}
