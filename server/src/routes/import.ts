import {
  ClaudeImportAcceptRequestSchema,
  importedNoteTitle,
  MAX_IMPORT_BYTES,
  type ClaudeImportAcceptResponse,
  type ClaudeImportPreview,
  type Patient,
} from '@apunta/shared';
import type { Database } from 'better-sqlite3';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { listFormats } from '../db/formats.js';
import { createNote } from '../db/notes.js';
import { createPatient, getPatient, listPatients } from '../db/patients.js';
import { createTranscript } from '../db/transcripts.js';
import { badRequest, notFound } from '../http/errors.js';
import { parseBody } from '../http/validate.js';
import { buildPreview, ImportFormatError, openExport } from '../import/claude.js';

/**
 * Importing her Claude conversations (M11).
 *
 * Two endpoints, and the shape between them is the whole design:
 *
 * `POST /api/import/claude` takes the export she chose in the browser, reads
 * it in memory, and answers with *proposals* — every conversation with her
 * words in it, and who each may be about. Nothing is written and nothing is
 * kept: the upload lives in this request's memory and is gone with it. The
 * archive holds everything she ever said to Claude, most of it nobody's
 * business, and the only copy of it stays where she put it.
 *
 * `POST /api/import/claude/accept` writes what she accepted, and only that,
 * as ordinary patients and notes. Each note keeps its provenance as a
 * transcript row of source `import`, which is also what makes her imported
 * words an allowed source for the refine chat's locks.
 *
 * Every diagnostic on this path is shape: counts, never a name.
 */
export function registerImportRoutes(app: FastifyInstance, db: Database): void {
  app.post('/api/import/claude', async (request): Promise<ClaudeImportPreview> => {
    const upload = await receiveExport(request);
    let read;
    try {
      read = openExport(upload.bytes, upload.filename);
    } catch (error) {
      if (error instanceof ImportFormatError) throw badRequest(error.message);
      throw error;
    }
    const preview = buildPreview(
      read,
      listPatients(db, { includeArchived: true }).map((patient) => ({ id: patient.id, name: patient.name })),
    );
    request.log.info(
      {
        bytes: upload.bytes.length,
        conversations: preview.totals.conversations,
        proposals: preview.conversations.length,
        candidates: preview.candidates.length,
      },
      'claude export previewed',
    );
    return preview;
  });

  app.post('/api/import/claude/accept', async (request, reply): Promise<ClaudeImportAcceptResponse> => {
    const input = parseBody(ClaudeImportAcceptRequestSchema, request.body);
    const format = listFormats(db)[0];
    if (!format)
      throw badRequest('Create a note format before importing, so the notes have somewhere to go.');

    // One transaction: either everything she accepted lands, or nothing does.
    const write = db.transaction((): ClaudeImportAcceptResponse => {
      const byName = new Map<string, Patient>();
      for (const existing of listPatients(db, { includeArchived: true }))
        byName.set(existing.name.toLowerCase(), existing);
      let patientsCreated = 0;
      const landed = new Set<string>();

      for (const item of input.items) {
        let patient: Patient | undefined;
        if (item.patient_id !== null) {
          patient = getPatient(db, item.patient_id);
          if (!patient) throw notFound('Patient not found');
        } else {
          // A new name that matches a patient she already has is that
          // patient: two "John Smith"s in the list is worse than one.
          patient = byName.get(item.patient_name.toLowerCase());
          if (!patient) {
            patient = createPatient(db, { name: item.patient_name });
            byName.set(patient.name.toLowerCase(), patient);
            patientsCreated += 1;
          }
        }

        const note = createNote(db, {
          patient_id: patient.id,
          format_id: format.id,
          title: importedNoteTitle(item.title, item.recorded_at),
          content: item.text,
          ...(item.recorded_at === null ? {} : { created_at: item.recorded_at }),
        });
        createTranscript(db, {
          note_id: note.id,
          source: 'import',
          raw_text: provenance(item.conversation_id, item.title, item.recorded_at) + item.text,
        });
        landed.add(patient.id);
      }

      return {
        patients_created: patientsCreated,
        notes_created: input.items.length,
        patient_ids: [...landed],
      };
    });

    const result = write();
    request.log.info(
      {
        notes: result.notes_created,
        patientsCreated: result.patients_created,
        patients: result.patient_ids.length,
      },
      'claude conversations imported',
    );
    reply.code(201);
    return result;
  });
}

/** The transcript's first line: where this came from, so the origin of an imported note is always answerable. */
function provenance(conversationId: string, title: string, recordedAt: string | null): string {
  const name = title.trim() === '' ? 'an untitled conversation' : `"${title.trim()}"`;
  const when = recordedAt === null ? '' : `, recorded ${recordedAt.slice(0, 10)}`;
  return `[Imported from Claude conversation ${name} (${conversationId})${when}]\n\n`;
}

interface ExportUpload {
  readonly bytes: Buffer;
  readonly filename: string;
}

/** The whole file into memory, and nowhere else. */
async function receiveExport(request: FastifyRequest): Promise<ExportUpload> {
  if (!request.isMultipart()) throw badRequest('Send the export as multipart/form-data with one file.');

  let upload: ExportUpload | null = null;
  const parts = request.parts({
    limits: { files: 1, fileSize: MAX_IMPORT_BYTES, fields: 4, fieldSize: 1024 },
  });
  for await (const part of parts) {
    if (part.type !== 'file') continue;
    if (upload !== null) {
      part.file.resume();
      continue;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of part.file) chunks.push(chunk as Buffer);
    if (part.file.truncated) throw badRequest('That export is too large to read in one go.');
    upload = { bytes: Buffer.concat(chunks), filename: part.filename };
  }
  if (upload === null || upload.bytes.length === 0)
    throw badRequest('No file arrived. Choose the export Claude sent you.');
  return upload;
}
