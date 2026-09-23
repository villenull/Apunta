-- Optimistic concurrency for note edits. Existing rows begin at revision zero.
ALTER TABLE notes ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
