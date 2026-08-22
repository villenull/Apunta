import { PatientListResponseSchema, PatientSchema, type Patient } from '@patience/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, seedFormat, seedNote, seedPatient, type TestApp } from '../test/harness.js';

let harness: TestApp;

beforeEach(async () => {
  harness = await createTestApp();
});

afterEach(async () => {
  await harness.close();
});

describe('POST /api/patients', () => {
  it('creates a patient and answers 201 with a schema-valid body', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/patients',
      payload: { name: '  John Smith  ', identifier: 'JS-001' },
    });

    expect(response.statusCode).toBe(201);
    const patient = PatientSchema.parse(response.json());
    expect(patient.name).toBe('John Smith');
    expect(patient.identifier).toBe('JS-001');
    expect(patient.archived_at).toBeNull();
  });

  it('defaults the optional identifier to null', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/patients',
      payload: { name: 'Ana Torres' },
    });

    expect(response.json<Patient>().identifier).toBeNull();
  });

  it('rejects a missing or empty name with 400 and the offending field', async () => {
    for (const payload of [{}, { name: '   ' }, { name: 42 }]) {
      const response = await harness.app.inject({ method: 'POST', url: '/api/patients', payload });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: 'bad_request' });
    }
  });
});

describe('GET /api/patients', () => {
  it('returns patients in creation order with their note counts', async () => {
    const format = await seedFormat(harness.app);
    const john = await seedPatient(harness.app, 'John Smith');
    await seedPatient(harness.app, 'Maria Ruiz');
    await seedNote(harness.app, john.id, format.id);

    const response = await harness.app.inject({ method: 'GET', url: '/api/patients' });

    expect(response.statusCode).toBe(200);
    const { patients } = PatientListResponseSchema.parse(response.json());
    expect(patients.map((p) => [p.name, p.note_count])).toEqual([
      ['John Smith', 1],
      ['Maria Ruiz', 0],
    ]);
  });

  it('hides archived patients unless asked for them', async () => {
    const john = await seedPatient(harness.app, 'John Smith');
    await seedPatient(harness.app, 'Ana Torres');

    await harness.app.inject({
      method: 'PATCH',
      url: `/api/patients/${john.id}`,
      payload: { archived: true },
    });

    const visible = await harness.app.inject({ method: 'GET', url: '/api/patients' });
    expect(visible.json<{ patients: Patient[] }>().patients.map((p) => p.name)).toEqual(['Ana Torres']);

    const all = await harness.app.inject({ method: 'GET', url: '/api/patients?include_archived=1' });
    expect(all.json<{ patients: Patient[] }>().patients.map((p) => p.name)).toEqual([
      'John Smith',
      'Ana Torres',
    ]);
  });

  it('rejects a nonsense value for include_archived', async () => {
    const response = await harness.app.inject({ method: 'GET', url: '/api/patients?include_archived=maybe' });

    expect(response.statusCode).toBe(400);
  });
});

describe('GET /api/patients/:id', () => {
  it('returns the patient', async () => {
    const patient = await seedPatient(harness.app);

    const response = await harness.app.inject({ method: 'GET', url: `/api/patients/${patient.id}` });

    expect(response.statusCode).toBe(200);
    expect(response.json<Patient>().id).toBe(patient.id);
  });

  it('404s an unknown id', async () => {
    const response = await harness.app.inject({ method: 'GET', url: '/api/patients/nope' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: 'not_found', message: 'Patient not found' });
  });
});

describe('PATCH /api/patients/:id', () => {
  it('renames, clears the identifier and archives', async () => {
    const patient = await seedPatient(harness.app);

    const renamed = await harness.app.inject({
      method: 'PATCH',
      url: `/api/patients/${patient.id}`,
      payload: { name: 'Jonathan Smith', identifier: null },
    });
    expect(renamed.json<Patient>()).toMatchObject({ name: 'Jonathan Smith', identifier: null });

    const archived = await harness.app.inject({
      method: 'PATCH',
      url: `/api/patients/${patient.id}`,
      payload: { archived: true },
    });
    expect(archived.json<Patient>().archived_at).not.toBeNull();

    const restored = await harness.app.inject({
      method: 'PATCH',
      url: `/api/patients/${patient.id}`,
      payload: { archived: false },
    });
    expect(restored.json<Patient>().archived_at).toBeNull();
  });

  it('rejects an empty patch and an unknown id', async () => {
    const patient = await seedPatient(harness.app);

    const empty = await harness.app.inject({
      method: 'PATCH',
      url: `/api/patients/${patient.id}`,
      payload: {},
    });
    expect(empty.statusCode).toBe(400);

    const missing = await harness.app.inject({
      method: 'PATCH',
      url: '/api/patients/nope',
      payload: { name: 'Ghost' },
    });
    expect(missing.statusCode).toBe(404);
  });
});

describe('DELETE /api/patients/:id', () => {
  it('deletes the patient and cascades their notes away', async () => {
    const format = await seedFormat(harness.app);
    const patient = await seedPatient(harness.app);
    const note = await seedNote(harness.app, patient.id, format.id);

    const response = await harness.app.inject({ method: 'DELETE', url: `/api/patients/${patient.id}` });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');

    const goneNote = await harness.app.inject({ method: 'GET', url: `/api/notes/${note.id}` });
    expect(goneNote.statusCode).toBe(404);

    const gonePatient = await harness.app.inject({ method: 'GET', url: `/api/patients/${patient.id}` });
    expect(gonePatient.statusCode).toBe(404);
  });

  it('404s an unknown id', async () => {
    const response = await harness.app.inject({ method: 'DELETE', url: '/api/patients/nope' });

    expect(response.statusCode).toBe(404);
  });
});
