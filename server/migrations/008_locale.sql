-- C-LANG@1 rule 3, data side: every document knows the language it is written
-- in. Both tables are created in 001; the column goes on last in each, so no
-- other column moves and the compared-column lists in the tests stay the
-- columns 001 and 007 left behind.
--
-- `NOT NULL DEFAULT 'en'` is the whole legacy rule. Every existing row becomes
-- English (D11) and none of them is translated or relabelled by this migration
-- or by anything that reads it afterwards.
ALTER TABLE notes ADD COLUMN locale TEXT NOT NULL DEFAULT 'en';
ALTER TABLE note_formats ADD COLUMN locale TEXT NOT NULL DEFAULT 'en';
