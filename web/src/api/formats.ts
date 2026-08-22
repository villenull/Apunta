import {
  NoteFormatListResponseSchema,
  NoteFormatSchema,
  type CreateNoteFormatRequest,
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

export async function updateFormat(id: string, patch: UpdateNoteFormatRequest): Promise<NoteFormat> {
  return requestJson(`/api/formats/${id}`, NoteFormatSchema, { method: 'PATCH', body: patch });
}

/** Refused with 409 while notes still reference the format. */
export async function deleteFormat(id: string): Promise<void> {
  return requestVoid(`/api/formats/${id}`, { method: 'DELETE' });
}
