import { describe, expect, it } from 'vitest';

import { describeFailure, SETUP_ERROR_CODES, setupError } from './errors.js';

describe('describeFailure', () => {
  it('has a sentence for every code', () => {
    for (const code of SETUP_ERROR_CODES) {
      const failure = describeFailure(setupError(code, 'internal detail'));
      expect(failure.code, code).toBe(code);
      expect(failure.title.length, code).toBeGreaterThan(0);
      expect(failure.detail.length, code).toBeGreaterThan(0);
    }
  });

  /**
   * The bar the packet sets: *"If any failure mode dead-ends at 'open Terminal
   * and run…', the packet is not done."* So no code, no path, no jargon —
   * checked, rather than intended.
   */
  it('never names a command, a path, or a piece of jargon', () => {
    const banned =
      /Terminal|command line|sudo|brew |npm |shell|stack trace|localhost|127\.0\.0\.1|\/Users\/|\bcurl\b|SHA-?\d|checksum|HTTP \d/i;
    for (const code of SETUP_ERROR_CODES) {
      const failure = describeFailure(setupError(code, 'HTTP 503 from https://example.test/x'));
      expect(`${failure.title} ${failure.detail}`, code).not.toMatch(banned);
    }
  });

  it('offers a retry for every failure, because every one of them is retryable', () => {
    for (const code of SETUP_ERROR_CODES) {
      expect(describeFailure(setupError(code, 'x')).retryable, code).toBe(true);
    }
  });

  it('lets a specific failure replace the general sentence', () => {
    const failure = describeFailure(
      setupError('not_enough_disk', 'internal', 'This Mac has 3.0 GB free and needs 13.0 GB.'),
    );
    expect(failure.detail).toBe('This Mac has 3.0 GB free and needs 13.0 GB.');
    expect(failure.title).toBe('This Mac needs more free space');
  });
});

describe('failures that arrive as something other than a SetupError', () => {
  it('reads an aborted operation as a stop, not a crash', () => {
    const abort = new Error('The operation was aborted');
    abort.name = 'AbortError';
    expect(describeFailure(abort).code).toBe('cancelled');
  });

  it('reads a dropped connection as the download stopping', () => {
    // What `fetch` actually throws when the network goes away mid-body.
    const failed = new TypeError('fetch failed');
    expect(describeFailure(failed).code).toBe('download_failed');

    const reset: NodeJS.ErrnoException = new Error('socket hang up');
    reset.code = 'ECONNRESET';
    expect(describeFailure(reset).code).toBe('download_failed');
  });

  it('still produces a sentence for something it has never seen', () => {
    const failure = describeFailure({ weird: true });
    expect(failure.code).toBe('unexpected');
    expect(failure.retryable).toBe(true);
  });
});
