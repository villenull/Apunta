import type { Patient, PatientListItem } from '@apunta/shared';
import type { Database } from 'better-sqlite3';

import { uuidv7 } from './uuid.js';

/**
 * Patient repository: plain functions over a database handle, no ORM.
 * Column names and API field names are identical, so rows map straight across.
 */

interface PatientRow {
  id: string;
  name: string;
  identifier: string | null;
  created_at: string;
  archived_at: string | null;
  name_guessed: number;
}

interface PatientListRow extends PatientRow {
  note_count: number;
}

const COLUMNS = 'id, name, identifier, created_at, archived_at, name_guessed';

function fromRow<T extends PatientRow>(row: T): Omit<T, 'name_guessed'> & { name_guessed: boolean } {
  return { ...row, name_guessed: row.name_guessed === 1 };
}

export interface ListPatientsOptions {
  /** Archived patients are hidden from the workspace unless explicitly asked for. */
  readonly includeArchived?: boolean;
}

/**
 * Creation order, matching the prototype's sidebar. The note count comes from
 * the same query so the list is one round trip regardless of practice size.
 */
export function listPatients(db: Database, options: ListPatientsOptions = {}): PatientListItem[] {
  const rows = db
    .prepare(
      `SELECT p.id, p.name, p.identifier, p.created_at, p.archived_at, p.name_guessed,
              COUNT(n.id) AS note_count
         FROM patients p
         LEFT JOIN notes n ON n.patient_id = p.id
        WHERE (:include_archived = 1 OR p.archived_at IS NULL)
        GROUP BY p.id
        ORDER BY p.created_at ASC, p.id ASC`,
    )
    .all({ include_archived: options.includeArchived === true ? 1 : 0 }) as PatientListRow[];

  return rows.map((row) => ({ ...fromRow(row), note_count: Number(row.note_count) }));
}

export function getPatient(db: Database, id: string): Patient | undefined {
  const row = db.prepare(`SELECT ${COLUMNS} FROM patients WHERE id = ?`).get(id) as PatientRow | undefined;
  return row === undefined ? undefined : fromRow(row);
}

export interface CreatePatientInput {
  readonly name: string;
  readonly identifier?: string | null;
  /** The Claude import guessed this name from a conversation title (M11). */
  readonly nameGuessed?: boolean;
}

export function createPatient(db: Database, input: CreatePatientInput): Patient {
  const patient: Patient = {
    id: uuidv7(),
    name: input.name,
    identifier: input.identifier ?? null,
    created_at: new Date().toISOString(),
    archived_at: null,
    name_guessed: input.nameGuessed === true,
  };

  db.prepare(
    `INSERT INTO patients (id, name, identifier, created_at, archived_at, name_guessed)
     VALUES (@id, @name, @identifier, @created_at, @archived_at, @name_guessed)`,
  ).run({ ...patient, name_guessed: patient.name_guessed === true ? 1 : 0 });

  return patient;
}

export interface UpdatePatientInput {
  readonly name?: string;
  readonly identifier?: string | null;
  /** `true` archives, `false` restores; omitted leaves the flag alone. */
  readonly archived?: boolean;
}

export function updatePatient(db: Database, id: string, patch: UpdatePatientInput): Patient | undefined {
  const current = getPatient(db, id);
  if (!current) return undefined;

  const archived_at =
    patch.archived === undefined
      ? current.archived_at
      : patch.archived
        ? (current.archived_at ?? new Date().toISOString())
        : null;

  const next: Patient = {
    ...current,
    name: patch.name ?? current.name,
    identifier: patch.identifier === undefined ? current.identifier : patch.identifier,
    archived_at,
    // Saving a name is her checking it: a guessed name stops being flagged.
    name_guessed: patch.name === undefined ? current.name_guessed === true : false,
  };

  db.prepare(
    `UPDATE patients SET name = @name, identifier = @identifier, archived_at = @archived_at,
            name_guessed = @name_guessed
      WHERE id = @id`,
  ).run({ ...next, name_guessed: next.name_guessed === true ? 1 : 0 });

  return next;
}

/** Cascades to the patient's notes and, through them, transcripts and chat. */
export function deletePatient(db: Database, id: string): boolean {
  return db.prepare('DELETE FROM patients WHERE id = ?').run(id).changes > 0;
}
