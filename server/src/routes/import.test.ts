import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type {
  ClaudeImportReport,
  ImportBatchListResponse,
  ImportUndoResponse,
  Patient,
} from '@apunta/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listNotesForPatient, setNotePublished } from '../db/notes.js';
import { getPatient, listPatients } from '../db/patients.js';
import { listTranscriptsForNote } from '../db/transcripts.js';
import { createTestApp, seedFormat, seedPatient, type TestApp } from '../test/harness.js';

/**
 * The automatic import, end to end through the API, on a fabricated export
 * (prototype names only; see `import/claude.test.ts` for what each
 * conversation in `patient-chats.json` is for). What this proves that the
 * pure tests cannot: the preview writes nothing; the run writes exactly the
 * preview, as drafts with provenance, in one batch; a second run writes
 * nothing twice; and undo takes back exactly the batch.
 */
const FIXTURE = join(import.meta.dirname, '..', '..', '..', 'e2e', 'fixtures', 'claude-export');
const CHATS = readFileSync(join(FIXTURE, 'patient-chats.json'));
const BOUNDARY = 'apunta-import-test';

function multipart(file: Buffer, filename: string, fields: Record<string, string> = {}): Buffer {
  const parts = Object.entries(fields).map(([name, value]) =>
    Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`),
  );
  return Buffer.concat([
    ...parts,
    Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="export"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ),
    file,
    Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
  ]);
}

async function post(
  step: 'preview' | 'run',
  fields: Record<string, string> = {},
  file: Buffer = CHATS,
  filename = 'conversations.json',
): Promise<{ statusCode: number; body: ClaudeImportReport & { message?: string } }> {
  const response = await harness.app.inject({
    method: 'POST',
    url: `/api/import/claude/${step}`,
    payload: multipart(file, filename, fields),
    headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
  });
  return { statusCode: response.statusCode, body: response.json() };
}

let harness: TestApp;

beforeEach(async () => {
  harness = await createTestApp();
  await seedFormat(harness.app);
});

afterEach(async () => {
  await harness.close();
});

const patients = (): Patient[] => listPatients(harness.db, { includeArchived: true });

describe('POST /api/import/claude/preview', () => {
  it('reports what a run would do, and writes nothing', async () => {
    const { statusCode, body } = await post('preview');

    expect(statusCode).toBe(200);
    expect(body.batch_id).toBeNull();
    expect(body.cutoff).toBe('2026-07-01');
    expect(body.source).toBe('assistant');
    expect(body.patients.map((p) => [p.name, p.notes])).toEqual([
      ['John', 3],
      ['Maria (1)', 2],
      ['Maria (2)', 2],
    ]);
    expect(body.skipped.map((s) => s.reason).sort()).toEqual([
      'before_cutoff',
      'no_name',
      'not_clinical',
      'single_session',
    ]);
    expect(patients()).toHaveLength(0);
  });

  it('never puts a skipped conversation’s title or text in the answer', async () => {
    const { body } = await post('preview');
    const answer = JSON.stringify(body);
    for (const secret of [
      'Garden',
      'Emily',
      'Ana Torres',
      'Session notes',
      'Jane',
      'tomatoes',
      'couples work',
    ]) {
      expect(answer).not.toContain(secret);
    }
  });

  it('reads the zip Claude sends as well as the bare file', async () => {
    const { statusCode, body } = await post(
      'preview',
      {},
      readFileSync(join(FIXTURE, 'sample-export.zip')),
      'data.zip',
    );
    expect(statusCode).toBe(200);
    // Five one-sitting chats: none is a patient history.
    expect(body.totals.conversations).toBe(5);
    expect(body.notes).toBe(0);
  });

  it('says what is wrong with a file that is not an export, or a bad cutoff', async () => {
    const notExport = await post('preview', {}, Buffer.from('not an export'), 'notes.txt');
    expect(notExport.statusCode).toBe(400);
    expect(notExport.body.message).toContain('not a Claude export');
    const badCutoff = await post('preview', { cutoff: 'July' });
    expect(badCutoff.statusCode).toBe(400);
  });
});

describe('POST /api/import/claude/run', () => {
  it('writes the preview as drafts, one batch, with provenance and guessed names flagged', async () => {
    const { statusCode, body } = await post('run');

    expect(statusCode).toBe(201);
    expect(body.batch_id).not.toBeNull();
    expect(body.notes).toBe(7);

    const created = patients();
    expect(created.map((p) => [p.name, p.name_guessed]).sort()).toEqual([
      ['John', true],
      ['Maria (1)', true],
      ['Maria (2)', true],
    ]);
    const john = created.find((p) => p.name === 'John') as Patient;
    const notes = listNotesForPatient(harness.db, john.id);
    expect(notes).toHaveLength(3);
    expect(notes.every((n) => n.status === 'draft')).toBe(true);
    expect(notes.map((n) => n.title).sort()).toEqual([
      'Imported session, 2026-05-12',
      'Imported session, 2026-06-09',
      'Imported session, 2026-07-14',
    ]);
    const oldest = notes.find((n) => n.created_at === '2026-05-12T17:00:00.000Z');
    expect(oldest?.content).toContain('John reports sleeping about five hours.');
    const transcript = listTranscriptsForNote(harness.db, oldest?.id ?? '')[0];
    expect(transcript?.source).toBe('import');
    expect(transcript?.raw_text).toMatch(
      /^\[Imported from Claude conversation "John — session notes" \(conv-john\), session 1 of 3, recorded 2026-05-12; note from Claude's last reply; messages: john-01 john-02\]/,
    );

    // Claude's Markdown never reaches a note or its transcript.
    for (const note of notes) {
      expect(note.content).not.toContain('**');
      const raw = listTranscriptsForNote(harness.db, note.id)[0]?.raw_text ?? '';
      expect(raw.split('\n').slice(2).join('\n')).toBe(note.content);
    }
  });

  it('writes nothing twice when run again', async () => {
    await post('run');
    const again = await post('run');

    expect(again.statusCode).toBe(200);
    expect(again.body.batch_id).toBeNull();
    expect(again.body.notes).toBe(0);
    expect(again.body.already_imported).toBe(7);
    expect(patients()).toHaveLength(3);
  });

  it('uses her list to name and merge, and a patient she already has', async () => {
    const maria = await seedPatient(harness.app, 'Maria Ruiz');
    const { body } = await post('run', { names: 'John Smith\nmaria ruiz\n\nJohn Smith' });

    expect(body.patients.map((p) => [p.name, p.source, p.name_guessed])).toEqual([
      ['John Smith', 'list', false],
      ['Maria Ruiz', 'list', false],
    ]);
    expect(listNotesForPatient(harness.db, maria.id)).toHaveLength(4);
    expect(
      patients()
        .map((p) => p.name)
        .sort(),
    ).toEqual(['John Smith', 'Maria Ruiz']);
  });

  it('leaves out a patient she unticked', async () => {
    const preview = await post('preview');
    const key = preview.body.patients.find((p) => p.name === 'Maria (2)')?.key ?? '';
    const { body } = await post('run', { exclude: JSON.stringify([key]) });
    expect(body.patients.map((p) => p.name)).toEqual(['John', 'Maria (1)']);
    expect(patients().map((p) => p.name)).not.toContain('Maria (2)');
  });

  it('imports her own messages when she chooses them', async () => {
    await post('run', { source: 'human' });
    const john = patients().find((p) => p.name === 'John') as Patient;
    const latest = listNotesForPatient(harness.db, john.id)[0];
    expect(latest?.content).toBe(
      'John, first session after the break. Sleep steady. Worksheet attached.\n\nShorter please.',
    );
  });
});

describe('undoing an import', () => {
  async function undo(id: string): Promise<{ statusCode: number; body: ImportUndoResponse }> {
    const response = await harness.app.inject({ method: 'POST', url: `/api/import/batches/${id}/undo` });
    return { statusCode: response.statusCode, body: response.json() };
  }

  it('lists the run, then deletes exactly its notes and the patients it created', async () => {
    const mine = await seedPatient(harness.app, 'Ana Torres');
    const { body } = await post('run');
    const batchId = body.batch_id as string;

    const list = await harness.app.inject({ method: 'GET', url: '/api/import/batches' });
    expect(list.json<ImportBatchListResponse>().batches).toEqual([
      expect.objectContaining({ id: batchId, source: 'assistant', notes: 7, patients: 3 }),
    ]);

    const result = await undo(batchId);
    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual({ notes_deleted: 7, patients_deleted: 3, notes_kept: 0, patients_kept: 0 });
    expect(patients().map((p) => p.id)).toEqual([mine.id]);
    expect((await undo(batchId)).statusCode).toBe(404);
    // The provenance lines went with the notes, so nothing marks those
    // sessions as imported any more.
    expect(harness.db.prepare('SELECT COUNT(*) AS n FROM transcripts').get()).toEqual({ n: 0 });
    expect(harness.db.prepare('SELECT COUNT(*) AS n FROM import_batch_patients').get()).toEqual({ n: 0 });

    // And the import can run again after an undo, from scratch.
    const again = await post('run');
    expect(again.body.notes).toBe(7);
    expect(again.body.already_imported).toBe(0);
    expect(again.body.patients_to_create).toBe(3);
  });

  it('keeps a note she has finalized since, and its patient', async () => {
    const { body } = await post('run');
    const john = patients().find((p) => p.name === 'John') as Patient;
    const note = listNotesForPatient(harness.db, john.id)[0];
    setNotePublished(harness.db, note?.id ?? '', true);

    const result = await undo(body.batch_id as string);
    expect(result.body).toEqual({ notes_deleted: 6, patients_deleted: 2, notes_kept: 1, patients_kept: 1 });
    expect(getPatient(harness.db, john.id)).toBeDefined();
  });

  it('never touches a patient she already had', async () => {
    const maria = await seedPatient(harness.app, 'Maria Ruiz');
    const { body } = await post('run', { names: 'Maria Ruiz' });
    await undo(body.batch_id as string);
    expect(getPatient(harness.db, maria.id)).toBeDefined();
    expect(listNotesForPatient(harness.db, maria.id)).toHaveLength(0);
  });
});

describe('a guessed name', () => {
  it('stays flagged until she saves a name for the patient', async () => {
    await post('run');
    const john = patients().find((p) => p.name === 'John') as Patient;

    await harness.app.inject({
      method: 'PATCH',
      url: `/api/patients/${john.id}`,
      payload: { archived: false },
    });
    expect(getPatient(harness.db, john.id)?.name_guessed).toBe(true);

    await harness.app.inject({
      method: 'PATCH',
      url: `/api/patients/${john.id}`,
      payload: { name: 'John Smith' },
    });
    expect(getPatient(harness.db, john.id)?.name_guessed).toBe(false);
  });
});
