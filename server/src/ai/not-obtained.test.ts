import { describe, expect, it } from 'vitest';

import { NOT_GATHERED_NOTE, notGatheredTopics, removeInventedNegatives } from './not-obtained.js';

const SOURCE =
  "Background — they stopped me. I don't have family history, I don't have prior treatment, I don't have medical, I don't\nhave anything on childhood or relationships. They denied suicidal ideation.";

describe('notGatheredTopics', () => {
  it('reads what she says she does not have, across a line wrap', () => {
    expect([...notGatheredTopics(SOURCE)].sort()).toEqual(
      ['childhood', 'family', 'medical', 'relationship', 'treatment'].sort(),
    );
  });

  it('does not read a finding as a gap', () => {
    expect(notGatheredTopics('I have no concerns about alcohol.').size).toBe(0);
  });
});

describe('removeInventedNegatives', () => {
  it('replaces a negative finding about ungathered background with the open item', () => {
    const outcome = removeInventedNegatives(SOURCE, {
      History:
        'They denied suicidal ideation. Patient reported no family history, no prior treatment, no medical conditions, and no relevant childhood or relationship history. They were not ready to discuss background.',
    });
    expect(outcome.sections.History).toBe(
      `They denied suicidal ideation. ${NOT_GATHERED_NOTE} They were not ready to discuss background.`,
    );
    expect(outcome.removed).toHaveLength(1);
  });

  it('keeps a negative she stated herself', () => {
    const source = "I don't have medical. No substance issues she reported, she barely drinks.";
    const draft = { History: 'She denies substance use. No medical history was reported.' };
    const outcome = removeInventedNegatives(source, draft);
    expect(outcome.sections.History).toBe(`She denies substance use. ${NOT_GATHERED_NOTE}`);
  });

  it('keeps a sentence that also says something else', () => {
    const draft = { History: 'No family history, and she lives with her sister.' };
    expect(removeInventedNegatives(SOURCE, draft)).toEqual({ sections: draft, removed: [] });
  });

  it('keeps a sentence carrying risk, a number or a medication', () => {
    for (const body of [
      'No family history and denied SI.',
      'No prior treatment in 2 years.',
      'No medical conditions apart from sertraline.',
    ]) {
      expect(removeInventedNegatives(SOURCE, { History: body }).removed).toEqual([]);
    }
  });

  it('keeps a sentence that already says the information is missing', () => {
    const draft = { History: 'Family history was not obtained.' };
    expect(removeInventedNegatives(SOURCE, draft).removed).toEqual([]);
  });

  it('does not treat "family" alone as family history', () => {
    const draft = { History: 'She has no family nearby.' };
    expect(removeInventedNegatives(SOURCE, draft).removed).toEqual([]);
  });

  it('does nothing when she gathered everything', () => {
    const draft = { History: 'No family history.' };
    expect(removeInventedNegatives('Family history: none, she said.', draft)).toEqual({
      sections: draft,
      removed: [],
    });
  });
});
