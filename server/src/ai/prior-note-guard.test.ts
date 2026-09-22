import { describe, expect, it } from 'vitest';

import {
  PRIOR_NOTE_NOTICE_OPENING,
  bringOverRequested,
  guardPriorNoteContent,
  priorNoteNotice,
} from './prior-note-guard.js';

/** Synthetic sessions for John Smith (hard rule 2). */
const PREVIOUS = {
  Subjective: 'John reports sleeping about six hours most nights. Work stress is easing.',
  Objective: 'Engaged, made eye contact throughout.',
  Assessment: '',
  Plan: 'Continue fortnightly.',
};
const TRANSCRIPT = 'He said sleep is about six hours and work stress is easing a little.';
const PRIOR_NOTES = [
  'Subjective: Sister Maria visited from Denver for a week. Sleeping four hours.\n\nPlan: Try the breathing app twice a day before bed.',
  'Assessment: Mood lower in the week of the move.',
];

function guard(updated: Partial<typeof PREVIOUS>, message = 'Make it shorter') {
  return guardPriorNoteContent(PREVIOUS, { ...PREVIOUS, ...updated }, [TRANSCRIPT], PRIOR_NOTES, message);
}

describe('guardPriorNoteContent', () => {
  it('holds back a section that gains a fact only an earlier note has', () => {
    const result = guard({ Subjective: `${PREVIOUS.Subjective} Sleep was four hours before.` });
    expect(result.sections['Subjective']).toBe(PREVIOUS.Subjective);
    expect(result.carried).toHaveLength(1);
    expect(result.carried[0]?.section).toBe('Subjective');
  });

  it('holds back a sentence lifted from an earlier note', () => {
    const result = guard({ Plan: 'Continue fortnightly. Try the breathing app twice a day before bed.' });
    expect(result.sections['Plan']).toBe(PREVIOUS.Plan);
    expect(result.carried[0]?.phrase).toMatch(/twice a day|breathing app/);
  });

  it('holds back a lifted sentence with no fact in it, by its words alone', () => {
    const result = guard({ Assessment: 'Mood lower in the week of the move.' });
    expect(result.carried[0]?.phrase).toMatch(/Mood lower in the week/);
  });

  it('holds back an empty section filled from an earlier note', () => {
    const result = guard({ Assessment: 'Mood lower in the week of the move.' });
    expect(result.sections['Assessment']).toBe('');
  });

  it('keeps the rest of the revision when one section is held back', () => {
    const result = guard({
      Objective: 'Engaged; eye contact throughout.',
      Plan: 'Continue fortnightly. Try the breathing app twice a day before bed.',
    });
    expect(result.sections['Objective']).toBe('Engaged; eye contact throughout.');
    expect(result.sections['Plan']).toBe(PREVIOUS.Plan);
  });

  it('lets through a restyle of this note, even where it shares words with an earlier one', () => {
    const result = guard({
      Subjective: 'John reports approximately six hours of sleep most nights; work stress is easing.',
      Plan: 'Continue sessions fortnightly.',
    });
    expect(result.carried).toEqual([]);
  });

  it('lets through what her dictation or her message says, even if an earlier note says it too', () => {
    expect(
      guard(
        { Subjective: `${PREVIOUS.Subjective} Sister Maria visited.` },
        'Add that his sister Maria visited',
      ).carried,
    ).toEqual([]);
    const dictated = guardPriorNoteContent(
      PREVIOUS,
      { ...PREVIOUS, Subjective: `${PREVIOUS.Subjective} Sleeping four hours.` },
      ['Sleeping four hours.'],
      PRIOR_NOTES,
      'Tidy it up',
    );
    expect(dictated.carried).toEqual([]);
  });

  it('stands aside when she asks to bring something over from another session', () => {
    const plan = 'Continue fortnightly. Try the breathing app twice a day before bed.';
    expect(
      guard({ Plan: plan }, 'Bring the breathing app homework over from last session').sections['Plan'],
    ).toBe(plan);
    expect(guard({ Plan: plan }, 'Add what we agreed last time to the plan').sections['Plan']).toBe(plan);
  });

  it('has nothing to judge without other notes', () => {
    const updated = { ...PREVIOUS, Assessment: 'Mood lower in the week of the move.' };
    expect(guardPriorNoteContent(PREVIOUS, updated, [], [], 'Fill it in').sections).toEqual(updated);
  });
});

describe('bringOverRequested', () => {
  it.each([
    'Bring the homework over from last session',
    'Copy the risk review from the previous note',
    'Add what we agreed last time',
    'Include the plan from the last session',
    'Put in the goals from the session before',
  ])('reads "%s" as a request', (message) => {
    expect(bringOverRequested(message)).toBe(true);
  });

  it.each([
    'Make it shorter',
    'Shorter, like last time',
    'How does this compare to last session?',
    'Add that he slept better',
    'Use a more clinical tone',
  ])('does not read "%s" as one', (message) => {
    expect(bringOverRequested(message)).toBe(false);
  });
});

describe('priorNoteNotice', () => {
  it('opens with the sentence the thread is stripped of, and says how to ask', () => {
    const notice = priorNoteNotice([{ section: 'Plan', phrase: 'Try the breathing app twice a' }]);
    expect(notice.startsWith(PRIOR_NOTE_NOTICE_OPENING)).toBe(true);
    expect(notice).toContain('Plan was kept as it was');
    expect(notice).toContain('ask for it');
  });
});
