import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { installEgressGuard } from '../../egress-guard.js';
import { extractPdf } from '../../extract/pdf.js';
import { HalaxyParseError, parseHalaxyText } from './parser.js';

import { describe, expect, it } from 'vitest';

const FIXTURE = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  'e2e',
  'fixtures',
  'halaxy',
  'john-smith.pdf',
);

describe('parseHalaxyText', () => {
  it('extracts the fixture while the runtime egress guard blocks remote fetches', async () => {
    const restore = installEgressGuard();
    try {
      const text = await extractPdf(readFileSync(FIXTURE));
      expect(text).toContain('John Smith');
    } finally {
      restore();
    }
  });
  it('round-trips the synthetic multi-page export and joins a note over a page break', async () => {
    const parsed = parseHalaxyText(await extractPdf(readFileSync(FIXTURE)), 'john-smith.pdf');
    expect(parsed.patientName).toBe('John Smith');
    expect(parsed.notes).toHaveLength(3);
    expect(parsed.notes.map((note) => note.date)).toEqual(['2026-03-12', '2026-03-12', '2026-03-18']);
    expect(parsed.notes[1]?.text).toContain('public transport');
    expect(parsed.notes[1]?.text).toContain('review continued after this page break');
    expect(parsed.notes.every((note) => !note.text.includes('Page 1 of 3'))).toBe(true);
  });

  it('supports AU numeric, UK textual, and prefixed date headings', () => {
    const parsed = parseHalaxyText(
      `Halaxy Clinical Notes\nPatient: Jane Doe\nDate: 01/02/2026\nFirst body\nSession — 12 March 2026 — Review\nSecond body`,
      'notes.pdf',
    );
    expect(parsed.notes.map((note) => note.date)).toEqual(['2026-02-01', '2026-03-12']);
    expect(parsed.notes[1]?.title).toBe('Review');
  });

  it('rejects a text layer without a patient or dated sessions', () => {
    expect(() =>
      parseHalaxyText('Halaxy Clinical Notes\nPatient: Jane Doe\nNo dates here.', 'notes.pdf'),
    ).toThrow(HalaxyParseError);
    expect(() => parseHalaxyText('Halaxy Clinical Notes\n12/03/2026\nA note', 'notes.pdf')).toThrow(
      HalaxyParseError,
    );
  });
});
