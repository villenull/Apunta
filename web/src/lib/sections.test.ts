import { describe, expect, it } from 'vitest';

import { duplicateSection, parseSections } from './sections.js';

describe('parseSections', () => {
  it("splits the prototype's example on commas", () => {
    expect(parseSections('Subjective, Objective, Assessment, Plan')).toEqual([
      'Subjective',
      'Objective',
      'Assessment',
      'Plan',
    ]);
  });

  it('accepts one section per line, and ignores blank entries', () => {
    expect(parseSections('Presenting problem\nHistory\n\n Formulation ,\nPlan')).toEqual([
      'Presenting problem',
      'History',
      'Formulation',
      'Plan',
    ]);
  });

  it('is empty for empty input', () => {
    expect(parseSections('   \n , ')).toEqual([]);
  });
});

describe('duplicateSection', () => {
  it('finds a repeat regardless of case, as the server does', () => {
    expect(duplicateSection(['Subjective', 'Plan'])).toBeNull();
    expect(duplicateSection(['Plan', 'plan'])).toBe('plan');
  });
});
