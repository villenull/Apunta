import { STANDARD_PROGRESS_FORMAT, textToSections, type NoteFormat, type Patient } from '@apunta/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { NO_REPAIRS } from '../ai/types.js';
import { listNotesForPatient } from '../db/notes.js';
import { createTestApp, seedFormat, seedPatient, type TestApp } from '../test/harness.js';
import { persistDraft } from './draft.js';

import type * as ChatMessages from '../db/chat-messages.js';

/**
 * `persistDraft`'s all-or-nothing write.
 *
 * The note, its transcripts and the refine thread's opening turn are one fact
 * about a session: a note without the transcript it was drafted from is not a
 * recoverable state, because that transcript is the source the refine
 * boilerplate lock checks against — legitimate content would then be held back
 * from a note that looks like it was never drafted from one. A failure has to
 * be representable for this to be worth asserting, so the last of the three
 * writes, `createChatMessage`, is made to throw on demand.
 */
const failing = { chatMessage: false };

vi.mock('../db/chat-messages.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ChatMessages>();
  return {
    ...actual,
    createChatMessage: vi.fn((...args: Parameters<typeof actual.createChatMessage>) => {
      if (failing.chatMessage) throw new Error('the disk is full');
      return actual.createChatMessage(...args);
    }),
  };
});

const SECTIONS = [...STANDARD_PROGRESS_FORMAT.sections];

let harness: TestApp;
let patient: Patient;
let format: NoteFormat;

beforeAll(async () => {
  harness = await createTestApp();
  patient = await seedPatient(harness.app, 'John Smith');
  format = await seedFormat(harness.app, { sections: SECTIONS });
});

afterAll(async () => {
  await harness.close();
});

function countRows(table: 'notes' | 'transcripts' | 'chat_messages'): number {
  return (harness.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

function draftInput(patientId: string) {
  return {
    patient_id: patientId,
    format_id: format.id,
    typed_notes: 'She said the grounding exercises helped.',
    transcript: 'Recorded dictation of the session.',
  };
}

const SAMPLE_SECTIONS = textToSections(
  SECTIONS.map((section) => `${section}: Sample body.`).join('\n\n'),
  SECTIONS,
);

describe('persistDraft', () => {
  it('writes the note, both transcripts and the opening turn', () => {
    const note = persistDraft(harness.db, draftInput(patient.id), format, SAMPLE_SECTIONS);

    expect(listNotesForPatient(harness.db, patient.id).map((candidate) => candidate.id)).toContain(note.id);
    const transcripts = harness.db
      .prepare('SELECT source FROM transcripts WHERE note_id = ? ORDER BY source')
      .all(note.id) as { source: string }[];
    expect(transcripts.map((row) => row.source)).toEqual(['audio', 'typed']);
    const messages = harness.db.prepare('SELECT role FROM chat_messages WHERE note_id = ?').all(note.id) as {
      role: string;
    }[];
    expect(messages.map((row) => row.role)).toEqual(['assistant']);
  });

  it('tells her in the opening turn what the server changed in the draft', () => {
    const note = persistDraft(harness.db, draftInput(patient.id), format, SAMPLE_SECTIONS, [], {
      ...NO_REPAIRS,
      riskReview: 'Subjective',
      notGathered: ['Patient reported no family history.'],
      reworded: [{ section: 'Assessment', words: ['compulsions'] }],
    });
    const [opening] = harness.db.prepare('SELECT text FROM chat_messages WHERE note_id = ?').all(note.id) as {
      text: string;
    }[];
    expect(opening?.text).toContain(
      'Apunta checked the draft against your notes: it added the risk review you dictated to Subjective',
    );
    expect(opening?.text).toContain('it reworded Assessment to take out “compulsions”');
    expect(opening?.text).toContain('it replaced “Patient reported no family history.”');
  });

  it('adds no notice when the server changed nothing', () => {
    const note = persistDraft(harness.db, draftInput(patient.id), format, SAMPLE_SECTIONS);
    const [opening] = harness.db.prepare('SELECT text FROM chat_messages WHERE note_id = ?').all(note.id) as {
      text: string;
    }[];
    expect(opening?.text).not.toContain('Apunta checked the draft');
  });

  it('leaves no note and no transcript when the opening turn cannot be written', () => {
    const before = {
      notes: countRows('notes'),
      transcripts: countRows('transcripts'),
      chat_messages: countRows('chat_messages'),
    };
    failing.chatMessage = true;
    try {
      expect(() => persistDraft(harness.db, draftInput(patient.id), format, SAMPLE_SECTIONS)).toThrow(
        'the disk is full',
      );
    } finally {
      failing.chatMessage = false;
    }

    // Not one of the three writes survives: the note is gone, so its
    // transcripts are not orphaned rows pointing at nothing, and the thread
    // gained no opening turn for a note that does not exist.
    expect(countRows('notes')).toBe(before.notes);
    expect(countRows('transcripts')).toBe(before.transcripts);
    expect(countRows('chat_messages')).toBe(before.chat_messages);
  });
});
