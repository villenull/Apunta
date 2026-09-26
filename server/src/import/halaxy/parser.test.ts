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

  /**
   * The `warnings` are the sentences the preview shows beside the sessions they
   * are about, so they are rendered here in the request's language rather than
   * left English for the browser — which has no catalogue of its own for them.
   */
  it('renders its warnings in the requested language, English unchanged', () => {
    const text = [
      'Halaxy Clinical Notes',
      'Patient: Jane Doe',
      'Some preamble that is not a session.',
      'Date',
      '01/02/2026',
      'First body',
    ].join('\n');

    const english = parseHalaxyText(text, 'notes.pdf').warnings;
    const spanish = parseHalaxyText(text, 'notes.pdf', 'es-MX').warnings;

    // English first, byte for byte what this parser always returned.
    expect(english).toEqual([
      'Text before the first dated session was not imported.',
      'Some date labels were close to other headings; check the session boundaries.',
      'Some sessions had a bare date heading; check those session boundaries before importing.',
    ]);
    // Every warning is translated, and none of them is the English sentence.
    expect(spanish).toHaveLength(english.length);
    for (const [index, warning] of spanish.entries()) {
      expect(warning).not.toBe(english[index]);
      expect(warning.endsWith('.')).toBe(true);
    }
    expect(spanish[0]).toBe('El texto anterior a la primera sesión con fecha no se importó.');

    // A session with no text, where the date is data: the wire carries
    // `2026-08-08` today and formatting it would change the English.
    const empty = [
      'Halaxy Clinical Notes',
      'Patient: Jane Doe',
      '01/02/2026',
      'First body',
      '05/03/2026',
    ].join('\n');
    expect(parseHalaxyText(empty, 'notes.pdf').warnings).toContain('The session on 2026-03-05 has no text.');
    expect(parseHalaxyText(empty, 'notes.pdf', 'es-MX').warnings).toContain(
      'La sesión del 2026-03-05 no tiene texto.',
    );
  });
});
