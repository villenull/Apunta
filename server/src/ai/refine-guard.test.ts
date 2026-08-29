import { describe, expect, it } from 'vitest';

import { guardNotice, guardRefinedSections } from './refine-guard.js';

/**
 * Born from a live M10 finding: "More clinical" added "alert and oriented"
 * and "mood congruent with affect" to a note containing neither, and two
 * rounds of prompt hardening could not reliably stop it. The guard is the
 * published-lock pattern applied to boilerplate: enforced server-side, on
 * the diff, against the stored sources — never against the model's own
 * account of what the dictation said, which the same session showed it
 * confabulates.
 */
describe('guardRefinedSections', () => {
  const previous = {
    Objective: 'Engaged, made eye contact the whole time.',
    Plan: 'Continue weekly.',
  };

  it('reverts a section whose revision invents mental-status boilerplate', () => {
    const result = guardRefinedSections(
      previous,
      {
        Objective: 'Alert and oriented, engaged, made eye contact throughout.',
        Plan: 'Continue weekly sessions.',
      },
      [],
    );
    expect(result.sections['Objective']).toBe(previous.Objective);
    expect(result.sections['Plan']).toBe('Continue weekly sessions.');
    expect(result.blocked).toEqual([{ section: 'Objective', phrase: 'Alert and oriented' }]);
  });

  it('reverts an invented risk assertion, the most dangerous gain a note can make', () => {
    const result = guardRefinedSections(
      previous,
      { Objective: previous.Objective, Plan: 'Continue weekly. Denied suicidal ideation.' },
      [],
    );
    expect(result.sections['Plan']).toBe(previous.Plan);
    expect(result.blocked[0]?.section).toBe('Plan');
  });

  it('lets boilerplate through when the therapist actually dictated it', () => {
    const transcript = 'He was alert and oriented today, tracked everything I said.';
    const result = guardRefinedSections(
      previous,
      { Objective: 'Alert and oriented, engaged.', Plan: previous.Plan },
      [transcript],
    );
    expect(result.sections['Objective']).toBe('Alert and oriented, engaged.');
    expect(result.blocked).toHaveLength(0);
  });

  it('lets a phrase persist once it is already in the section, so old notes stay editable', () => {
    const contaminated = { Objective: 'Alert and oriented, engaged.', Plan: 'Continue weekly.' };
    const result = guardRefinedSections(
      contaminated,
      { Objective: 'Alert and oriented; engaged and talkative.', Plan: 'Continue weekly.' },
      [],
    );
    // The phrase is not NEW here — reverting would make contaminated notes
    // uneditable. Removing inherited boilerplate is her call, not a diff's.
    expect(result.blocked).toHaveLength(0);
  });

  it('is case-sensitive about SI so Spanish "si" and greeting "hi" never trip it', () => {
    const result = guardRefinedSections(
      previous,
      { Objective: 'Said no si worries, and no hi either.', Plan: 'No SI reported.' },
      [],
    );
    expect(result.sections['Objective']).toBe('Said no si worries, and no hi either.');
    expect(result.sections['Plan']).toBe(previous.Plan);
  });

  it('passes an untouched revision through whole', () => {
    const updated = { Objective: 'Engaged, briefly tearful.', Plan: 'Continue weekly.' };
    const result = guardRefinedSections(previous, updated, []);
    expect(result.sections).toEqual(updated);
    expect(result.blocked).toHaveLength(0);
  });
});

describe('guardNotice', () => {
  it('names the section and the boilerplate, which is never dictation content', () => {
    const notice = guardNotice([{ section: 'Objective', phrase: 'alert and oriented' }]);
    expect(notice).toContain('Apunta blocked part of this revision.');
    expect(notice).toContain('Objective was kept as it was');
    expect(notice).toContain('"alert and oriented"');
  });
});
