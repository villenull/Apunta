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
import { HalaxyParseError, parseHalaxyText } from '../import/halaxy/parser.js';

export function registerHalaxyRoutes(app: FastifyInstance, db: Database): void {
  app.post('/api/import/halaxy/preview', async (request): Promise<HalaxyPreviewResponse> => {
    const files = await receiveFiles(request);
    const activePatients = listPatients(db);
    const patients: HalaxyPreviewResponse['patients'] = [];
    const rejected: HalaxyPreviewResponse['rejected'] = [];
    for (const file of files) {
      try {
        const parsed = parseHalaxyText(await extractPdf(file.bytes), file.filename);
        const normalized = normalizePatientName(parsed.patientName);
        const existingPatients = activePatients
          .filter((patient) => normalizePatientName(patient.name) === normalized)
          .map((patient) => ({ id: patient.id, name: patient.name }));
        patients.push({ ...parsed, existingPatients });
      } catch (error) {
        rejected.push({ fileName: file.filename, reason: rejectionMessage(error) });
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
    if (!parsed.success) throw badRequest('The Halaxy review selection is not valid.');
    if (parsed.data.patients.length === 0) throw badRequest('Select at least one patient to import.');
    const format = db.prepare('SELECT id FROM note_formats ORDER BY created_at, id LIMIT 1').get() as
      { id: string } | undefined;
    if (!format)
      throw badRequest('Create a note format before importing, so the notes have somewhere to go.');
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
        if (!patient) throw badRequest('Choose an active matching patient or Create new before importing.');
        if (created) {
          addBatchPatient(db, batchId, patient.id);
          activePatients.push(patient);
        }
        for (const noteInput of planned.notes) {
          const note = createNote(db, {
            patient_id: patient.id,
            format_id: format.id,
            title: noteInput.title ?? `Imported session, ${noteInput.date}`,
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
  if (!request.isMultipart())
    throw badRequest('Send one or more PDFs as multipart/form-data using the files field.');
  const files: HalaxyFile[] = [];
  let total = 0;
  const parts = request.parts({
    limits: { files: MAX_HALAXY_FILES, fileSize: MAX_HALAXY_FILE_BYTES, fields: 0, parts: MAX_HALAXY_FILES },
  });
  for await (const part of parts) {
    if (part.type !== 'file') continue;
    if (part.fieldname !== 'files') {
      part.file.resume();
      throw badRequest('Upload PDFs in the files field.');
    }
    if (!part.filename.toLowerCase().endsWith('.pdf')) {
      part.file.resume();
      throw badRequest('Halaxy exports must be PDF files.');
    }
    const chunks: Buffer[] = [];
    for await (const chunk of part.file) chunks.push(chunk as Buffer);
    if (part.file.truncated) throw badRequest('A PDF is too large to read in one go.');
    const bytes = Buffer.concat(chunks);
    total += bytes.length;
    if (total > MAX_HALAXY_TOTAL_BYTES)
      throw badRequest('The selected PDFs are too large to read in one go.');
    files.push({ filename: part.filename, bytes });
  }
  if (files.length === 0) throw badRequest('Choose at least one Halaxy PDF.');
  return files;
}

function rejectionMessage(error: unknown): string {
  if (error instanceof ExtractError || error instanceof HalaxyParseError) return error.message;
  return "Apunta couldn't read that PDF. Choose a text-based Halaxy export.";
}

function normalizePatientName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}
