import type { PatientGroup } from '@apunta/shared';
import type { Database } from 'better-sqlite3';

import { uuidv7 } from './uuid.js';

/**
 * Patient groups: plain functions over a database handle, like every other
 * repository here. Group ids are uuidv7 and timestamps are UTC ISO-8601, as
 * everywhere.
 *
 * **Creation order, not alphabetical** (`ORDER BY created_at`). She creates a
 * group when she needs it, and the order she made them in is the order she
 * thinks of them in; sorting by name would silently reshuffle the sidebar the
 * first time she renamed one. This is my default and it is one clause to
 * reverse, not an owner instruction — see the handoff.
 */

interface GroupRow {
  id: string;
  name: string;
  created_at: string;
  /** Null for a group she has never dragged; sorts last (owner, 2026-09-27). */
  position: number | null;
}

const COLUMNS = 'id, name, created_at, position';

/**
 * Her order, then the order she made them in.
 *
 * `position IS NULL` last rather than first is the load-bearing part: a group
 * nobody has dragged belongs at the bottom, not the top, and `ORDER BY position`
 * alone would put every null first in SQLite and quietly reverse the sidebar on
 * the day the column arrives.
 */
export function listPatientGroups(db: Database): PatientGroup[] {
  const rows = db
    .prepare(
      `SELECT ${COLUMNS} FROM patient_groups
        ORDER BY position IS NULL, position ASC, created_at ASC, id ASC`,
    )
    .all() as GroupRow[];
  return rows.map((row) => ({ ...row, position: row.position ?? null }));
}

export function getPatientGroup(db: Database, id: string): PatientGroup | undefined {
  const row = db.prepare(`SELECT ${COLUMNS} FROM patient_groups WHERE id = ?`).get(id) as
    GroupRow | undefined;
  return row === undefined ? undefined : { ...row, position: row.position ?? null };
}

export function findPatientGroupByName(db: Database, name: string): PatientGroup | undefined {
  // NOCASE to match the unique index behind it, so the check and the constraint
  // cannot disagree about whether "Family" is already taken.
  const row = db.prepare(`SELECT ${COLUMNS} FROM patient_groups WHERE name = ? COLLATE NOCASE`).get(name) as
    GroupRow | undefined;
  return row === undefined ? undefined : { ...row, position: row.position ?? null };
}

export function createPatientGroup(db: Database, name: string): PatientGroup {
  // No position: a new group goes to the bottom until she drags it somewhere.
  const group: PatientGroup = {
    id: uuidv7(),
    name,
    created_at: new Date().toISOString(),
    position: null,
  };
  db.prepare(
    `INSERT INTO patient_groups (id, name, created_at, position) VALUES (@id, @name, @created_at, @position)`,
  ).run(group);
  return group;
}

export function renamePatientGroup(db: Database, id: string, name: string): PatientGroup | undefined {
  const changed = db.prepare(`UPDATE patient_groups SET name = ? WHERE id = ?`).run(name, id).changes;
  if (changed === 0) return undefined;
  return getPatientGroup(db, id);
}

/** Where she dragged a group. Separate from the rename so neither can clobber the other. */
export function setPatientGroupPosition(
  db: Database,
  id: string,
  position: number | null,
): PatientGroup | undefined {
  const changed = db.prepare(`UPDATE patient_groups SET position = ? WHERE id = ?`).run(position, id).changes;
  if (changed === 0) return undefined;
  return getPatientGroup(db, id);
}
