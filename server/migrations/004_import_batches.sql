-- M11 (automatic import): every run of the Claude import is a batch, so one
-- button can take it back.
--
-- The owner chose automatic assignment over per-note review (2026-09-21);
-- what makes that safe is that a run is undoable as a unit. A batch records
-- the notes it wrote and the patients it created — only those, so undo can
-- never reach a note she dictated or a patient she entered herself.
-- Deleting a note by hand drops it from its batch (cascade); a patient she
-- deletes by hand likewise.
CREATE TABLE import_batches (
  id          TEXT PRIMARY KEY,
  -- Which side of each session became the note body: 'assistant' | 'human'.
  source      TEXT NOT NULL CHECK (source IN ('assistant', 'human')),
  created_at  TEXT NOT NULL
) STRICT;

CREATE TABLE import_batch_notes (
  batch_id TEXT NOT NULL REFERENCES import_batches (id) ON DELETE CASCADE,
  note_id  TEXT NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
  PRIMARY KEY (batch_id, note_id)
) STRICT;

CREATE TABLE import_batch_patients (
  batch_id   TEXT NOT NULL REFERENCES import_batches (id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patients (id) ON DELETE CASCADE,
  PRIMARY KEY (batch_id, patient_id)
) STRICT;

CREATE INDEX idx_import_batch_notes_note ON import_batch_notes (note_id);
CREATE INDEX idx_import_batch_patients_patient ON import_batch_patients (patient_id);

-- A patient the import named from a conversation title rather than from a
-- name she gave. The patient list shows "name guessed — check" until she
-- saves a name for them.
ALTER TABLE patients ADD COLUMN name_guessed INTEGER NOT NULL DEFAULT 0 CHECK (name_guessed IN (0, 1));
