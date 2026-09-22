import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { HalaxyImportResponse, HalaxyPreviewResponse } from '@apunta/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listNotesForPatient } from '../db/notes.js';
import { listPatients } from '../db/patients.js';
import { createTestApp, seedFormat, type TestApp } from '../test/harness.js';

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
});
