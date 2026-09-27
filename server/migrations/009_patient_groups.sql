-- Patient groups: named lists a patient can be filed under (owner, 2026-09-27).
--
-- A group is a row of its own because she names them, and a patient is in **at
-- most one**: a nullable `group_id` rather than a join table. That is the
-- owner's explicit choice, and the column is nullable so that "no group" is a
-- real state she can return a patient to rather than an absence of a row.
--
-- Preservation, which is the whole risk of a migration on a live practice:
--
-- - `ALTER TABLE ... ADD COLUMN` with no `NOT NULL` and no default. Every
--   existing row keeps every column it had and reads `group_id` as NULL, so no
--   patient's name, identifier, notes, archive flag or `name_guessed` flag is
--   rewritten, and nobody is silently filed anywhere.
-- - The new table is empty, so no existing patient gains a group by accident.
-- - `ON DELETE SET NULL` rather than `RESTRICT`: emptying a group must not be
--   able to fail, and a patient that loses its group lands in the same
--   "no group, no change" place it started in.
--
-- The unique index is case-insensitive so "Family" and "family" cannot be two
-- groups that look identical in the sidebar; it is the backstop, and the route
-- checks first so she gets a sentence rather than a constraint error.
CREATE TABLE patient_groups (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

ALTER TABLE patients ADD COLUMN group_id TEXT REFERENCES patient_groups (id) ON DELETE SET NULL;

CREATE UNIQUE INDEX idx_patient_groups_name ON patient_groups (name COLLATE NOCASE);

CREATE INDEX idx_patients_group ON patients (group_id);
