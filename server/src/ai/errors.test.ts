import { describe, expect, it } from 'vitest';

import { AiError, aiError, isConnectionFailure, UNREACHABLE_MESSAGE } from './errors.js';

describe('AiError', () => {
  it('carries a message written for a therapist, not a stack trace', () => {
    expect(aiError('ollama_unreachable').message).toContain(UNREACHABLE_MESSAGE);
    expect(aiError('model_missing').message).toContain('setup script');
    expect(aiError('invalid_output').message).not.toMatch(/schema|zod|parse/i);
  });

  /**
   * The privacy audit's H1. `detail` is for the server log, and pino's `err`
   * serializer copies every *enumerable* own property of a thrown error onto
   * the record — so an `AiError` reaching the Fastify error handler would print
   * whatever is in there. Making it non-enumerable means the leak is
   * structurally impossible rather than a rule someone has to remember.
   */
  it('keeps `detail` off anything that enumerates the error', () => {
    const error = aiError('invalid_output', 'not JSON: 812 chars');

    expect(error.detail).toBe('not JSON: 812 chars');
    expect(Object.keys(error)).not.toContain('detail');
    expect(JSON.stringify({ ...error })).not.toContain('812');

    // How pino-std-serializers walks an error.
    const copied: Record<string, unknown> = {};
    for (const key in error) copied[key] = (error as unknown as Record<string, unknown>)[key];
    expect(copied).not.toHaveProperty('detail');
  });

  it('is still an Error, so `instanceof` and the message survive', () => {
    const error = aiError('degenerate_output');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AiError);
    expect(error.name).toBe('AiError');
  });
});

describe('isConnectionFailure', () => {
  it('recognises the undici causes that mean "nothing is listening"', () => {
    for (const code of ['ECONNREFUSED', 'ECONNRESET', 'UND_ERR_CONNECT_TIMEOUT']) {
      expect(isConnectionFailure(Object.assign(new TypeError('fetch failed'), { cause: { code } }))).toBe(
        true,
      );
    }
  });

  it('does not claim an ordinary error is a connection failure', () => {
    expect(isConnectionFailure(new Error('boom'))).toBe(false);
    expect(isConnectionFailure('boom')).toBe(false);
  });
});
