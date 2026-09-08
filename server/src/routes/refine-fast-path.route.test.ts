import type { Note, NoteFormat, Patient } from '@apunta/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FakeLlmProvider, FakeSttProvider } from '../ai/fake.js';
import type { RefineNoteRequest, LlmEvent } from '../ai/types.js';
import { getNote, setNotePublished } from '../db/notes.js';
import { createTestApp, seedFormat, seedNote, seedPatient, type TestApp } from '../test/harness.js';

interface SseEvent {
  readonly name: string;
  readonly data: Record<string, unknown>;
}

function parseSse(body: string): SseEvent[] {
  return body.split('\n\n').flatMap((frame) => {
    const name = /^event: (.+)$/m.exec(frame)?.[1];
    const data = /^data: (.+)$/m.exec(frame)?.[1];
    return name === undefined || data === undefined
      ? []
      : [{ name, data: JSON.parse(data) as Record<string, unknown> }];
  });
}

class RecordingLlmProvider extends FakeLlmProvider {
  refineCalls = 0;

  override async *refineNote(request: RefineNoteRequest): AsyncIterable<LlmEvent> {
    this.refineCalls += 1;
    yield* super.refineNote(request);
  }
}

const PHRASE = 'Patient denies SI and slept 6 hours on June 4, 2026.';
const NOTE_TEXT = [
  `Subjective: ${PHRASE} Mood improving.`,
  'Objective: Alert and engaged.',
  'Assessment: Continued progress.',
  'Plan: Continue weekly sessions.',
].join('\n\n');

let harness: TestApp;
let patient: Patient;
let format: NoteFormat;
let llm: RecordingLlmProvider;

beforeAll(async () => {
  llm = new RecordingLlmProvider({ streamDelayMs: 0 });
  harness = await createTestApp({ providers: { llm, stt: new FakeSttProvider() } });
  patient = await seedPatient(harness.app, 'Fast path test patient');
  format = await seedFormat(harness.app);
});

afterAll(async () => {
  await harness.close();
});

async function chat(note: Note, message: string): Promise<SseEvent[]> {
  const response = await harness.app.inject({
    method: 'POST',
    url: `/api/notes/${note.id}/chat`,
    payload: { message },
  });
  expect(response.statusCode).toBe(200);
  return parseSse(response.body);
}

async function freshNote(content = NOTE_TEXT): Promise<Note> {
  return seedNote(harness.app, patient.id, format.id, content);
}

describe('move-only fast path over chat route', () => {
  it('does not call the provider and preserves busy, applied-note, reply ordering', async () => {
    const note = await freshNote();
    const events = await chat(note, `Move "${PHRASE}" from Subjective to Plan`);
    const names = events.map((event) => event.name);

    expect(llm.refineCalls).toBe(0);
    expect(names[0]).toBe('message');
    expect(names[1]).toBe('status');
    expect(names.indexOf('note-updated')).toBeGreaterThan(names.indexOf('status'));
    expect(names.indexOf('message', 1)).toBeGreaterThan(names.indexOf('note-updated'));
    expect(events.find((event) => event.name === 'status')?.data['message']).toBe('Applying the move…');
    expect(events.find((event) => event.name === 'token')?.data['text']).toBe(
      'Moved the quoted text from Subjective to Plan.',
    );
  });

  it('moves verbatim, keeps unrelated sections byte-for-byte, and writes one note update', async () => {
    const note = await freshNote();
    const before = note.content;
    const events = await chat(note, `Move “${PHRASE}” from the Subjective section to the Plan section.`);
    const update = events.find((event) => event.name === 'note-updated');
    const updated = update?.data['note'] as Note | undefined;

    expect(updated).toBeDefined();
    expect(updated?.content).toContain(`Plan: Continue weekly sessions. ${PHRASE}`);
    expect(updated?.content).toContain('Subjective: Mood improving.');
    expect(updated?.content).toContain('Objective: Alert and engaged.');
    expect(updated?.content).toContain('Assessment: Continued progress.');
    expect(updated?.content?.match(/Patient denies SI and slept 6 hours on June 4, 2026\./g)).toHaveLength(1);
    expect(updated?.content).not.toBe(before);
    expect(getNote(harness.db, note.id)?.content).toBe(updated?.content);
  });

  it.each([
    'Move "not present" from Subjective to Plan',
    'Can you move "Patient denies SI and slept 6 hours on June 4, 2026." from Subjective to Plan?',
    'Do not move "Patient denies SI and slept 6 hours on June 4, 2026." from Subjective to Plan',
    'Move "Patient denies SI and slept 6 hours on June 4, 2026." from Subjective to Plan and make it formal',
    'Move "Patient denies SI and slept 6 hours on June 4, 2026." from Missing to Plan',
  ])('falls back to the existing LLM path for %s', async (message) => {
    const note = await freshNote();
    const callsBefore = llm.refineCalls;
    const events = await chat(note, message);

    expect(llm.refineCalls).toBe(callsBefore + 1);
    expect(events.find((event) => event.name === 'status')?.data['message']).not.toBe('Applying the move…');
  });

  it('never shortcuts clinical review or an unsupported question', async () => {
    for (const message of ['Review this clinically', 'What does this note say about risk?']) {
      const note = await freshNote();
      const callsBefore = llm.refineCalls;
      await chat(note, message);
      expect(llm.refineCalls).toBe(callsBefore + 1);
    }
  });

  it('does not shortcut a published note and leaves its content locked', async () => {
    const note = await freshNote();
    setNotePublished(harness.db, note.id, true);
    const callsBefore = llm.refineCalls;
    const events = await chat(note, `Move "${PHRASE}" from Subjective to Plan`);

    expect(llm.refineCalls).toBe(callsBefore);
    expect(events.map((event) => event.name)).not.toContain('status');
    expect(events.map((event) => event.name)).not.toContain('note-updated');
    expect(getNote(harness.db, note.id)?.content).toBe(NOTE_TEXT);
  });

  it('still accepts a move containing protected numbers and negation facts', async () => {
    const note = await freshNote();
    const events = await chat(note, `Move "${PHRASE}" from Subjective to Assessment`);

    expect(events.map((event) => event.name)).toContain('note-updated');
    const updated = events.find((event) => event.name === 'note-updated')?.data['note'] as Note;
    expect(updated.content).toContain(`Assessment: Continued progress. ${PHRASE}`);
    expect(updated.content).not.toContain(`Subjective: ${PHRASE}`);
  });
});
