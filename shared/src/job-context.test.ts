import { describe, expect, it } from 'vitest';

import { captureJobContext, type JobContext } from './job-context.js';

/**
 * C-LANG@1 rule 4's guarantee, at the only level this card owns: a job's
 * context is read once and cannot move under it.
 */

describe('captureJobContext', () => {
  it('carries the four values rule 4 names', () => {
    const context = captureJobContext({
      locale: 'es-MX',
      sttModel: null,
      llmModel: 'gemma4:12b-it-qat',
      promptSet: 'es-MX',
    });

    expect(context).toEqual({
      locale: 'es-MX',
      sttModel: null,
      llmModel: 'gemma4:12b-it-qat',
      promptSet: 'es-MX',
    });
  });

  it('records a job that dictates nothing as having no speech model', () => {
    // A draft from typed notes has no audio, so it has no model — `null` says
    // "not needed here" rather than "the English one will do".
    const context = captureJobContext({
      locale: 'en',
      llmModel: 'gemma4:12b-it-qat',
      promptSet: 'en',
    });
    expect(context.sttModel).toBeNull();
  });

  it('is a snapshot: the reading it was given cannot be changed into the context', () => {
    const reading = { locale: 'en', llmModel: 'gemma4:12b-it-qat', promptSet: 'en' } as const;
    const context: JobContext = captureJobContext(reading);

    expect(context).not.toBe(reading);
    expect({ ...context }).toEqual({ ...reading, sttModel: null });
  });

  it('cannot be edited once captured, so a retry cannot read a different job', () => {
    const context = captureJobContext({
      locale: 'en',
      llmModel: 'gemma4:12b-it-qat',
      promptSet: 'en',
    });

    expect(Object.isFrozen(context)).toBe(true);
    // Rule 4: SSE, retries and persistence read the captured values. A context
    // any of them could edit would be a second source of truth that happens to
    // agree for a while.
    expect(() => {
      (context as { locale: string }).locale = 'es-MX';
    }).toThrow(TypeError);
  });
});
