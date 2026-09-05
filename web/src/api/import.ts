import {
  ClaudeImportAcceptResponseSchema,
  ClaudeImportPreviewSchema,
  type ClaudeImportAcceptRequest,
  type ClaudeImportAcceptResponse,
  type ClaudeImportPreview,
} from '@apunta/shared';

import { requestJson } from './client.js';

/**
 * Importing her Claude conversations (M11).
 *
 * The export goes up as a file and proposals come back; nothing is written
 * until `acceptClaudeImport`, and then only what she accepted. Both calls go
 * to 127.0.0.1 like everything else — the archive never leaves this machine.
 */
export function previewClaudeImport(file: File): Promise<ClaudeImportPreview> {
  const body = new FormData();
  body.append('export', file, file.name);
  return requestJson('/api/import/claude', ClaudeImportPreviewSchema, { method: 'POST', body });
}

export function acceptClaudeImport(input: ClaudeImportAcceptRequest): Promise<ClaudeImportAcceptResponse> {
  return requestJson('/api/import/claude/accept', ClaudeImportAcceptResponseSchema, {
    method: 'POST',
    body: input,
  });
}
