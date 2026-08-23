import type { SessionBrief, SessionBriefContent } from '@apunta/shared';
import type { Database } from 'better-sqlite3';

import { uuidv7 } from './uuid.js';

/**
 * Saved session briefings.
 *
 * A briefing is ephemeral by default (owner decision 3): `POST .../prep`
 * streams one and persists nothing at all. A row exists here only because she
 * pressed Keep, which is why there is no "create then promote" path — nothing
 * to promote.
 */

interface BriefRow {
  id: string;
  patient_id: string;
  generated_at: string;
  content: string;
  source_note_ids: string;
  saved: number;
  created_at: string;
}

const COLUMNS = 'id, patient_id, generated_at, content, source_note_ids, saved, created_at';

function toBrief(row: BriefRow): SessionBrief {
  return {
    id: row.id,
    patient_id: row.patient_id,
    generated_at: row.generated_at,
    content: JSON.parse(row.content) as SessionBriefContent,
    source_note_ids: JSON.parse(row.source_note_ids) as string[],
    saved: row.saved === 1,
    created_at: row.created_at,
  };
}

export interface CreateBriefInput {
  readonly patient_id: string;
  readonly generated_at: string;
  readonly content: SessionBriefContent;
  readonly source_note_ids: readonly string[];
}

export function createSessionBrief(db: Database, input: CreateBriefInput): SessionBrief {
  const brief: SessionBrief = {
    id: uuidv7(),
    patient_id: input.patient_id,
    generated_at: input.generated_at,
    content: input.content,
    source_note_ids: [...input.source_note_ids],
    saved: true,
    created_at: new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO session_briefs (${COLUMNS})
     VALUES (@id, @patient_id, @generated_at, @content, @source_note_ids, @saved, @created_at)`,
  ).run({
    ...brief,
    content: JSON.stringify(brief.content),
    source_note_ids: JSON.stringify(brief.source_note_ids),
    saved: 1,
  });

  return brief;
}

/** Newest first. */
export function listSessionBriefs(db: Database, patientId: string): SessionBrief[] {
  const rows = db
    .prepare(
      `SELECT ${COLUMNS} FROM session_briefs WHERE patient_id = ?
        ORDER BY generated_at DESC, id DESC`,
    )
    .all(patientId) as BriefRow[];
  return rows.map(toBrief);
}

export function deleteSessionBrief(db: Database, id: string): boolean {
  return db.prepare('DELETE FROM session_briefs WHERE id = ?').run(id).changes > 0;
}
