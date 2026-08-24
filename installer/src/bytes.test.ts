import { describe, expect, it } from 'vitest';

import { describeProgress, formatBytes, formatDuration, progressSnapshot } from './bytes.js';

describe('formatBytes', () => {
  it('uses the decimal units macOS shows, so the numbers match Finder', () => {
    expect(formatBytes(0)).toBe('0 bytes');
    expect(formatBytes(999)).toBe('999 bytes');
    expect(formatBytes(1000)).toBe('1.0 KB');
    expect(formatBytes(1_500_000)).toBe('1.5 MB');
    expect(formatBytes(8_000_000_000)).toBe('8.0 GB');
  });

  it('answers a dash rather than NaN', () => {
    expect(formatBytes(Number.NaN)).toBe('—');
    expect(formatBytes(-1)).toBe('—');
  });
});

describe('formatDuration', () => {
  it('rounds to something a person would say', () => {
    expect(formatDuration(3)).toBe('a few seconds');
    expect(formatDuration(42)).toBe('about 40 seconds');
    expect(formatDuration(60)).toBe('about 1 minute');
    expect(formatDuration(1000)).toBe('about 17 minutes');
    expect(formatDuration(7200)).toBe('about 2.0 hours');
  });
});

describe('progressSnapshot', () => {
  it('reports a percentage against the whole file', () => {
    const snapshot = progressSnapshot({
      completedBytes: 250,
      totalBytes: 1000,
      resumedFromBytes: 0,
      elapsedMs: 1000,
    });
    expect(snapshot.percent).toBe(25);
    expect(snapshot.bytesPerSecond).toBe(250);
    expect(snapshot.etaSeconds).toBe(3);
  });

  /**
   * The bug this exists to prevent: a resumed download that divides all its
   * bytes by four seconds reports 100 MB/s and "almost done", then sits there
   * for twenty minutes.
   */
  it('counts only the bytes this run transferred towards the rate', () => {
    const snapshot = progressSnapshot({
      completedBytes: 600,
      totalBytes: 1000,
      resumedFromBytes: 500,
      elapsedMs: 2000,
    });
    expect(snapshot.percent).toBe(60);
    expect(snapshot.bytesPerSecond).toBe(50);
    expect(snapshot.etaSeconds).toBe(8);
  });

  it('reports no rate until there is a second of evidence', () => {
    const snapshot = progressSnapshot({
      completedBytes: 10,
      totalBytes: 1000,
      resumedFromBytes: 0,
      elapsedMs: 40,
    });
    expect(snapshot.bytesPerSecond).toBeNull();
    expect(snapshot.etaSeconds).toBeNull();
  });

  it('reports no percentage when the total is unknown', () => {
    const snapshot = progressSnapshot({
      completedBytes: 10,
      totalBytes: null,
      resumedFromBytes: 0,
      elapsedMs: 4000,
    });
    expect(snapshot.percent).toBeNull();
    expect(snapshot.etaSeconds).toBeNull();
  });

  it('clamps rather than reporting 104% when a server over-delivers', () => {
    const snapshot = progressSnapshot({
      completedBytes: 1040,
      totalBytes: 1000,
      resumedFromBytes: 0,
      elapsedMs: 1000,
    });
    expect(snapshot.percent).toBe(100);
    expect(snapshot.etaSeconds).toBe(0);
  });
});

describe('describeProgress', () => {
  it('reads as a sentence under the bar', () => {
    const snapshot = progressSnapshot({
      completedBytes: 412_000_000,
      totalBytes: 574_000_000,
      resumedFromBytes: 0,
      elapsedMs: 10_000,
    });
    expect(describeProgress(snapshot)).toBe('412 MB of 574 MB — a few seconds left');
  });

  it('says only what it knows when the total is unknown', () => {
    expect(
      describeProgress(
        progressSnapshot({ completedBytes: 5_000_000, totalBytes: null, resumedFromBytes: 0, elapsedMs: 0 }),
      ),
    ).toBe('5.0 MB');
  });
});
