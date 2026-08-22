import type { Database } from 'better-sqlite3';

import { createFormat, listFormats } from './db/formats.js';
import { createNote, setNotePublished } from './db/notes.js';
import { createPatient, listPatients } from './db/patients.js';

/**
 * Development seed data, taken verbatim from `prototype/patients.html` and
 * `prototype/settings.html`.
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

export const SEED_FORMATS = [
  { name: 'Progress note', sections: ['Subjective', 'Objective', 'Assessment', 'Plan'] },
  { name: 'Intake note', sections: ['Presenting problem', 'History', 'Formulation', 'Plan'] },
] as const;

const PROGRESS_NOTE_AUG_8 = `Subjective: Patient reports improved sleep since last session and decreased frequency of intrusive thoughts.

Objective: Alert, oriented, cooperative, mood congruent with affect.

Assessment: Continued progress on anxiety management goals; responding well to current CBT approach.

Plan: Continue weekly sessions. Introduce grounding exercises for use between sessions.`;

const PROGRESS_NOTE_AUG_1 = `Subjective: Patient describes increased stress related to an upcoming work deadline.

Objective: Alert and engaged, slightly restless affect.

Assessment: Stress reactive to situational trigger, no acute risk indicators.

Plan: Practice breathing exercises daily. Follow up next week.`;

const INTAKE_NOTE_JUL_24 = `Presenting problem: Patient presents with generalized anxiety symptoms over the past six months.

History: No prior therapy. Family history of anxiety.

Formulation: Symptoms consistent with GAD, likely exacerbated by work transition.

Plan: Begin weekly CBT-based sessions.`;

const PROGRESS_NOTE_AUG_4 = `Subjective: Patient reports difficult week around anniversary of loss.

Objective: Tearful at points, otherwise composed.

Assessment: Grief processing progressing as expected.

Plan: Continue supportive therapy weekly.`;

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
  /** Wipe the existing sample data first. Without it, a populated db is left alone. */
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

/**
 * Insert the prototype's samples. Refuses to touch a database that already has
 * content unless `reset` is set, so running `npm run seed` against real notes
 * cannot silently duplicate or destroy them.
 */
export function seedDatabase(db: Database, options: SeedOptions = {}): SeedResult {
  const populated = listPatients(db, { includeArchived: true }).length > 0 || listFormats(db).length > 0;

  if (populated && options.reset !== true) {
    return {
      seeded: false,
      formats: 0,
      patients: 0,
      notes: 0,
      skippedReason: 'the database already contains data (pass --reset to replace it)',
    };
  }

  const run = db.transaction(() => {
    if (populated) wipe(db);

    const formatIds = new Map<string, string>();
    SEED_FORMATS.forEach((format, index) => {
      const created = createFormat(db, {
        name: format.name,
        sections: [...format.sections],
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
