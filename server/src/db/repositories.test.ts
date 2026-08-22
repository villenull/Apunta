import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../config.js';
import { createChatMessage, listChatMessagesForNote } from './chat-messages.js';
import { countNotesForFormat, createFormat, deleteFormat, getFormat, updateFormat } from './formats.js';
import { openDatabase, type Database } from './index.js';
import { createNote, deleteNote, listNotesForPatient, setNotePublished } from './notes.js';
import { createPatient, deletePatient, listPatients, updatePatient } from './patients.js';
import { getAllSettings, getSetting, putSettings } from './settings.js';
import { createTranscript, listTranscriptsForNote } from './transcripts.js';

const migrationsDir = loadConfig({}).migrationsDir;

let dataDir: string;
let db: Database;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'patience-repo-'));
  db = openDatabase({ file: join(dataDir, 'practice-notes.db'), migrationsDir }).db;
});

afterEach(() => {
  db.close();
  rmSync(dataDir, { recursive: true, force: true });
});

function fixture() {
  const format = createFormat(db, { name: 'Progress note', sections: ['Subjective', 'Plan'] });
  const patient = createPatient(db, { name: 'John Smith' });
  const note = createNote(db, {
    patient_id: patient.id,
    format_id: format.id,
    title: format.name,
    content: 'Subjective: Sample body.',
  });
  const transcript = createTranscript(db, {
    note_id: note.id,
    source: 'typed',
    raw_text: 'Sample dictation.',
  });
  const message = createChatMessage(db, { note_id: note.id, role: 'user', text: 'Make it shorter' });
  return { format, patient, note, transcript, message };
}

function countRows(table: 'notes' | 'transcripts' | 'chat_messages'): number {
  return (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
}

describe('cascades', () => {
  it('deleting a note removes its transcripts and chat messages', () => {
    const { note } = fixture();
    expect(countRows('transcripts')).toBe(1);
    expect(countRows('chat_messages')).toBe(1);

    expect(deleteNote(db, note.id)).toBe(true);

    expect(countRows('notes')).toBe(0);
    expect(countRows('transcripts')).toBe(0);
    expect(countRows('chat_messages')).toBe(0);
  });

  it('deleting a patient removes their notes and everything hanging off them', () => {
    const { patient } = fixture();

    expect(deletePatient(db, patient.id)).toBe(true);

    expect(countRows('notes')).toBe(0);
    expect(countRows('transcripts')).toBe(0);
    expect(countRows('chat_messages')).toBe(0);
  });

  it('refuses to delete a format that notes still reference', () => {
    const { format } = fixture();

    expect(countNotesForFormat(db, format.id)).toBe(1);
    expect(() => deleteFormat(db, format.id)).toThrow(/FOREIGN KEY/i);
    expect(getFormat(db, format.id)).toBeDefined();
  });

  it('allows deleting a format once its notes are gone', () => {
    const { format, note } = fixture();
    deleteNote(db, note.id);

    expect(deleteFormat(db, format.id)).toBe(true);
    expect(getFormat(db, format.id)).toBeUndefined();
  });

  it('rejects a note pointing at a patient that does not exist', () => {
    const { format } = fixture();

    expect(() =>
      createNote(db, { patient_id: 'missing', format_id: format.id, title: 'Progress note' }),
    ).toThrow(/FOREIGN KEY/i);
  });
});

describe('patients', () => {
  it('hides archived patients from the default listing and counts notes', () => {
    const { patient } = fixture();
    const other = createPatient(db, { name: 'Ana Torres' });

    expect(listPatients(db).map((p) => [p.name, p.note_count])).toEqual([
      ['John Smith', 1],
      ['Ana Torres', 0],
    ]);

    updatePatient(db, other.id, { archived: true });

    expect(listPatients(db).map((p) => p.name)).toEqual(['John Smith']);
    expect(listPatients(db, { includeArchived: true }).map((p) => p.name)).toEqual([
      'John Smith',
      'Ana Torres',
    ]);
    expect(patient.archived_at).toBeNull();
  });

  it('keeps the original archive time when archiving twice, and clears it on restore', () => {
    const patient = createPatient(db, { name: 'Maria Ruiz' });

    const archived = updatePatient(db, patient.id, { archived: true });
    const archivedAgain = updatePatient(db, patient.id, { archived: true });
    expect(archivedAgain?.archived_at).toBe(archived?.archived_at);

    expect(updatePatient(db, patient.id, { archived: false })?.archived_at).toBeNull();
  });
});

describe('notes', () => {
  it('lists the notes of a patient newest first', () => {
    const { format, patient, note } = fixture();
    const older = createNote(db, {
      patient_id: patient.id,
      format_id: format.id,
      title: 'Intake note',
      content: '',
      created_at: '2026-07-24T10:00:00.000Z',
    });
    const newer = createNote(db, {
      patient_id: patient.id,
      format_id: format.id,
      title: 'Progress note',
      content: '',
      created_at: '2026-08-08T10:00:00.000Z',
    });

    // The fixture note was created just now, so it sorts ahead of both.
    expect(listNotesForPatient(db, patient.id).map((n) => n.id)).toEqual([note.id, newer.id, older.id]);
  });

  it('sets and clears published_at alongside the status', () => {
    const { note } = fixture();

    const published = setNotePublished(db, note.id, true);
    expect(published?.status).toBe('published');
    expect(published?.published_at).not.toBeNull();

    const draft = setNotePublished(db, note.id, false);
    expect(draft?.status).toBe('draft');
    expect(draft?.published_at).toBeNull();
  });
});

describe('formats', () => {
  it('round-trips the sections array through its JSON column', () => {
    const format = createFormat(db, {
      name: 'Intake note',
      sections: ['Presenting problem', 'History', 'Formulation', 'Plan'],
      source: 'manual',
    });

    expect(getFormat(db, format.id)?.sections).toEqual([
      'Presenting problem',
      'History',
      'Formulation',
      'Plan',
    ]);

    updateFormat(db, format.id, { sections: ['Presenting problem', 'Plan'] });
    expect(getFormat(db, format.id)?.sections).toEqual(['Presenting problem', 'Plan']);
  });
});

describe('transcripts and chat messages', () => {
  it('lists them for their note', () => {
    const { note } = fixture();
    createChatMessage(db, { note_id: note.id, role: 'assistant', text: 'Shortened the Plan section.' });

    expect(listTranscriptsForNote(db, note.id)).toHaveLength(1);
    expect(listChatMessagesForNote(db, note.id).map((m) => m.role)).toEqual(['user', 'assistant']);
  });
});

describe('settings', () => {
  it('merges writes and preserves JSON value types', () => {
    putSettings(db, { llm_model: 'gemma4:12b', keep_audio: false });
    putSettings(db, { stt_vocabulary: ['sertraline', 'CBT'] });

    expect(getAllSettings(db)).toEqual({
      llm_model: 'gemma4:12b',
      keep_audio: false,
      stt_vocabulary: ['sertraline', 'CBT'],
    });
    expect(getSetting<boolean>(db, 'keep_audio')).toBe(false);
    expect(getSetting<string>(db, 'not_set')).toBeUndefined();
  });

  it('overwrites an existing key rather than duplicating it', () => {
    putSettings(db, { llm_model: 'first' });
    putSettings(db, { llm_model: 'second' });

    expect(getAllSettings(db)).toEqual({ llm_model: 'second' });
  });
});
