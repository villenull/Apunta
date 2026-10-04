import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { importedNoteTitle, parsePatientList } from './import.js';

/**
 * `instantToLocalDay` reads the local zone, and the fixtures below are 17:00Z —
 * the same day in Denver, the next day in Tokyo. Every case therefore pins one.
 */
const originalTimezone = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'America/Denver';
});
afterAll(() => {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
});

/**
 * The fallback title of an imported note (Claude and Halaxy). It is a
 * catalogue key rather than a literal because a note's language is the format's
 * language (C-LANG@1 rule 3), and a title that is English on an es-MX note is
 * a title the owner has to translate by hand. The English is pinned exactly:
 * it is what every existing import wrote, and the wire has not changed.
 *
 * The day itself stays `YYYY-MM-DD` in both languages — it is a fact about her
 * record, not something to be redressed for the reader.
 */
describe('importedNoteTitle', () => {
  it('says the day in English, exactly as it did before the key existed', () => {
    expect(importedNoteTitle('2026-05-12T17:00:00.000Z')).toBe('Imported session, 2026-05-12');
    expect(importedNoteTitle('2026-05-12T17:00:00.000Z', 'en')).toBe('Imported session, 2026-05-12');
  });

  it('says it in Spanish for an es-MX note, and leaves the day as it was recorded', () => {
    expect(importedNoteTitle('2026-05-12T17:00:00.000Z', 'es-MX')).toBe('Sesión importada, 2026-05-12');
    // Not "12 ago 2026": a dateOnly parameter would dress the day up in the
    // reader's language, and this day is a fact about the session.
    expect(importedNoteTitle('2026-05-12T17:00:00.000Z', 'es-MX')).toContain('2026-05-12');
  });

  it('drops the day from the title when there is none', () => {
    expect(importedNoteTitle(null)).toBe('Imported session');
    expect(importedNoteTitle(null, 'es-MX')).toBe('Sesión importada');
  });
});

describe('parsePatientList', () => {
  it('drops blank lines and repeats, whatever their case', () => {
    expect(parsePatientList(' John Smith \n\nmaria ruiz\nJOHN SMITH\n\n')).toEqual([
      'John Smith',
      'maria ruiz',
    ]);
  });
});
