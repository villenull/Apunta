import type { BrainstormMessage } from '@apunta/shared';
import type { Database } from 'better-sqlite3';

import { uuidv7 } from './uuid.js';

/**
 * The Brainstorm thread (M12, migration 005): one ongoing conversation per
 * patient. "New conversation" deletes these rows; deleting the patient drops
 * them by cascade; archiving keeps them.
 */

const COLUMNS = 'id, patient_id, role, text, created_at';

export function createBrainstormMessage(
  db: Database,
  input: { patient_id: string; role: 'user' | 'assistant'; text: string },
): BrainstormMessage {
  const message: BrainstormMessage = {
    id: uuidv7(),
    patient_id: input.patient_id,
    role: input.role,
    text: input.text,
    created_at: new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO brainstorm_messages (${COLUMNS})
     VALUES (@id, @patient_id, @role, @text, @created_at)`,
  ).run(message);

  return message;
}

/** Oldest first — the order the thread is rendered in. */
export function listBrainstormMessages(db: Database, patientId: string): BrainstormMessage[] {
  return db
    .prepare(
      `SELECT ${COLUMNS} FROM brainstorm_messages WHERE patient_id = ? ORDER BY created_at ASC, id ASC`,
    )
    .all(patientId) as BrainstormMessage[];
}

/** "New conversation": forget the thread. Returns how many turns went. */
export function clearBrainstormMessages(db: Database, patientId: string): number {
  return db.prepare('DELETE FROM brainstorm_messages WHERE patient_id = ?').run(patientId).changes;
}
