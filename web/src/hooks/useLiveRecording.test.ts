import { describe, expect, it } from 'vitest';

import { reconcilePreviewResult, splitPreviewTail } from './useLiveRecording.js';

describe('live preview reconciliation', () => {
  it('lets the final chunk supersede a stale partial instead of appending it', () => {
    const initial = { text: '', at: 0 };
    const partialRequest = { kind: 'tail' as const, committedAt: 0, to: 12 };
    const commitRequest = { kind: 'commit' as const, committedAt: 0, to: 12 };

    const partial = reconcilePreviewResult(initial, partialRequest, 'The sentence was spoken once.');
    expect(partial?.preview).toBe('The sentence was spoken once.');

    const final = reconcilePreviewResult(initial, commitRequest, 'The sentence was spoken once.');
    expect(final?.preview).toBe('The sentence was spoken once.');

    // This is the response ordering that used to flash a duplicate: a tail
    // captured before the commit arrives after the final chunk.
    expect(
      reconcilePreviewResult(final!.committed, partialRequest, 'The sentence was spoken once.'),
    ).toBeNull();
  });

  it('keeps a genuine repeated utterance in a later audio segment', () => {
    const first = reconcilePreviewResult(
      { text: '', at: 0 },
      { kind: 'commit', committedAt: 0, to: 12 },
      'No, no, no.',
    );
    expect(first?.preview).toBe('No, no, no.');

    const repeated = reconcilePreviewResult(
      first!.committed,
      { kind: 'tail', committedAt: 12, to: 24 },
      'No, no, no.',
    );
    expect(repeated?.preview).toBe('No, no, no. No, no, no.');
  });

  it('removes a repeated sentence at a preview-window join', () => {
    const first = reconcilePreviewResult(
      { text: '', at: 0 },
      { kind: 'commit' as const, committedAt: 0, to: 12 },
      'The client discussed the wedding next month.',
    );
    const joined = reconcilePreviewResult(
      first!.committed,
      { kind: 'commit' as const, committedAt: 12, to: 24 },
      'The client discussed the wedding next month. She feels anxious.',
    );
    expect(joined?.preview).toBe('The client discussed the wedding next month. She feels anxious.');
  });

  it('does not remove a repeated single-word emphasis at a join', () => {
    const first = reconcilePreviewResult(
      { text: '', at: 0 },
      { kind: 'commit' as const, committedAt: 0, to: 12 },
      'No, no, no.',
    );
    const joined = reconcilePreviewResult(
      first!.committed,
      { kind: 'commit' as const, committedAt: 12, to: 24 },
      'No, no, no.',
    );
    expect(joined?.preview).toBe('No, no, no. No, no, no.');
  });

  it('stabilizes an agreed prefix and leaves only a short tentative tail', () => {
    const first = reconcilePreviewResult(
      { text: '', at: 0, tail: '' },
      { kind: 'tail' as const, committedAt: 0, to: 1 },
      'The client discussed the wedding',
    );
    const next = reconcilePreviewResult(
      first!.committed,
      { kind: 'tail' as const, committedAt: 0, to: 2 },
      'The client discussed the wedding next month',
    );
    const rewrite = reconcilePreviewResult(
      next!.committed,
      { kind: 'tail' as const, committedAt: 0, to: 3 },
      'The client discussed the work next month',
    );
    expect(rewrite?.preview).toContain('The client discussed');
    expect(rewrite?.preview).toContain('work next month');
  });
  it('renders each preview word once across committed and tentative spans', () => {
    const cases = [
      'The client discussed the wedding next month with her sister',
      'Wedding anxiety',
    ];
    for (const text of cases) {
      const result = reconcilePreviewResult(
        { text: '', at: 0, tail: '' },
        { kind: 'tail' as const, committedAt: 0, to: 1 },
        text,
      );
      expect(result).not.toBeNull();
      const display = splitPreviewTail(result!.committed);
      const rendered = [display.committed, display.tentative].filter(Boolean).join(' ');
      expect(rendered).toBe(result!.preview);
      expect(rendered.split(/\s+/)).toEqual(text.split(/\s+/));
    }
  });
});
