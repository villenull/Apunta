-- Where a patient sits in the order of the group they are filed under (owner,
-- 2026-09-27). Dragging a name into a place has to mean something tomorrow
-- morning, or the drag is a toy.
--
-- **Nullable, and only meaningful with a `group_id`.** A patient with no group is
-- in Recents, and Recents is ordered by its own rules — last activity or name,
-- whichever she chose — so there is nothing for a position to say about them.
-- NULL is that state, not a missing value.
--
-- Sparse on purpose: 0, 1, 2 rather than 1, 2, 3, so a row can be inserted
-- between two others without renumbering the rest, and a group's order can be
-- read as "sort by this, then by name" without caring about the gaps. Renumbering
-- a whole group on every drop would be a write per row for no benefit.
--
-- The index is on the pair, because that is how every read asks for it: "this
-- group's rows, in her order".
ALTER TABLE patients ADD COLUMN group_position INTEGER;

CREATE INDEX idx_patients_group_position ON patients (group_id, group_position);
