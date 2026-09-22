-- Halaxy imports are published history and therefore undo must remove them,
-- unlike a Claude note that the user may have published after importing.
ALTER TABLE import_batches RENAME TO import_batches_old;
ALTER TABLE import_batch_notes RENAME TO import_batch_notes_old;
ALTER TABLE import_batch_patients RENAME TO import_batch_patients_old;

CREATE TABLE import_batches (
  id          TEXT PRIMARY KEY,
  source      TEXT NOT NULL CHECK (source IN ('assistant', 'human', 'halaxy')),
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

INSERT INTO import_batches (id, source, created_at)
SELECT id, source, created_at FROM import_batches_old;
INSERT INTO import_batch_notes (batch_id, note_id)
SELECT batch_id, note_id FROM import_batch_notes_old;
INSERT INTO import_batch_patients (batch_id, patient_id)
SELECT batch_id, patient_id FROM import_batch_patients_old;

DROP TABLE import_batch_notes_old;
DROP TABLE import_batch_patients_old;
DROP TABLE import_batches_old;

CREATE INDEX idx_import_batch_notes_note ON import_batch_notes (note_id);
CREATE INDEX idx_import_batch_patients_patient ON import_batch_patients (patient_id);
