import { describe, expect, it } from 'vitest';

import {
  factNotice,
  factTokens,
  guardDroppedFacts,
  medicationTokens,
  nameTokens,
  protectedFactTokens,
} from './fact-guard.js';

/**
 * Born from the refine harness's first run (2026-09-01): asked to shorten,
 * the model removed "up from four in June" and explained that the detail was
 * not in the dictation — a dictation the refine call never shows it. Three
 * prompt attempts failed. The guard is the published-lock pattern applied to
 * loss: enforced server-side, on the diff, note-wide, with her own message as
 * the only way through.
 */
describe('factTokens', () => {
  it('finds numbers however they are written, and normalises them', () => {
    const tokens = factTokens(
      'Sleeping six and a half hours, up from four in June; twenty-five minutes of walking.',
    );
    expect([...tokens.keys()]).toEqual(['6.5', '4', 'm6', '25']);
  });

  it('reads "twenty five" across two words and "twenty-one" with the one it otherwise ignores', () => {
    expect([...factTokens('twenty five minutes').keys()]).toEqual(['25']);
    expect([...factTokens('twenty-one sessions').keys()]).toEqual(['21']);
    // "one" on its own is a pronoun far more often than a quantity.
    expect([...factTokens('one of the things he raised').keys()]).toEqual([]);
  });

  it('reads a hyphenated quantity the same as a spaced one, because a clinical rewrite hyphenates', () => {
    expect([...factTokens('six-and-a-half hours').keys()]).toEqual(['6.5']);
    expect([...factTokens('a twenty-five-minute walk').keys()]).toEqual(['25']);
  });

  it('reads the clinical register\'s "six and one-half" and "six point five" as the same 6.5', () => {
    // What the real model wrote for "use a more clinical tone" on 2026-09-04,
    // and what the lock first mistook for a lost fact.
    expect([...factTokens('approximately six and one-half hours per night').keys()]).toEqual(['6.5']);
    expect([...factTokens('six point five hours').keys()]).toEqual(['6.5']);
  });

  it('keeps digit groups apart and drops leading zeros', () => {
    expect([...factTokens('GAD-7 was 12/21 at 08:30').keys()]).toEqual(['7', '12', '21', '8', '30']);
    expect([...factTokens('6.5 hours').keys()]).toEqual(['6.5']);
  });

  it('ignores list markers, which are layout rather than facts', () => {
    expect([...factTokens('1. Continue weekly\n2. Grounding daily\n- Review').keys()]).toEqual([]);
  });

  it('knows a month from the modal verb and a weekday from the past tense', () => {
    expect([...factTokens('he may come back on Tuesday').keys()]).toEqual(['d2']);
    expect([...factTokens('seen in May; sat quietly; back Sat.').keys()]).toEqual(['m5', 'd6']);
  });

  it('maps each token to the phrase it sits in, for the notice', () => {
    const tokens = factTokens('Sleeping better now, up from four in June. Walks daily.');
    expect(tokens.get('4')).toBe('four in June');
    expect(tokens.get('m6')).toBe('June');
  });
});

describe('guardDroppedFacts', () => {
  const previous = {
    Subjective:
      'John reports sleeping about six and a half hours most nights, up from four in June. He says the intrusive thoughts are less frequent, not gone.',
    Objective: 'Engaged, made eye contact throughout.',
    Plan: 'Continue fortnightly. Review in 3 weeks.',
  };

  it('keeps a section that a shortening would strip a fact from, and names the fact', () => {
    const result = guardDroppedFacts(
      previous,
      {
        Subjective:
          'John sleeps about six and a half hours most nights; intrusive thoughts are less frequent.',
        Objective: previous.Objective,
        Plan: 'Continue fortnightly; review in 3 weeks.',
      },
      'Make the subjective section shorter',
    );
    expect(result.sections['Subjective']).toBe(previous.Subjective);
    // The other section's edit goes through — the lock is per section.
    expect(result.sections['Plan']).toBe('Continue fortnightly; review in 3 weeks.');
    expect(result.dropped).toEqual([{ section: 'Subjective', phrase: 'four in June' }]);
  });

  it('lets paraphrase through: 4 for four, Jun for June, 6.5 for six and a half', () => {
    const result = guardDroppedFacts(
      previous,
      {
        ...previous,
        Subjective:
          'Sleeping ~6.5h most nights, up from 4 in Jun. Intrusive thoughts less frequent, not gone.',
      },
      'Make it shorter',
    );
    expect(result.dropped).toHaveLength(0);
    expect(result.sections['Subjective']).toContain('6.5h');
  });

  it('lets a fact move between sections, because the note still has it', () => {
    const result = guardDroppedFacts(
      previous,
      {
        Subjective: 'John says the intrusive thoughts are less frequent, not gone.',
        Objective: previous.Objective,
        Plan: 'Continue fortnightly. Review in 3 weeks. Sleep now six and a half hours, up from four in June.',
      },
      'Move the sleep detail to the plan',
    );
    expect(result.dropped).toHaveLength(0);
  });

  it('lets a fact go when her message names it', () => {
    const result = guardDroppedFacts(
      previous,
      {
        ...previous,
        Subjective:
          'John reports sleeping about six and a half hours most nights. Intrusive thoughts less frequent, not gone.',
      },
      'The four in June comparison is out of date now, tidy that sentence',
    );
    expect(result.dropped).toHaveLength(0);
  });

  it('stands down when she asks for a removal in so many words', () => {
    const updated = { ...previous, Subjective: 'Intrusive thoughts less frequent, not gone.' };
    const result = guardDroppedFacts(previous, updated, 'Take out the sleep comparison');
    expect(result.dropped).toHaveLength(0);
    expect(result.sections).toEqual(updated);
  });

  it('restores a section the model left out of its answer', () => {
    const result = guardDroppedFacts(
      previous,
      { Subjective: previous.Subjective, Objective: previous.Objective },
      'Tighten the wording',
    );
    expect(result.sections['Plan']).toBe(previous.Plan);
    expect(result.dropped).toEqual([{ section: 'Plan', phrase: '3 weeks' }]);
  });

  it('does not count a list being unnumbered as a loss', () => {
    const listed = { Plan: '1. Continue weekly\n2. Grounding daily' };
    const result = guardDroppedFacts(listed, { Plan: 'Continue weekly; grounding daily.' }, 'Make it prose');
    expect(result.dropped).toHaveLength(0);
  });

  it('does not fire when the number survives in another section — a known miss, kept for precision', () => {
    const twice = { Subjective: 'Up from four in June.', Plan: 'Review in 4 weeks, then June.' };
    const result = guardDroppedFacts(twice, { ...twice, Subjective: 'Improving.' }, 'Shorter');
    expect(result.dropped).toHaveLength(0);
  });

  it('passes an untouched revision through whole', () => {
    const result = guardDroppedFacts(previous, { ...previous }, 'Make it shorter');
    expect(result.sections).toEqual(previous);
    expect(result.dropped).toHaveLength(0);
  });

  it('preserves explicit risk negations when shortening drops the risk sentence', () => {
    const before = { Assessment: 'Progressing. Denies SI/HI and no safety concerns today.' };
    const result = guardDroppedFacts(before, { Assessment: 'Progressing.' }, 'Make the assessment shorter');
    expect(result.sections.Assessment).toBe(before.Assessment);
    expect(result.dropped).toEqual([{ section: 'Assessment', phrase: 'Denies SI' }]);
  });

  it('recognizes risk-negation paraphrases as the same load-bearing fact', () => {
    const before = { Assessment: 'Patient denies SI and self-harm.' };
    const result = guardDroppedFacts(
      before,
      { Assessment: 'No current suicidal ideation; self-injurious behavior was denied.' },
      'Shorten without changing meaning',
    );
    expect(result.sections.Assessment).toEqual(
      'No current suicidal ideation; self-injurious behavior was denied.',
    );
    expect(result.dropped).toHaveLength(0);
  });

  it('keeps a positive risk finding too, without conflating it with a negation', () => {
    const before = { Assessment: 'Patient reports passive suicidal thoughts.' };
    const result = guardDroppedFacts(before, { Assessment: 'Progress continues.' }, 'Shorten this section');
    expect(result.sections.Assessment).toBe(before.Assessment);
    expect(result.dropped).toHaveLength(1);
  });

  it('preserves medications across brand/generic rewrites and catches an unnamed dosed drug', () => {
    expect([...medicationTokens('Started Zoloft 50 mg daily and takes fluox-a-teen 20 mg.').keys()]).toEqual([
      'med:sertraline',
      'med:fluox-a-teen',
    ]);
    const before = { Plan: 'Continue Zoloft 50 mg daily.' };
    const result = guardDroppedFacts(
      before,
      { Plan: 'Continue sertraline daily.' },
      'Use a shorter clinical wording',
    );
    // The medication survives by alias, while the dose is separately retained
    // by the numeric fact lock and therefore keeps this section unchanged.
    expect(result.sections.Plan).toBe(before.Plan);
    expect(result.dropped).toEqual([{ section: 'Plan', phrase: '50 mg daily' }]);
  });

  it('preserves titled and relationship-anchored names, including punctuation', () => {
    expect([...nameTokens('Discussed with Dr. Alvarez; her daughter, Maria, called.').keys()]).toEqual([
      'name:alvarez',
      'name:maria',
    ]);
    const before = { Subjective: 'Dr. Alvarez spoke with her daughter, Maria, about the referral.' };
    const result = guardDroppedFacts(
      before,
      { Subjective: 'Discussed the referral.' },
      'Tighten the sentence',
    );
    expect(result.sections.Subjective).toBe(before.Subjective);
    expect(result.dropped[0]?.phrase).toBe('Dr. Alvarez');
  });

  it('does not turn ordinary prose with a numeric-looking unit into a medication fact', () => {
    const before = { Subjective: 'Walking 5 mg is not a phrase used in this note.' };
    const result = guardDroppedFacts(before, { Subjective: 'The wording is 5 mg awkward.' }, 'Shorten');
    expect(result.dropped).toHaveLength(0);
    expect([...protectedFactTokens('Walking 5 mg is not a phrase used in this note.').keys()]).not.toContain(
      'med:walking',
    );
  });

  /**
   * Found by the owner's hands-on pass, 2026-09-23. The relationship patterns
   * are case-insensitive, and with the `i` flag `[A-Z]` matches any letter, so
   * the word after a relationship noun became a name whatever it was: "her
   * manager has been giving her more responsibility" held the name `has`, and
   * "her sister's wedding next month" the name `wedding`. Asked to make the
   * Discussion shorter, the lock then kept the whole section and the notice
   * under the reply read "the change would have lost \"manager has\"" — a
   * shortening she had asked for, refused for a word that is not a name.
   */
  it('does not read an ordinary word after a relationship noun as a name', () => {
    expect([...nameTokens('her manager has been giving her more responsibility').keys()]).toEqual([]);
    expect([...nameTokens("her sister's wedding next month").keys()]).toEqual([]);
    expect([...nameTokens('her manager Hasina approved the request').keys()]).toEqual(['name:hasina']);

    const before = {
      Discussion: 'We also talked about work; her manager has been giving her more responsibility.',
    };
    const shortened = { Discussion: 'We talked about work.' };
    const result = guardDroppedFacts(before, shortened, 'Make the discussion shorter');
    expect(result.dropped).toEqual([]);
    expect(result.sections).toEqual(shortened);
  });
});

describe('factNotice', () => {
  it('names the section and the phrase, and says how to take something out on purpose', () => {
    const notice = factNotice([{ section: 'Subjective', phrase: 'four in June' }]);
    expect(notice).toContain('Apunta held back part of this revision.');
    expect(notice).toContain('Subjective was kept as it was');
    expect(notice).toContain('"four in June"');
    expect(notice).toContain('say so and name it');
    // Distinct opening words from the boilerplate lock, so the harness can count them apart.
    expect(notice).not.toContain('Apunta blocked');
  });
});
