-- M11: a transcript may be her own words from a Claude conversation.
--
-- `source = 'import'` marks a note whose raw material was typed to Claude
-- rather than dictated after a session — in five years that difference will
-- matter to whoever reads the record. SQLite cannot widen a CHECK in place,
-- so the table is rebuilt: the copy is exact, nothing references
-- `transcripts`, and the index is recreated under its old name.
CREATE TABLE transcripts_rebuilt (
  id               TEXT PRIMARY KEY,
  note_id          TEXT NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
  source           TEXT NOT NULL CHECK (source IN ('audio', 'typed', 'import')),
  raw_text         TEXT NOT NULL,
  audio_filename   TEXT,
  duration_seconds REAL,
  created_at       TEXT NOT NULL
) STRICT;

INSERT INTO transcripts_rebuilt (id, note_id, source, raw_text, audio_filename, duration_seconds, created_at)
  SELECT id, note_id, source, raw_text, audio_filename, duration_seconds, created_at FROM transcripts;

DROP TABLE transcripts;
ALTER TABLE transcripts_rebuilt RENAME TO transcripts;
CREATE INDEX idx_transcripts_note ON transcripts (note_id, created_at);
