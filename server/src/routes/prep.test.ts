import type { BriefLine, NoteFormat, Note, Patient, SessionBrief } from '@apunta/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { NUM_CTX } from '../ai/ollama.js';
import { approximateTokens, buildComposeBriefPrompt, buildSummariseNotePrompt } from '../ai/prompts.js';
import { listSessionBriefs } from '../db/briefs.js';
import { createTestApp, seedFormat, seedNote, seedPatient, type TestApp } from '../test/harness.js';
import { recordingProviders, type RecordingLlmProvider } from '../test/providers.js';

/**
 * Session prep, end to end.
 *
 * Two properties carry this suite, and neither is visible in the response
 * body: that the notes were read one call at a time, and that the call which
 * composes the briefing was never shown the plan. Both are asserted against
 * what the provider was actually asked.
 */

interface SseEvent {
  readonly name: string;
  readonly data: Record<string, unknown>;
}

function parseSse(body: string): SseEvent[] {
  const events: SseEvent[] = [];
  for (const frame of body.split('\n\n')) {
    const name = /^event: (.+)$/m.exec(frame)?.[1];
    const data = /^data: (.+)$/m.exec(frame)?.[1];
    if (name === undefined || data === undefined) continue;
    events.push({ name, data: JSON.parse(data) as Record<string, unknown> });
  }
  return events;
}

const NOTE = [
  'Subjective: Patient reports improved sleep since last session and decreased frequency of intrusive thoughts.',
  '',
  'Objective: Alert and engaged in session.',
  '',
  'Assessment: Continued progress on anxiety management goals.',
  '',
  'Plan: Continue weekly sessions.',
].join('\n');

let harness: TestApp;
let llm: RecordingLlmProvider;
let patient: Patient;
let format: NoteFormat;

beforeEach(async () => {
  const providers = recordingProviders();
  llm = providers.llm;
  harness = await createTestApp({ providers });
  patient = await seedPatient(harness.app, 'John Smith');
  format = await seedFormat(harness.app);
});

afterEach(async () => {
  await harness.close();
});

async function prep(patientId = patient.id): Promise<SseEvent[]> {
  const response = await harness.app.inject({
    method: 'POST',
    url: `/api/patients/${patientId}/prep`,
    payload: {},
  });
  return parseSse(response.body);
}

describe('POST /api/patients/:id/prep', () => {
  it('has an honest answer for a patient with no notes', async () => {
    const events = await prep();
    const brief = events.at(-1);

    expect(brief?.name).toBe('brief');
    const content = brief?.data['content'] as { lines: BriefLine[]; lookback: { notes_read: number } };
    expect(content.lines).toEqual([]);
    expect(content.lookback.notes_read).toBe(0);
    // Nothing to read means nothing was asked of the model at all.
    expect(llm.summarised).toHaveLength(0);
    expect(llm.compositions).toHaveLength(0);
  });

  it('reads one note and dates every line it produces', async () => {
    const note = await seedNote(harness.app, patient.id, format.id, NOTE);
    const events = await prep();

    expect(llm.summarised).toHaveLength(1);
    expect(llm.compositions).toHaveLength(1);

    const lines = events.filter((event) => event.name === 'line');
    expect(lines.length).toBeGreaterThan(0);
    for (const event of lines) {
      const line = event.data['line'] as BriefLine;
      // Clickable through to the note it came from, which means it has to be
      // a real note of this patient's.
      expect(line.note_id).toBe(note.id);
      expect(line.note_date).toBe(note.created_at);
      expect(line.note_title).toBe(note.title);
      expect(line.text.trim()).not.toBe('');
    }
  });

  /**
   * The whole reason prep is two-stage. One call carrying five notes would be
   * truncated from the head — instructions gone, patient material kept.
   */
  it('summarises each note in its own call, and keeps every call far inside the window', async () => {
    for (let index = 0; index < 4; index += 1) {
      await seedNote(harness.app, patient.id, format.id, NOTE);
    }

    await prep();

    expect(llm.summarised).toHaveLength(4);
    for (const call of llm.summarised) {
      expect(call.noteText).toBe(NOTE);
      const prompt = buildSummariseNotePrompt(call);
      expect(approximateTokens(prompt.system) + approximateTokens(prompt.user)).toBeLessThan(NUM_CTX * 0.75);
    }

    const composition = llm.compositions[0];
    expect(composition).toBeDefined();
    if (composition) {
      const prompt = buildComposeBriefPrompt(composition);
      expect(approximateTokens(prompt.system) + approximateTokens(prompt.user)).toBeLessThan(NUM_CTX * 0.75);
      // The composing call sees summaries, not notes.
      expect(prompt.user).not.toContain(NOTE);
    }
  });

  it('stops at the lookback cap and says how far back it read', async () => {
    const notes: Note[] = [];
    for (let index = 0; index < 7; index += 1) {
      notes.push(await seedNote(harness.app, patient.id, format.id, NOTE));
    }

    const events = await prep();

    expect(llm.summarised).toHaveLength(5);
    const content = events.at(-1)?.data['content'] as {
      lookback: { cap: number; notes_read: number; oldest_note_date: string; newest_note_date: string };
    };
    expect(content.lookback.cap).toBe(5);
    expect(content.lookback.notes_read).toBe(5);
    // Newest first, so the range runs from the fifth-newest to the newest.
    expect(content.lookback.newest_note_date).toBe(notes.at(-1)?.created_at);
    expect(content.lookback.oldest_note_date).toBe(notes[2]?.created_at);
  });

  /**
   * The owner declined having the app draw connections between her plan and
   * her notes, and that covers prep. It is structural: the call that writes
   * the briefing is never shown the plan, so it cannot relate one to the other
   * however it is asked.
   */
  it('never puts the plan in front of the briefing call', async () => {
    await seedNote(harness.app, patient.id, format.id, NOTE);
    const started = await harness.app.inject({
      method: 'POST',
      url: `/api/patients/${patient.id}/plan`,
      payload: {},
    });
    const planId = started.json<{ plan: { id: string } }>().plan.id;
    await harness.app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/goals`,
      payload: { statement: 'John sleeps well enough to get through a workday.' },
    });

    const events = await prep();

    // Not "the plan was in there but it was told to ignore it": the request
    // has no field a plan could travel in, and the goal statement is nowhere
    // in it. (The note's own Assessment says "goals" — that is her prose about
    // the session, which is exactly what prep is for.)
    expect(JSON.stringify(llm.compositions)).not.toContain('John sleeps well enough');
    expect(Object.keys(llm.compositions[0] ?? {})).toEqual(['notes']);
    for (const note of llm.compositions[0]?.notes ?? []) {
      expect(Object.keys(note).sort()).toEqual(['date', 'index', 'points', 'title']);
    }

    // And nothing in the briefing scores, counts or compares.
    const content = events.at(-1)?.data['content'] as { lines: BriefLine[] };
    for (const line of content.lines) {
      expect(Object.keys(line).sort()).toEqual(['note_date', 'note_id', 'note_title', 'text']);
    }
  });

  it('drops a composed line that names a note it was never given', async () => {
    const providers = recordingProviders({
      composeBrief: () => ({
        lines: [
          { note: 0, text: 'Sleeping better since the wind-down routine changed.' },
          { note: 4, text: 'A line about a note that was never read.' },
        ],
      }),
    });
    const stubbed = await createTestApp({ providers });
    try {
      const stubPatient = await seedPatient(stubbed.app, 'John Smith');
      const stubFormat = await seedFormat(stubbed.app);
      await seedNote(stubbed.app, stubPatient.id, stubFormat.id, NOTE);

      const response = await stubbed.app.inject({
        method: 'POST',
        url: `/api/patients/${stubPatient.id}/prep`,
        payload: {},
      });
      const events = parseSse(response.body);
      const content = events.at(-1)?.data['content'] as { lines: BriefLine[] };

      expect(content.lines).toHaveLength(1);
      expect(content.lines[0]?.text).toContain('wind-down routine');
    } finally {
      await stubbed.close();
    }
  });

  /** A briefing is ephemeral by default: generating one writes nothing. */
  it('persists nothing at all', async () => {
    await seedNote(harness.app, patient.id, format.id, NOTE);
    await prep();
    await prep();

    expect(listSessionBriefs(harness.db, patient.id)).toEqual([]);
  });

  it('reports an AI failure inside the stream, carrying no note content', async () => {
    const providers = recordingProviders({
      composeBrief: () => {
        throw new Error('the model fell over');
      },
    });
    const stubbed = await createTestApp({ providers });
    try {
      const stubPatient = await seedPatient(stubbed.app, 'John Smith');
      const stubFormat = await seedFormat(stubbed.app);
      await seedNote(stubbed.app, stubPatient.id, stubFormat.id, NOTE);

      const response = await stubbed.app.inject({
        method: 'POST',
        url: `/api/patients/${stubPatient.id}/prep`,
        payload: {},
      });
      const failure = parseSse(response.body).at(-1);

      expect(failure?.name).toBe('error');
      expect(String(failure?.data['message'])).not.toContain('intrusive thoughts');
      expect(listSessionBriefs(stubbed.db, stubPatient.id)).toEqual([]);
    } finally {
      await stubbed.close();
    }
  });
});

describe('POST /api/patients/:id/prep/save', () => {
  it('keeps the briefing she chose, and only then', async () => {
    await seedNote(harness.app, patient.id, format.id, NOTE);
    const events = await prep();
    const brief = events.at(-1)?.data as { generated_at: string; content: unknown };

    expect(listSessionBriefs(harness.db, patient.id)).toEqual([]);

    const response = await harness.app.inject({
      method: 'POST',
      url: `/api/patients/${patient.id}/prep/save`,
      payload: brief,
    });

    expect(response.statusCode).toBe(201);
    const saved = response.json<SessionBrief>();
    expect(saved.saved).toBe(true);
    expect(saved.source_note_ids.length).toBeGreaterThan(0);

    const listed = await harness.app.inject({ method: 'GET', url: `/api/patients/${patient.id}/prep` });
    expect(listed.json<{ briefs: SessionBrief[] }>().briefs).toHaveLength(1);
  });

  it('refuses a briefing citing a note that is not this patient’s', async () => {
    const other = await seedPatient(harness.app, 'Maria Ruiz');
    const otherNote = await seedNote(harness.app, other.id, format.id, NOTE);

    const response = await harness.app.inject({
      method: 'POST',
      url: `/api/patients/${patient.id}/prep/save`,
      payload: {
        generated_at: '2026-08-23T09:00:00.000Z',
        content: {
          lines: [
            {
              note_id: otherNote.id,
              note_date: otherNote.created_at,
              note_title: otherNote.title,
              text: 'Something from someone else’s chart.',
            },
          ],
          lookback: {
            cap: 5,
            notes_read: 1,
            oldest_note_date: otherNote.created_at,
            newest_note_date: otherNote.created_at,
            skipped_note_ids: [],
          },
        },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(listSessionBriefs(harness.db, patient.id)).toEqual([]);
  });
});

describe('POST /api/patients/:id/prep over a real connection', () => {
  it('streams the briefing to a client that is actually connected', async () => {
    await seedNote(harness.app, patient.id, format.id, NOTE);
    const address = await harness.app.listen({ port: 0, host: '127.0.0.1' });

    try {
      const response = await fetch(`${address}/api/patients/${patient.id}/prep`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');

      const events = parseSse(await response.text());
      // `app.inject` opens no socket: this is the only test that would catch a
      // stream that comes back empty over a real one.
      expect(events.length).toBeGreaterThan(0);
      expect(events.some((event) => event.name === 'line')).toBe(true);
      expect(events.at(-1)?.name).toBe('brief');
    } finally {
      await harness.app.close();
    }
  });
});
