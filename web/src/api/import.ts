import {
  ClaudeImportReportSchema,
  HalaxyImportResponseSchema,
  HalaxyPreviewResponseSchema,
  ImportBatchListResponseSchema,
  ImportUndoResponseSchema,
  type ClaudeImportReport,
  type HalaxyImportRequest,
  type HalaxyImportResponse,
  type HalaxyPreviewResponse,
  type ImportBatchListResponse,
  type ImportNoteSource,
  type ImportUndoResponse,
} from '@apunta/shared';

import { requestJson } from './client.js';

/**
 * Importing her Claude conversations (M11), automatically.
 *
 * The preview and the run take the same upload and compute the same plan;
 * only the run writes. The file goes up again for the run rather than the
 * server keeping a copy between the two. Every call goes to 127.0.0.1 like
 * everything else — the archive never leaves this machine.
 */
export interface ClaudeImportInput {
  readonly file: File;
  /** Her optional list, one name per line. */
  readonly names: string;
  readonly cutoff: string;
  readonly source: ImportNoteSource;
  /** Patient keys she unticked in the summary. */
  readonly exclude: readonly string[];
  /** Explicit review choices: a patient id to add to, or null to create new. */
  readonly existingPatientIds?: Readonly<Record<string, string | null>>;
}

function form(input: ClaudeImportInput): FormData {
  const body = new FormData();
  body.append('names', input.names);
  body.append('cutoff', input.cutoff);
  body.append('source', input.source);
  body.append('exclude', JSON.stringify(input.exclude));
  if (input.existingPatientIds !== undefined)
    body.append('existingPatientIds', JSON.stringify(input.existingPatientIds));
  body.append('export', input.file, input.file.name);
  return body;
}

export function previewClaudeImport(input: ClaudeImportInput): Promise<ClaudeImportReport> {
  return requestJson('/api/import/claude/preview', ClaudeImportReportSchema, {
    method: 'POST',
    body: form(input),
  });
}

export interface HalaxyImportInput {
  readonly files: readonly File[];
}

function halaxyForm(files: readonly File[]): FormData {
  const body = new FormData();
  for (const file of files) body.append('files', file, file.name);
  return body;
}

export function previewHalaxyImport(files: readonly File[]): Promise<HalaxyPreviewResponse> {
  return requestJson('/api/import/halaxy/preview', HalaxyPreviewResponseSchema, {
    method: 'POST',
    body: halaxyForm(files),
  });
}

export function runHalaxyImport(input: HalaxyImportRequest): Promise<HalaxyImportResponse> {
  return requestJson('/api/import/halaxy', HalaxyImportResponseSchema, {
    method: 'POST',
    body: input,
  });
}
export function runClaudeImport(input: ClaudeImportInput): Promise<ClaudeImportReport> {
  return requestJson('/api/import/claude/run', ClaudeImportReportSchema, {
    method: 'POST',
    body: form(input),
  });
}

export function listImportBatches(): Promise<ImportBatchListResponse> {
  return requestJson('/api/import/batches', ImportBatchListResponseSchema);
}

export function undoImportBatch(id: string): Promise<ImportUndoResponse> {
  return requestJson(`/api/import/batches/${id}/undo`, ImportUndoResponseSchema, { method: 'POST' });
}
