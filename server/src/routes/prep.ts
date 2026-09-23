import {
  SaveBriefRequestSchema,
  instantToLocalDay,
  type BriefLine,
  type BriefLookback,
  type SessionBrief,
  type SessionBriefContent,
  type SessionBriefListResponse,
} from '@apunta/shared';
import type { Database } from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

import { logFailure, logStats, toAiError } from './ai.js';
import type { AiProviders } from '../ai/types.js';
import { createSessionBrief, listSessionBriefs } from '../db/briefs.js';
import { getFormat } from '../db/formats.js';
import { getNote, listNotesForPatient } from '../db/notes.js';
import { badRequest } from '../http/errors.js';
import { openSse } from '../http/sse.js';
import { IdParamsSchema, parseBody, parseParams } from '../http/validate.js';
import { readRecentNotes, type NoteMaterial } from '../plan/pipeline.js';
import { resolveLookback } from '../plan/settings.js';
import { requirePatient } from './patients.js';

/**
 * Session preparation — a briefing generated on demand before a session.
 *
 * Three things about it are decisions rather than implementation details.
 *
 * **It is ephemeral.** `POST /api/patients/:id/prep` writes nothing at all;
 * the briefing exists in the browser until she presses Keep, which is owner
 * decision 3. So there is no draft row to promote and no cleanup to schedule.
 *
 * **It does not connect the plan to the notes.** The briefing call is never
 * shown the plan — not instructed to ignore it, not shown it — so it cannot
 * compute coverage, count sessions since a goal came up, or say a goal is
 * being missed. The screen puts the plan beside the briefing; she does the
 * connecting. That was her decision, and it covers prep as much as drafting.
 *
 * **It says how far back it read.** Every line carries the note it came from,
 * and the lookback carries the cap, the range and anything it could not read.
 * A briefing that quietly read four notes out of five is worse than one that
 * says so.
 */
export function registerPrepRoutes(app: FastifyInstance, db: Database, providers: AiProviders): void {
  /** The briefings she kept. */
  app.get('/api/patients/:id/prep', async (request): Promise<SessionBriefListResponse> => {
    const { id } = parseParams(IdParamsSchema, request.params);
    requirePatient(db, id);
    return { briefs: listSessionBriefs(db, id) };
  });

  app.post('/api/patients/:id/prep', async (request, reply) => {
    const { id } = parseParams(IdParamsSchema, request.params);
    requirePatient(db, id);

    const cap = resolveLookback(db);
    const notes = listNotesForPatient(db, id).slice(0, cap);

    const stream = openSse(reply);
    stream.send('status', { stage: 'connecting', message: 'Thinking…' });

    let lines: BriefLine[] = [];
    // Assigned in the try; every path out of the catch returns.
    let lookback: BriefLookback;

    try {
      const read = await readRecentNotes({
        llm: providers.llm,
        notes,
        sectionsFor: (note) => getFormat(db, note.format_id)?.sections ?? [],
        cap,
        onProgress: (index, total) => {
          stream.send('status', {
            stage: 'reading-notes',
            message: `Reading note ${String(index)} of ${String(total)}…`,
          });
        },
        onStats: (stats) => {
          logStats(request, stats, 'note summarised');
        },
        cancelled: () => stream.closed,
      });
      lookback = read.lookback;

      if (read.materials.length > 0 && !stream.closed) {
        stream.send('status', { stage: 'drafting', message: 'Writing the briefing…' });
        const composed = await providers.llm.composeBrief({
          notes: read.materials.map((material) => ({
            index: material.index,
            date: instantToLocalDay(material.note.created_at),
            title: material.note.title,
            points: material.points,
          })),
        });
        logStats(request, composed.stats, 'briefing composed');
        lines = resolveLines(composed.value.lines, read.materials);
      }
    } catch (error) {
      const failure = toAiError(error);
      logFailure(request, failure, 'session prep failed');
      stream.send('error', { code: failure.code, message: failure.message });
      stream.end();
      return;
    }

    if (stream.closed) {
      stream.end();
      return;
    }

    for (const line of lines) stream.send('line', { line });
    stream.send('brief', {
      generated_at: new Date().toISOString(),
      content: { lines, lookback } satisfies SessionBriefContent,
    });
    stream.end();
  });

  /**
   * Keep one.
   *
   * The browser posts back the briefing it was given, because nothing was
   * persisted while it streamed. Every line's note is checked against this
   * patient before it is stored: a saved briefing is a record, and a record
   * that cites a note from someone else's chart is not one.
   */
  app.post('/api/patients/:id/prep/save', async (request, reply): Promise<SessionBrief> => {
    const { id } = parseParams(IdParamsSchema, request.params);
    const input = parseBody(SaveBriefRequestSchema, request.body);
    requirePatient(db, id);

    const noteIds = [...new Set(input.content.lines.map((line) => line.note_id))];
    for (const noteId of noteIds) {
      const note = getNote(db, noteId);
      if (!note || note.patient_id !== id) {
        throw badRequest('This briefing cites a note that does not belong to this patient');
      }
    }

    reply.code(201);
    return createSessionBrief(db, {
      patient_id: id,
      generated_at: input.generated_at,
      content: input.content,
      source_note_ids: noteIds,
    });
  });
}

/**
 * Resolve each composed line to the note it names.
 *
 * A line whose index does not resolve is dropped rather than shown
 * un-attributed: the reading view puts a date on every line and makes it
 * clickable, and a line with no note behind it would be the one thing on the
 * screen that cannot be checked.
 */
function resolveLines(
  composed: readonly { note: number; text: string }[],
  materials: readonly NoteMaterial[],
): BriefLine[] {
  const lines: BriefLine[] = [];
  for (const line of composed) {
    const material = materials.find((candidate) => candidate.index === line.note);
    const text = line.text.trim();
    if (!material || text === '') continue;
    lines.push({
      note_id: material.note.id,
      note_date: material.note.created_at,
      note_title: material.note.title,
      text,
    });
  }
  return lines;
}
