import type { ImportBatch, ImportNoteSource, ImportUndoResponse } from '@apunta/shared';
import type { Database } from 'better-sqlite3';

import { deleteNote } from './notes.js';
import { deletePatient } from './patients.js';
import { uuidv7 } from './uuid.js';

/**
 * Import batches (M11, migration 004): every run of the Claude import is one,
 * so one button can take it back. A batch knows only the notes it wrote and
 * the patients it created, so undo can never reach anything she made herself.
 */

export function createImportBatch(db: Database, source: ImportNoteSource): string {
  const id = uuidv7();
  db.prepare('INSERT INTO import_batches (id, source, created_at) VALUES (?, ?, ?)').run(
    id,
    source,
    new Date().toISOString(),
  );
  return id;
}

export function addBatchNote(db: Database, batchId: string, noteId: string): void {
  db.prepare('INSERT INTO import_batch_notes (batch_id, note_id) VALUES (?, ?)').run(batchId, noteId);
}

export function addBatchPatient(db: Database, batchId: string, patientId: string): void {
  db.prepare('INSERT INTO import_batch_patients (batch_id, patient_id) VALUES (?, ?)').run(
    batchId,
    patientId,
  );
}

/** Newest first, with what is left of each. */
export function listImportBatches(db: Database): ImportBatch[] {
  return db
    .prepare(
      `SELECT b.id, b.source, b.created_at,
              (SELECT COUNT(*) FROM import_batch_notes n WHERE n.batch_id = b.id) AS notes,
              (SELECT COUNT(*) FROM import_batch_patients p WHERE p.batch_id = b.id) AS patients
         FROM import_batches b
        ORDER BY b.created_at DESC, b.id DESC`,
    )
    .all() as ImportBatch[];
}

export function importBatchExists(db: Database, id: string): boolean {
  return db.prepare('SELECT 1 FROM import_batches WHERE id = ?').get(id) !== undefined;
}

/**
 * Take a run back: delete its notes, then the patients it created that are
 * left with nothing — no other note, treatment plan, session brief or
 * brainstorm conversation. A note she has finalized since is hers now and
 * stays, and so does its patient.
 * One transaction; the batch itself goes too, so a second undo is a 404.
 */
export function undoImportBatch(db: Database, id: string): ImportUndoResponse {
  return db.transaction((): ImportUndoResponse => {
    const notes = db
      .prepare(
        `SELECT n.id, n.status FROM import_batch_notes b JOIN notes n ON n.id = b.note_id WHERE b.batch_id = ?`,
      )
      .all(id) as { id: string; status: string }[];
    let notesDeleted = 0;
    let notesKept = 0;
    for (const note of notes) {
      if (note.status === 'published') {
        notesKept += 1;
        continue;
      }
      if (deleteNote(db, note.id)) notesDeleted += 1;
    }

    const patients = db
      .prepare('SELECT patient_id FROM import_batch_patients WHERE batch_id = ?')
      .all(id) as { patient_id: string }[];
    let patientsDeleted = 0;
    let patientsKept = 0;
    for (const { patient_id: patientId } of patients) {
      const attached = db
        .prepare(
          `SELECT (SELECT COUNT(*) FROM notes WHERE patient_id = @id)
                 + (SELECT COUNT(*) FROM treatment_plans WHERE patient_id = @id)
                 + (SELECT COUNT(*) FROM session_briefs WHERE patient_id = @id)
                 + (SELECT COUNT(*) FROM brainstorm_messages WHERE patient_id = @id) AS count`,
        )
        .get({ id: patientId }) as { count: number };
      if (attached.count > 0) {
        patientsKept += 1;
        continue;
      }
      if (deletePatient(db, patientId)) patientsDeleted += 1;
    }

    db.prepare('DELETE FROM import_batches WHERE id = ?').run(id);
    return {
      notes_deleted: notesDeleted,
      patients_deleted: patientsDeleted,
      notes_kept: notesKept,
      patients_kept: patientsKept,
    };
  })();
}
