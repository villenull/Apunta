import {
  CreateNoteFormatRequestSchema,
  STANDARD_PROGRESS_FORMAT,
  UpdateNoteFormatRequestSchema,
  type NoteFormat,
  type NoteFormatListResponse,
} from '@apunta/shared';
import type { Database } from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

import { OWNER_PROGRESS_INSTRUCTIONS } from '../ai/default-instructions.js';
import {
  countNotesForFormat,
  createFormat,
  deleteFormat,
  getFormat,
  listFormats,
  updateFormat,
} from '../db/formats.js';
import { conflict, notFound } from '../http/errors.js';
import { IdParamsSchema, parseBody, parseParams } from '../http/validate.js';

function requireFormat(db: Database, id: string): NoteFormat {
  const format = getFormat(db, id);
  if (!format) throw notFound('Note format not found');
  return format;
}

export function registerFormatRoutes(app: FastifyInstance, db: Database): void {
  app.get('/api/formats', async (): Promise<NoteFormatListResponse> => {
    return { formats: listFormats(db) };
  });

  app.post('/api/formats', async (request, reply): Promise<NoteFormat> => {
    const input = parseBody(CreateNoteFormatRequestSchema, request.body);
    const format = createFormat(db, {
      name: input.name,
      sections: input.sections,
      ...(input.instructions === undefined ? {} : { instructions: input.instructions }),
      ...(input.source === undefined ? {} : { source: input.source }),
    });
    reply.code(201);
    return format;
  });

  /**
   * `POST /api/formats/standard` — onboarding's recommended one-click choice:
   * the owner's own progress note, with her sections and her drafting
   * instructions written onto the format, so Settings shows (and lets her
   * edit) exactly what the model reads. No body; the browser never carries
   * the instructions' text.
   */
  app.post('/api/formats/standard', async (_request, reply): Promise<NoteFormat> => {
    const format = createFormat(db, {
      name: STANDARD_PROGRESS_FORMAT.name,
      sections: [...STANDARD_PROGRESS_FORMAT.sections],
      instructions: OWNER_PROGRESS_INSTRUCTIONS,
      source: 'manual',
    });
    reply.code(201);
    return format;
  });

  app.get('/api/formats/:id', async (request): Promise<NoteFormat> => {
    const { id } = parseParams(IdParamsSchema, request.params);
    return requireFormat(db, id);
  });

  /**
   * Editing sections of a format that already has notes is allowed — existing
   * notes keep their text, and only future drafts use the new structure.
   */
  app.patch('/api/formats/:id', async (request): Promise<NoteFormat> => {
    const { id } = parseParams(IdParamsSchema, request.params);
    const patch = parseBody(UpdateNoteFormatRequestSchema, request.body);
    requireFormat(db, id);

    const updated = updateFormat(db, id, {
      ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.sections === undefined ? {} : { sections: patch.sections }),
      ...(patch.instructions === undefined ? {} : { instructions: patch.instructions }),
      ...(patch.source === undefined ? {} : { source: patch.source }),
    });
    if (!updated) throw notFound('Note format not found');
    return updated;
  });

  /**
   * Refused while notes still reference the format: deleting it would orphan
   * them, and losing clinical notes to a settings tidy-up is unacceptable.
   */
  app.delete('/api/formats/:id', async (request, reply) => {
    const { id } = parseParams(IdParamsSchema, request.params);
    requireFormat(db, id);

    const noteCount = countNotesForFormat(db, id);
    if (noteCount > 0) {
      throw conflict(
        `This format is used by ${String(noteCount)} note${noteCount === 1 ? '' : 's'} and cannot be deleted.`,
      );
    }

    deleteFormat(db, id);
    return reply.code(204).send();
  });
}
