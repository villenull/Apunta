-- M12 (Brainstorm): one ongoing conversation per patient, beside the notes.
--
-- Keyed straight off the patient, not off a conversation row: there is only
-- ever one, and "New conversation" clears it. Deleting the patient drops the
-- thread with them (cascade, like notes); archiving keeps it (like notes).
-- There is no ref_quote here — no editor is open beside this chat — and no
-- column will ever point at a note, a plan or a briefing: Brainstorm is a
-- thinking aid, never a record, and the schema says so too.
CREATE TABLE brainstorm_messages (
  id         TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients (id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_brainstorm_messages_patient ON brainstorm_messages (patient_id, created_at, id);
