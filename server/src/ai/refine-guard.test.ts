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

  // Finding 3: the block list was widened past its first handful of phrases to
  // the MSE, risk, and disposition boilerplate a "more clinical" prompt invents.
  // Each of these was invented from a note (and sources) that never said it.
  const invented: ReadonlyArray<readonly [string, string]> = [
    ['linear and goal-directed thought process', 'Thought process linear and goal-directed.'],
    ['no delusions or hallucinations', 'No delusions or hallucinations.'],
    ['memory intact', 'Memory and concentration grossly intact.'],
    ['no acute distress', 'Appeared in no acute distress, casually dressed.'],
    ['speech within normal limits', 'Speech was unremarkable in rate and tone.'],
    ['no suicidal ideation (not just the "denied" form)', 'Reports no current suicidal ideation.'],
    ['a risk rating', 'Assessed as low risk.'],
    ['a disposition line', 'Would benefit from a higher level of care.'],
  ];
  for (const [label, sentence] of invented) {
    it(`reverts an invented ${label}`, () => {
      const result = guardRefinedSections(
        previous,
        { Objective: `${previous.Objective} ${sentence}`, Plan: previous.Plan },
        [],
      );
      expect(result.sections['Objective']).toBe(previous.Objective);
      expect(result.blocked).toHaveLength(1);
      expect(result.blocked[0]?.section).toBe('Objective');
    });
  }

  it('does not block grounded MSE boilerplate she actually dictated', () => {
    const transcript =
      'His thought process was linear and goal-directed, no hallucinations, memory grossly intact, ' +
      'and he was in no acute distress. I would put him at low risk today.';
    const revised = {
      Objective:
        'Thought process linear and goal-directed; no hallucinations. Memory grossly intact, no acute distress.',
      Plan: 'Low risk today. Continue weekly.',
    };
    const result = guardRefinedSections(previous, revised, [transcript]);
    expect(result.sections).toEqual(revised);
    expect(result.blocked).toHaveLength(0);
  });

  it('does not block clinical language when her own message asks for it', () => {
    // Her message is an allowed source: "add that he denied SI" is her writing
    // the note through the chat.
    const result = guardRefinedSections(
      previous,
      { Objective: previous.Objective, Plan: 'Continue weekly. Denied suicidal ideation.' },
      ['Note that he denied suicidal ideation today'],
    );
    expect(result.blocked).toHaveLength(0);
  });

  it('leaves ordinary narrative prose alone — a widened list must not reach into free dictation', () => {
    // None of "oriented toward recovery", "normal for him", "at risk of losing
    // his job", or an intact fence should trip a mental-status pattern.
    const revised = {
      Objective:
        'He seems oriented toward recovery and said the week felt normal for him. Worried he is at risk of losing his job; the back fence is finally intact.',
      Plan: 'Continue weekly.',
    };
    const result = guardRefinedSections(previous, revised, []);
    expect(result.sections).toEqual(revised);
    expect(result.blocked).toHaveLength(0);
  });

  it('blocks abbreviated, positive, and recommendation-shaped risk inventions', () => {
    const invented = [
      'Denies SI/HI/AVH. Cooperative and pleasant with good eye contact.',
      'Patient endorses suicidal ideation and is at elevated acute risk.',
      'Recommended to seek a higher level of care and referred for psychiatric evaluation.',
    ];
    for (const sentence of invented) {
      const result = guardRefinedSections(previous, { Objective: sentence, Plan: previous.Plan }, []);
      expect(result.sections['Objective']).toBe(previous.Objective);
      expect(result.blocked).toHaveLength(1);
    }
  });

  it('grounds equivalent clinical wording rather than requiring the same phrase', () => {
    const result = guardRefinedSections(
      previous,
      {
        Objective: 'Alert and oriented x4; denies suicidal ideation. Speech normal in rate and tone.',
        Plan: 'Continue weekly. Recommend follow up with psychiatry.',
      },
      [
        'She was alert and fully oriented, denied SI. Her verbal output was clear. Recommended follow-up with psychiatry.',
      ],
    );
    expect(result.sections).toEqual({
      Objective: 'Alert and oriented x4; denies suicidal ideation. Speech normal in rate and tone.',
      Plan: 'Continue weekly. Recommend follow up with psychiatry.',
    });
    expect(result.blocked).toHaveLength(0);
  });

  it('does not mistake everyday distress, eye contact, or recommendations for stock findings', () => {
    const revised = {
      Objective: 'No distress about the deadline; he made eye contact with the camera.',
      Plan: 'I recommend a shorter appointment next week.',
    };
    const result = guardRefinedSections(previous, revised, []);
    expect(result.sections).toEqual(revised);
    expect(result.blocked).toHaveLength(0);
  });

  it('does not let a grounded negative risk finding justify a positive one', () => {
    const result = guardRefinedSections(
      previous,
      { Plan: 'Patient endorses suicidal ideation and is high risk.', Objective: previous.Objective },
      ['Patient denied SI and was low risk.'],
    );
    expect(result.sections.Plan).toBe(previous.Plan);
    expect(result.blocked).toHaveLength(1);
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
