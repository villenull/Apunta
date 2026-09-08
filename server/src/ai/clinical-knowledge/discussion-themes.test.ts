import { describe, expect, it } from 'vitest';

import {
  DISCUSSION_FALLBACK_TITLE,
  groupDiscussionThemes,
  renderDiscussionThemes,
  splitDiscussionRawNotes,
} from './discussion-themes.js';

describe('groupDiscussionThemes', () => {
  it('groups repeated broad topics while preserving exact facts and relative order', () => {
    const facts = [
      'Patient described difficulty falling asleep.',
      'Patient reported worry before work meetings.',
      'Patient said sleep was more consistent this week.',
      'Patient discussed a demanding work environment.',
      'Patient reported waking once overnight.',
      'Patient discussed support from a friend.',
    ];

    expect(groupDiscussionThemes(facts)).toEqual([
      {
        title: 'Daily routines and functioning',
        facts: [
          'Patient described difficulty falling asleep.',
          'Patient said sleep was more consistent this week.',
          'Patient reported waking once overnight.',
        ],
      },
      {
        title: 'Context and relationships',
        facts: [
          'Patient discussed a demanding work environment.',
          'Patient discussed support from a friend.',
        ],
      },
      {
        title: DISCUSSION_FALLBACK_TITLE,
        facts: ['Patient reported worry before work meetings.'],
      },
    ]);
  });

  it('places unpaired, ambiguous, and unrelated facts in a neutral fallback', () => {
    const facts = [
      'Patient reported worry.',
      'Patient mentioned a book borrowed from the library.',
      'Patient discussed a goal for next week.',
      'Patient felt worried about a new plan.',
    ];

    const result = groupDiscussionThemes(facts);

    expect(result).toEqual([
      {
        title: DISCUSSION_FALLBACK_TITLE,
        facts,
      },
    ]);
  });

  it('does not add clinical interpretation, causality, severity, risk, or facts', () => {
    const facts = [
      'Patient denied suicidal thoughts.',
      'Patient wondered whether the change was related to a move.',
      'Patient discussed a diagnosis mentioned by another clinician.',
    ];

    const result = groupDiscussionThemes(facts);
    expect(result).toEqual([{ title: DISCUSSION_FALLBACK_TITLE, facts }]);
    expect(renderDiscussionThemes(facts)).toBe(`### ${DISCUSSION_FALLBACK_TITLE}\n${facts.join('\n')}`);
  });

  it('retains duplicate source facts as separate occurrences', () => {
    const facts = ['Patient discussed sleep.', 'Patient discussed sleep.', 'Patient discussed school.'];

    expect(groupDiscussionThemes(facts)).toEqual([
      {
        title: 'Daily routines and functioning',
        facts: ['Patient discussed sleep.', 'Patient discussed sleep.'],
      },
      { title: DISCUSSION_FALLBACK_TITLE, facts: ['Patient discussed school.'] },
    ]);
  });

  it('supports raw notes by splitting sentence and line boundaries', () => {
    const rawNotes =
      'Patient discussed sleep at home. Patient reported waking early.\nPatient mentioned a new book.';

    expect(splitDiscussionRawNotes(rawNotes)).toEqual([
      'Patient discussed sleep at home.',
      'Patient reported waking early.',
      'Patient mentioned a new book.',
    ]);
    expect(groupDiscussionThemes(rawNotes)).toEqual([
      {
        title: 'Daily routines and functioning',
        facts: ['Patient discussed sleep at home.', 'Patient reported waking early.'],
      },
      { title: DISCUSSION_FALLBACK_TITLE, facts: ['Patient mentioned a new book.'] },
    ]);
  });

  it('returns an empty Discussion result for empty input', () => {
    expect(groupDiscussionThemes([])).toEqual([]);
    expect(groupDiscussionThemes('')).toEqual([]);
    expect(renderDiscussionThemes([])).toBe('');
  });
});
