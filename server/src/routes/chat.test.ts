import {
  FIRST_PASS_MESSAGE,
  PUBLISHED_REFUSAL,
  approximateTokens,
  type ChatMessage,
  type Note,
  type NoteFormat,
  type Patient,
} from '@apunta/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FakeLlmProvider, FakeSttProvider } from '../ai/fake.js';
import { aiError } from '../ai/errors.js';
import type { LlmEvent, RefineNoteRequest } from '../ai/types.js';
import { listChatMessagesForNote } from '../db/chat-messages.js';
import { getNote, setNotePublished } from '../db/notes.js';
import { createTranscript } from '../db/transcripts.js';
import { REFINE_PROMPT_TOKENS } from '../ai/ollama.js';
import { buildRefinePrompt, REFINE_BACKGROUND_END, REFINE_BACKGROUND_REMINDER } from '../ai/prompts.js';
import { createTestApp, seedFormat, seedNote, seedPatient, type TestApp } from '../test/harness.js';
import { recordingProviders } from '../test/providers.js';
import { REFINE_BACKGROUND_TOKENS, UNCHANGED_NOTICE, withoutServerSentences } from './chat.js';

/**
 * `POST /api/notes/:id/chat` against a real SQLite file and the fake provider.
 *
 * The fake's canned refine logic mirrors the prototype's, so the messages the
 * tests send are the ones the prototype's own `sendChat` branches on: anything
 * mentioning "plan" rewrites the Plan section, and anything with a question
 * mark that mentions neither plan nor sleep is answered without a rewrite.
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

async function chat(
  app: FastifyInstance,
  noteId: string,
  payload: Record<string, unknown>,
): Promise<{ statusCode: number; events: SseEvent[] }> {
  const response = await app.inject({ method: 'POST', url: `/api/notes/${noteId}/chat`, payload });
  return { statusCode: response.statusCode, events: parseSse(response.body) };
}

/** Every `message` event, in order — the user's turn then the assistant's. */
function messages(events: SseEvent[]): ChatMessage[] {
  return events
    .filter((event) => event.name === 'message')
    .map((event) => event.data['message'] as ChatMessage);
}

function assistantReply(events: SseEvent[]): string {
  return messages(events).find((message) => message.role === 'assistant')?.text ?? '';
}

function noteUpdated(events: SseEvent[]): SseEvent | undefined {
  return events.findLast((event) => event.name === 'note-updated');
}

const NOTE_TEXT = [
  'Subjective: Patient reports improved sleep since last session.',
  'Objective: Alert and engaged in session.',
  'Assessment: Continued progress on anxiety management goals.',
  'Plan: Continue weekly sessions. Introduce grounding exercises for use between sessions.',
].join('\n\n');

/** A note with a fact in Subjective's second sentence — what the fake's "shorter" branch drops. */
const FACT_NOTE = [
  'Subjective: Patient reports improved sleep since last session. Up from four hours a night in June.',
  'Objective: Alert and engaged in session.',
  'Assessment: Continued progress on anxiety management goals.',
  'Plan: Continue weekly sessions. Introduce grounding exercises for use between sessions.',
].join('\n\n');

/** The same shape with nothing in the second sentence a lock should mind losing. */
const CHATTY_NOTE = FACT_NOTE.replace('Up from four hours a night in June.', 'Feels hopeful about work.');

let harness: TestApp;
let patient: Patient;
let format: NoteFormat;

/**
 * Each note gets a patient of its own: the refine chat reads a patient's
 * other notes as background, and the prior-note lock would otherwise judge
 * one test's rewrite against notes another test left behind.
 */
async function freshNote(content = NOTE_TEXT): Promise<Note> {
  const own = await seedPatient(harness.app, 'John Smith');
  return seedNote(harness.app, own.id, format.id, content);
}

async function publish(noteId: string): Promise<void> {
  await harness.app.inject({ method: 'POST', url: `/api/notes/${noteId}/publish` });
}

beforeAll(async () => {
  harness = await createTestApp();
  patient = await seedPatient(harness.app, 'John Smith');
  format = await seedFormat(harness.app);
});

afterAll(async () => {
  await harness.close();
});

describe('POST /api/notes/:id/chat — refining a draft', () => {
  it('streams reply tokens, rewrites the note, and persists both turns', async () => {
    const note = await freshNote();

    const { statusCode, events } = await chat(harness.app, note.id, { message: 'Make the plan shorter' });

    expect(statusCode).toBe(200);
    const names = events.map((event) => event.name);
    expect(names).toContain('token');
    expect(names.at(-2)).toBe('token');
    expect(names.at(-1)).toBe('message');
    expect(names.lastIndexOf('note-updated')).toBeLessThan(names.lastIndexOf('message'));
    expect(names).not.toContain('error');

    // The reply streams as prose, never as the JSON the model actually emits.
    const streamed = events
      .filter((event) => event.name === 'token')
      .map((event) => String(event.data['text']))
      .join('');
    expect(streamed).toBe('Shortened the Plan section.');
    expect(streamed).not.toContain('{"');

    const updated = noteUpdated(events)?.data['note'] as Note;
    expect(updated.content).toContain('Plan: Continue weekly sessions and grounding exercises.');
    expect(updated.content).not.toContain('Introduce grounding exercises');
    // Untouched sections come back verbatim.
    expect(updated.content).toContain('Subjective: Patient reports improved sleep since last session.');

    // …and that is what is in the database, with `updated_at` moved on.
    const stored = getNote(harness.db, note.id);
    expect(stored?.content).toBe(updated.content);
    expect(stored?.updated_at).not.toBe(note.updated_at);

    const thread = listChatMessagesForNote(harness.db, note.id);
    expect(thread.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(thread[0]?.text).toBe('Make the plan shorter');
    expect(thread[1]?.text).toBe('Shortened the Plan section.');
  });

  it('waits for a delayed provider, then emits the committed note before edit completion', async () => {
    let release!: () => void;
    const providerReady = new Promise<void>((resolve) => {
      release = resolve;
    });
    class DelayedLlmProvider extends FakeLlmProvider {
      override async *refineNote(request: RefineNoteRequest): AsyncIterable<LlmEvent> {
        yield { type: 'status', stage: 'drafting', message: 'Thinking…' };
        await providerReady;
        yield* super.refineNote(request);
      }
    }

    const local = await createTestApp({
      providers: { llm: new DelayedLlmProvider(), stt: new FakeSttProvider() },
    });
    try {
      const localPatient = await seedPatient(local.app, 'John Smith');
      const localFormat = await seedFormat(local.app);
      const note = await seedNote(local.app, localPatient.id, localFormat.id, NOTE_TEXT);
      const pending = chat(local.app, note.id, { message: 'Make the plan shorter' });

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(getNote(local.db, note.id)?.content).toBe(NOTE_TEXT);
      release();

      const { events } = await pending;
      const names = events.map((event) => event.name);
      const updateIndex = names.indexOf('note-updated');
      const tokenIndex = names.indexOf('token');
      const assistantIndex = names.indexOf('message', names.indexOf('message') + 1);
      expect(updateIndex).toBeGreaterThan(-1);
      expect(updateIndex).toBeLessThan(tokenIndex);
      expect(updateIndex).toBeLessThan(assistantIndex);
      expect((noteUpdated(events)?.data['note'] as Note).content).toContain(
        'Continue weekly sessions and grounding exercises.',
      );
    } finally {
      await local.close();
    }
  });

  it('drops buffered edit success when a delayed provider fails', async () => {
    class FailingLlmProvider extends FakeLlmProvider {
      override async *refineNote(_request: RefineNoteRequest): AsyncIterable<LlmEvent> {
        yield { type: 'token', section: 'reply', text: 'Fixed the note.' };
        throw aiError('ollama_error', 'synthetic delayed failure');
      }
    }

    const local = await createTestApp({
      providers: { llm: new FailingLlmProvider(), stt: new FakeSttProvider() },
    });
    try {
      const localPatient = await seedPatient(local.app, 'John Smith');
      const localFormat = await seedFormat(local.app);
      const note = await seedNote(local.app, localPatient.id, localFormat.id, NOTE_TEXT);
      const { events } = await chat(local.app, note.id, { message: 'Make the plan shorter' });

      expect(events.map((event) => event.name)).toContain('error');
      expect(events.map((event) => event.name)).not.toContain('token');
      expect(events.map((event) => event.name)).not.toContain('note-updated');
      expect(messages(events).map((message) => message.role)).toEqual(['user']);
      expect(getNote(local.db, note.id)?.content).toBe(NOTE_TEXT);
    } finally {
      await local.close();
    }
  });

  it('echoes the persisted user turn before the assistant answers', async () => {
    const note = await freshNote();

    const { events } = await chat(harness.app, note.id, { message: 'Make the plan shorter' });

    const sent = messages(events);
    expect(sent[0]?.role).toBe('user');
    expect(sent[0]?.note_id).toBe(note.id);
    expect(sent.at(-1)?.role).toBe('assistant');
    // The user's row arrives before the first token, so the browser can swap
    // its optimistic bubble for the real one while the reply is still coming.
    const firstMessage = events.findIndex((event) => event.name === 'message');
    expect(firstMessage).toBeLessThan(events.findIndex((event) => event.name === 'token'));
  });

  it('persists a highlighted excerpt and echoes it back', async () => {
    const note = await freshNote();
    const quote = 'Plan: Continue weekly sessions.';

    const { events } = await chat(harness.app, note.id, { message: 'Tighten the plan', ref_quote: quote });

    expect(messages(events)[0]?.ref_quote).toBe(quote);
    const thread = listChatMessagesForNote(harness.db, note.id);
    expect(thread[0]?.ref_quote).toBe(quote);
    // The assistant's own row carries no quote — it is hers, not its.
    expect(thread[1]?.ref_quote).toBeNull();
  });

  it('answers a question without touching the note', async () => {
    const note = await freshNote();

    const { events } = await chat(harness.app, note.id, { message: 'What does this say about her mood?' });

    expect(events.map((event) => event.name)).not.toContain('note-updated');
    expect(assistantReply(events)).toContain('Based on the note');
    expect(getNote(harness.db, note.id)?.content).toBe(NOTE_TEXT);
  });

  /**
   * A question never edits, even on a draft. "Can you shorten the plan?" reads
   * to the model as an instruction and comes back with a rewrite attached — the
   * fake returns exactly that, as it does for the published-lock case below.
   * The server discards the rewrite: a message she asked rather than instructed
   * must not silently overwrite the note.
   */
  it('never applies a rewrite the model attaches to a question', async () => {
    const note = await freshNote();

    const { events } = await chat(harness.app, note.id, { message: 'Can you shorten the plan?' });

    expect(events.map((event) => event.name)).not.toContain('note-updated');
    expect(getNote(harness.db, note.id)?.content).toBe(NOTE_TEXT);
    // The reply still reaches her — she only asked a question.
    expect(assistantReply(events)).not.toBe('');
    // …and the no-change sentence is not appended: a question is allowed to
    // leave the note alone without the server remarking on it.
    expect(assistantReply(events)).not.toContain(UNCHANGED_NOTICE);
  });

  it('refines whatever the editor currently shows, not what was drafted', async () => {
    const note = await freshNote();
    const handEdited = NOTE_TEXT.replace(
      'Objective: Alert and engaged in session.',
      'Objective: Alert and engaged. She had walked here in the rain.',
    );
    await harness.app.inject({
      method: 'PATCH',
      url: `/api/notes/${note.id}`,
      payload: { content: handEdited },
    });

    const { events } = await chat(harness.app, note.id, { message: 'Make the plan shorter' });

    const updated = noteUpdated(events)?.data['note'] as Note;
    // The sentence she typed a moment ago is in the revision, which it could
    // only be if the *current* note went to the model rather than the draft.
    expect(updated.content).toContain('She had walked here in the rain.');
    expect(updated.content).toContain('Plan: Continue weekly sessions and grounding exercises.');
  });

  it('carries an empty section through a rewrite and reports it', async () => {
    const note = await freshNote(
      ['Subjective: Improved sleep.', 'Objective:', 'Assessment: Progressing.', 'Plan: Weekly.'].join('\n\n'),
    );

    const { events } = await chat(harness.app, note.id, { message: 'Make the plan shorter' });

    const final = noteUpdated(events);
    expect(final?.name).toBe('note-updated');
    expect(final?.data['empty_sections']).toEqual(['Objective']);
    // The header still travels: she fills the blank in on the far side.
    expect(String((final?.data['note'] as Note).content)).toContain('Objective:');
  });

  /**
   * The boilerplate lock, end to end. The fake's "clinical tone" branch
   * replays M10's live incident — injecting "Alert and oriented" into
   * Objective — and the route is expected to revert it, append the server's
   * own sentence to the reply, and leave the note untouched.
   */
  it('blocks a revision that invents boilerplate, and says so in the reply', async () => {
    const note = await freshNote();

    const { events } = await chat(harness.app, note.id, { message: 'Use a more clinical tone' });

    const reply = assistantReply(events);
    expect(reply).toContain('Apunta blocked part of this revision.');
    expect(reply).toContain('Objective was kept as it was');
    expect(reply).toContain('"Alert and oriented"');

    // The only changed section was the blocked one, so the note is untouched
    // and no note-updated event goes out.
    expect(events.map((event) => event.name)).not.toContain('note-updated');
    expect(getNote(harness.db, note.id)?.content).toBe(NOTE_TEXT);
  });

  it('lets boilerplate through when her own message asked for it in those words', async () => {
    const note = await freshNote();

    // Her request contains the phrase, so it is her writing, not the model's
    // invention — the fake's clinical branch injects it and the lock must
    // let her words through.
    const { events } = await chat(harness.app, note.id, {
      message: 'Make it formal, and note he was alert and oriented',
    });

    expect(assistantReply(events)).not.toContain('Apunta blocked');
    expect(getNote(harness.db, note.id)?.content).toContain('Alert and oriented.');
  });

  it('lets the same boilerplate through when her stored dictation contains it', async () => {
    const note = await freshNote();
    createTranscript(harness.db, {
      note_id: note.id,
      source: 'audio',
      raw_text: 'He was alert and oriented today, tracked everything I said.',
    });

    const { events } = await chat(harness.app, note.id, { message: 'Use a more clinical tone' });

    expect(assistantReply(events)).not.toContain('Apunta blocked');
    expect(events.map((event) => event.name)).toContain('note-updated');
    expect(getNote(harness.db, note.id)?.content).toContain('Alert and oriented.');
  });

  /**
   * The fact lock, end to end. The fake's "shorter" branch replays the refine
   * harness's 2026-09-01 finding — shortening Subjective to its first sentence
   * and calling the rest unsourced — and the route is expected to keep the
   * section when the dropped sentence held a fact, say so in its own words
   * under the model's, and leave the note untouched.
   */
  it('keeps a section that a shortening would strip a fact from, and says so', async () => {
    const note = await freshNote(FACT_NOTE);

    const { events } = await chat(harness.app, note.id, { message: 'Make it shorter' });

    const reply = assistantReply(events);
    expect(reply).toContain('Apunta held back part of this revision.');
    expect(reply).toContain('Subjective was kept as it was');
    expect(reply).toContain('"four hours a night in June"');
    // The lock's notice is the explanation; the no-change line would only repeat it.
    expect(reply).not.toContain(UNCHANGED_NOTICE);
    expect(events.map((event) => event.name)).not.toContain('note-updated');
    expect(getNote(harness.db, note.id)?.content).toBe(FACT_NOTE);
  });

  it('lets the shortening through when there was no fact to lose', async () => {
    const note = await freshNote(CHATTY_NOTE);

    const { events } = await chat(harness.app, note.id, { message: 'Make it shorter' });

    expect(assistantReply(events)).not.toContain('Apunta held back');
    expect(events.map((event) => event.name)).toContain('note-updated');
    expect(getNote(harness.db, note.id)?.content).not.toContain('Feels hopeful about work.');
  });

  it('lets a fact go when she asks for the removal in so many words', async () => {
    const note = await freshNote(FACT_NOTE);

    const { events } = await chat(harness.app, note.id, {
      message: 'Make it shorter — take out the June comparison',
    });

    expect(assistantReply(events)).not.toContain('Apunta held back');
    expect(getNote(harness.db, note.id)?.content).not.toContain('four hours a night in June');
  });

  it('does not treat a highlighted passage as permission to lose what it says', async () => {
    const note = await freshNote(FACT_NOTE);

    const { events } = await chat(harness.app, note.id, {
      message: 'Make it shorter',
      ref_quote: 'Up from four hours a night in June.',
    });

    expect(assistantReply(events)).toContain('Apunta held back part of this revision.');
    expect(getNote(harness.db, note.id)?.content).toBe(FACT_NOTE);
  });

  /**
   * Seen live on 2026-09-04: asked to shorten a second time, the model
   * returned no revision and repeated, word for word, its earlier claim to
   * have removed a sentence. The fake's default branch is the same shape — a
   * reply that says "Updated" over identical sections — and the route has to
   * put the true thing under it.
   */
  it('says so when an instruction changed nothing, so the reply cannot claim an edit', async () => {
    const note = await freshNote();

    const { events } = await chat(harness.app, note.id, { message: 'Tidy this up a little' });

    expect(assistantReply(events)).toContain(UNCHANGED_NOTICE);
    expect(events.map((event) => event.name)).not.toContain('note-updated');
    expect(getNote(harness.db, note.id)?.content).toBe(NOTE_TEXT);
  });

  it('lets a question change nothing without remarking on it', async () => {
    const note = await freshNote();

    const { events } = await chat(harness.app, note.id, { message: 'Is the assessment clear enough?' });

    expect(assistantReply(events)).not.toContain(UNCHANGED_NOTICE);
  });

  it('strips every server sentence from a reply before it goes back as history', () => {
    // The model is never told about the locks; a notice in its own history
    // is exactly that telling, and it fed the live failure above.
    const reply = 'Shortened the Subjective section.';
    expect(
      withoutServerSentences(
        `${reply}\n\nApunta held back part of this revision. Subjective was kept as it was.`,
      ),
    ).toBe(reply);
    expect(
      withoutServerSentences(
        `${reply}\n\nApunta blocked part of this revision. Objective was kept as it was.`,
      ),
    ).toBe(reply);
    expect(withoutServerSentences(`${reply}\n\n${UNCHANGED_NOTICE}`)).toBe(reply);
    expect(
      withoutServerSentences(
        `${reply}\n\nApunta applied the corrections you made as you spoke, before drafting: left out “four hours”.`,
      ),
    ).toBe(reply);
    expect(
      withoutServerSentences(
        `${reply}\n\nApunta kept your other notes out of this revision. Plan was kept as it was.`,
      ),
    ).toBe(reply);
    expect(withoutServerSentences(reply)).toBe(reply);
    // A model sentence that merely mentions Apunta is not a server sentence.
    expect(withoutServerSentences('Apunta already has that in the Plan section.')).toBe(
      'Apunta already has that in the Plan section.',
    );
  });

  it('sends the recent thread back as history on the next turn', async () => {
    const note = await freshNote();

    await chat(harness.app, note.id, { message: 'Make the plan shorter' });
    await chat(harness.app, note.id, { message: 'And is that clear enough now?' });

    const thread = listChatMessagesForNote(harness.db, note.id);
    expect(thread.map((message) => message.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
  });
});

/**
 * Her other notes as read-only background (2026-09-21): she can ask how this
 * session compares with the last, and nothing from them enters this note
 * unless she asks. All sessions are synthetic.
 */
describe('POST /api/notes/:id/chat — her other notes as background', () => {
  const EARLIER =
    'Subjective: Sister Maria visited from Denver for a week.\n\nAssessment: Mood lower in the week of the move.';
  const EARLIEST = 'Subjective: First session. Sleeping four hours.';
  const GAPPY = NOTE_TEXT.replace(
    'Assessment: Continued progress on anxiety management goals.',
    'Assessment:',
  );

  async function history(
    app: FastifyInstance,
    content: string,
    noteFormat: NoteFormat = format,
  ): Promise<{ earliest: Note; earlier: Note; current: Note; other: Note }> {
    const own = await seedPatient(app, 'John Smith');
    const someoneElse = await seedPatient(app, 'Jane Doe');
    const earliest = await seedNote(app, own.id, noteFormat.id, EARLIEST);
    const earlier = await seedNote(app, own.id, noteFormat.id, EARLIER);
    const current = await seedNote(app, own.id, noteFormat.id, content);
    const other = await seedNote(app, someoneElse.id, noteFormat.id, 'Subjective: Someone else entirely.');
    return { earliest, earlier, current, other };
  }

  /** Pin created_at, so "newest first" does not depend on the clock's resolution. */
  function date(local: TestApp, note: Note, day: string): void {
    local.db
      .prepare('UPDATE notes SET created_at = ? WHERE id = ?')
      .run(`2026-09-${day}T09:00:00.000Z`, note.id);
  }

  it("gives the model the patient's other notes, newest first — never this note, never another patient's", async () => {
    const providers = recordingProviders();
    const local = await createTestApp({ providers });
    try {
      const notes = await history(local.app, NOTE_TEXT, await seedFormat(local.app));
      date(local, notes.earliest, '04');
      date(local, notes.earlier, '11');
      date(local, notes.current, '18');

      await chat(local.app, notes.current.id, { message: 'Make it shorter' });

      const sent = providers.llm.refines.at(-1);
      expect(sent?.priorNotes?.map((prior) => prior.text)).toEqual([EARLIER, EARLIEST]);
      expect(sent?.priorNotes?.map((prior) => prior.date)).toEqual(['2026-09-11', '2026-09-04']);
      expect(sent?.noteDate).toBe('2026-09-18');
      expect(sent?.noteText).toBe(NOTE_TEXT);

      // The prompt the provider builds from it: fenced, and the rule restated
      // beside this ordinary edit request.
      const prompt = buildRefinePrompt(sent as RefineNoteRequest);
      expect(prompt.user.indexOf(EARLIER)).toBeLessThan(prompt.user.indexOf(REFINE_BACKGROUND_END));
      expect(prompt.user.indexOf(REFINE_BACKGROUND_REMINDER)).toBeGreaterThan(
        prompt.user.indexOf('She says:\n\nMake it shorter'),
      );
      expect(prompt.user).not.toContain('Someone else entirely');
    } finally {
      await local.close();
    }
  });

  it('sends no background at all for a patient with one note', async () => {
    const providers = recordingProviders();
    const local = await createTestApp({ providers });
    try {
      const localFormat = await seedFormat(local.app);
      const own = await seedPatient(local.app, 'John Smith');
      const only = await seedNote(local.app, own.id, localFormat.id, NOTE_TEXT);
      await chat(local.app, only.id, { message: 'Make it shorter' });
      expect(providers.llm.refines.at(-1)?.priorNotes).toBeUndefined();
    } finally {
      await local.close();
    }
  });

  it('holds back a section filled from another note, and says so', async () => {
    const notes = await history(harness.app, GAPPY);

    // The fake's "fill" copies from the newest other note — the failure this
    // lock exists for, on demand.
    const { events } = await chat(harness.app, notes.current.id, { message: 'Fill in the gaps' });

    const reply = assistantReply(events);
    expect(reply).toContain('Apunta kept your other notes out of this revision.');
    expect(reply).toContain('To bring something over from another session, ask for it.');
    expect(events.map((event) => event.name)).not.toContain('note-updated');
    expect(getNote(harness.db, notes.current.id)?.content).toBe(GAPPY);
    // …and the model never sees the notice.
    await chat(harness.app, notes.current.id, { message: 'Is the plan clear?' });
    const last = listChatMessagesForNote(harness.db, notes.current.id).at(-3);
    expect(withoutServerSentences(last?.text ?? '')).not.toContain('Apunta kept');
  });

  it('lets it through when she asks to bring it over from another session', async () => {
    const notes = await history(harness.app, GAPPY);

    const { events } = await chat(harness.app, notes.current.id, {
      message: 'Fill in the gaps: bring it over from the last session',
    });

    expect(assistantReply(events)).not.toContain('Apunta kept your other notes');
    expect(noteUpdated(events)).toBeDefined();
    expect(getNote(harness.db, notes.current.id)?.content).toContain('Sister Maria visited from Denver');
  });

  it('answers a question about last session from the background, and changes nothing', async () => {
    const notes = await history(harness.app, NOTE_TEXT);

    const { events } = await chat(harness.app, notes.current.id, {
      message: 'How does this compare to last session?',
    });

    expect(assistantReply(events)).toContain('as background');
    expect(events.map((event) => event.name)).not.toContain('note-updated');
    expect(getNote(harness.db, notes.current.id)?.content).toBe(NOTE_TEXT);
  });

  it('budgets the background last: the note and the whole thread always go, the other notes get what is left', async () => {
    const providers = recordingProviders();
    const local = await createTestApp({ providers });
    try {
      const localFormat = await seedFormat(local.app);
      const own = await seedPatient(local.app, 'John Smith');
      for (let index = 0; index < 12; index += 1) {
        await seedNote(
          local.app,
          own.id,
          format.id,
          `Subjective: Earlier session ${String(index)}. ${'Slept better. '.repeat(120)}`,
        );
      }
      const longNote = `Subjective: ${'This session in detail. '.repeat(900)}`;
      const current = await seedNote(local.app, own.id, localFormat.id, longNote);
      // A long thread first, all of it kept as history.
      for (let index = 0; index < 5; index += 1) {
        await chat(local.app, current.id, { message: `Question ${String(index)}? ${'x '.repeat(400)}` });
      }
      await chat(local.app, current.id, { message: 'Make it shorter' });

      const sent = providers.llm.refines.at(-1) as RefineNoteRequest;
      expect(sent.noteText).toBe(longNote);
      expect(sent.history).toHaveLength(10);
      const prompt = buildRefinePrompt(sent);
      expect(approximateTokens(prompt.system) + approximateTokens(prompt.user)).toBeLessThanOrEqual(
        REFINE_PROMPT_TOKENS,
      );
      const background = (sent.priorNotes ?? []).length;
      expect(background).toBeLessThan(12);

      // With room to spare, the background still stops at its own cap.
      const roomy = await seedNote(local.app, own.id, localFormat.id, NOTE_TEXT);
      await chat(local.app, roomy.id, { message: 'Make it shorter' });
      const roomySent = providers.llm.refines.at(-1) as RefineNoteRequest;
      const cost = (roomySent.priorNotes ?? []).reduce(
        (total, prior) =>
          total + approximateTokens(`### ${prior.title} (${prior.date})\n\n${prior.text}`) + 1,
        0,
      );
      expect(cost).toBeLessThanOrEqual(REFINE_BACKGROUND_TOKENS);
      expect((roomySent.priorNotes ?? []).length).toBeGreaterThan(background);
    } finally {
      await local.close();
    }
  });
});

describe('POST /api/notes/:id/chat — the published lock', () => {
  it('refuses an edit in the prototype’s words and leaves the note alone', async () => {
    const note = await freshNote();
    await publish(note.id);

    const { events } = await chat(harness.app, note.id, { message: 'Make the plan shorter' });

    expect(events.map((event) => event.name)).not.toContain('note-updated');
    expect(assistantReply(events)).toBe(PUBLISHED_REFUSAL);

    const stored = getNote(harness.db, note.id);
    expect(stored?.content).toBe(NOTE_TEXT);
    expect(stored?.status).toBe('published');
  });

  it('still answers a question about a published note', async () => {
    const note = await freshNote();
    await publish(note.id);

    const { events } = await chat(harness.app, note.id, { message: 'What does this say about her mood?' });

    expect(assistantReply(events)).toContain('Based on the note');
    expect(assistantReply(events)).not.toBe(PUBLISHED_REFUSAL);
    expect(getNote(harness.db, note.id)?.content).toBe(NOTE_TEXT);
  });

  it('refuses when a question turns out to be an edit request in disguise', async () => {
    const note = await freshNote();
    await publish(note.id);

    // The fake reads "plan" as an instruction and returns a rewrite, exactly
    // as a real model would for "shorten the plan, is that ok?".
    const { events } = await chat(harness.app, note.id, { message: 'Can you shorten the plan?' });

    expect(assistantReply(events)).toBe(PUBLISHED_REFUSAL);
    expect(events.map((event) => event.name)).not.toContain('note-updated');
    expect(getNote(harness.db, note.id)?.content).toBe(NOTE_TEXT);
  });

  it('records the refusal in the thread, so a reload still shows it', async () => {
    const note = await freshNote();
    await publish(note.id);

    await chat(harness.app, note.id, { message: 'Make the plan shorter' });

    const thread = listChatMessagesForNote(harness.db, note.id);
    expect(thread.map((message) => message.text)).toEqual(['Make the plan shorter', PUBLISHED_REFUSAL]);
  });

  it('lets an unpublished note be edited again', async () => {
    const note = await freshNote();
    await publish(note.id);
    await harness.app.inject({ method: 'POST', url: `/api/notes/${note.id}/unpublish` });

    const { events } = await chat(harness.app, note.id, { message: 'Make the plan shorter' });

    expect(events.map((event) => event.name)).toContain('note-updated');
    expect(getNote(harness.db, note.id)?.content).toContain('Continue weekly sessions and grounding');
  });
});

/**
 * The publish-during-refine race. The refine reads the note as a draft, then —
 * in the gap before its rewrite arrives, which a real model holds open for
 * seconds — a second request files the note. The finished rewrite must not land
 * on the now-published record: that would slip fresh text past the published
 * lock, which was only tested at the *start* of the refine.
 */
describe('POST /api/notes/:id/chat — a publish that lands mid-refine', () => {
  /** A fake whose refine fires a hook just before its rewrite, to stand in for the racing publish. */
  class RacingLlmProvider extends FakeLlmProvider {
    constructor(private readonly beforeRewrite: () => void) {
      super({ streamDelayMs: 0 });
    }

    override async *refineNote(request: RefineNoteRequest): AsyncIterable<LlmEvent> {
      this.beforeRewrite();
      yield* super.refineNote(request);
    }
  }

  it('discards the rewrite and leaves the filed note untouched', async () => {
    let publishNow: () => void = () => {};
    const local = await createTestApp({
      providers: { llm: new RacingLlmProvider(() => publishNow()), stt: new FakeSttProvider() },
    });
    try {
      const racePatient = await seedPatient(local.app, 'John Smith');
      const raceFormat = await seedFormat(local.app);
      const note = await seedNote(local.app, racePatient.id, raceFormat.id, NOTE_TEXT);
      // The race, made deterministic: the note is filed the instant the refine
      // begins, before the model's rewrite comes back.
      publishNow = (): void => {
        setNotePublished(local.db, note.id, true);
      };

      const { events } = await chat(local.app, note.id, { message: 'Make the plan shorter' });

      // The rewrite is thrown away: no note-updated, the record stays published
      // with the content it was filed with.
      expect(events.map((event) => event.name)).not.toContain('note-updated');
      expect(assistantReply(events)).toBe(PUBLISHED_REFUSAL);
      const stored = getNote(local.db, note.id);
      expect(stored?.status).toBe('published');
      expect(stored?.content).toBe(NOTE_TEXT);
    } finally {
      await local.close();
    }
  });
});

describe('POST /api/notes/:id/chat — bad requests', () => {
  it('404s an unknown note before the stream opens', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/notes/0198c0f0-0000-7000-8000-00000000dead/chat',
      payload: { message: 'Make the plan shorter' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('application/json');
  });

  it('400s an empty message, and writes nothing to the thread', async () => {
    const note = await freshNote();

    const response = await harness.app.inject({
      method: 'POST',
      url: `/api/notes/${note.id}/chat`,
      payload: { message: '   ' },
    });

    expect(response.statusCode).toBe(400);
    expect(listChatMessagesForNote(harness.db, note.id)).toHaveLength(0);
  });
});

describe('GET /api/notes/:id/chat', () => {
  it('returns the thread oldest first, and survives a fresh request', async () => {
    const note = await freshNote();
    await chat(harness.app, note.id, { message: 'Make the plan shorter' });

    const response = await harness.app.inject({ method: 'GET', url: `/api/notes/${note.id}/chat` });

    expect(response.statusCode).toBe(200);
    const { messages: thread } = response.json<{ messages: ChatMessage[] }>();
    expect(thread.map((message) => message.role)).toEqual(['user', 'assistant']);
  });

  it('is empty for a note nobody has talked to', async () => {
    const note = await freshNote();
    const response = await harness.app.inject({ method: 'GET', url: `/api/notes/${note.id}/chat` });
    expect(response.json<{ messages: ChatMessage[] }>().messages).toEqual([]);
  });

  it('404s an unknown note', async () => {
    const response = await harness.app.inject({
      method: 'GET',
      url: '/api/notes/0198c0f0-0000-7000-8000-00000000dead/chat',
    });
    expect(response.statusCode).toBe(404);
  });

  it('cascades away with the note', async () => {
    const note = await freshNote();
    await chat(harness.app, note.id, { message: 'Make the plan shorter' });
    await harness.app.inject({ method: 'DELETE', url: `/api/notes/${note.id}` });

    expect(listChatMessagesForNote(harness.db, note.id)).toEqual([]);
  });
});

describe('POST /api/generate — the thread it opens', () => {
  it('writes the assistant’s first-pass message so the chat is never empty', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/generate',
      payload: {
        patient_id: patient.id,
        format_id: format.id,
        typed_notes: 'Sleep improved, intrusive thoughts less frequent.',
      },
    });

    const note = parseSse(response.body).at(-1)?.data['note'] as Note;
    const thread = listChatMessagesForNote(harness.db, note.id);

    expect(thread).toHaveLength(1);
    expect(thread[0]?.role).toBe('assistant');
    expect(thread[0]?.text).toBe(FIRST_PASS_MESSAGE);
  });
});

/**
 * The streaming endpoints get one suite over a real socket.
 *
 * `app.inject` never opens one, so it cannot see the class of bug that shipped
 * in M3: the SSE helper watched `request.raw` for 'close', which since Node 16
 * fires when the request *body* has been read. Every POST looked disconnected
 * within milliseconds and the stream ended having sent nothing — while every
 * injected test passed. `/api/notes/:id/chat` uses the same helper, so it gets
 * the same guard.
 */
describe('POST /api/notes/:id/chat over a real connection', () => {
  it('streams tokens and finishes with the rewritten note', async () => {
    const local = await createTestApp();
    try {
      const localPatient = await seedPatient(local.app, 'John Smith');
      const localFormat = await seedFormat(local.app);
      const note = await seedNote(local.app, localPatient.id, localFormat.id, NOTE_TEXT);

      const address = await local.app.listen({ port: 0, host: '127.0.0.1' });
      const response = await fetch(`${address}/api/notes/${note.id}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'Make the plan shorter' }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');

      const events = parseSse(await response.text());

      // The regression this suite exists for: this used to be empty.
      expect(events.length).toBeGreaterThan(0);
      expect(events.some((event) => event.name === 'token')).toBe(true);

      const final = noteUpdated(events);
      expect(final?.name).toBe('note-updated');
      expect(String((final?.data['note'] as Note).content)).toContain(
        'Plan: Continue weekly sessions and grounding exercises.',
      );
    } finally {
      await local.close();
    }
  });
});
