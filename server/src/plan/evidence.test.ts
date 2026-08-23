import { describe, expect, it } from 'vitest';

import { findExcerpt, sectionAtOffset } from './evidence.js';

/**
 * The check a citation has to survive.
 *
 * A quote in a directive document with a citation attached is worse than no
 * quote at all if the note does not actually say it, so this is deliberately
 * unforgiving about words and deliberately forgiving about whitespace.
 */

const NOTE = [
  'Subjective: Patient reports improved sleep since last session, and is getting',
  'six hours most nights now.',
  '',
  'Objective: Alert and engaged in session.',
  '',
  'Assessment: Continued progress.',
  '',
  'Plan: Continue weekly sessions.',
].join('\n');

const SOAP = ['Subjective', 'Objective', 'Assessment', 'Plan'];

describe('findExcerpt', () => {
  it('finds a quote and returns the note’s own characters', () => {
    const match = findExcerpt(NOTE, 'improved sleep since last session');
    expect(match?.text).toBe('improved sleep since last session');
    expect(NOTE.slice(match?.start ?? 0, (match?.start ?? 0) + 8)).toBe('improved');
  });

  it('forgives a line break turned into a space', () => {
    // The model quoted across the wrap; the note still says it.
    const match = findExcerpt(NOTE, 'is getting six hours most nights now');
    expect(match).not.toBeNull();
    expect(match?.text).toContain('\n');
  });

  it('refuses a paraphrase, however faithful', () => {
    expect(findExcerpt(NOTE, 'sleep has improved since the last session')).toBeNull();
    expect(findExcerpt(NOTE, 'seven hours most nights now')).toBeNull();
  });

  it('refuses an empty quote', () => {
    expect(findExcerpt(NOTE, '   ')).toBeNull();
    expect(findExcerpt('', 'anything')).toBeNull();
  });
});

describe('sectionAtOffset', () => {
  it('works out the section from the note rather than asking the model', () => {
    const subjective = findExcerpt(NOTE, 'improved sleep') as { start: number };
    expect(sectionAtOffset(NOTE, SOAP, subjective.start)).toBe('Subjective');

    const plan = findExcerpt(NOTE, 'Continue weekly sessions') as { start: number };
    expect(sectionAtOffset(NOTE, SOAP, plan.start)).toBe('Plan');
  });

  it('has no section for text before the first header', () => {
    expect(sectionAtOffset('a stray line\n\nSubjective: body.', SOAP, 2)).toBeNull();
  });
});
