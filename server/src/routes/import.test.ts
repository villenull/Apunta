import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ClaudeImportPreview, NoteFormat, Patient } from '@apunta/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { listNotesForPatient } from '../db/notes.js';
import { listPatients } from '../db/patients.js';
import { listTranscriptsForNote } from '../db/transcripts.js';
import { createTestApp, seedFormat, seedPatient, type TestApp } from '../test/harness.js';

/**
 * The import's two invariants, end to end: the preview writes nothing, and
 * the accept writes exactly what she accepted with its provenance kept.
 * The fixture is fabricated (prototype names only).
 */
const FIXTURE = join(import.meta.dirname, '..', '..', '..', 'e2e', 'fixtures', 'claude-export');
const BOUNDARY = 'apunta-import-test';

function multipart(file: Buffer, filename: string): Buffer {
  return Buffer.concat([
    Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="export"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ),
    file,
    Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
  ]);
}

async function preview(
  app: FastifyInstance,
  file: Buffer,
  filename: string,
): Promise<{ statusCode: number; body: unknown }> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/import/claude',
    payload: multipart(file, filename),
    headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
  });
  return { statusCode: response.statusCode, body: response.json() };
}

let harness: TestApp;
let format: NoteFormat;

beforeAll(async () => {
  harness = await createTestApp();
  format = await seedFormat(harness.app);
});

afterAll(async () => {
  await harness.close();
});

describe('POST /api/import/claude', () => {
  it('answers proposals from the zip, and writes nothing', async () => {
    const patientsBefore = listPatients(harness.db, { includeArchived: true }).length;

    const { statusCode, body } = await preview(
      harness.app,
      readFileSync(join(FIXTURE, 'sample-export.zip')),
      'data.zip',
    );

    expect(statusCode).toBe(200);
    const result = body as ClaudeImportPreview;
    expect(result.conversations).toHaveLength(5);
    expect(result.candidates.map((c) => c.name)).toEqual(
      expect.arrayContaining(['John Smith', 'Jane Doe', 'Emily']),
    );
    expect(listPatients(harness.db, { includeArchived: true })).toHaveLength(patientsBefore);
  });

  it('matches a patient she already has by name, first', async () => {
    const jane = await seedPatient(harness.app, 'Jane Doe');

    const { body } = await preview(
      harness.app,
      readFileSync(join(FIXTURE, 'conversations.json')),
      'conversations.json',
    );

    const result = body as ClaudeImportPreview;
    expect(result.candidates[0]).toEqual({ name: 'Jane Doe', conversations: 1, patient_id: jane.id });
  });

  it('says what is wrong with a file that is not an export', async () => {
    const { statusCode, body } = await preview(harness.app, Buffer.from('not an export'), 'notes.txt');
    expect(statusCode).toBe(400);
    expect(String((body as { message: string }).message)).toContain('not a Claude export');
  });
});

describe('POST /api/import/claude/accept', () => {
  it('creates the patient once and a note per conversation, each with its provenance', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/import/claude/accept',
      payload: {
        items: [
          {
            conversation_id: 'c-0001',
            patient_id: null,
            patient_name: 'John Smith',
            title: 'John session notes',
            recorded_at: '2026-03-04T18:12:00.000Z',
            text: 'Session with John Smith today. He reports sleeping about six hours most nights.',
          },
          {
            conversation_id: 'c-0003',
            patient_id: null,
            patient_name: 'john smith',
            title: '',
            recorded_at: '2026-03-18T18:05:00.000Z',
            text: 'John Smith, session 4. Sleep steady at six hours.',
          },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    const result = response.json() as {
      patients_created: number;
      notes_created: number;
      patient_ids: string[];
    };
    expect(result.patients_created).toBe(1);
    expect(result.notes_created).toBe(2);
    expect(result.patient_ids).toHaveLength(1);

    const john = listPatients(harness.db, { includeArchived: true }).find(
      (p) => p.name === 'John Smith',
    ) as Patient;
    const notes = listNotesForPatient(harness.db, john.id);
    expect(notes).toHaveLength(2);
    const titles = notes.map((n) => n.title).sort();
    expect(titles).toEqual(['Imported conversation, 2026-03-18', 'John session notes']);
    // Dated when she talked to Claude, as a draft, in the practice's format.
    const first = notes.find((n) => n.title === 'John session notes');
    expect(first?.created_at).toBe('2026-03-04T18:12:00.000Z');
    expect(first?.status).toBe('draft');
    expect(first?.format_id).toBe(format.id);
    expect(first?.content).toContain('Session with John Smith today.');

    const transcripts = listTranscriptsForNote(harness.db, first?.id ?? '');
    expect(transcripts).toHaveLength(1);
    expect(transcripts[0]?.source).toBe('import');
    expect(transcripts[0]?.raw_text).toContain(
      '[Imported from Claude conversation "John session notes" (c-0001), recorded 2026-03-04]',
    );
    expect(transcripts[0]?.raw_text).toContain('Session with John Smith today.');
  });

  it('lands on the patient she named by id', async () => {
    const emily = await seedPatient(harness.app, 'Emily Example');
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/import/claude/accept',
      payload: {
        items: [
          {
            conversation_id: 'c-0005',
            patient_id: emily.id,
            patient_name: 'Emily',
            title: 'Untitled',
            recorded_at: null,
            text: 'Thinking about Emily. She says she feels stuck.',
          },
        ],
      },
    });
    expect(response.statusCode).toBe(201);
    const notes = listNotesForPatient(harness.db, emily.id);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.title).toBe('Imported conversation');
  });

  it('refuses an unknown patient id and writes nothing', async () => {
    const before = listPatients(harness.db, { includeArchived: true }).length;
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/import/claude/accept',
      payload: {
        items: [
          {
            conversation_id: 'c-x',
            patient_id: '01a00000-0000-7000-8000-000000000000',
            patient_name: 'Nobody',
            title: '',
            recorded_at: null,
            text: 'words',
          },
        ],
      },
    });
    expect(response.statusCode).toBe(404);
    expect(listPatients(harness.db, { includeArchived: true })).toHaveLength(before);
  });
});
