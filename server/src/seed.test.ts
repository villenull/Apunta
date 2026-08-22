import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from './config.js';
import { listFormats } from './db/formats.js';
import { openDatabase, type Database } from './db/index.js';
import { listNotesForPatient } from './db/notes.js';
import { listPatients } from './db/patients.js';
import { seedDatabase } from './seed.js';

const migrationsDir = loadConfig({}).migrationsDir;

let dataDir: string;
let db: Database;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'patience-seed-'));
  db = openDatabase({ file: join(dataDir, 'practice-notes.db'), migrationsDir }).db;
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
      ['Progress note', ['Subjective', 'Objective', 'Assessment', 'Plan']],
      ['Intake note', ['Presenting problem', 'History', 'Formulation', 'Plan']],
    ]);

    const patients = listPatients(db);
    expect(patients.map((p) => [p.name, p.note_count])).toEqual([
      ['John Smith', 3],
      ['Maria Ruiz', 1],
      ['Ana Torres', 0],
    ]);
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
    expect(notes[0]?.content).toContain('Subjective: Patient reports improved sleep');
  });

  it('refuses to touch a database that already has data', () => {
    seedDatabase(db);

    const second = seedDatabase(db);

    expect(second.seeded).toBe(false);
    expect(second.skippedReason).toMatch(/--reset/);
    expect(listPatients(db)).toHaveLength(3);
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
