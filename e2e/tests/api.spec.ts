import { expect, test } from '@playwright/test';

/**
 * The unit suite drives the API with `fastify.inject`. This spec proves the
 * same routes work through the real HTTP server that `npm start` runs — built
 * server code, real SQLite file in a temp data dir, real JSON over loopback.
 */

test('a patient, a format and a note round-trip through the running server', async ({ request }) => {
  const formatResponse = await request.post('/api/formats', {
    data: { name: `E2E format ${String(Date.now())}`, sections: ['Subjective', 'Plan'] },
  });
  expect(formatResponse.status()).toBe(201);
  const format = (await formatResponse.json()) as { id: string; name: string };

  const patientResponse = await request.post('/api/patients', {
    data: { name: `E2E patient ${String(Date.now())}` },
  });
  expect(patientResponse.status()).toBe(201);
  const patient = (await patientResponse.json()) as { id: string; name: string };

  const noteResponse = await request.post('/api/notes', {
    data: { patient_id: patient.id, format_id: format.id, content: 'Subjective: Sample body.' },
  });
  expect(noteResponse.status()).toBe(201);
  const note = (await noteResponse.json()) as { id: string; title: string; status: string; revision: number };
  expect(note).toMatchObject({ title: format.name, status: 'draft', revision: 0 });

  const listed = await request.get(`/api/patients/${patient.id}/notes`);
  const { notes } = (await listed.json()) as { notes: { id: string; revision: number }[] };
  expect(notes.map((n) => n.id)).toEqual([note.id]);

  // Publishing locks the body: a content edit has to be refused.
  const published = await request.post(`/api/notes/${note.id}/publish`);
  expect(published.status()).toBe(200);
  await published.json();

  const blocked = await request.patch(`/api/notes/${note.id}`, {
    data: { revision: note.revision, content: 'edited' },
  });
  expect(blocked.status()).toBe(409);

  const unpublished = await request.post(`/api/notes/${note.id}/unpublish`);
  const draft = (await unpublished.json()) as { revision: number };
  const allowed = await request.patch(`/api/notes/${note.id}`, {
    data: { revision: draft.revision, content: 'edited' },
  });
  expect(allowed.status()).toBe(200);

  // Deleting the patient takes the note with it.
  expect((await request.delete(`/api/patients/${patient.id}`)).status()).toBe(204);
  expect((await request.get(`/api/notes/${note.id}`)).status()).toBe(404);
});

test('the health endpoint reports a migrated database', async ({ request }) => {
  const response = await request.get('/api/health');

  expect(response.ok()).toBe(true);
  const health = (await response.json()) as { db: { path: string; migrationLevel: number } };
  expect(health.db.path).toContain('apunta.db');
  expect(health.db.migrationLevel).toBeGreaterThanOrEqual(1);
});

test('validation and unknown ids come back as JSON errors', async ({ request }) => {
  const badBody = await request.post('/api/patients', { data: { name: '  ' } });
  expect(badBody.status()).toBe(400);
  expect(await badBody.json()).toMatchObject({ error: 'bad_request' });

  const unknown = await request.get('/api/notes/does-not-exist');
  expect(unknown.status()).toBe(404);
  expect(await unknown.json()).toMatchObject({ error: 'not_found' });
});
