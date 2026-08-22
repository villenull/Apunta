-- Initial schema. Mirrors docs/PLAN.md §3 exactly: no extra columns.
--
-- Conventions: ids are UUIDv7 TEXT generated server-side, timestamps are UTC
-- ISO-8601 TEXT, and JSON-valued columns store `JSON.stringify` output.
-- Foreign keys are enforced (see db/index.ts); SQLite propagates cascades
-- transitively, so deleting a patient removes their notes and, through those,
-- the notes' transcripts and chat messages.

CREATE TABLE patients (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  identifier  TEXT,
  created_at  TEXT NOT NULL,
  archived_at TEXT
) STRICT;

CREATE INDEX idx_patients_name ON patients (name);

CREATE TABLE note_formats (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  -- JSON array of section names, in the order they appear in a note.
  sections     TEXT NOT NULL,
  -- Flattened drafting prompt for this format; '' means "use the default".
  instructions TEXT NOT NULL DEFAULT '',
  source       TEXT NOT NULL CHECK (source IN ('template', 'examples', 'manual')),
  created_at   TEXT NOT NULL
) STRICT;

CREATE TABLE notes (
  id           TEXT PRIMARY KEY,
  patient_id   TEXT NOT NULL REFERENCES patients (id) ON DELETE CASCADE,
  -- Deleting a format that notes were written with would orphan them, so it is
  -- refused; the API turns the failure into a 409.
  format_id    TEXT NOT NULL REFERENCES note_formats (id) ON DELETE RESTRICT,
  title        TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('draft', 'published')),
  content      TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  published_at TEXT,
  -- published_at is set if and only if the note is published.
  CHECK ((status = 'published') = (published_at IS NOT NULL))
) STRICT;

CREATE INDEX idx_notes_patient_created ON notes (patient_id, created_at DESC, id DESC);
CREATE INDEX idx_notes_format ON notes (format_id);

CREATE TABLE transcripts (
  id               TEXT PRIMARY KEY,
  note_id          TEXT NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
  source           TEXT NOT NULL CHECK (source IN ('audio', 'typed')),
  raw_text         TEXT NOT NULL,
  audio_filename   TEXT,
  duration_seconds REAL,
  created_at       TEXT NOT NULL
) STRICT;

CREATE INDEX idx_transcripts_note ON transcripts (note_id, created_at);

CREATE TABLE chat_messages (
  id         TEXT PRIMARY KEY,
  note_id    TEXT NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  text       TEXT NOT NULL,
  ref_quote  TEXT,
  created_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_chat_messages_note ON chat_messages (note_id, created_at, id);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  -- JSON-encoded value: settings hold booleans, strings and string arrays.
  value TEXT NOT NULL
) STRICT;
