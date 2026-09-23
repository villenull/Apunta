import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../config.js';
import { createFormat } from './formats.js';
import { openDatabase, type Database } from './index.js';
import { createNote, getNote, setNotePublished, updateDraftNoteContent } from './notes.js';
import { createPatient } from './patients.js';

const migrationsDir = loadConfig({}).migrationsDir;

let dataDir: string;
let db: Database;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'apunta-notes-'));
  db = openDatabase({ file: join(dataDir, 'apunta.db'), migrationsDir }).db;
});

afterEach(() => {
  db.close();
  rmSync(dataDir, { recursive: true, force: true });
});

function draftNote(content = 'Subjective: Sample body.') {
  const format = createFormat(db, { name: 'Progress note', sections: ['Subjective', 'Plan'] });
  const patient = createPatient(db, { name: 'John Smith' });
  return createNote(db, { patient_id: patient.id, format_id: format.id, title: format.name, content });
}

describe('updateDraftNoteContent', () => {
  it('writes the content while the note is a draft', () => {
    const note = draftNote();
    const updated = updateDraftNoteContent(db, note.id, 'Subjective: Revised body.');
    expect(updated?.content).toBe('Subjective: Revised body.');
    expect(updated?.status).toBe('draft');
    expect(updated?.revision).toBe(note.revision + 1);
    expect(getNote(db, note.id)?.content).toBe('Subjective: Revised body.');
  });

  it('no-ops on a published note, so a mid-refine publish is never overwritten', () => {
    const note = draftNote('Subjective: Filed body.');
    setNotePublished(db, note.id, true);

    const result = updateDraftNoteContent(db, note.id, 'Subjective: The rewrite that came back too late.');

    // The write is refused at the row: undefined out, and the filed content and
    // published status are both exactly as they were.
    expect(result).toBeUndefined();
    const stored = getNote(db, note.id);
    expect(stored?.content).toBe('Subjective: Filed body.');
    expect(stored?.status).toBe('published');
  });

  it('returns undefined for a note that does not exist', () => {
    expect(updateDraftNoteContent(db, '0198c0f0-0000-7000-8000-00000000dead', 'x')).toBeUndefined();
  });
});
