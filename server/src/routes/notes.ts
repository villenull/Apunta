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

function requireNote(db: Database, id: string): Note {
  const note = getNote(db, id);
  if (!note) throw notFound('errors.not_found.note');
  return note;
}
function staleWrite(note: Note): HttpError {
  // `errors.conflict.note_published_lock` keeps the prototype's own wording for
  // the same refusal, and this is its 409 sibling: the record she is editing
  // has moved under her, and the current note travels in `details`.
  return new HttpError(409, 'stale_write', 'errors.stale_write.note_changed', {}, { note });
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
    if (!format) throw notFound('errors.not_found.note_format');

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
      throw conflict('errors.conflict.note_published_lock');
    }

    const updated = updateNote(db, id, {
      revision: patch.revision,
      ...(patch.title === undefined ? {} : { title: patch.title }),
      ...(patch.content === undefined ? {} : { content: patch.content }),
    });
    if (updated) return updated;

    const latest = requireNote(db, id);
    if (latest.revision !== patch.revision) throw staleWrite(latest);
    throw notFound('errors.not_found.note');
  });

  /** Cascades to the note's transcripts and chat messages. */
  app.delete('/api/notes/:id', async (request, reply) => {
    const { id } = parseParams(IdParamsSchema, request.params);
    if (!deleteNote(db, id)) throw notFound('errors.not_found.note');
    return reply.code(204).send();
  });

  app.post('/api/notes/:id/publish', async (request): Promise<Note> => {
    const { id } = parseParams(IdParamsSchema, request.params);
    const note = requireNote(db, id);
    if (note.status === 'published') throw conflict('errors.conflict.note_published');

    const published = setNotePublished(db, id, true);
    if (!published) throw notFound('errors.not_found.note');
    return published;
  });

  app.post('/api/notes/:id/unpublish', async (request): Promise<Note> => {
    const { id } = parseParams(IdParamsSchema, request.params);
    const note = requireNote(db, id);
    if (note.status === 'draft') throw conflict('errors.conflict.note_not_published');

    const unpublished = setNotePublished(db, id, false);
    if (!unpublished) throw notFound('errors.not_found.note');
    return unpublished;
  });
}
