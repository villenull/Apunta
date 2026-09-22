import { describe, expect, it } from 'vitest';

import { reconcilePreviewResult } from './useLiveRecording.js';

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
});
