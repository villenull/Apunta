import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MAX_DETECT_CHARS } from '@apunta/shared';
import { describe, expect, it } from 'vitest';

import { installEgressGuard } from '../egress-guard.js';
import { concatenateForDetection } from './concat.js';
import { ExtractError, extractDocument } from './index.js';
import { sniff } from './sniff.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__');
const fixture = (name: string): Buffer => readFileSync(join(FIXTURES, name));

/** Every failure is asserted on its `reason`, never on message wording. */
async function failure(buffer: Buffer): Promise<ExtractError> {
  try {
    await extractDocument(buffer);
  } catch (error) {
    if (error instanceof ExtractError) return error;
    throw error;
  }
  throw new Error('expected extraction to fail');
}

describe('sniff', () => {
  it('reads the type from the bytes, not the extension', () => {
    expect(sniff(fixture('template-headings.docx'))).toBe('docx');
    expect(sniff(fixture('template.pdf'))).toBe('pdf');
    expect(sniff(fixture('template.rtf'))).toBe('rtf');
    expect(sniff(fixture('screenshot.png'))).toBe('image');
    expect(sniff(Buffer.from('Subjective:\nObjective:\n'))).toBe('text');
  });

  it('tells a .docx zip from any other zip', () => {
    // A `.pages` file and a `.docx` are both `PK..`; only the entry names
    // separate them, so the sniffer has to look inside.
    expect(sniff(fixture('example-note.docx'))).toBe('docx');
  });
});

describe('extractDocument — .docx', () => {
  it('reads a template whose headings live in paragraph styles', async () => {
    const { kind, text } = await extractDocument(fixture('template-headings.docx'));
    expect(kind).toBe('docx');
    expect(text.split('\n')).toContain('Subjective');
    expect(text.split('\n')).toContain('Plan');
  });

  it('keeps each cell of a two-column table on its own line', async () => {
    // Half the real clinical templates are a table: label left, blank right.
    // If the cells ran together there would be no structure left to detect.
    const { text } = await extractDocument(fixture('template-table.docx'));
    const lines = text.split('\n');
    expect(lines).toContain('Presenting problem');
    expect(lines).toContain('History');
    expect(lines).toContain('Formulation');
  });

  it('reads a completed note', async () => {
    const { text } = await extractDocument(fixture('example-note.docx'));
    expect(text).toContain('Subjective');
    expect(text).toContain('John Smith reports improved sleep');
  });
});

describe('extractDocument — .pdf', () => {
  it('reads a text PDF with the egress guard installed', async () => {
    // Hard rule 1, as a test rather than a comment: pdf.js can reach for
    // standard fonts and CMaps over HTTP, and if it ever did, extraction
    // would die with an error that looks nothing like a PDF problem.
    const restore = installEgressGuard();
    try {
      const { kind, text } = await extractDocument(fixture('template.pdf'));
      expect(kind).toBe('pdf');
      expect(text.split('\n')).toContain('Subjective');
    } finally {
      restore();
    }
  });

  it('refuses a scan rather than returning nothing useful', async () => {
    expect((await failure(fixture('scan.pdf'))).reason).toBe('scanned_pdf');
  });

  it('refuses a damaged PDF', async () => {
    expect((await failure(Buffer.from('%PDF-1.4\nthis is not a pdf\n'))).reason).toBe('corrupt_pdf');
  });
});

describe('extractDocument — text', () => {
  it('passes .txt through, normalising CRLF', async () => {
    const { kind, text } = await extractDocument(Buffer.from('Subjective:\r\nObjective:\r\n'));
    expect(kind).toBe('text');
    expect(text).toBe('Subjective:\nObjective:');
  });

  it('passes .md through without parsing it', async () => {
    const { text } = await extractDocument(Buffer.from('# Subjective\n\n# Objective\n'));
    expect(text).toBe('# Subjective\n\n# Objective');
  });

  it('strips a BOM', async () => {
    const { text } = await extractDocument(Buffer.from('﻿Subjective:\nObjective:\n'));
    expect(text.startsWith('Subjective')).toBe(true);
  });

  it('refuses bytes that are not UTF-8 text', async () => {
    expect((await failure(Buffer.from([0xc3, 0x28, 0xc3, 0x28, 0xc3, 0x28, 0xc3, 0x28]))).reason).toBe(
      'undecodable_text',
    );
  });
});

describe('extractDocument — rejections', () => {
  it('rejects a file over 10MB before reading it', async () => {
    const error = await failure(Buffer.alloc(10 * 1024 * 1024 + 1));
    expect(error.reason).toBe('too_large');
    expect(error.message).toContain('10 MB');
  });

  it('rejects .rtf with the Save-As instruction', async () => {
    const error = await failure(fixture('template.rtf'));
    expect(error.reason).toBe('unsupported_type');
    expect(error.message).toContain('.docx');
  });

  it('rejects an image, saying there is no OCR', async () => {
    const error = await failure(fixture('screenshot.png'));
    expect(error.reason).toBe('unsupported_type');
    expect(error.message).toContain('picture');
  });

  it('rejects an empty file', async () => {
    expect((await failure(Buffer.alloc(0))).reason).toBe('empty');
    expect((await failure(Buffer.from('   \n'))).reason).toBe('empty');
  });
});

describe('extractDocument — what a failure may say', () => {
  it('never quotes the file back in an error message', async () => {
    const secret = 'Willow Creek Counseling intake for a client';
    const error = await failure(Buffer.from(`%PDF-1.4\n${secret}\n`));
    expect(error.message).not.toContain(secret);
    expect(error.message).not.toContain('Willow');
  });
});

describe('concatenateForDetection', () => {
  it('labels each note so the model can tell them apart', () => {
    const { text, truncated } = concatenateForDetection('examples', ['first note', 'second note']);
    expect(text).toBe('--- Note 1 ---\nfirst note\n\n--- Note 2 ---\nsecond note');
    expect(truncated).toBe(false);
  });

  it('leaves a single template unlabelled', () => {
    expect(concatenateForDetection('template', ['Subjective:\nPlan:']).text).toBe('Subjective:\nPlan:');
  });

  it('caps the total, splitting the budget evenly and cutting at the tail', () => {
    // Ollama truncates from the *head*, dropping the instructions and keeping
    // the material. Spending the budget here is what stops that happening by
    // accident to someone whose notes are simply long.
    const long = 'x'.repeat(MAX_DETECT_CHARS);
    const { text, truncated } = concatenateForDetection('examples', [long, long, long]);
    expect(truncated).toBe(true);
    expect(text.length).toBeLessThanOrEqual(MAX_DETECT_CHARS + 80);
    expect(text.startsWith('--- Note 1 ---\nxxx')).toBe(true);
  });

  it('reports truncated: false when everything fitted', () => {
    expect(concatenateForDetection('examples', ['a'.repeat(100), 'b'.repeat(100)]).truncated).toBe(false);
  });
});
