import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../config.js';
import { createFormat } from './formats.js';
import { openDatabase, type Database } from './index.js';
import { createNote, getNote, setNotePublished, updateDraftNoteContent, updateNote } from './notes.js';
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
    const updated = updateDraftNoteContent(db, note.id, 'Subjective: Revised body.', note.revision);
    expect(updated?.content).toBe('Subjective: Revised body.');
    expect(updated?.status).toBe('draft');
    expect(updated?.revision).toBe(note.revision + 1);
    expect(getNote(db, note.id)?.content).toBe('Subjective: Revised body.');
  });

  it('no-ops on a published note, so a mid-refine publish is never overwritten', () => {
    const note = draftNote('Subjective: Filed body.');
    setNotePublished(db, note.id, true);

    const result = updateDraftNoteContent(
      db,
      note.id,
      'Subjective: The rewrite that came back too late.',
      note.revision,
    );

    // The write is refused at the row: undefined out, and the filed content and
    // published status are both exactly as they were.
    expect(result).toBeUndefined();
    const stored = getNote(db, note.id);
    expect(stored?.content).toBe('Subjective: Filed body.');
    expect(stored?.status).toBe('published');
  });

  it('no-ops when the draft moved on, so a mid-refine hand edit is never overwritten', () => {
    const note = draftNote('Subjective: The text the rewrite was built from.');
    // Her own edit, committed while the model was still thinking: the revision
    // the rewrite was computed from is no longer the note's.
    const edited = updateNote(db, note.id, {
      revision: note.revision,
      content: 'Subjective: What she typed in the other window.',
    });

    const result = updateDraftNoteContent(db, note.id, 'Subjective: The late rewrite.', note.revision);

    expect(edited?.revision).toBe(note.revision + 1);
    expect(result).toBeUndefined();
    expect(getNote(db, note.id)?.content).toBe('Subjective: What she typed in the other window.');
  });

  it('writes when the revision still matches, so a retry of the same turn is not blocked', () => {
    const note = draftNote();
    // The caller reads the note itself and passes that revision — the same one
    // a note PATCH carries, so a turn that changed nothing still applies.
    const result = updateDraftNoteContent(db, note.id, 'Subjective: First.', getNote(db, note.id)!.revision);
    expect(result?.content).toBe('Subjective: First.');
    // The same, now stale, revision is refused: the write moved the note on.
    expect(updateDraftNoteContent(db, note.id, 'Subjective: Second.', note.revision)).toBeUndefined();
  });

  it('returns undefined for a note that does not exist', () => {
    expect(updateDraftNoteContent(db, '0198c0f0-0000-7000-8000-00000000dead', 'x', 0)).toBeUndefined();
  });
});
