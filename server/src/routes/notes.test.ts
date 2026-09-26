import { NoteListResponseSchema, NoteSchema, type Note, type NoteFormat, type Patient } from '@apunta/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createChatMessage } from '../db/chat-messages.js';
import { createTranscript } from '../db/transcripts.js';
import { createTestApp, seedFormat, seedNote, seedPatient, type TestApp } from '../test/harness.js';

let harness: TestApp;
let format: NoteFormat;
let patient: Patient;

beforeEach(async () => {
  harness = await createTestApp();
  format = await seedFormat(harness.app);
  patient = await seedPatient(harness.app);
});

afterEach(async () => {
  await harness.close();
});

describe('POST /api/notes', () => {
  it('creates a draft titled after its format', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/notes',
      payload: { patient_id: patient.id, format_id: format.id, content: 'Subjective: Slept better.' },
    });

    expect(response.statusCode).toBe(201);
    const note = NoteSchema.parse(response.json());
    expect(note).toMatchObject({
      patient_id: patient.id,
      format_id: format.id,
      title: 'Progress note',
      status: 'draft',
      published_at: null,
      content: 'Subjective: Slept better.',
    });
  });

  it('defaults content to empty and honours an explicit title', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/notes',
      payload: { patient_id: patient.id, format_id: format.id, title: 'Session 4' },
    });

    expect(response.json<Note>()).toMatchObject({ title: 'Session 4', content: '' });
  });

  /**
   * C-LANG@1 rule 3: a note is written in its format's language, and nothing
   * else chooses one. A request that names a locale is refused for having an
   * unknown key rather than quietly honoured.
   */
  it('takes its locale from the format it was written against', async () => {
    const english = await harness.app.inject({
      method: 'POST',
      url: '/api/notes',
      payload: { patient_id: patient.id, format_id: format.id },
    });
    expect(NoteSchema.parse(english.json()).locale).toBe('en');

    const spanishFormat = await seedFormat(harness.app, {
      name: 'Nota de progreso',
      sections: ['Lugar', 'Discusión'],
    });
    const changed = await harness.app.inject({
      method: 'PATCH',
      url: `/api/formats/${spanishFormat.id}`,
      payload: { locale: 'es-MX' },
    });
    expect(changed.json<NoteFormat>().locale).toBe('es-MX');

    const spanish = await harness.app.inject({
      method: 'POST',
      url: '/api/notes',
      payload: { patient_id: patient.id, format_id: spanishFormat.id },
    });
    const note = NoteSchema.parse(spanish.json());
    expect(note.locale).toBe('es-MX');
    expect(note.title).toBe('Nota de progreso');

    // The English note is untouched by the Spanish one existing: no translation,
    // no relabelling, and the listing carries both locales as they were created.
    const { notes } = NoteListResponseSchema.parse(
      (await harness.app.inject({ method: 'GET', url: `/api/patients/${patient.id}/notes` })).json(),
    );
    expect(notes.map((row) => row.locale).sort()).toEqual(['en', 'es-MX']);
  });

  it('404s an unknown patient or format', async () => {
    const noPatient = await harness.app.inject({
      method: 'POST',
      url: '/api/notes',
      payload: { patient_id: '01920000-0000-7000-8000-00000000dead', format_id: format.id },
    });
    expect(noPatient.statusCode).toBe(404);
    expect(noPatient.json()).toMatchObject({ message: 'Patient not found' });

    const noFormat = await harness.app.inject({
      method: 'POST',
      url: '/api/notes',
      payload: { patient_id: patient.id, format_id: '01920000-0000-7000-8000-00000000dead' },
    });
    expect(noFormat.statusCode).toBe(404);
    expect(noFormat.json()).toMatchObject({ message: 'Note format not found' });
  });

  it('400s a body that is missing ids or malformed', async () => {
    for (const payload of [{}, { patient_id: patient.id }, { patient_id: 'x', format_id: 'y' }]) {
      const response = await harness.app.inject({ method: 'POST', url: '/api/notes', payload });
      expect(response.statusCode).toBe(400);
    }
  });
});

describe('GET /api/patients/:id/notes', () => {
  it('lists the patient notes newest first', async () => {
    const first = await seedNote(harness.app, patient.id, format.id, 'first');
    const second = await seedNote(harness.app, patient.id, format.id, 'second');

    const response = await harness.app.inject({ method: 'GET', url: `/api/patients/${patient.id}/notes` });

    expect(response.statusCode).toBe(200);
    const { notes } = NoteListResponseSchema.parse(response.json());
    expect(notes.map((n) => n.id)).toEqual([second.id, first.id]);
  });

  it('returns an empty list for a patient with no notes, and 404s an unknown patient', async () => {
    const empty = await harness.app.inject({ method: 'GET', url: `/api/patients/${patient.id}/notes` });
    expect(empty.json<{ notes: Note[] }>().notes).toEqual([]);

    const missing = await harness.app.inject({ method: 'GET', url: '/api/patients/nope/notes' });
    expect(missing.statusCode).toBe(404);
  });

  it('does not leak another patient notes', async () => {
    const other = await seedPatient(harness.app, 'Maria Ruiz');
    await seedNote(harness.app, patient.id, format.id);

    const response = await harness.app.inject({ method: 'GET', url: `/api/patients/${other.id}/notes` });

    expect(response.json<{ notes: Note[] }>().notes).toEqual([]);
  });
});

describe('PATCH /api/notes/:id', () => {
  it('edits a draft and moves updated_at forward', async () => {
    const note = await seedNote(harness.app, patient.id, format.id);

    const response = await harness.app.inject({
      method: 'PATCH',
      url: `/api/notes/${note.id}`,
      payload: { revision: note.revision, content: 'Subjective: Revised body.' },
    });

    expect(response.statusCode).toBe(200);
    const updated = response.json<Note>();
    expect(updated.content).toBe('Subjective: Revised body.');
    expect(Date.parse(updated.updated_at)).toBeGreaterThanOrEqual(Date.parse(note.updated_at));
  });

  it('409s a content edit on a published note but allows a rename', async () => {
    const note = await seedNote(harness.app, patient.id, format.id);
    const published = await harness.app.inject({ method: 'POST', url: `/api/notes/${note.id}/publish` });
    const publishedNote = published.json<Note>();

    const blocked = await harness.app.inject({
      method: 'PATCH',
      url: `/api/notes/${note.id}`,
      payload: { revision: note.revision, content: 'sneaky edit' },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({ error: 'stale_write' });
    expect(blocked.json<{ details: { note: Note } }>().details.note.status).toBe('published');

    const renamed = await harness.app.inject({
      method: 'PATCH',
      url: `/api/notes/${note.id}`,
      payload: { revision: publishedNote.revision, title: 'Progress note (Aug 8)' },
    });
    expect(renamed.statusCode).toBe(200);

    const current = renamed.json<Note>();
    const locked = await harness.app.inject({
      method: 'PATCH',
      url: `/api/notes/${note.id}`,
      payload: { revision: current.revision, content: 'sneaky edit' },
    });
    expect(locked.statusCode).toBe(409);
    expect(locked.json()).toMatchObject({ error: 'conflict' });
    expect(locked.json<{ message: string }>().message).toMatch(/unpublish/i);

    // The body really did not change.
    const reread = await harness.app.inject({ method: 'GET', url: `/api/notes/${note.id}` });
    expect(reread.json<Note>().content).toBe(note.content);
  });

  it('rejects a missing revision and returns the current note for a stale write', async () => {
    const note = await seedNote(harness.app, patient.id, format.id);

    const missing = await harness.app.inject({
      method: 'PATCH',
      url: `/api/notes/${note.id}`,
      payload: { content: 'without precondition' },
    });
    expect(missing.statusCode).toBe(400);

    const first = await harness.app.inject({
      method: 'PATCH',
      url: `/api/notes/${note.id}`,
      payload: { revision: note.revision, content: 'first window' },
    });
    const current = first.json<Note>();
    const stale = await harness.app.inject({
      method: 'PATCH',
      url: `/api/notes/${note.id}`,
      payload: { revision: note.revision, content: 'second window' },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ error: 'stale_write', details: { note: current } });
  });

  it('400s an empty patch and 404s an unknown note', async () => {
    const note = await seedNote(harness.app, patient.id, format.id);

    const empty = await harness.app.inject({
      method: 'PATCH',
      url: `/api/notes/${note.id}`,
      payload: { revision: note.revision },
    });
    expect(empty.statusCode).toBe(400);

    const missing = await harness.app.inject({
      method: 'PATCH',
      url: '/api/notes/nope',
      payload: { revision: 0, content: 'x' },
    });
    expect(missing.statusCode).toBe(404);
  });
});

describe('publish and unpublish', () => {
  it('publishes a draft, refuses to publish it twice, then unpublishes it', async () => {
    const note = await seedNote(harness.app, patient.id, format.id);

    const published = await harness.app.inject({ method: 'POST', url: `/api/notes/${note.id}/publish` });
    expect(published.statusCode).toBe(200);
    expect(published.json<Note>()).toMatchObject({ status: 'published' });
    expect(published.json<Note>().published_at).not.toBeNull();

    const again = await harness.app.inject({ method: 'POST', url: `/api/notes/${note.id}/publish` });
    expect(again.statusCode).toBe(409);
    expect(again.json<{ message: string }>().message).toMatch(/already published/i);

    const unpublished = await harness.app.inject({ method: 'POST', url: `/api/notes/${note.id}/unpublish` });
    expect(unpublished.statusCode).toBe(200);
    const draft = unpublished.json<Note>();
    expect(draft).toMatchObject({ status: 'draft', published_at: null });

    // ...and now the body is editable again.
    const edit = await harness.app.inject({
      method: 'PATCH',
      url: `/api/notes/${note.id}`,
      payload: { revision: draft.revision, content: 'Subjective: Edited after unlocking.' },
    });
    expect(edit.statusCode).toBe(200);
  });

  it('409s unpublishing a note that is still a draft', async () => {
    const note = await seedNote(harness.app, patient.id, format.id);

    const response = await harness.app.inject({ method: 'POST', url: `/api/notes/${note.id}/unpublish` });

    expect(response.statusCode).toBe(409);
  });

  it('404s publish and unpublish on an unknown note', async () => {
    for (const action of ['publish', 'unpublish']) {
      const response = await harness.app.inject({ method: 'POST', url: `/api/notes/nope/${action}` });
      expect(response.statusCode).toBe(404);
    }
  });
});

describe('DELETE /api/notes/:id', () => {
  it('deletes the note along with its transcripts and chat messages', async () => {
    const note = await seedNote(harness.app, patient.id, format.id);
    createTranscript(harness.db, { note_id: note.id, source: 'typed', raw_text: 'dictation' });
    createChatMessage(harness.db, { note_id: note.id, role: 'user', text: 'shorter please' });

    const response = await harness.app.inject({ method: 'DELETE', url: `/api/notes/${note.id}` });

    expect(response.statusCode).toBe(204);
    expect(
      harness.db.prepare('SELECT COUNT(*) AS count FROM transcripts WHERE note_id = ?').get(note.id),
    ).toEqual({ count: 0 });
    expect(
      harness.db.prepare('SELECT COUNT(*) AS count FROM chat_messages WHERE note_id = ?').get(note.id),
    ).toEqual({ count: 0 });
  });

  it('404s an unknown id', async () => {
    const response = await harness.app.inject({ method: 'DELETE', url: '/api/notes/nope' });

    expect(response.statusCode).toBe(404);
  });
});
