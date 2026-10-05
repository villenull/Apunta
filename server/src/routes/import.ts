import {
  DEFAULT_IMPORT_CUTOFF,
  ImportCutoffSchema,
  importedNoteTitle,
  ImportNoteSourceSchema,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_PATIENTS,
  parsePatientList,
  type ClaudeImportReport,
  type ImportBatchListResponse,
  type ImportUndoResponse,
} from '@apunta/shared';
import type { Database } from 'better-sqlite3';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { listFormats } from '../db/formats.js';
import {
  addBatchNote,
  addBatchPatient,
  createImportBatch,
  importBatchExists,
  listImportBatches,
  undoImportBatch,
} from '../db/import-batches.js';
import { createNote } from '../db/notes.js';
import { createPatient, listPatients } from '../db/patients.js';
import { createTranscript } from '../db/transcripts.js';
import { uuidv7 } from '../db/uuid.js';
import { badRequest, notFound } from '../http/errors.js';
import {
  importedKeys,
  ImportFormatError,
  openExport,
  planImport,
  type ImportOptions,
  type ImportPlan,
  type ReadExport,
} from '../import/claude.js';
import { begin, end } from '../jobs/registry.js';

/**
 * Importing her Claude conversations (M11), automatically — the owner's
 * choice on 2026-09-21, over per-note review.
 *
 * `POST /api/import/claude/preview` and `POST /api/import/claude/run` take
 * the same upload — the export, her optional list of names, the cutoff, the
 * note source, and the patients she unticked — and compute the same plan
 * (`planImport`). The preview writes nothing. The run writes exactly that
 * plan in one transaction, as one batch: drafts only, each with a transcript
 * row of source `import` naming the conversation, the session and its
 * message ids, which is also what lets a second run skip what the first
 * wrote. The export is read in the request's memory and kept nowhere: the
 * browser sends it again for the run rather than the server holding a copy.
 *
 * `GET /api/import/batches` lists past runs; `POST /api/import/batches/:id/undo`
 * takes one back.
 *
 * Every log line on this path is shape: counts, never a name.
 */
export function registerImportRoutes(app: FastifyInstance, db: Database): void {
  app.post('/api/import/claude/preview', async (request): Promise<ClaudeImportReport> => {
    const upload = await receiveExport(request);
    const plan = planFor(db, upload);
    request.log.info(
      { bytes: upload.bytes.length, notes: plan.report.notes, patients: plan.report.patients.length },
      'claude export previewed',
    );
    return { batch_id: null, ...plan.report };
  });

  app.post('/api/import/claude/run', async (request, reply): Promise<ClaudeImportReport> => {
    // C-UPD@1's registry. A run reads a whole export and writes patients,
    // notes and transcripts in one transaction, so it is the longest single
    // write in the app and the one a quiesce most needs to be able to name.
    // The id is minted here because there is nothing yet to identify it by:
    // the batch does not exist until the transaction below runs.
    const jobId = uuidv7();
    begin('import', jobId);
    try {
      const upload = await receiveExport(request);
      const format = listFormats(db)[0];
      if (!format) throw badRequest('errors.bad_request.needs_format');

      // Planned and written in one transaction, so what is skipped as already
      // imported is judged against the database this run writes to.
      const report = db.transaction((): ClaudeImportReport => {
        const plan = planFor(db, upload);
        if (plan.notes.length === 0) return { batch_id: null, ...plan.report };

        const batchId = createImportBatch(db, upload.options.source);
        const patientIds = plan.report.patients.map((planned) => {
          if (planned.patient_id !== null) return planned.patient_id;
          const created = createPatient(db, { name: planned.name, nameGuessed: planned.name_guessed });
          addBatchPatient(db, batchId, created.id);
          return created.id;
        });
        for (const planned of plan.notes) {
          const note = createNote(db, {
            patient_id: patientIds[planned.patient] as string,
            format_id: format.id,
            // The format's language is the note's language (C-LANG@1 rule 3), so
            // a refine on an imported note answers in the note's language.
            locale: format.locale,
            title: importedNoteTitle(planned.recordedAt, format.locale),
            content: planned.body,
            ...(planned.recordedAt === null ? {} : { created_at: planned.recordedAt }),
          });
          createTranscript(db, {
            note_id: note.id,
            source: 'import',
            raw_text: `${planned.provenance}\n\n${planned.body}`,
          });
          addBatchNote(db, batchId, note.id);
        }
        return {
          batch_id: batchId,
          ...plan.report,
          patients: plan.report.patients.map((planned, index) => ({
            ...planned,
            patient_id: patientIds[index] as string,
          })),
        };
      })();

      request.log.info(
        {
          notes: report.notes,
          patientsCreated: report.patients_to_create,
          patients: report.patients.length,
          skipped: report.skipped.length,
        },
        'claude conversations imported',
      );
      reply.code(report.batch_id === null ? 200 : 201);
      return report;
    } finally {
      end(jobId);
    }
  });

  app.get('/api/import/batches', (): ImportBatchListResponse => ({ batches: listImportBatches(db) }));

  app.post<{ Params: { id: string } }>('/api/import/batches/:id/undo', (request): ImportUndoResponse => {
    if (!importBatchExists(db, request.params.id)) throw notFound('errors.not_found.import_undone');
    const result = undoImportBatch(db, request.params.id);
    request.log.info(result, 'claude import undone');
    return result;
  });
}

function planFor(db: Database, upload: ExportUpload): ImportPlan {
  const transcripts = db
    .prepare(
      `SELECT t.raw_text, n.patient_id FROM transcripts t JOIN notes n ON n.id = t.note_id
        WHERE t.source = 'import'`,
    )
    .all() as { raw_text: string; patient_id: string }[];
  try {
    return planImport(upload.read, {
      ...upload.options,
      existing: listPatients(db, { includeArchived: true }).map((patient) => ({
        id: patient.id,
        name: patient.name,
        archived: patient.archived_at !== null,
      })),
      imported: importedKeys(transcripts),
      headings: listFormats(db).flatMap((format) => format.sections),
    });
  } catch (error) {
    // The planner's own keys travel with the error — a patient she selected
    // after the preview that is no longer active — so this is a 400 in the
    // request's language, exactly as the reader's four already are. On the run
    // this throw rolls the transaction back, so a stale choice writes nothing.
    if (error instanceof ImportFormatError) throw badRequest(error.key, error.params);
    throw error;
  }
}
interface ExportUpload {
  readonly bytes: Buffer;
  readonly read: ReadExport;
  readonly options: Pick<ImportOptions, 'names' | 'source' | 'cutoff' | 'exclude' | 'existingPatientIds'>;
}

/** The whole file into memory, and nowhere else; the form fields beside it. */
async function receiveExport(request: FastifyRequest): Promise<ExportUpload> {
  if (!request.isMultipart()) throw badRequest('errors.bad_request.import_not_multipart');

  let file: { bytes: Buffer; filename: string } | null = null;
  const fields = new Map<string, string>();
  const parts = request.parts({
    limits: { files: 1, fileSize: MAX_IMPORT_BYTES, fields: 8, fieldSize: 64 * 1024 },
  });
  for await (const part of parts) {
    if (part.type !== 'file') {
      if (typeof part.value === 'string') fields.set(part.fieldname, part.value);
      continue;
    }
    if (file !== null) {
      part.file.resume();
      continue;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of part.file) chunks.push(chunk as Buffer);
    if (part.file.truncated) throw badRequest('errors.bad_request.import_too_large');
    file = { bytes: Buffer.concat(chunks), filename: part.filename };
  }
  if (file === null || file.bytes.length === 0) throw badRequest('errors.bad_request.import_no_file');

  const names = parsePatientList(fields.get('names') ?? '');
  if (names.length > MAX_IMPORT_PATIENTS)
    throw badRequest('errors.bad_request.import_patient_limit', { max: MAX_IMPORT_PATIENTS });
  const source = ImportNoteSourceSchema.safeParse(fields.get('source') ?? 'assistant');
  if (!source.success || source.data === 'halaxy') throw badRequest('errors.bad_request.import_bad_source');
  const cutoff = ImportCutoffSchema.safeParse(fields.get('cutoff') ?? DEFAULT_IMPORT_CUTOFF);
  if (!cutoff.success) throw badRequest('errors.bad_request.import_bad_cutoff');
  let exclude: string[] = [];
  try {
    const parsed = JSON.parse(fields.get('exclude') ?? '[]') as unknown;
    if (Array.isArray(parsed)) exclude = parsed.filter((key): key is string => typeof key === 'string');
  } catch {
    throw badRequest('errors.bad_request.import_bad_exclude');
  }
  let existingPatientIds: Map<string, string | null> | undefined;
  try {
    const parsed = JSON.parse(fields.get('existingPatientIds') ?? '{}') as unknown;
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      existingPatientIds = new Map(
        Object.entries(parsed as Record<string, unknown>).flatMap(([key, value]) =>
          value === null || typeof value === 'string' ? [[key, value] as [string, string | null]] : [],
        ),
      );
    }
  } catch {
    throw badRequest('errors.bad_request.import_bad_existing');
  }

  let read: ReadExport;
  try {
    read = openExport(file.bytes, file.filename);
  } catch (error) {
    // The reader's own key travels with the error, so the 400 is the same
    // sentence in the request's language without this route knowing which of
    // the four it is holding.
    if (error instanceof ImportFormatError) throw badRequest(error.key, error.params);
    throw error;
  }
  return {
    bytes: file.bytes,
    read,
    options: {
      names,
      source: source.data,
      cutoff: cutoff.data,
      exclude: new Set(exclude),
      ...(existingPatientIds === undefined ? {} : { existingPatientIds }),
    },
  };
}
