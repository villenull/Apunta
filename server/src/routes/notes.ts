import {
  CreateNoteRequestSchema,
  UpdateNoteRequestSchema,
  type Note,
  type NoteListResponse,
} from '@apunta/shared';
import type { Database } from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

import { getFormat } from '../db/formats.js';
import {
  createNote,
  deleteNote,
  getNote,
  listNotesForPatient,
  setNotePublished,
  updateNote,
} from '../db/notes.js';
import { conflict, HttpError, notFound } from '../http/errors.js';
import { IdParamsSchema, parseBody, parseParams } from '../http/validate.js';
import { requirePatient } from './patients.js';

/** The prototype's wording when the user tries to change a published note. */
const PUBLISHED_LOCK_MESSAGE =
  'This note is published, so its content is locked. Unpublish it first, then edit.';

function requireNote(db: Database, id: string): Note {
  const note = getNote(db, id);
  if (!note) throw notFound('Note not found');
  return note;
}
function staleWrite(note: Note): HttpError {
  return new HttpError(409, 'stale_write', 'This note changed in another window.', { note });
}

export function registerNoteRoutes(app: FastifyInstance, db: Database): void {
  app.get('/api/patients/:id/notes', async (request): Promise<NoteListResponse> => {
    const { id } = parseParams(IdParamsSchema, request.params);
    requirePatient(db, id);
    return { notes: listNotesForPatient(db, id) };
  });

  /**
   * Manual note creation. `POST /api/generate` (M3) drafts the content with the
   * LLM and then lands here, through the same repository.
   */
  app.post('/api/notes', async (request, reply): Promise<Note> => {
    const input = parseBody(CreateNoteRequestSchema, request.body);
    requirePatient(db, input.patient_id);

    const format = getFormat(db, input.format_id);
    if (!format) throw notFound('Note format not found');

    const note = createNote(db, {
      patient_id: input.patient_id,
      format_id: input.format_id,
      // C-LANG@1 rule 3: a note is written in its format's language, so the
      // format's locale is the locale. No client chooses one.
      locale: format.locale,
      // The prototype titles notes after their format ("Progress note").
      title: input.title ?? format.name,
      ...(input.content === undefined ? {} : { content: input.content }),
    });
    reply.code(201);
    return note;
  });

  app.get('/api/notes/:id', async (request): Promise<Note> => {
    const { id } = parseParams(IdParamsSchema, request.params);
    return requireNote(db, id);
  });

  /**
   * Publish locks the body: a content edit on a published note is a 409 rather
   * than a silent unpublish, so the client has to make the unlock explicit.
   * Renaming a published note is still allowed.
   */
  app.patch('/api/notes/:id', async (request): Promise<Note> => {
    const { id } = parseParams(IdParamsSchema, request.params);
    const patch = parseBody(UpdateNoteRequestSchema, request.body);
    const note = requireNote(db, id);

    if (patch.revision !== note.revision) throw staleWrite(note);
    if (note.status === 'published' && patch.content !== undefined) {
      throw conflict(PUBLISHED_LOCK_MESSAGE);
    }

    const updated = updateNote(db, id, {
      revision: patch.revision,
      ...(patch.title === undefined ? {} : { title: patch.title }),
      ...(patch.content === undefined ? {} : { content: patch.content }),
    });
    if (updated) return updated;

    const latest = requireNote(db, id);
    if (latest.revision !== patch.revision) throw staleWrite(latest);
    throw notFound('Note not found');
  });

  /** Cascades to the note's transcripts and chat messages. */
  app.delete('/api/notes/:id', async (request, reply) => {
    const { id } = parseParams(IdParamsSchema, request.params);
    if (!deleteNote(db, id)) throw notFound('Note not found');
    return reply.code(204).send();
  });

  app.post('/api/notes/:id/publish', async (request): Promise<Note> => {
    const { id } = parseParams(IdParamsSchema, request.params);
    const note = requireNote(db, id);
    if (note.status === 'published') throw conflict('This note is already published.');

    const published = setNotePublished(db, id, true);
    if (!published) throw notFound('Note not found');
    return published;
  });

  app.post('/api/notes/:id/unpublish', async (request): Promise<Note> => {
    const { id } = parseParams(IdParamsSchema, request.params);
    const note = requireNote(db, id);
    if (note.status === 'draft') throw conflict('This note is not published.');

    const unpublished = setNotePublished(db, id, false);
    if (!unpublished) throw notFound('Note not found');
    return unpublished;
  });
}
