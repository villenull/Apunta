import type { Sections } from '@apunta/shared';
import { describe, expect, it } from 'vitest';

import {
  draftCarriesRisk,
  hasRiskReview,
  MAX_RISK_SENTENCES,
  riskHomeSection,
  riskReviewLost,
  riskSentencesFromQuotes,
  withRiskReview,
} from './risk-review.js';

describe('hasRiskReview', () => {
  it('needs both a risk word and a review verb', () => {
    expect(hasRiskReview('I asked about self-harm and she denied it.')).toBe(true);
    expect(hasRiskReview('She talked about the risk of losing her job.')).toBe(false);
    expect(hasRiskReview('She denied drinking.')).toBe(false);
  });
});

describe('draftCarriesRisk', () => {
  it('sees any risk dimension in any section', () => {
    expect(draftCarriesRisk({ A: 'Low mood.', B: 'She denied thoughts of hurting herself.' })).toBe(true);
    expect(draftCarriesRisk({ A: 'She denies SI.' })).toBe(true);
    expect(draftCarriesRisk({ A: 'He denied any intent to hurt anyone.' })).toBe(true);
  });

  it('does not count passing words that are not a review', () => {
    expect(draftCarriesRisk({ A: 'Passive ideation raises the severity.', B: 'She said hi.' })).toBe(false);
  });
});

describe('riskReviewLost', () => {
  const empty = { A: 'Low mood.' };

  it('needs a review in the source that names a risk, and none in the draft', () => {
    expect(riskReviewLost('I asked about self-harm and she denied it.', empty)).toBe(true);
    expect(riskReviewLost('I asked about self-harm and she denied it.', { A: 'She denied self-harm.' })).toBe(
      false,
    );
  });

  it('makes no call for a source that only passes the broad gate', () => {
    expect(riskReviewLost('Her back hurt. I asked about work.', empty)).toBe(false);
  });
});

describe('riskSentencesFromQuotes', () => {
  const SOURCE =
    'Low mood for five years. Risk: i asked directly and she denied any thoughts of killing herself and denied any plan. She said she has "days where i wouldn\'t mind not waking up," passive stuff, no intent. Parking was a nightmare.';

  it("returns her whole sentences, never the model's words", () => {
    expect(riskSentencesFromQuotes(SOURCE, ['she denied any thoughts of killing herself'])).toEqual([
      'Risk: i asked directly and she denied any thoughts of killing herself and denied any plan.',
    ]);
  });

  it('widens a fragment so it cannot drop the denial around it', () => {
    const source = 'I asked about it and she denied she has thoughts of killing herself.';
    expect(riskSentencesFromQuotes(source, ['she has thoughts of killing herself'])).toEqual([source]);
  });

  it('matches words alone, ignoring case and punctuation, but not a changed word', () => {
    expect(riskSentencesFromQuotes(SOURCE, ['RISK: I asked directly, and she denied'])).toHaveLength(1);
    expect(riskSentencesFromQuotes(SOURCE, ['she denied all thoughts of killing herself'])).toEqual([]);
  });

  it('drops a quote whose sentences name no risk, and a quote not in the source', () => {
    expect(riskSentencesFromQuotes(SOURCE, ['Parking was a nightmare'])).toEqual([]);
    expect(riskSentencesFromQuotes(SOURCE, ['she reported suicidal intent'])).toEqual([]);
  });

  it('keeps a quote across two sentences whole, in her order, once', () => {
    const source =
      'I did ask about self-harm and suicide directly. He said no to both, past and present. On time.';
    expect(
      riskSentencesFromQuotes(source, [
        'He said no to both',
        'I did ask about self-harm and suicide directly. He said no to both, past and present',
      ]),
    ).toEqual(['I did ask about self-harm and suicide directly.', 'He said no to both, past and present.']);
  });

  it('does not end a sentence at a time, a title or a soft line wrap', () => {
    const time = 'She reports thoughts of suicide around 11.30pm but has no plan.';
    expect(riskSentencesFromQuotes(time, ['reports thoughts of suicide around 11'])).toEqual([time]);
    const wrapped = 'She endorsed thoughts of suicide\nbut has no current plan.';
    expect(riskSentencesFromQuotes(wrapped, ['endorsed thoughts of suicide'])).toEqual([
      'She endorsed thoughts of suicide\nbut has no current plan.'.replace(/\s+/g, ' '),
    ]);
    const title = 'She told Dr. Jones she has thoughts of killing herself but would never act on it.';
    expect(riskSentencesFromQuotes(title, ['has thoughts of killing herself'])).toEqual([title]);
  });

  it('still ends a sentence at a lower-case dictated stop, and at a new line that starts one', () => {
    const lower = 'she denied any thoughts of killing herself. parking was a nightmare.';
    expect(
      riskSentencesFromQuotes(lower, ['she denied any thoughts of killing herself. parking was']),
    ).toEqual(['she denied any thoughts of killing herself.']);
    const listed = 'Risk: denied SI\nPlan: weekly';
    expect(riskSentencesFromQuotes(listed, ['denied SI'])).toEqual(['Risk: denied SI']);
  });

  it('does not take an unrelated sentence the quote drifts into', () => {
    const source =
      "She denied thoughts of self-harm. She mentioned she cried at her sister's wedding last month.";
    expect(
      riskSentencesFromQuotes(source, [
        "denied thoughts of self-harm. She mentioned she cried at her sister's wedding",
      ]),
    ).toEqual(['She denied thoughts of self-harm.']);
  });

  it('counts a quoted injury as risk, but not an injury in the draft', () => {
    const source = 'I asked whether the washing had ever gone to the point of injury and she said no.';
    expect(riskSentencesFromQuotes(source, ['the point of injury'])).toEqual([source]);
    expect(draftCarriesRisk({ A: 'She sprained her ankle; no injury beyond bruising.' })).toBe(false);
  });

  it('keeps no more than the cap', () => {
    const source = Array.from(
      { length: MAX_RISK_SENTENCES + 2 },
      (_, index) => `She denied SI ${'again '.repeat(index)}.`,
    ).join(' ');
    expect(riskSentencesFromQuotes(source, ['She denied SI'])).toHaveLength(MAX_RISK_SENTENCES);
  });
});

describe('riskHomeSection', () => {
  it('prefers a risk section, then where a review is reported', () => {
    expect(riskHomeSection(['Location', 'Client presentation', 'Risk review', 'Discussion'])).toBe(
      'Risk review',
    );
    expect(riskHomeSection(['Presenting problem', 'History', 'Formulation', 'Plan'])).toBe(
      'Presenting problem',
    );
    expect(riskHomeSection(['Subjective', 'Objective', 'Assessment', 'Plan'])).toBe('Subjective');
  });

  it('never files a review under a conclusion or a plan', () => {
    expect(riskHomeSection(['Formulation', 'Plan', 'Notes'])).toBe('Notes');
  });
});

describe('withRiskReview', () => {
  const sections: Sections = { 'Risk review': 'None.', Discussion: 'Work stress.' };

  it('fills an empty or "None." risk section with her words, quoted', () => {
    expect(withRiskReview(sections, ['Risk review', 'Discussion'], ['She denied SI.'])).toEqual({
      'Risk review': 'As dictated: "She denied SI."',
      Discussion: 'Work stress.',
    });
  });

  it('adds a labelled paragraph to any other section', () => {
    expect(
      withRiskReview({ Discussion: 'Work stress.' }, ['Discussion'], ['She denied SI.', 'And HI.']),
    ).toEqual({
      Discussion: 'Work stress.\n\nRisk review, as dictated: "She denied SI. And HI."',
    });
  });

  it('leaves the draft alone with nothing to add', () => {
    expect(withRiskReview(sections, ['Risk review', 'Discussion'], [])).toBe(sections);
  });
});
