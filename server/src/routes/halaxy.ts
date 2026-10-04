import {
  HalaxyImportRequestSchema,
  MAX_HALAXY_FILE_BYTES,
  MAX_HALAXY_FILES,
  MAX_HALAXY_TOTAL_BYTES,
  type HalaxyImportResponse,
  type HalaxyPreviewResponse,
} from '@apunta/shared';
import type { Database } from 'better-sqlite3';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { extractPdf } from '../extract/pdf.js';
import { ExtractError } from '../extract/types.js';
import { createImportBatch, addBatchNote, addBatchPatient } from '../db/import-batches.js';
import { createNote, setNotePublished } from '../db/notes.js';
import { createPatient, listPatients } from '../db/patients.js';
import { badRequest } from '../http/errors.js';
import { msg, storedLanguage, type Locale } from '../http/locale.js';
import { HalaxyParseError, parseHalaxyText } from '../import/halaxy/parser.js';

export function registerHalaxyRoutes(app: FastifyInstance, db: Database): void {
  app.post('/api/import/halaxy/preview', async (request): Promise<HalaxyPreviewResponse> => {
    // Read once, at the start: every rejection reason below is rendered from
    // this value, not from the setting as it stands after each PDF — and the
    // preview's own `warnings`, which the parser renders, travel with it.
    const locale = storedLanguage(db);
    const files = await receiveFiles(request);
    const activePatients = listPatients(db);
    const patients: HalaxyPreviewResponse['patients'] = [];
    const rejected: HalaxyPreviewResponse['rejected'] = [];
    for (const file of files) {
      try {
        const parsed = parseHalaxyText(await extractPdf(file.bytes), file.filename, locale);
        const normalized = normalizePatientName(parsed.patientName);
        const existingPatients = activePatients
          .filter((patient) => normalizePatientName(patient.name) === normalized)
          .map((patient) => ({ id: patient.id, name: patient.name }));
        patients.push({ ...parsed, existingPatients });
      } catch (error) {
        rejected.push({ fileName: file.filename, reason: rejectionMessage(error, locale) });
      }
    }
    request.log.info(
      { files: files.length, accepted: patients.length, rejected: rejected.length },
      'halaxy PDFs previewed',
    );
    return { patients, rejected };
  });
  app.post('/api/import/halaxy', (request, reply): HalaxyImportResponse => {
    const parsed = HalaxyImportRequestSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest('errors.bad_request.halaxy_selection_invalid');
    if (parsed.data.patients.length === 0) throw badRequest('errors.bad_request.halaxy_no_patients');
    const format = db.prepare('SELECT id, locale FROM note_formats ORDER BY created_at, id LIMIT 1').get() as
      { id: string; locale: Locale } | undefined;
    if (!format) throw badRequest('errors.bad_request.needs_format');
    const response = db.transaction((): HalaxyImportResponse => {
      const batchId = createImportBatch(db, 'halaxy');
      const activePatients = listPatients(db).map(({ id, name }) => ({ id, name }));
      const patients: HalaxyImportResponse['patients'] = [];
      let noteCount = 0;
      for (const planned of parsed.data.patients) {
        const matches = activePatients.filter(
          (patient) => normalizePatientName(patient.name) === normalizePatientName(planned.patientName),
        );
        const selected = planned.existingPatientId;
        let patient;
        let created = false;
        if (selected !== undefined && selected !== null) {
          patient = matches.find((candidate) => candidate.id === selected);
        } else if (selected === null) {
          patient = createPatient(db, { name: planned.patientName });
          created = true;
        } else if (matches.length === 1) {
          patient = matches[0];
        } else {
          patient = createPatient(db, { name: planned.patientName });
          created = true;
        }
        if (!patient) throw badRequest('errors.bad_request.halaxy_patient_unmatched');
        if (created) {
          addBatchPatient(db, batchId, patient.id);
          activePatients.push(patient);
        }
        for (const noteInput of planned.notes) {
          const note = createNote(db, {
            patient_id: patient.id,
            format_id: format.id,
            // The format's language is the note's language (C-LANG@1 rule 3),
            // and the fallback title is said in it too.
            locale: format.locale,
            title: noteInput.title ?? msg(format.locale, 'import.fallbackTitle', { date: noteInput.date }),
            content: noteInput.text,
            created_at: `${noteInput.date}T12:00:00.000Z`,
          });
          setNotePublished(db, note.id, true, `${noteInput.date}T12:00:00.000Z`);
          addBatchNote(db, batchId, note.id);
          noteCount += 1;
        }
        patients.push({
          fileName: planned.fileName,
          patientName: planned.patientName,
          patient_id: patient.id,
          notes: planned.notes.length,
        });
      }
      return { batch_id: batchId, patients, notes: noteCount };
    })();
    reply.code(201);
    request.log.info({ patients: response.patients.length, notes: response.notes }, 'halaxy PDFs imported');
    return response;
  });
}

interface HalaxyFile {
  readonly filename: string;
  readonly bytes: Buffer;
}

async function receiveFiles(request: FastifyRequest): Promise<HalaxyFile[]> {
  if (!request.isMultipart()) throw badRequest('errors.bad_request.halaxy_not_multipart');
  const files: HalaxyFile[] = [];
  let total = 0;
  const parts = request.parts({
    limits: { files: MAX_HALAXY_FILES, fileSize: MAX_HALAXY_FILE_BYTES, fields: 0, parts: MAX_HALAXY_FILES },
  });
  for await (const part of parts) {
    if (part.type !== 'file') continue;
    if (part.fieldname !== 'files') {
      part.file.resume();
      throw badRequest('errors.bad_request.halaxy_wrong_field');
    }
    if (!part.filename.toLowerCase().endsWith('.pdf')) {
      part.file.resume();
      throw badRequest('errors.bad_request.halaxy_not_pdf');
    }
    const chunks: Buffer[] = [];
    for await (const chunk of part.file) chunks.push(chunk as Buffer);
    if (part.file.truncated) throw badRequest('errors.bad_request.halaxy_pdf_too_large');
    const bytes = Buffer.concat(chunks);
    total += bytes.length;
    if (total > MAX_HALAXY_TOTAL_BYTES) throw badRequest('errors.bad_request.halaxy_pdfs_too_large');
    files.push({ filename: part.filename, bytes });
  }
  if (files.length === 0) throw badRequest('errors.bad_request.halaxy_no_files');
  return files;
}

/**
 * Why one PDF did not make it into the preview.
 *
 * `HalaxyParseError` carries its own key, so its sentence is rendered here in
 * the request's language. `ExtractError` still hands over its own English:
 * two of its categories each back two different sentences, so which one it is
 * cannot be told from the category, and the module that could say is outside
 * this card's write scope. See `rawHttpError` in `http/errors.ts`.
 */
function rejectionMessage(error: unknown, locale: Locale): string {
  if (error instanceof HalaxyParseError) return error.messageIn(locale);
  if (error instanceof ExtractError) return error.message;
  return msg(locale, 'errors.bad_request.halaxy_unreadable');
}

function normalizePatientName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}
