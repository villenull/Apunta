import {
  DetectFormatResponseSchema,
  NoteFormatListResponseSchema,
  NoteFormatSchema,
  type CreateNoteFormatRequest,
  type DetectFormatResponse,
  type DetectKind,
  type NoteFormat,
  type UpdateNoteFormatRequest,
} from '@apunta/shared';

import { requestJson, requestVoid } from './client.js';

export async function listFormats(signal?: AbortSignal): Promise<NoteFormat[]> {
  const { formats } = await requestJson(
    '/api/formats',
    NoteFormatListResponseSchema,
    signal ? { signal } : {},
  );
  return formats;
}

export async function createFormat(input: CreateNoteFormatRequest): Promise<NoteFormat> {
  return requestJson('/api/formats', NoteFormatSchema, { method: 'POST', body: input });
}

/**
 * The owner's standard progress note, created by the server with her sections
 * and her drafting instructions. No body: the instructions never pass through
 * the browser.
 */
export async function createStandardFormat(): Promise<NoteFormat> {
  return requestJson('/api/formats/standard', NoteFormatSchema, { method: 'POST' });
}

export async function updateFormat(id: string, patch: UpdateNoteFormatRequest): Promise<NoteFormat> {
  return requestJson(`/api/formats/${id}`, NoteFormatSchema, { method: 'PATCH', body: patch });
}

/** Refused with 409 while notes still reference the format. */
export async function deleteFormat(id: string): Promise<void> {
  return requestVoid(`/api/formats/${id}`, { method: 'DELETE' });
}

/**
 * Read a format out of an uploaded template or a few example notes. Saves
 * nothing: the answer goes to the confirm screen, and only what she approves
 * there is sent to `POST /api/formats`.
 *
 * **The file names are dropped here, before the upload leaves the browser.**
 * `Smith, John — 2026-07-14.docx` names a client, and a server cannot leak
 * what it never receives.
 */
export async function detectFormat(
  kind: DetectKind,
  files: readonly File[],
  signal?: AbortSignal,
): Promise<DetectFormatResponse> {
  const form = new FormData();
  form.append('kind', kind);
  files.forEach((file, index) => {
    form.append('files', file, `upload-${String(index + 1)}`);
  });
  return requestJson('/api/formats/detect', DetectFormatResponseSchema, {
    method: 'POST',
    body: form,
    ...(signal ? { signal } : {}),
  });
}
