import { PatientSchema, type Patient } from '@apunta/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiRequestError, errorMessage, requestJson, requestVoid } from './client.js';
import { createFormat } from './formats.js';
import { createNote, publishNote, updateNote } from './notes.js';
import { createPatient, deletePatient, listPatients } from './patients.js';

const patient: Patient = {
  id: '0198c0f0-0000-7000-8000-000000000001',
  name: 'John Smith',
  identifier: null,
  created_at: '2026-08-22T09:00:00.000Z',
  archived_at: null,
};

const format = {
  id: '0198c0f0-0000-7000-8000-000000000002',
  name: 'Progress note',
  sections: ['Subjective', 'Plan'],
  instructions: '',
  source: 'manual' as const,
  // A stubbed response body, parsed by the client against the shared output
  // schema — so it carries the required `locale` (C-LANG@1 rule 3) like any
  // real one does.
  locale: 'en' as const,
  created_at: '2026-08-22T09:00:00.000Z',
};

const note = {
  id: '0198c0f0-0000-7000-8000-000000000003',
  patient_id: patient.id,
  format_id: format.id,
  title: 'Progress note',
  status: 'draft' as const,
  revision: 0,
  content: 'Subjective: Sample body.',
  locale: 'en' as const,
  created_at: '2026-08-22T09:00:00.000Z',
  updated_at: '2026-08-22T09:00:00.000Z',
  published_at: null,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubFetch(handler: (path: string, init: RequestInit) => Response | Promise<Response>) {
  const spy = vi.fn(async (path: string, init: RequestInit) => handler(path, init));
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('requestJson', () => {
  it('validates the response against the shared schema', async () => {
    stubFetch(() => jsonResponse(patient));

    await expect(requestJson('/api/patients/1', PatientSchema)).resolves.toEqual(patient);
  });

  it('rejects a payload the server should never have sent', async () => {
    stubFetch(() => jsonResponse({ ...patient, created_at: 'yesterday' }));

    await expect(requestJson('/api/patients/1', PatientSchema)).rejects.toThrow();
  });

  it('surfaces the API error body as an ApiRequestError', async () => {
    stubFetch(() => jsonResponse({ error: 'conflict', message: 'This note is already published.' }, 409));

    const error = await requestJson('/api/notes/1', PatientSchema).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 409, code: 'conflict' });
    expect(errorMessage(error)).toBe('This note is already published.');
  });

  it('falls back to a status message when the error body is not JSON', async () => {
    stubFetch(() => new Response('<html>nope</html>', { status: 500 }));

    const error = await requestJson('/api/patients', PatientSchema).catch((thrown: unknown) => thrown);

    expect(error).toMatchObject({ status: 500, code: 'internal_error' });
    expect(errorMessage(error)).toBe('The Apunta server returned an unexpected error. Try again.');
  });

  it('reports an unreachable server rather than a raw TypeError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    const error = await requestJson('/api/patients', PatientSchema).catch((thrown: unknown) => thrown);

    expect(error).toMatchObject({ status: 0, code: 'network_error' });
    expect(errorMessage(error)).toContain('Could not reach the Apunta server');
  });

  it('lets an abort propagate untouched so callers can ignore it', async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        throw error;
      }),
    );

    const error = await requestJson('/api/patients', PatientSchema, { signal: controller.signal }).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).not.toBeInstanceOf(ApiRequestError);
    expect((error as Error).name).toBe('AbortError');
  });
});

describe('requestVoid', () => {
  it('accepts a 204 with no body', async () => {
    stubFetch(() => new Response(null, { status: 204 }));

    await expect(requestVoid('/api/patients/1', { method: 'DELETE' })).resolves.toBeUndefined();
  });
});

describe('resource helpers', () => {
  it('sends the right method, path and JSON body', async () => {
    const calls: { path: string; init: RequestInit }[] = [];
    stubFetch((path, init) => {
      calls.push({ path, init });
      if (path === '/api/patients' && init.method === 'GET') return jsonResponse({ patients: [] });
      if (path.endsWith('/publish')) return jsonResponse(note);
      if (path.startsWith('/api/notes')) return jsonResponse(note);
      if (path.startsWith('/api/formats')) return jsonResponse(format);
      if (init.method === 'DELETE') return new Response(null, { status: 204 });
      return jsonResponse(patient);
    });

    await listPatients();
    await createPatient({ name: 'John Smith' });
    await deletePatient(patient.id);
    await createNote({ patient_id: patient.id, format_id: format.id });
    await updateNote(note.id, { revision: note.revision, content: 'Subjective: edited.' });
    await publishNote(note.id);
    await createFormat({ name: 'Progress note', sections: ['Subjective', 'Plan'] });

    expect(calls.map((call) => `${String(call.init.method)} ${call.path}`)).toEqual([
      'GET /api/patients',
      'POST /api/patients',
      `DELETE /api/patients/${patient.id}`,
      'POST /api/notes',
      `PATCH /api/notes/${note.id}`,
      `POST /api/notes/${note.id}/publish`,
      'POST /api/formats',
    ]);
    expect(calls[1]?.init.body).toBe(JSON.stringify({ name: 'John Smith' }));
    expect(calls[4]?.init.body).toBe(JSON.stringify({ revision: 0, content: 'Subjective: edited.' }));
  });
});
