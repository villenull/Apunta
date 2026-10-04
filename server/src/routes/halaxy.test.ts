import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { HalaxyImportResponse, HalaxyPreviewResponse, NoteFormatListResponse } from '@apunta/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listNotesForPatient } from '../db/notes.js';
import { listPatients } from '../db/patients.js';
import { createTestApp, seedFormat, seedNote, seedPatient, type TestApp } from '../test/harness.js';

const FIXTURE = join(import.meta.dirname, '..', '..', '..', 'e2e', 'fixtures', 'halaxy', 'john-smith.pdf');
const PDF = readFileSync(FIXTURE);

function multipart(files: Array<{ name: string; bytes: Buffer }>): Buffer {
  const boundary = 'apunta-halaxy-test';
  const chunks: Buffer[] = [];
  for (const file of files) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${file.name}"\r\nContent-Type: application/pdf\r\n\r\n`,
      ),
      file.bytes,
      Buffer.from('\r\n'),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}

let harness: TestApp;

/**
 * The language of the format the run writes into. It takes the first format in
 * the database — the same one the route reads — so every format is relabelled
 * rather than a second one being added behind it.
 */
async function setFormatLocale(locale: 'en' | 'es-MX'): Promise<void> {
  const list = await harness.app.inject({ method: 'GET', url: '/api/formats' });
  for (const format of list.json<NoteFormatListResponse>().formats) {
    const patched = await harness.app.inject({
      method: 'PATCH',
      url: `/api/formats/${format.id}`,
      payload: { locale },
    });
    expect(patched.statusCode).toBe(200);
  }
}

/** The one fixture PDF, through the preview the run's payload is built from. */
async function previewJohn(): Promise<HalaxyPreviewResponse['patients'][number]> {
  const response = await harness.app.inject({
    method: 'POST',
    url: '/api/import/halaxy/preview',
    headers: { 'content-type': 'multipart/form-data; boundary=apunta-halaxy-test' },
    payload: multipart([{ name: 'john-smith.pdf', bytes: PDF }]),
  });
  expect(response.statusCode).toBe(200);
  return response.json<HalaxyPreviewResponse>().patients[0]!;
}

beforeEach(async () => {
  harness = await createTestApp();
  await seedFormat(harness.app);
});

afterEach(async () => {
  await harness.close();
});

describe('POST /api/import/halaxy/preview', () => {
  it('round-trips a multi-page PDF without persisting it', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/import/halaxy/preview',
      headers: { 'content-type': 'multipart/form-data; boundary=apunta-halaxy-test' },
      payload: multipart([{ name: 'john-smith.pdf', bytes: PDF }]),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<HalaxyPreviewResponse>();
    expect(body.rejected).toEqual([]);
    expect(body.patients[0]?.patientName).toBe('John Smith');
    expect(body.patients[0]?.notes).toHaveLength(3);
    expect(listPatients(harness.db, { includeArchived: true })).toHaveLength(0);
  });

  it('reports a non-PDF or unreadable PDF instead of persisting anything', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/import/halaxy/preview',
      headers: { 'content-type': 'multipart/form-data; boundary=apunta-halaxy-test' },
      payload: multipart([{ name: 'scan.pdf', bytes: Buffer.from('%PDF-1.4 not a readable text PDF') }]),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<HalaxyPreviewResponse>();
    expect(body.patients).toHaveLength(0);
    expect(body.rejected[0]?.reason).toMatch(/PDF|scan|read/i);
    expect(listPatients(harness.db, { includeArchived: true })).toHaveLength(0);
  });
});

describe('POST /api/import/halaxy', () => {
  it('publishes all selected notes in one undoable batch', async () => {
    const preview = await harness.app.inject({
      method: 'POST',
      url: '/api/import/halaxy/preview',
      headers: { 'content-type': 'multipart/form-data; boundary=apunta-halaxy-test' },
      payload: multipart([{ name: 'john-smith.pdf', bytes: PDF }]),
    });
    const patient = preview.json<HalaxyPreviewResponse>().patients[0]!;
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/import/halaxy',
      payload: {
        patients: [
          {
            fileName: patient.fileName,
            patientName: 'John Smith (edited)',
            notes: patient.notes.map(({ date, title, text }) => ({ date, title, text })),
          },
        ],
      },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json<HalaxyImportResponse>();
    expect(body.notes).toBe(3);
    const created = listPatients(harness.db, { includeArchived: true });
    expect(created).toHaveLength(1);
    expect(created[0]?.name).toBe('John Smith (edited)');
    expect(listNotesForPatient(harness.db, created[0]!.id).every((note) => note.status === 'published')).toBe(
      true,
    );

    const undone = await harness.app.inject({
      method: 'POST',
      url: `/api/import/batches/${body.batch_id}/undo`,
    });
    expect(undone.statusCode).toBe(200);
    expect(undone.json()).toMatchObject({ notes_deleted: 3, patients_deleted: 1 });
    expect(listPatients(harness.db, { includeArchived: true })).toHaveLength(0);
  });

  it('adds a repeated PDF to one matching chart and undo leaves prior notes', async () => {
    const existing = await seedPatient(harness.app, '  john   smith ');
    const format = await seedFormat(harness.app, { name: 'Prior Halaxy note format' });
    await seedNote(harness.app, existing.id, format.id, 'Prior Halaxy note stays here.');
    const preview = await harness.app.inject({
      method: 'POST',
      url: '/api/import/halaxy/preview',
      headers: { 'content-type': 'multipart/form-data; boundary=apunta-halaxy-test' },
      payload: multipart([{ name: 'john-smith.pdf', bytes: PDF }]),
    });
    const patient = preview.json<HalaxyPreviewResponse>().patients[0]!;
    expect(patient.existingPatients.map((match) => match.id)).toEqual([existing.id]);

    const run = await harness.app.inject({
      method: 'POST',
      url: '/api/import/halaxy',
      payload: {
        patients: [
          {
            fileName: patient.fileName,
            patientName: 'John Smith',
            existingPatientId: existing.id,
            notes: patient.notes.map(({ date, title, text }) => ({ date, title, text })),
          },
        ],
      },
    });
    expect(run.statusCode).toBe(201);
    expect(listPatients(harness.db, { includeArchived: true })).toHaveLength(1);
    expect(listNotesForPatient(harness.db, existing.id)).toHaveLength(4);

    const undone = await harness.app.inject({
      method: 'POST',
      url: `/api/import/batches/${run.json<HalaxyImportResponse>().batch_id}/undo`,
    });
    expect(undone.statusCode).toBe(200);
    expect(undone.json()).toMatchObject({ notes_deleted: 3, patients_deleted: 0 });
    expect(listPatients(harness.db, { includeArchived: true })).toHaveLength(1);
    expect(listNotesForPatient(harness.db, existing.id)).toHaveLength(1);
  });

  // Same rule as the Claude import (C-LANG@1 rule 3): the note's language is
  // its format's, and a title is a sentence in that language.
  it('writes the note, and an untitled fallback title, in the format’s language', async () => {
    await setFormatLocale('es-MX');
    const patient = await previewJohn();
    const created = await harness.app.inject({
      method: 'POST',
      url: '/api/import/halaxy',
      payload: {
        patients: [
          {
            fileName: patient.fileName,
            patientName: 'John Smith',
            // No `title` on any note: the fallback is what is under test.
            notes: patient.notes.map(({ date, text }) => ({ date, text })),
          },
        ],
      },
    });
    expect(created.statusCode).toBe(201);

    const john = listPatients(harness.db).find((p) => p.name === 'John Smith');
    const notes = listNotesForPatient(harness.db, john?.id ?? '');
    expect(notes).toHaveLength(3);
    expect(notes.every((note) => note.locale === 'es-MX')).toBe(true);
    expect(notes.map((note) => note.title).sort()).toEqual(
      patient.notes.map(({ date }) => `Sesión importada, ${date}`).sort(),
    );
  });

  it('keeps an English format’s fallback title in English', async () => {
    const patient = await previewJohn();
    const created = await harness.app.inject({
      method: 'POST',
      url: '/api/import/halaxy',
      payload: {
        patients: [
          {
            fileName: patient.fileName,
            patientName: 'John Smith',
            notes: patient.notes.map(({ date, text }) => ({ date, text })),
          },
        ],
      },
    });
    expect(created.statusCode).toBe(201);
    const john = listPatients(harness.db).find((p) => p.name === 'John Smith');
    const notes = listNotesForPatient(harness.db, john?.id ?? '');
    expect(notes.every((note) => note.locale === 'en')).toBe(true);
    expect(notes.map((note) => note.title).sort()).toEqual(
      patient.notes.map(({ date }) => `Imported session, ${date}`).sort(),
    );
  });

  // Halaxy reaches its stale patient the same way — she picked a chart on the
  // preview screen and it is no longer there — and it was already a 400 with a
  // catalogue key. This pins that, so it cannot quietly become a 500.
  it('400s a patient she selected that is archived or unknown, and writes nothing', async () => {
    const archived = await seedPatient(harness.app, 'John Smith');
    const archivedResponse = await harness.app.inject({
      method: 'PATCH',
      url: `/api/patients/${archived.id}`,
      payload: { archived: true },
    });
    expect(archivedResponse.statusCode).toBe(200);
    // A well-formed id for a patient this database has never held.
    const neverExisted = '018f1c40-0000-7000-8000-00000000abcd';
    const patient = await previewJohn();

    for (const existingPatientId of [archived.id, neverExisted]) {
      const response = await harness.app.inject({
        method: 'POST',
        url: '/api/import/halaxy',
        payload: {
          patients: [
            {
              fileName: patient.fileName,
              patientName: 'John Smith',
              existingPatientId,
              notes: patient.notes.map(({ date, text }) => ({ date, text })),
            },
          ],
        },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json<{ error: string; message: string }>()).toMatchObject({
        error: 'bad_request',
        message: expect.stringMatching(/patient/i),
      });
    }
    expect(listNotesForPatient(harness.db, archived.id)).toHaveLength(0);
    expect(harness.db.prepare('SELECT COUNT(*) AS n FROM import_batches').get()).toEqual({ n: 0 });
  });
});
