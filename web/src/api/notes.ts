import {
  NoteListResponseSchema,
  NoteSchema,
  type CreateNoteRequest,
  type Note,
  type UpdateNoteRequest,
} from '@apunta/shared';

import { requestJson, requestVoid } from './client.js';

export async function listNotes(patientId: string, signal?: AbortSignal): Promise<Note[]> {
  const { notes } = await requestJson(
    `/api/patients/${patientId}/notes`,
    NoteListResponseSchema,
    signal ? { signal } : {},
  );
  return notes;
}

export async function createNote(input: CreateNoteRequest): Promise<Note> {
  return requestJson('/api/notes', NoteSchema, { method: 'POST', body: input });
}

export async function updateNote(id: string, patch: UpdateNoteRequest): Promise<Note> {
  return requestJson(`/api/notes/${id}`, NoteSchema, { method: 'PATCH', body: patch });
}

export async function deleteNote(id: string): Promise<void> {
  return requestVoid(`/api/notes/${id}`, { method: 'DELETE' });
}

/** Publishing locks the body until `unpublishNote` releases it. */
export async function publishNote(id: string): Promise<Note> {
  return requestJson(`/api/notes/${id}/publish`, NoteSchema, { method: 'POST' });
}

export async function unpublishNote(id: string): Promise<Note> {
  return requestJson(`/api/notes/${id}/unpublish`, NoteSchema, { method: 'POST' });
}
