import type { ChatMessage, CreateChatMessageInput } from '@apunta/shared';
import type { Database } from 'better-sqlite3';

import { uuidv7 } from './uuid.js';

/**
 * The "Refine with AI" thread. `POST /api/notes/:id/chat` (M4) writes these;
 * M1 owns the table and the cascade from notes.
 */

const COLUMNS = 'id, note_id, role, text, ref_quote, created_at';

export function createChatMessage(db: Database, input: CreateChatMessageInput): ChatMessage {
  const message: ChatMessage = {
    id: uuidv7(),
    note_id: input.note_id,
    role: input.role,
    text: input.text,
    ref_quote: input.ref_quote ?? null,
    created_at: new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO chat_messages (${COLUMNS})
     VALUES (@id, @note_id, @role, @text, @ref_quote, @created_at)`,
  ).run(message);

  return message;
}

/** Oldest first — the order the thread is rendered in. */
export function listChatMessagesForNote(db: Database, noteId: string): ChatMessage[] {
  return db
    .prepare(`SELECT ${COLUMNS} FROM chat_messages WHERE note_id = ? ORDER BY created_at ASC, id ASC`)
    .all(noteId) as ChatMessage[];
}
