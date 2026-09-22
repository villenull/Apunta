import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { STANDARD_PROGRESS_FORMAT } from '@apunta/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { OWNER_PROGRESS_INSTRUCTIONS } from './ai/default-instructions.js';
import { loadConfig } from './config.js';
import { createFormat, listFormats } from './db/formats.js';
import { openDatabase, type Database } from './db/index.js';
import { listNotesForPatient } from './db/notes.js';
import { listPatients } from './db/patients.js';
import { SeedRefusedError, seedDatabase } from './seed.js';

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

    expect(notes.map((n) => [n.title, n.created_at.slice(0, 10), n.status])).toEqual([
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
