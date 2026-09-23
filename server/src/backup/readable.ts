import { instantToLocalDay, planDocumentText, safeFilePart } from '@apunta/shared';
import type { Note, Patient } from '@apunta/shared';
import type { Database } from 'better-sqlite3';

import { listNotesForPatient } from '../db/notes.js';
import { listPatients } from '../db/patients.js';
import { listPlanGoals, listPlanVersions } from '../db/plans.js';

/**
 * The half of the archive a person can read with no software at all.
 *
 * Plain text, not markdown. The clipboard format is already plain text by
 * owner decision (`docs/decisions.md`, answer 3), so reusing it means the file
 * in the backup is character-for-character what she pastes into her records
 * system — and `.md` in this project would mean asterisks she never asked for
 * (`docs/research/data-at-rest-2026-08.md` §5.2).
 *
 * Treatment plans are here too, one document per version. A plan version is a
 * payer-facing record whose retention is measured in years, and this rendering
 * is the part of it that outlives the schema (M9 deliverable 6,
 * `docs/research/m9-plan-requirements-2026-08.md` §5).
 */

export interface ReadableEntry {
  /** Path inside the zip, `/`-separated. */
  readonly path: string;
  readonly text: string;
}

/** `notes/John Smith/2026-08-08 Progress note.txt` */
export function noteEntries(db: Database): ReadableEntry[] {
  const entries: ReadableEntry[] = [];
  const paths = new Set<string>();
  for (const patient of listPatients(db, { includeArchived: true })) {
    const folder = patientFolder(patient);
    for (const note of listNotesForPatient(db, patient.id)) {
      const basePath = `notes/${folder}/${noteFilename(note)}`;
      let path = basePath;
      if (paths.has(path)) {
        // A client can have two notes with the same title on the same day.
        // Keep the usual readable name for the first one, then reserve enough
        // room for the full id so no note can be silently replaced in the zip.
        const base = noteFilename(note).slice(0, -'.txt'.length);
        const suffix = ` (${note.id})`;
        const room = Math.max(1, 80 - suffix.length);
        path = `notes/${folder}/${base.slice(0, room).trimEnd()}${suffix}.txt`;
      }
      // The UUID makes this collision-free even when two titles sanitize to
      // the same filename. This guard is defensive if the data ever violates
      // the UUID uniqueness invariant.
      let fallback = 2;
      while (paths.has(path)) {
        path = `notes/${folder}/${note.id}-${String(fallback)}.txt`;
        fallback += 1;
      }
      paths.add(path);
      entries.push({ path, text: noteFileText(note) });
    }
  }
  return entries;
}

/** `plans/John Smith/Treatment plan v2 (active).txt` */
export function planEntries(db: Database): ReadableEntry[] {
  const entries: ReadableEntry[] = [];
  for (const patient of listPatients(db, { includeArchived: true })) {
    const versions = listPlanVersions(db, patient.id);
    const folder = patientFolder(patient);
    for (const plan of versions) {
      const text = planDocumentText({
        plan,
        goals: listPlanGoals(db, plan.id),
        versions,
        patientName: patient.name,
        patientIdentifier: patient.identifier,
      });
      const name = safeFilePart(`Treatment plan v${String(plan.version)} (${plan.status})`);
      entries.push({ path: `plans/${folder}/${name}.txt`, text });
    }
  }
  return entries;
}

/**
 * Two patients can legitimately share a name, so the folder carries a short
 * id suffix. Without it one patient's notes would land inside another's
 * folder, which is the one filing error a clinical archive must not make.
 */
function patientFolder(patient: Patient): string {
  return safeFilePart(`${patient.name} (${patient.id.slice(0, 8)})`);
}

function noteFilename(note: Note): string {
  const day = instantToLocalDay(note.created_at);
  return `${safeFilePart(`${day} ${note.title}`)}.txt`;
}

/**
 * The note as she would paste it, with a two-line header saying what it is.
 *
 * The header is above the note body and separated by a blank line, so deleting
 * the first three lines leaves exactly the clipboard text.
 */
export function noteFileText(note: Note): string {
  const status = note.status === 'published' ? `published ${note.published_at ?? ''}`.trim() : 'draft';
  return [`${note.title}`, `${note.created_at} — ${status}`, '', note.content, ''].join('\n');
}
