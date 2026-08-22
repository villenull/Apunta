import type { Note, NoteFormat, Patient, PatientListItem } from '@apunta/shared';
import { vi } from 'vitest';

/**
 * A stand-in for the JSON API, small enough to read in one sitting.
 *
 * Component tests want the screens' real behaviour — publish locks the body,
 * deleting a note reloads the counts — without a server. This keeps the same
 * invariants the routes enforce (`server/src/routes/notes.ts`), so a test that
 * passes here is not passing against a friendlier API than production.
 *
 * Every name in the fixtures comes from the prototype's sample practice
 * (CLAUDE.md hard rule 2).
 */
export interface FakeApiState {
  patients: PatientListItem[];
  notes: Note[];
  formats: NoteFormat[];
}

export interface FakeApi {
  state: FakeApiState;
  /** "GET /api/patients", in order, for asserting what a screen actually sent. */
  calls: string[];
}

const NOW = '2026-08-22T12:00:00.000Z';

/**
 * Ids are UUIDv7-shaped because the shared schemas validate them: a fixture
 * with a readable id like "note-1" fails at the client boundary, which is
 * exactly what that validation is for.
 */
let idCounter = 0;
export function fakeId(): string {
  idCounter += 1;
  return `0198c0f0-0000-7000-8000-${String(idCounter).padStart(12, '0')}`;
}

export function makePatient(name: string, overrides: Partial<PatientListItem> = {}): PatientListItem {
  return {
    id: fakeId(),
    name,
    identifier: null,
    created_at: '2026-07-01T09:00:00.000Z',
    archived_at: null,
    note_count: 0,
    ...overrides,
  };
}

export function makeFormat(name: string, sections: string[]): NoteFormat {
  return {
    id: fakeId(),
    name,
    sections,
    instructions: '',
    source: 'manual',
    created_at: '2026-07-01T09:00:00.000Z',
  };
}

export function makeNote(patientId: string, overrides: Partial<Note> = {}): Note {
  return {
    id: fakeId(),
    patient_id: patientId,
    format_id: fakeId(),
    title: 'Progress note',
    status: 'draft',
    content: 'Subjective: Patient reports improved sleep since last session.',
    created_at: '2026-08-08T09:00:00.000Z',
    updated_at: '2026-08-08T09:00:00.000Z',
    published_at: null,
    ...overrides,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function apiError(status: number, code: string, message: string): Response {
  return json({ error: code, message }, status);
}

/** Installs a `fetch` that answers the endpoints M2 uses, and returns its state. */
export function installFakeApi(initial: Partial<FakeApiState> = {}): FakeApi {
  const state: FakeApiState = { patients: [], notes: [], formats: [], ...initial };
  const calls: string[] = [];
  let sequence = 0;

  function stamp(): string {
    sequence += 1;
    return new Date(new Date(NOW).getTime() + sequence * 1000).toISOString();
  }

  function noteById(id: string): Note | undefined {
    return state.notes.find((note) => note.id === id);
  }

  function replaceNote(updated: Note): Note {
    state.notes = state.notes.map((note) => (note.id === updated.id ? updated : note));
    return updated;
  }

  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init: RequestInit = {}): Promise<Response> => {
      const method = init.method ?? 'GET';
      calls.push(`${method} ${path}`);
      const body: Record<string, unknown> =
        typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};

      if (path === '/api/formats' && method === 'GET') return json({ formats: state.formats });

      if (path === '/api/formats' && method === 'POST') {
        const format = makeFormat(String(body['name']), body['sections'] as string[]);
        state.formats = [...state.formats, format];
        return json(format, 201);
      }

      if (path === '/api/patients' && method === 'GET') return json({ patients: state.patients });

      if (path === '/api/patients' && method === 'POST') {
        const patient = makePatient(String(body['name']));
        state.patients = [...state.patients, patient];
        return json(patient, 201);
      }

      const notesMatch = /^\/api\/patients\/([^/]+)\/notes$/.exec(path);
      if (notesMatch && method === 'GET') {
        const patientId = notesMatch[1];
        return json({ notes: state.notes.filter((note) => note.patient_id === patientId) });
      }

      const patientMatch = /^\/api\/patients\/([^/]+)$/.exec(path);
      if (patientMatch) {
        const patientId = patientMatch[1];
        const patient = state.patients.find((candidate) => candidate.id === patientId);
        if (!patient) return apiError(404, 'not_found', 'Patient not found');
        if (method === 'DELETE') {
          state.patients = state.patients.filter((candidate) => candidate.id !== patientId);
          state.notes = state.notes.filter((note) => note.patient_id !== patientId);
          return new Response(null, { status: 204 });
        }
        const { note_count: _count, ...rest } = patient;
        return json(rest satisfies Patient);
      }

      if (path === '/api/notes' && method === 'POST') {
        const created = makeNote(String(body['patient_id']), {
          format_id: String(body['format_id']),
          content: typeof body['content'] === 'string' ? body['content'] : '',
          created_at: stamp(),
          updated_at: stamp(),
        });
        state.notes = [created, ...state.notes];
        return json(created, 201);
      }

      const publishMatch = /^\/api\/notes\/([^/]+)\/(publish|unpublish)$/.exec(path);
      if (publishMatch) {
        const note = noteById(publishMatch[1] ?? '');
        if (!note) return apiError(404, 'not_found', 'Note not found');
        const publishing = publishMatch[2] === 'publish';
        if (publishing === (note.status === 'published')) {
          return apiError(409, 'conflict', publishing ? 'Already published.' : 'Not published.');
        }
        return json(
          replaceNote({
            ...note,
            status: publishing ? 'published' : 'draft',
            published_at: publishing ? stamp() : null,
            updated_at: stamp(),
          }),
        );
      }

      const noteMatch = /^\/api\/notes\/([^/]+)$/.exec(path);
      if (noteMatch) {
        const note = noteById(noteMatch[1] ?? '');
        if (!note) return apiError(404, 'not_found', 'Note not found');
        if (method === 'DELETE') {
          state.notes = state.notes.filter((candidate) => candidate.id !== note.id);
          return new Response(null, { status: 204 });
        }
        // The published lock, exactly as the server enforces it.
        if (note.status === 'published' && body['content'] !== undefined) {
          return apiError(409, 'conflict', 'This note is published, so its content is locked.');
        }
        return json(
          replaceNote({
            ...note,
            ...(typeof body['title'] === 'string' ? { title: body['title'] } : {}),
            ...(typeof body['content'] === 'string' ? { content: body['content'] } : {}),
            updated_at: stamp(),
          }),
        );
      }

      return apiError(404, 'not_found', `No fake route for ${method} ${path}`);
    }),
  );

  return { state, calls };
}

/** jsdom has no clipboard; the publish flow writes to it. */
export function installFakeClipboard(): { written: string[] } {
  const written: string[] = [];
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (text: string) => {
        written.push(text);
        return Promise.resolve();
      },
    },
  });
  return { written };
}
