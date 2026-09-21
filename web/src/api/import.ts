import {
  ClaudeImportReportSchema,
  ImportBatchListResponseSchema,
  ImportUndoResponseSchema,
  type ClaudeImportReport,
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
}

function form(input: ClaudeImportInput): FormData {
  const body = new FormData();
  body.append('names', input.names);
  body.append('cutoff', input.cutoff);
  body.append('source', input.source);
  body.append('exclude', JSON.stringify(input.exclude));
  body.append('export', input.file, input.file.name);
  return body;
}

export function previewClaudeImport(input: ClaudeImportInput): Promise<ClaudeImportReport> {
  return requestJson('/api/import/claude/preview', ClaudeImportReportSchema, {
    method: 'POST',
    body: form(input),
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
