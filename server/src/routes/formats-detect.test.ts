import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MAX_DETECT_CHARS,
  type DetectFormatResponse,
  type NoteFormat,
  type SkillFlattenResponse,
} from '@apunta/shared';
import { strToU8, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RecordingLlmProvider } from '../test/providers.js';
import { createTestApp, seedPatient, type TestApp } from '../test/harness.js';
import { FakeSttProvider } from '../ai/fake.js';

const EXTRACT_FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'extract', '__fixtures__');
const SKILL_MD = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'skill', '__fixtures__', 'skill', 'SKILL.md'),
);
const fixture = (name: string): Buffer => readFileSync(join(EXTRACT_FIXTURES, name));

interface Part {
  readonly name: string;
  readonly value: string | Buffer;
  readonly filename?: string;
}

/**
 * A real multipart body, built with the platform's own `FormData` so the
 * bytes on the wire are the bytes a browser would send. `light-my-request`
 * has no multipart helper and adding one as a dependency to encode four
 * headers would be worse.
 */
async function multipart(parts: readonly Part[]): Promise<{ body: Buffer; contentType: string }> {
  const form = new FormData();
  for (const part of parts) {
    if (typeof part.value === 'string') form.append(part.name, part.value);
    else form.append(part.name, new Blob([new Uint8Array(part.value)]), part.filename ?? 'upload.bin');
  }
  const request = new Request('http://127.0.0.1/multipart', { method: 'POST', body: form });
  return {
    body: Buffer.from(await request.arrayBuffer()),
    contentType: request.headers.get('content-type') ?? '',
  };
}

let harness: TestApp;
let llm: RecordingLlmProvider;

beforeEach(async () => {
  llm = new RecordingLlmProvider();
  harness = await createTestApp({ providers: { llm, stt: new FakeSttProvider() } });
});

afterEach(async () => {
  await harness.close();
});

async function post(url: string, parts: readonly Part[]) {
  const { body, contentType } = await multipart(parts);
  return harness.app.inject({ method: 'POST', url, headers: { 'content-type': contentType }, payload: body });
}

describe('POST /api/formats/detect', () => {
  it('reads the sections out of a .docx template', async () => {
    const response = await post('/api/formats/detect', [
      { name: 'kind', value: 'template' },
      { name: 'files', value: fixture('template-headings.docx'), filename: 'template.docx' },
    ]);

    expect(response.statusCode).toBe(200);
    const detected = response.json<DetectFormatResponse>();
    expect(detected.sections).toEqual(['Subjective', 'Objective', 'Assessment', 'Plan']);
    expect(detected.name).toBe('Progress note');
    expect(detected.files).toBe(1);
    expect(detected.truncated).toBe(false);
  });

  it('reads a template laid out as a two-column table', async () => {
    // The chips on screen have to come out of the document, not out of a
    // constant — half of real clinical templates are a blank-form table.
    const response = await post('/api/formats/detect', [
      { name: 'kind', value: 'template' },
      { name: 'files', value: fixture('template-table.docx'), filename: 'intake.docx' },
    ]);

    expect(response.json<DetectFormatResponse>().sections).toEqual([
      'Presenting problem',
      'History',
      'Formulation',
      'Plan',
    ]);
  });

  it('labels each note for the examples path', async () => {
    const response = await post('/api/formats/detect', [
      { name: 'kind', value: 'examples' },
      { name: 'files', value: fixture('example-note.docx'), filename: 'a.docx' },
      { name: 'files', value: fixture('example-note.docx'), filename: 'b.docx' },
    ]);

    expect(response.statusCode).toBe(200);
    expect(response.json<DetectFormatResponse>().files).toBe(2);
    const sent = llm.detections[0];
    expect(sent?.kind).toBe('examples');
    expect(sent?.text).toContain('--- Note 1 ---');
    expect(sent?.text).toContain('--- Note 2 ---');
  });

  it('reads a plain .txt template', async () => {
    const response = await post('/api/formats/detect', [
      { name: 'kind', value: 'template' },
      { name: 'files', value: Buffer.from('Presenting problem:\nHistory:\nPlan:\n'), filename: 't.txt' },
    ]);
    expect(response.json<DetectFormatResponse>().sections).toEqual(['Presenting problem', 'History', 'Plan']);
  });

  it('caps a long upload and says so, rather than letting the prompt be truncated', async () => {
    // Ollama truncates from the head — the instructions go and the material
    // stays. The budget is spent here instead, and the answer admits it.
    const long = `Subjective:\n${'a'.repeat(MAX_DETECT_CHARS)}\nPlan:\n`;
    const response = await post('/api/formats/detect', [
      { name: 'kind', value: 'template' },
      { name: 'files', value: Buffer.from(long), filename: 'long.txt' },
    ]);

    expect(response.statusCode).toBe(200);
    expect(response.json<DetectFormatResponse>().truncated).toBe(true);
    expect(llm.detections[0]?.text.length).toBeLessThanOrEqual(MAX_DETECT_CHARS);
  });

  it('saves nothing — the therapist confirms on the next screen', async () => {
    await post('/api/formats/detect', [
      { name: 'kind', value: 'template' },
      { name: 'files', value: fixture('template-headings.docx'), filename: 'template.docx' },
    ]);

    const listed = await harness.app.inject({ method: 'GET', url: '/api/formats' });
    expect(listed.json<{ formats: NoteFormat[] }>().formats).toHaveLength(0);
  });

  it('rejects a file over 10MB', async () => {
    const response = await post('/api/formats/detect', [
      { name: 'kind', value: 'template' },
      { name: 'files', value: Buffer.alloc(10 * 1024 * 1024 + 1024), filename: 'huge.docx' },
    ]);

    expect(response.statusCode).toBe(400);
    expect(response.json<{ message: string }>().message).toContain('10 MB');
  });

  it('rejects a screenshot, saying there is no OCR', async () => {
    const response = await post('/api/formats/detect', [
      { name: 'kind', value: 'template' },
      { name: 'files', value: fixture('screenshot.png'), filename: 'template.png' },
    ]);

    expect(response.statusCode).toBe(400);
    expect(response.json<{ message: string }>().message).toContain('picture');
  });

  it('rejects .rtf with the two-click fix', async () => {
    const response = await post('/api/formats/detect', [
      { name: 'kind', value: 'template' },
      { name: 'files', value: fixture('template.rtf'), filename: 'template.rtf' },
    ]);
    expect(response.statusCode).toBe(400);
    expect(response.json<{ message: string }>().message).toContain('Save As');
  });

  it('rejects a scanned PDF rather than answering from nothing', async () => {
    const response = await post('/api/formats/detect', [
      { name: 'kind', value: 'template' },
      { name: 'files', value: fixture('scan.pdf'), filename: 'scan.pdf' },
    ]);
    expect(response.statusCode).toBe(400);
    expect(response.json<{ message: string }>().message).toContain('scan');
  });

  it('rejects a request with no kind', async () => {
    const response = await post('/api/formats/detect', [
      { name: 'files', value: fixture('template-headings.docx'), filename: 'template.docx' },
    ]);
    expect(response.statusCode).toBe(400);
  });

  it('rejects a single file on the examples path', async () => {
    const response = await post('/api/formats/detect', [
      { name: 'kind', value: 'examples' },
      { name: 'files', value: fixture('example-note.docx'), filename: 'a.docx' },
    ]);
    expect(response.statusCode).toBe(400);
    expect(response.json<{ message: string }>().message).toContain('2 or 3');
  });

  it('rejects a fourth file', async () => {
    const one = fixture('example-note.docx');
    const response = await post('/api/formats/detect', [
      { name: 'kind', value: 'examples' },
      { name: 'files', value: one, filename: 'a.docx' },
      { name: 'files', value: one, filename: 'b.docx' },
      { name: 'files', value: one, filename: 'c.docx' },
      { name: 'files', value: one, filename: 'd.docx' },
    ]);
    expect(response.statusCode).toBe(400);
  });

  it('rejects a body that is not multipart at all', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: '/api/formats/detect',
      payload: { kind: 'template' },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('POST /api/formats/detect — what reaches a log', () => {
  it('never writes the uploaded note text or its file name', async () => {
    const logs: string[] = [];
    const local = await createTestApp({ logs });
    try {
      const { body, contentType } = await multipart([
        { name: 'kind', value: 'examples' },
        { name: 'files', value: fixture('example-note.docx'), filename: 'Smith, John — 2026-07-14.docx' },
        { name: 'files', value: fixture('screenshot.png'), filename: 'Smith, John — scan.png' },
      ]);
      await local.app.inject({
        method: 'POST',
        url: '/api/formats/detect',
        headers: { 'content-type': contentType },
        payload: body,
      });
    } finally {
      await local.close();
    }

    const written = logs.join('\n');
    expect(written).not.toContain('John Smith reports improved sleep');
    expect(written).not.toContain('Smith, John');
    expect(written).not.toContain('intrusive thoughts');
  });
});

describe('POST /api/formats/flatten-skill', () => {
  it('flattens a SKILL.md and reports what it removed', async () => {
    const response = await post('/api/formats/flatten-skill', [
      { name: 'file', value: SKILL_MD, filename: 'SKILL.md' },
    ]);

    expect(response.statusCode).toBe(200);
    const flattened = response.json<SkillFlattenResponse>();
    expect(flattened.instructions).not.toContain('allowed-tools');
    expect(flattened.instructions).toContain('**Subjective** — what the client reported');
    expect(flattened.removed.frontmatter).toBe(true);
    expect(flattened.removed.commandBlocks).toBe(1);
    expect(flattened.referencedFiles).toEqual(['references/FORMS.md', 'references/TERMS.md']);
    expect(flattened.approxTokens).toBeGreaterThan(0);
  });

  it('accepts a .zip of the skill folder', async () => {
    const zipped = Buffer.from(
      zipSync({
        'willow-creek/SKILL.md': new Uint8Array(SKILL_MD),
        'willow-creek/scripts/lint_note.py': strToU8('print("x")\n'),
      }),
    );
    const response = await post('/api/formats/flatten-skill', [
      { name: 'file', value: zipped, filename: 'willow-creek.zip' },
    ]);

    expect(response.statusCode).toBe(200);
    expect(response.json<SkillFlattenResponse>().removed.frontmatter).toBe(true);
  });

  it('says what it expected when the zip has no SKILL.md', async () => {
    const zipped = Buffer.from(zipSync({ 'notes/README.md': strToU8('# nope\n') }));
    const response = await post('/api/formats/flatten-skill', [
      { name: 'file', value: zipped, filename: 'notes.zip' },
    ]);
    expect(response.statusCode).toBe(400);
    expect(response.json<{ message: string }>().message).toContain('SKILL.md');
  });

  it('saves nothing — the flattened text is reviewed before it is saved', async () => {
    await post('/api/formats/flatten-skill', [{ name: 'file', value: SKILL_MD, filename: 'SKILL.md' }]);
    const listed = await harness.app.inject({ method: 'GET', url: '/api/formats' });
    expect(listed.json<{ formats: NoteFormat[] }>().formats).toHaveLength(0);
  });
});

describe('a format’s instructions reach the drafting call', () => {
  it('persists through PATCH and arrives on generateNote', async () => {
    const created = await harness.app.inject({
      method: 'POST',
      url: '/api/formats',
      payload: { name: 'Willow Creek progress', sections: ['Subjective', 'Plan'], source: 'template' },
    });
    const format = created.json<NoteFormat>();

    const instructions = 'Use "client", not "patient". Keep her hedging exactly as she voiced it.';
    const patched = await harness.app.inject({
      method: 'PATCH',
      url: `/api/formats/${format.id}`,
      payload: { instructions },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json<NoteFormat>().instructions).toBe(instructions);

    // Reloaded rather than trusted: the point is that it was written down.
    const reloaded = await harness.app.inject({ method: 'GET', url: `/api/formats/${format.id}` });
    expect(reloaded.json<NoteFormat>().instructions).toBe(instructions);

    const patient = await seedPatient(harness.app);
    const generated = await harness.app.inject({
      method: 'POST',
      url: '/api/generate',
      payload: {
        patient_id: patient.id,
        format_id: format.id,
        typed_notes: 'Sleeping better since the wind-down change. Continue weekly.',
      },
    });
    expect(generated.statusCode).toBe(200);

    expect(llm.drafts).toHaveLength(1);
    expect(llm.drafts[0]?.instructions).toBe(instructions);
    expect(llm.drafts[0]?.sections).toEqual(['Subjective', 'Plan']);
  });
});
