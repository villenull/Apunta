import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildPreview,
  findCandidates,
  ImportFormatError,
  mentions,
  openExport,
  readConversations,
} from './claude.js';

/**
 * The fixture is a fabricated export in the inferred shape (prototype names
 * only). Five conversations: two about John Smith, one about Jane Doe, one
 * about someone called Emily with no surname, and a recipe — the personal
 * material an export also holds, which must never turn into a patient.
 */
const FIXTURE = join(import.meta.dirname, '..', '..', '..', 'e2e', 'fixtures', 'claude-export');
const zip = (): Buffer => readFileSync(join(FIXTURE, 'sample-export.zip'));
const json = (): Buffer => readFileSync(join(FIXTURE, 'conversations.json'));

describe('openExport', () => {
  it('reads the zip Claude sends, and the bare conversations.json alike', () => {
    for (const [upload, name] of [
      [zip(), 'data-2026-09-01.zip'],
      [json(), 'conversations.json'],
    ] as const) {
      const read = openExport(upload, name);
      expect(read.conversations).toHaveLength(5);
      expect(read.messages).toBe(12);
      expect(read.skipped).toBe(0);
    }
  });

  it('says what is wrong with a file that is not an export', () => {
    expect(() => openExport(Buffer.from('hello'), 'notes.txt')).toThrow(ImportFormatError);
    expect(() => openExport(Buffer.from('{"nothing": true}'), 'x.json')).toThrow('No conversations');
  });
});

describe('readConversations', () => {
  it('tolerates the other shapes an export might take', () => {
    const read = readConversations({
      conversations: [
        {
          id: 'c1',
          title: 'A',
          createdAt: 1_772_000_000,
          messages: [
            { role: 'user', content: [{ type: 'text', text: 'Saw Sam today.' }], create_time: 1_772_000_000 },
            { author: { role: 'assistant' }, content: 'Noted.' },
            { role: 'system', text: 'ignored' },
          ],
        },
        { id: 'c2', title: 'empty', messages: [] },
        'not even an object',
      ],
    });
    expect(read.conversations).toHaveLength(1);
    expect(read.conversations[0]?.turns.map((t) => t.role)).toEqual(['human', 'assistant']);
    expect(read.conversations[0]?.createdAt).toBe('2026-02-25T06:13:20.000Z');
    expect(read.skipped).toBe(2);
  });
});

describe('mentions', () => {
  it('matches a whole name, or a first name long enough to mean something', () => {
    expect(mentions('Session with John Smith today', 'John Smith')).toBe(true);
    expect(mentions('John came in late', 'John Smith')).toBe(true);
    expect(mentions('Johnny came in', 'John Smith')).toBe(false);
    expect(mentions('Joanna came in', 'Jo Bloggs')).toBe(false);
    expect(mentions('emily says', 'Emily')).toBe(true);
  });
});

describe('findCandidates', () => {
  it('offers recurring proper nouns as possible people, and never the recipe', () => {
    const names = findCandidates(openExport(json(), 'conversations.json').conversations, []).map(
      (c) => c.name,
    );
    expect(names).toContain('John Smith');
    expect(names).toContain('Jane Doe');
    expect(names).toContain('Emily');
    expect(names).not.toContain('John');
    expect(names).not.toContain('Smith');
    // Capitalised for other reasons: sentence starts, months, weekdays, Claude.
    for (const word of ['Session', 'Thursday', 'February', 'Claude', 'Recipe', 'Quick', 'Mood', 'Plan']) {
      expect(names).not.toContain(word);
    }
  });

  it('puts a patient she already has first, matched by name, with her id', () => {
    const read = openExport(zip(), 'export.zip');
    const candidates = findCandidates(read.conversations, [{ id: '01a0-john', name: 'John Smith' }]);
    expect(candidates[0]).toEqual({ name: 'John Smith', conversations: 2, patient_id: '01a0-john' });
    // And the proper-noun pass does not offer him a second time.
    expect(candidates.filter((c) => c.name === 'John Smith')).toHaveLength(1);
  });
});

describe('buildPreview', () => {
  it('builds each proposal from her words only, with the assistant kept apart', () => {
    const preview = buildPreview(openExport(zip(), 'export.zip'), []);

    const first = preview.conversations.find((c) => c.id === 'c-0001');
    expect(first?.human_text).toContain('Session with John Smith today');
    expect(first?.human_text).toContain('Make it shorter please.');
    expect(first?.human_text).not.toContain('Subjective');
    expect(first?.assistant_text).toContain('Subjective');
    expect(first?.people).toEqual(['John Smith']);
    expect(first?.recorded_at).toBe('2026-03-04T18:12:00.000Z');
    expect(first?.turns).toBe(4);
  });

  it('names who each conversation may be about, and admits when it is nobody', () => {
    const preview = buildPreview(openExport(zip(), 'export.zip'), []);
    const people = Object.fromEntries(preview.conversations.map((c) => [c.id, c.people]));
    expect(people['c-0002']).toEqual(['Jane Doe']);
    expect(people['c-0005']).toEqual(['Emily']);
    expect(people['c-0004']).toEqual([]);
  });

  it('reports shape only in its totals, and the range of dates', () => {
    const preview = buildPreview(openExport(zip(), 'export.zip'), []);
    expect(preview.totals).toEqual({ conversations: 5, messages: 12, skipped: 0 });
    expect(preview.date_range).toEqual({ from: '2026-03-04T18:12:00.000Z', to: '2026-03-25T17:30:00.000Z' });
  });
});
