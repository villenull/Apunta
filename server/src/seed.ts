import { sectionsToText, STANDARD_PROGRESS_FORMAT } from '@apunta/shared';
import type { Database } from 'better-sqlite3';

import { OWNER_PROGRESS_INSTRUCTIONS } from './ai/default-instructions.js';
import { createFormat, listFormats } from './db/formats.js';
import { createNote, setNotePublished } from './db/notes.js';
import { createPatient } from './db/patients.js';

/**
 * Development seed data, taken from `prototype/patients.html` and
 * `prototype/settings.html`. The intake note is verbatim; the prototype's
 * progress notes are SOAP, and since 2026-09-22 the default progress note is
 * the owner's own seven sections (`docs/decisions.md`), so they are restated
 * in those sections with the prototype's facts and nothing added.
 *
 * Hard rule 2: nothing here is, or resembles, a real person or a real session.
 * The prototype's fabricated samples are the only patient-shaped text allowed
 * in this repository, so they are the only thing this script writes.
 */

interface SeedNote {
  readonly title: string;
  readonly format: string;
  /** The note's date in the prototype, as a UTC timestamp. */
  readonly created_at: string;
  readonly content: string;
}

interface SeedPatient {
  readonly name: string;
  readonly notes: readonly SeedNote[];
}

export const SEED_FORMATS: readonly {
  readonly name: string;
  readonly sections: readonly string[];
  readonly instructions?: string;
}[] = [
  {
    name: STANDARD_PROGRESS_FORMAT.name,
    sections: STANDARD_PROGRESS_FORMAT.sections,
    instructions: OWNER_PROGRESS_INSTRUCTIONS,
  },
  { name: 'Intake note', sections: ['Presenting problem', 'History', 'Formulation', 'Plan'] },
];

/** A progress note in her sections; a section left out is written as an empty header. */
function progressNote(sections: Record<string, string>): string {
  return sectionsToText(sections, STANDARD_PROGRESS_FORMAT.sections);
}

const PROGRESS_NOTE_AUG_8 = progressNote({
  'Client presentation': 'John appears alert and engaged.',
  'Risk review': 'None.',
  Discussion: 'John reports improved sleep since last session and decreased frequency of intrusive thoughts.',
  Intervention: 'CBT; introduced grounding exercises for use between sessions.',
  'Out of session actions': 'John, practice grounding exercises between sessions.',
  'Note for next session':
    'Anxiety management remains an ongoing focus; John is responding well to the current CBT approach. Continue weekly sessions.',
});

const PROGRESS_NOTE_AUG_1 = progressNote({
  'Client presentation': 'John appears alert and engaged, with slightly restless affect.',
  'Risk review': 'No acute risk indicators.',
  Discussion: 'John describes increased stress related to an upcoming work deadline.',
  Intervention: 'Breathing exercises.',
  'Out of session actions': 'John, practice breathing exercises daily.',
  'Note for next session': 'Follow up next week.',
});

const INTAKE_NOTE_JUL_24 = `Presenting problem: Patient presents with generalized anxiety symptoms over the past six months.

History: No prior therapy. Family history of anxiety.

Formulation: Symptoms consistent with GAD, likely exacerbated by work transition.

Plan: Begin weekly CBT-based sessions.`;

const PROGRESS_NOTE_AUG_4 = progressNote({
  'Client presentation': 'Maria was tearful at points, otherwise composed.',
  'Risk review': 'None.',
  Discussion: 'Maria reports a difficult week around the anniversary of her loss.',
  Intervention: 'Supportive therapy.',
  'Out of session actions': 'None.',
  'Note for next session': 'Grief processing remains an ongoing focus. Continue supportive therapy weekly.',
});

export const SEED_PATIENTS: readonly SeedPatient[] = [
  {
    name: 'John Smith',
    notes: [
      {
        title: 'Intake note',
        format: 'Intake note',
        created_at: '2026-07-24T09:00:00.000Z',
        content: INTAKE_NOTE_JUL_24,
      },
      {
        title: 'Progress note',
        format: 'Progress note',
        created_at: '2026-08-01T09:00:00.000Z',
        content: PROGRESS_NOTE_AUG_1,
      },
      {
        title: 'Progress note',
        format: 'Progress note',
        created_at: '2026-08-08T09:00:00.000Z',
        content: PROGRESS_NOTE_AUG_8,
      },
    ],
  },
  {
    name: 'Maria Ruiz',
    notes: [
      {
        title: 'Progress note',
        format: 'Progress note',
        created_at: '2026-08-04T09:00:00.000Z',
        content: PROGRESS_NOTE_AUG_4,
      },
    ],
  },
  // Ana has no notes in the prototype — she is what the "no notes yet" empty
  // state is demonstrated with.
  { name: 'Ana Torres', notes: [] },
];

export interface SeedOptions {
  /**
   * Wipe everything first, patients and notes included. Without it a database
   * that already has content is refused.
   */
  readonly reset?: boolean;
}

export interface SeedResult {
  readonly seeded: boolean;
  readonly formats: number;
  readonly patients: number;
  readonly notes: number;
  /** Set when nothing was written, explaining why. */
  readonly skippedReason?: string;
}

function wipe(db: Database): void {
  // Notes cascade to transcripts and chat messages; formats must go last.
  db.exec('DELETE FROM notes; DELETE FROM patients; DELETE FROM note_formats; DELETE FROM settings;');
}

/** Thrown instead of seeding over a practice: the CLI turns it into a non-zero exit. */
export class SeedRefusedError extends Error {
  override readonly name = 'SeedRefusedError';
}

function count(db: Database, table: 'patients' | 'notes'): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

/**
 * Insert the prototype's samples. Refuses — throws, so `npm run seed` exits
 * non-zero — on a database that already has patients unless `reset` is set:
 * seeding the demo over the owner's real database with `--reset` is how her
 * format was replaced with SOAP on 2026-09-21, so a run that would wipe a
 * practice has to be asked for explicitly and says what it would delete.
 * A database with formats but no patients is still skipped, not wiped.
 */
export function seedDatabase(db: Database, options: SeedOptions = {}): SeedResult {
  const patients = count(db, 'patients');
  if (patients > 0 && options.reset !== true) {
    throw new SeedRefusedError(
      `the database already has ${String(patients)} patient${patients === 1 ? '' : 's'} and ` +
        `${String(count(db, 'notes'))} notes. Seeding is for an empty development database; ` +
        'pass --reset only if every one of them should be deleted and replaced with the sample practice.',
    );
  }

  const populated = patients > 0 || listFormats(db).length > 0;

  if (populated && options.reset !== true) {
    return {
      seeded: false,
      formats: 0,
      patients: 0,
      notes: 0,
      skippedReason: 'the database already has note formats (pass --reset to replace them)',
    };
  }

  const run = db.transaction(() => {
    if (populated) wipe(db);

    const formatIds = new Map<string, string>();
    SEED_FORMATS.forEach((format, index) => {
      const created = createFormat(db, {
        name: format.name,
        sections: [...format.sections],
        ...(format.instructions === undefined ? {} : { instructions: format.instructions }),
        source: 'manual',
        created_at: `2026-07-20T09:0${String(index)}:00.000Z`,
      });
      formatIds.set(format.name, created.id);
    });

    let noteCount = 0;
    for (const patient of SEED_PATIENTS) {
      const created = createPatient(db, { name: patient.name });
      for (const note of patient.notes) {
        const formatId = formatIds.get(note.format);
        if (!formatId) throw new Error(`Seed note references unknown format "${note.format}"`);

        const inserted = createNote(db, {
          patient_id: created.id,
          format_id: formatId,
          title: note.title,
          content: note.content,
          created_at: note.created_at,
        });
        // Every sample note in the prototype is already published.
        setNotePublished(db, inserted.id, true, note.created_at);
        noteCount += 1;
      }
    }

    return noteCount;
  });

  const notes = run();

  return {
    seeded: true,
    formats: SEED_FORMATS.length,
    patients: SEED_PATIENTS.length,
    notes,
  };
}
