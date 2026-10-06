import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  UPDATE_JOURNAL_NAME,
  clearJournal,
  journalPath,
  readJournal,
  writeJournal,
  type UpdateJournal,
} from './update-journal.js';

const JOURNAL: UpdateJournal = {
  phase: 'pending',
  updateId: '41',
  fromVersion: '1.0.0',
  toVersion: '1.1.0',
  snapshotPath: '/data/safety/pre-update-1.0.0-1.1.0-20261006T120000Z.db',
  createdAt: '2026-10-06T12:00:00.000Z',
};

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'apunta-journal-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('the update journal', () => {
  it('lives at <dataDir>/update-journal.json', () => {
    expect(journalPath(dir)).toBe(join(dir, UPDATE_JOURNAL_NAME));
    expect(UPDATE_JOURNAL_NAME).toBe('update-journal.json');
  });

  it('is absent (null) when nothing was written', () => {
    expect(readJournal(dir)).toBeNull();
  });

  it('round-trips every phase', () => {
    for (const phase of ['pending', 'health_attempted', 'recovery'] as const) {
      writeJournal(dir, { ...JOURNAL, phase });
      expect(readJournal(dir)).toEqual({ ...JOURNAL, phase });
    }
  });

  it('replaces atomically: no temp file is left, the file is owner-only, and the old content is fully replaced', () => {
    writeJournal(dir, JOURNAL);
    writeJournal(dir, { ...JOURNAL, phase: 'health_attempted' });

    expect(readdirSync(dir)).toEqual([UPDATE_JOURNAL_NAME]);
    expect(statSync(journalPath(dir)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(journalPath(dir), 'utf8'))).toEqual({
      ...JOURNAL,
      phase: 'health_attempted',
    });
  });

  it('a crash that left only the temp file reads as no journal, never as half of one', () => {
    writeFileSync(`${journalPath(dir)}.tmp`, '{"phase":"pend');
    expect(readJournal(dir)).toBeNull();
  });

  it('clears durably, and clearing an absent journal is not an error', () => {
    writeJournal(dir, JOURNAL);
    clearJournal(dir);
    expect(existsSync(journalPath(dir))).toBe(false);
    expect(readJournal(dir)).toBeNull();
    expect(() => {
      clearJournal(dir);
    }).not.toThrow();
  });

  describe('a file that exists but cannot be read as a journal is "corrupt", never absent', () => {
    const cases: Record<string, string> = {
      'not JSON': 'this is not json',
      'empty file': '',
      'a JSON array': '[1,2,3]',
      'JSON null': 'null',
      'an unknown phase': JSON.stringify({ ...JOURNAL, phase: 'done' }),
      'a missing phase': JSON.stringify({ ...JOURNAL, phase: undefined }),
      'a missing update id': JSON.stringify({ ...JOURNAL, updateId: undefined }),
      'an empty snapshot path': JSON.stringify({ ...JOURNAL, snapshotPath: '' }),
      'a numeric version': JSON.stringify({ ...JOURNAL, toVersion: 2 }),
      'a missing creation time': JSON.stringify({ ...JOURNAL, createdAt: undefined }),
    };
    for (const [name, content] of Object.entries(cases)) {
      it(name, () => {
        writeFileSync(journalPath(dir), content);
        expect(readJournal(dir)).toBe('corrupt');
      });
    }

    it('an unreadable path (a directory where the file should be)', () => {
      mkdirSync(journalPath(dir));
      expect(readJournal(dir)).toBe('corrupt');
    });
  });

  it('ignores unknown extra keys when reading (a newer build may add some)', () => {
    writeFileSync(journalPath(dir), JSON.stringify({ ...JOURNAL, future: true }));
    expect(readJournal(dir)).toEqual(JOURNAL);
  });
});
