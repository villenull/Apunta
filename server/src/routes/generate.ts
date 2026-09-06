import { emptySectionNames, GenerateRequestSchema } from '@apunta/shared';
import type { Database } from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

import type { AiProviders } from '../ai/types.js';
import { getFormat } from '../db/formats.js';
import { notFound } from '../http/errors.js';
import { openSse } from '../http/sse.js';
import { parseBody } from '../http/validate.js';
import { persistDraft, streamDraft } from './draft.js';
import { requirePatient } from './patients.js';

/**
 * `POST /api/generate` — draft a note from the therapist's own material.
 *
 * Validation happens before the stream opens, so a bad request is an ordinary
 * 400/404 with a JSON body. Once the stream is open the status code is already
 * committed, so everything after that — including "Ollama is not running" — is
 * an `error` event carrying a message written for the user.
 *
 * The note is persisted only after the draft validates. A failed draft leaves
 * nothing behind; the therapist's text is still in the browser, so trying
 * again costs her nothing.
 *
 * The drafting and persistence themselves live in `draft.ts`, because
 * `POST /api/transcribe` (M5) finishes by doing exactly this.
 */
export function registerGenerateRoute(app: FastifyInstance, db: Database, providers: AiProviders): void {
  app.post('/api/generate', async (request, reply) => {
    const input = parseBody(GenerateRequestSchema, request.body);
    requirePatient(db, input.patient_id);
    const format = getFormat(db, input.format_id);
    if (!format) throw notFound('Note format not found');

    const stream = openSse(reply);

    const { sections, retractions } = await streamDraft({
      providers,
      format,
      source: { typedNotes: input.typed_notes, transcript: input.transcript },
      stream,
      request,
    });

    if (sections === null || stream.closed) {
      stream.end();
      return;
    }

    stream.send('status', { stage: 'saving', message: 'Saving the draft…' });
    const note = persistDraft(db, input, format, sections, retractions);

    stream.send('note', {
      note,
      empty_sections: emptySectionNames(sections, format.sections),
    });
    stream.end();
  });
}
