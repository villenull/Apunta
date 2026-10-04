import { DEFAULT_LOCALE, isLocale, type Note } from '@apunta/shared';
import type { Database } from 'better-sqlite3';

import { uuidv7 } from './uuid.js';

const COLUMNS =
  'id, patient_id, format_id, locale, title, status, revision, content, created_at, updated_at, published_at';

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
  /**
   * The note's language (C-LANG@1 rule 3), which is the format's locale — the
   * only locale a note can inherit. Optional so every caller that writes legacy
   * content keeps compiling, and English when absent, because that is what all
   * of them mean today (D11).
   */
  readonly locale?: string;
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
    locale: isLocale(input.locale) ? input.locale : DEFAULT_LOCALE,
    title: input.title,
    status: 'draft',
    revision: 0,
    content: input.content ?? '',
    created_at: timestamp,
    updated_at: timestamp,
    published_at: null,
  };

  db.prepare(
    `INSERT INTO notes (${COLUMNS})
     VALUES (@id, @patient_id, @format_id, @locale, @title, @status, @revision, @content, @created_at, @updated_at, @published_at)`,
  ).run(note);

  return note;
}

export interface UpdateNoteInput {
  readonly revision: number;
  readonly title?: string;
  readonly content?: string;
}

/**
 * Content edits on a published note are refused at the route layer (409,
 * "unlock first"); this function is the mechanical optimistic write.
 */
export function updateNote(db: Database, id: string, patch: UpdateNoteInput): Note | undefined {
  const current = getNote(db, id);
  if (!current || current.revision !== patch.revision) return undefined;

  const next: Note = {
    ...current,
    title: patch.title ?? current.title,
    content: patch.content ?? current.content,
    revision: current.revision + 1,
    updated_at: new Date().toISOString(),
  };

  const result = db
    .prepare(
      `UPDATE notes SET title = @title, content = @content, revision = @revision, updated_at = @updated_at
       WHERE id = @id AND revision = @previous_revision`,
    )
    .run({ ...next, previous_revision: patch.revision });
  return result.changes === 0 ? undefined : next;
}

/**
 * A refine-chat content revision, applied only while the note is still the
 * draft the rewrite was computed from.
 *
 * The chat's published lock is tested when the refine *starts*, but a real
 * model runs for seconds and she may file the note inside that window. Writing
 * the finished rewrite then would slip fresh text into a published clinical
 * record behind the lock's back. The status test rides *inside* the UPDATE, so
 * the check and the write are one indivisible statement — no read-then-write
 * gap for a publish to land in — and the write simply no-ops, returning
 * `undefined`, when the note published while the model was thinking.
 *
 * The same window is open to a *hand* edit: a second window or tab, or a late
 * keepalive flush from this one, commits a revision while the model thinks, and
 * the rewrite is built from the note as it stood when the request started. So
 * the caller passes the `revision` it read, and the write is conditional on it
 * as well: a rewrite may only land on the exact draft it was written for. When
 * it may not, the write no-ops exactly as the publish race does and the caller
 * re-reads the note to tell the two refusals apart.
 */
export function updateDraftNoteContent(
  db: Database,
  id: string,
  content: string,
  /** The `revision` the rewrite was computed from, as read at request start. */
  expectedRevision: number,
): Note | undefined {
  const result = db
    .prepare(
      `UPDATE notes SET content = @content, revision = revision + 1, updated_at = @updated_at
        WHERE id = @id AND status = 'draft' AND revision = @expected_revision`,
    )
    .run({ id, content, expected_revision: expectedRevision, updated_at: new Date().toISOString() });
  if (result.changes === 0) return undefined;
  return getNote(db, id);
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
    revision: current.revision + 1,
    updated_at: now,
  };

  db.prepare(
    `UPDATE notes SET status = @status, published_at = @published_at, revision = @revision, updated_at = @updated_at
      WHERE id = @id AND revision = @previous_revision`,
  ).run({ ...next, previous_revision: current.revision });

  return getNote(db, id);
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
