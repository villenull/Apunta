import { sectionsToText, STANDARD_PROGRESS_FORMAT } from '@apunta/shared';
import type { Database } from 'better-sqlite3';

import { OWNER_PROGRESS_INSTRUCTIONS } from './ai/default-instructions.js';
import { createFormat, listFormats } from './db/formats.js';
import { createNote, setNotePublished } from './db/notes.js';
import { createPatientGroup } from './db/patientGroups.js';
import { createPatient, updatePatient } from './db/patients.js';

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
  /**
   * Whether to publish it. The prototype's samples are all published, so this
   * defaults to publishing; the generated practice leaves every other note a
   * draft on purpose.
   */
  readonly published?: boolean;
}

interface SeedPatient {
  readonly name: string;
  readonly notes: readonly SeedNote[];
  /** The practice group this patient is filed under, if any. */
  readonly group?: string;
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

/**
 * A throwaway practice, for looking at a list that has something in it:
 * fifteen patients with five to ten notes each, spread over the last few months
 * so the sidebar's "Last activity" windows have something to bite on, and
 * alternating published and **draft** so "Continue a draft" has real drafts to
 * find rather than only published notes.
 *
 * **Opt-in** (`npm run seed -- --practice`), because it is noise next to the
 * sample practice and nobody wants it in a database they meant to be small.
 *
 * Hard rule 2: every name and every line here is invented and says nothing about
 * any person or any session. These are deliberately *not* the prototype's
 * sample names — a bulk list of fifteen would make those look like a real
 * caseload rather than the three fabricated examples they are — and they are
 * built deterministically from the index, so two runs of the seeder produce the
 * same database and a test can count them.
 */
const PRACTICE_PATIENT_COUNT = 15;
const PRACTICE_NOTES_MIN = 5;
const PRACTICE_NOTES_MAX = 10;
/** How far back the newest note in the practice reaches, in days. */
const PRACTICE_SPAN_DAYS = 120;

const PRACTICE_FIRST_NAMES = [
  'Ana',
  'Bruno',
  'Carla',
  'Diego',
  'Elena',
  'Farid',
  'Gina',
  'Hugo',
  'Ines',
  'Julio',
  'Karina',
  'Liam',
  'Marta',
  'Nadia',
  'Omar',
] as const;
const PRACTICE_LAST_NAMES = [
  'Alvarez',
  'Bianchi',
  'Cardoso',
  'Duarte',
  'Esquivel',
  'Fuentes',
  'Gallardo',
  'Herrera',
  'Ibarra',
  'Jimenez',
  'Kruger',
  'Lombardi',
  'Molina',
  'Navarro',
  'Ortega',
] as const;

/**
 * Two groups in the practice, and which of the generated patients are in them
 * (owner, 2026-09-27). A practice with eighteen patients and no groups does not
 * exercise the sidebar's group headings at all, and a heading with nobody in it
 * is exactly the case that reads as broken.
 *
 * Deliberately **not** all of them: leaving most patients ungrouped is what
 * "no group, no change" looks like, and a seed where everybody is filed is not
 * the shape a real list is in.
 */
export const PRACTICE_GROUPS: readonly {
  readonly name: string;
  readonly first: number;
  readonly count: number;
}[] = [
  { name: 'Family therapy', first: 0, count: 4 },
  { name: 'Court-mandated', first: 5, count: 3 },
];

export function buildPracticePatients(now: Date = new Date()): readonly SeedPatient[] {
  return Array.from({ length: PRACTICE_PATIENT_COUNT }, (_, index) => {
    const first = PRACTICE_FIRST_NAMES[index % PRACTICE_FIRST_NAMES.length] ?? 'Ana';
    const last = PRACTICE_LAST_NAMES[index % PRACTICE_LAST_NAMES.length] ?? 'Alvarez';
    // 5..10, by index, so the spread is deterministic and every count in the
    // range is exercised rather than clustering.
    const noteCount = PRACTICE_NOTES_MIN + (index % (PRACTICE_NOTES_MAX - PRACTICE_NOTES_MIN + 1));
    const notes = Array.from({ length: noteCount }, (_, noteIndex) => {
      /*
       * Newest first, one note every few days.
       *
       * The span is the *newest* note's reach, so the oldest note in a practice
       * runs a little past it: the per-patient `+ index` offset (each patient
       * starts further back than the last) is added on top of the 120-day
       * spread, and the last patient reaches 123 days. Saying "all inside the
       * span" here was true of the spread and not of the result.
       */
      const daysAgo = 1 + Math.round((noteIndex * PRACTICE_SPAN_DAYS) / noteCount) + index;
      const at = new Date(now.getTime() - daysAgo * 86_400_000);
      return {
        title: `Session ${String(noteCount - noteIndex)}`,
        format: STANDARD_PROGRESS_FORMAT.name,
        created_at: at.toISOString(),
        // Every other note stays a draft, which is what makes the workbench's
        // "Continue a draft" card mean something on a practice this size.
        published: noteIndex % 2 === 1,
        content: [
          `Fabricated sample note ${String(noteCount - noteIndex)} for ${first} ${last}.`,
          '',
          'Presenting concern, observations and plan were discussed and recorded.',
          'This text is invented for development and describes no real person.',
        ].join('\n'),
      };
    });
    // The first few go into the practice groups, the rest stay ungrouped.
    const group = PRACTICE_GROUPS.find(
      (candidate) => index >= candidate.first && index < candidate.first + candidate.count,
    )?.name;
    return { name: `${first} ${last}`, notes, ...(group === undefined ? {} : { group }) };
  });
}

export interface SeedOptions {
  /**
   * Wipe everything first, patients and notes included. Without it a database
   * that already has content is refused.
   */
  readonly reset?: boolean;
  /**
   * Also write the fifteen-patient throwaway practice after the sample one.
   * Opt-in, and additive: the sample practice is still there beside it.
   */
  readonly practice?: boolean;
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
  //
  // `patient_groups` is in here because `--reset` is documented as leaving an
  // empty database, and a group left behind is not empty: a patient created
  // later could be filed into a list from a previous life, with nothing in the
  // seed to explain where it came from. It is written before the patients are
  // deleted purely for readability — the patients' foreign key is
  // `ON DELETE SET NULL`, so either order works.
  db.exec(
    'DELETE FROM notes; DELETE FROM patients; DELETE FROM patient_groups; DELETE FROM note_formats; DELETE FROM settings;',
  );
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

  const practicePatients = options.practice === true ? buildPracticePatients() : [];

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
        if (note.published !== false) setNotePublished(db, inserted.id, true, note.created_at);
        noteCount += 1;
      }
    }

    if (options.practice === true) {
      const practiceGroupIds = new Map<string, string>();
      for (const group of PRACTICE_GROUPS) {
        practiceGroupIds.set(group.name, createPatientGroup(db, group.name).id);
      }
      for (const patient of practicePatients) {
        const created = createPatient(db, { name: patient.name });
        const groupId = patient.group === undefined ? undefined : practiceGroupIds.get(patient.group);
        if (groupId !== undefined) updatePatient(db, created.id, { groupId });
        for (const note of patient.notes) {
          const formatId = formatIds.get(note.format);
          if (!formatId) throw new Error(`Practice note references unknown format "${note.format}"`);

          const inserted = createNote(db, {
            patient_id: created.id,
            format_id: formatId,
            title: note.title,
            content: note.content,
            created_at: note.created_at,
          });
          if (note.published !== false) setNotePublished(db, inserted.id, true, note.created_at);
          noteCount += 1;
        }
      }
    }

    return noteCount;
  });

  const notes = run();

  return {
    seeded: true,
    formats: SEED_FORMATS.length,
    patients: SEED_PATIENTS.length + practicePatients.length,
    notes,
  };
}
