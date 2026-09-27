import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { instantToLocalDay, STANDARD_PROGRESS_FORMAT } from '@apunta/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { OWNER_PROGRESS_INSTRUCTIONS } from './ai/default-instructions.js';
import { loadConfig } from './config.js';
import { createFormat, listFormats } from './db/formats.js';
import { openDatabase, type Database } from './db/index.js';
import { createPatientGroup, listPatientGroups } from './db/patientGroups.js';
import { createPatient, listPatients, updatePatient } from './db/patients.js';
import { listNotesForPatient } from './db/notes.js';
import { buildPracticePatients, SeedRefusedError, seedDatabase } from './seed.js';

const migrationsDir = loadConfig({}).migrationsDir;

let dataDir: string;
let db: Database;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'apunta-seed-'));
  db = openDatabase({ file: join(dataDir, 'apunta.db'), migrationsDir }).db;
});

afterEach(() => {
  db.close();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('seedDatabase', () => {
  it('inserts the prototype practice: two formats, three patients, four published notes', () => {
    const result = seedDatabase(db);

    expect(result).toMatchObject({ seeded: true, formats: 2, patients: 3, notes: 4 });

    expect(listFormats(db).map((f) => [f.name, f.sections])).toEqual([
      [
        'Progress note',
        [
          'Location',
          'Client presentation',
          'Risk review',
          'Discussion',
          'Intervention',
          'Out of session actions',
          'Note for next session',
        ],
      ],
      ['Intake note', ['Presenting problem', 'History', 'Formulation', 'Plan']],
    ]);

    const patients = listPatients(db);
    expect(patients.map((p) => [p.name, p.note_count])).toEqual([
      ['John Smith', 3],
      ['Maria Ruiz', 1],
      ['Ana Torres', 0],
    ]);
  });

  it('gives the progress note the owner’s instructions and leaves the intake on the default', () => {
    seedDatabase(db);
    const [progress, intake] = listFormats(db);

    expect(progress?.sections).toEqual([...STANDARD_PROGRESS_FORMAT.sections]);
    expect(progress?.instructions).toBe(OWNER_PROGRESS_INSTRUCTIONS);
    expect(intake?.instructions).toBe('');
  });

  it('publishes every sample note and backdates it to the prototype date', () => {
    seedDatabase(db);
    const john = listPatients(db).find((p) => p.name === 'John Smith');

    const notes = listNotesForPatient(db, john?.id ?? '');

    expect(notes.map((n) => [n.title, instantToLocalDay(n.created_at), n.status])).toEqual([
      ['Progress note', '2026-08-08', 'published'],
      ['Progress note', '2026-08-01', 'published'],
      ['Intake note', '2026-07-24', 'published'],
    ]);
    expect(notes.every((n) => n.published_at === n.created_at)).toBe(true);
    expect(notes[0]?.content).toContain(
      'Discussion: John reports improved sleep since last session and decreased frequency of intrusive thoughts.',
    );
    // Every one of her seven headers travels, the empty Location included.
    expect(notes[0]?.content.startsWith('Location:')).toBe(true);
    for (const section of STANDARD_PROGRESS_FORMAT.sections) {
      expect(notes[0]?.content).toContain(`${section}:`);
    }
  });

  it('refuses, with an error, a database that already has patients', () => {
    seedDatabase(db);

    expect(() => seedDatabase(db)).toThrow(SeedRefusedError);
    expect(() => seedDatabase(db)).toThrow(/3 patients and 4 notes.*--reset/);
    expect(listPatients(db)).toHaveLength(3);
    expect(listFormats(db)).toHaveLength(2);
  });

  it('skips, without wiping, a database that has formats but no patients yet', () => {
    // A freshly restored config pack looks like this: her format, no patients.
    createFormat(db, { name: 'Progress note', sections: ['Location'], instructions: 'Mine.' });

    const result = seedDatabase(db);

    expect(result.seeded).toBe(false);
    expect(result.skippedReason).toMatch(/--reset/);
    expect(listFormats(db).map((f) => f.instructions)).toEqual(['Mine.']);
  });

  it('replaces the existing content when reset is asked for', () => {
    seedDatabase(db);
    const before = listPatients(db).map((p) => p.id);

    const again = seedDatabase(db, { reset: true });

    expect(again).toMatchObject({ seeded: true, patients: 3 });
    expect(listPatients(db)).toHaveLength(3);
    expect(listFormats(db)).toHaveLength(2);
    // Fresh rows, not duplicates of the old ones.
    expect(listPatients(db).map((p) => p.id)).not.toEqual(before);
  });
});

/**
 * The opt-in throwaway practice (owner, 2026-09-27): fifteen patients with five
 * to ten notes each, so a list can be looked at with something in it.
 *
 * The counts are asserted rather than eyeballed because they are the whole
 * point of the flag, and because the note spread is what makes the sidebar's
 * "Last activity" windows and the workbench's "Continue a draft" mean anything.
 * The names being invented rather than the prototype's is a hard-rule point and
 * is asserted too: fifteen copies of the sample names would make three fabricated
 * examples look like a caseload.
 */
describe('the throwaway practice', () => {
  it('is fifteen patients with five to ten notes each, built the same way twice', () => {
    const first = buildPracticePatients(new Date('2026-09-27T12:00:00.000Z'));
    const second = buildPracticePatients(new Date('2026-09-27T12:00:00.000Z'));

    expect(first).toHaveLength(15);
    expect(second).toEqual(first);
    for (const patient of first) {
      expect(patient.notes.length).toBeGreaterThanOrEqual(5);
      expect(patient.notes.length).toBeLessThanOrEqual(10);
    }
    // Every count in the range is exercised, not just the ends.
    const counts = new Set(first.map((patient) => patient.notes.length));
    expect(counts.size).toBe(6);
  });

  it('invents its own names, and never the prototype three', () => {
    const names = buildPracticePatients().map((patient) => patient.name);

    expect(new Set(names).size).toBe(15);
    for (const sample of ['John Smith', 'Maria Ruiz', 'Ana Torres']) {
      expect(names).not.toContain(sample);
    }
  });

  it('leaves half its notes as drafts, and reaches back months', () => {
    const now = new Date('2026-09-27T12:00:00.000Z');
    const patients = buildPracticePatients(now);
    const notes = patients.flatMap((patient) => patient.notes);

    const drafts = notes.filter((note) => note.published === false);
    expect(drafts.length).toBeGreaterThan(0);
    // Published by default unless a note says otherwise, so the drafts above are
    // a deliberate half rather than every note arriving unpublished.
    expect(notes.some((note) => note.published === true)).toBe(true);

    const oldest = Math.min(...notes.map((note) => new Date(note.created_at).getTime()));
    const newest = Math.max(...notes.map((note) => new Date(note.created_at).getTime()));
    expect(now.getTime() - oldest).toBeGreaterThan(60 * 86_400_000);
    expect(now.getTime() - newest).toBeLessThan(14 * 86_400_000);
  });

  it('says nothing about a real person, and is opt-in', () => {
    for (const patient of buildPracticePatients()) {
      for (const note of patient.notes) {
        expect(note.content).toContain('Fabricated sample note');
        expect(note.content).toContain('describes no real person');
      }
    }
  });
});

/** The flag itself: additive, and refused on a database that already has people. */
describe('seeding with --practice', () => {
  it('adds the practice beside the sample practice, and is not the default', () => {
    const plain = openDatabase({ file: join(dataDir, 'plain.db'), migrationsDir });
    seedDatabase(plain.db);
    expect(listPatients(plain.db)).toHaveLength(3);
    plain.db.close();

    const withPractice = openDatabase({ file: join(dataDir, 'practice.db'), migrationsDir });
    const result = seedDatabase(withPractice.db, { practice: true });
    const patients = listPatients(withPractice.db);

    // The sample three are still there, and the fifteen are beside them.
    expect(patients).toHaveLength(18);
    expect(result.patients).toBe(18);
    expect(patients.map((patient) => patient.name)).toEqual(
      expect.arrayContaining(['John Smith', 'Maria Ruiz', 'Ana Torres']),
    );
    // And every practice patient really has notes behind them.
    const generated = patients.filter(
      (patient) => !['John Smith', 'Maria Ruiz', 'Ana Torres'].includes(patient.name),
    );
    for (const patient of generated) {
      expect(listNotesForPatient(withPractice.db, patient.id).length).toBeGreaterThanOrEqual(5);
    }
    withPractice.db.close();
  });
});

/**
 * `--reset` has to leave an *empty* database (owner, 2026-09-27).
 *
 * It did not: `wipe()` predated the groups table, so a group survived a reset
 * while every patient it held was deleted. That is worse than untidy — a patient
 * created afterwards could be filed into a list from a previous life with nothing
 * to explain where it came from, and the owner hit exactly this in a preview.
 */
describe('--reset', () => {
  it('takes the groups with it, not just the patients', () => {
    const opened = openDatabase({ file: join(dataDir, 'wipe.db'), migrationsDir });
    const db = opened.db;
    seedDatabase(db);
    // A group made by hand, so this is about `wipe` and not about what the
    // practice flag happens to generate today.
    const group = createPatientGroup(db, 'Family therapy');
    const patient = createPatient(db, { name: 'John Smith' });
    updatePatient(db, patient.id, { groupId: group.id });
    expect(listPatientGroups(db)).toHaveLength(1);

    seedDatabase(db, { reset: true });

    // The group went with the patients. Left behind it would not be untidy but
    // wrong: a patient created after a reset could be filed into a list from a
    // previous life, with nothing to say where it came from.
    // The sample practice is back — that is what `--reset` does — and **no group
    // came with it**, and nobody is filed into anything.
    expect(listPatientGroups(db)).toEqual([]);
    expect(listPatients(db).length).toBe(3);
    expect(listPatients(db).every((patient) => patient.group_id === null)).toBe(true);
    db.close();
  });
});
