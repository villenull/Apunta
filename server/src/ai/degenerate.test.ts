import { describe, expect, it } from 'vitest';

import { findDegeneration, findDegenerateSection } from './degenerate.js';

describe('findDegeneration', () => {
  it('passes ordinary clinical prose', () => {
    expect(
      findDegeneration(
        'Patient reports improved sleep since last session and decreased frequency of intrusive thoughts. She continues to attend her bereavement group and intends to resume morning walks.',
      ),
    ).toBeNull();
  });

  it('passes an empty section', () => {
    expect(findDegeneration('')).toBeNull();
  });

  /** ollama#15502's reported output shape, verbatim in structure. */
  it('catches a run of one repeated token', () => {
    const finding = findDegeneration(`amber ${'own '.repeat(40)}`);
    expect(finding?.reason).toBe('consecutive');
    expect(finding?.token).toBe('own');
  });

  it('catches a loop that is broken up but still dominates the body', () => {
    const body = Array.from({ length: 60 }, (_, index) => (index % 3 === 0 ? 'sleep' : 'own own')).join(' ');
    expect(findDegeneration(body)?.reason).toBe('share');
  });

  it('tolerates a short body that repeats a word', () => {
    expect(findDegeneration('Continue weekly. Continue weekly.')).toBeNull();
  });

  it('tolerates natural repetition of a common word in a long body', () => {
    const body = Array.from({ length: 30 }, () => 'the patient reports improved sleep this week').join(' ');
    expect(findDegeneration(body)).toBeNull();
  });
});

describe('findDegenerateSection', () => {
  it('names the first bad section', () => {
    const found = findDegenerateSection({
      Subjective: 'Sleeping better.',
      Plan: `plan ${'own '.repeat(20)}`,
    });
    expect(found?.section).toBe('Plan');
  });

  it('returns null when every section reads like prose', () => {
    expect(findDegenerateSection({ Subjective: 'Sleeping better.', Plan: 'Continue weekly.' })).toBeNull();
  });
});
