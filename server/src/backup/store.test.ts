import { backupFilename, type BackupFile } from '@apunta/shared';
import { describe, expect, it } from 'vitest';

import { isDueToday, isStale, selectPrunable } from './store.js';

function file(filename: string): BackupFile {
  return {
    filename,
    path: `/backups/${filename}`,
    bytes: 1024,
    created_at: '2026-08-24T00:00:00.000Z',
    encrypted: false,
  };
}

function daily(from: string, count: number): BackupFile[] {
  const start = new Date(from);
  return Array.from({ length: count }, (_unused, index) => {
    const day = new Date(start.getTime() - index * 24 * 60 * 60 * 1000);
    return file(backupFilename(day));
  });
}

describe('the pruning ladder', () => {
  it('keeps everything while there are few archives', () => {
    expect(selectPrunable(daily('2026-08-24', 10))).toEqual([]);
  });

  it('keeps 14 dailies plus the newest of each of the last 12 months', () => {
    // Two years of daily backups: 730 archives in, 25 out.
    const files = daily('2026-08-24', 730);
    const pruned = new Set(selectPrunable(files).map((f) => f.filename));
    const kept = files.filter((candidate) => !pruned.has(candidate.filename));

    // The two rungs are a union, not a sum: this month's newest archive is
    // both the newest daily and the newest monthly, so 14 + 12 keeps 25 files.
    expect(kept).toHaveLength(25);
    // The most recent fortnight, day by day.
    expect(kept.slice(0, 14).map((f) => f.filename)).toEqual(files.slice(0, 14).map((f) => f.filename));
    // Then one per month, newest first, and no month twice.
    const months = kept.map((f) => f.filename.slice('apunta-backup-'.length, 'apunta-backup-'.length + 7));
    expect(new Set(months.slice(14)).size).toBe(months.length - 14);
    expect(new Set(months).size).toBe(12);
  });

  /**
   * Retention of *backups* is not retention of *records*: the practice keeps
   * every note forever, and the ladder only removes older copies of the same
   * database (`data-at-rest-2026-08.md` §5.3, §6.1).
   */
  it('never removes the newest archive, whatever the shape of the folder', () => {
    for (const count of [1, 15, 40, 400]) {
      const files = daily('2026-08-24', count);
      expect(selectPrunable(files).map((f) => f.filename)).not.toContain(files[0]?.filename);
    }
  });

  it('ignores anything in the folder that is not one of ours', () => {
    const files = [...daily('2026-08-24', 20), file('holiday.zip')];
    expect(selectPrunable(files).map((f) => f.filename)).not.toContain('holiday.zip');
  });
});

describe('when the next backup is due', () => {
  it('is due when there has never been one', () => {
    expect(isDueToday(null, new Date())).toBe(true);
    expect(isStale(null, new Date())).toBe(true);
  });

  it('is not due again the same day, and is due the next', () => {
    const morning = new Date('2026-08-24T08:00:00.000Z');
    const evening = new Date('2026-08-24T22:00:00.000Z');
    const tomorrow = new Date('2026-08-25T07:00:00.000Z');

    expect(isDueToday(morning.toISOString(), evening)).toBe(false);
    expect(isDueToday(morning.toISOString(), tomorrow)).toBe(true);
  });

  it('treats an unparseable timestamp as no backup rather than as a recent one', () => {
    expect(isDueToday('sometime last week', new Date())).toBe(true);
    expect(isStale('sometime last week', new Date())).toBe(true);
  });

  it('calls a week-old backup stale', () => {
    const now = new Date('2026-08-24T09:00:00.000Z');
    expect(isStale('2026-08-20T09:00:00.000Z', now)).toBe(false);
    expect(isStale('2026-08-16T09:00:00.000Z', now)).toBe(true);
  });
});
