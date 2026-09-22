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

  it('leaves unpaired, ambiguous, and unrelated facts as untitled prose', () => {
    const facts = [
      'Patient reported worry.',
      'Patient mentioned a book borrowed from the library.',
      'Patient discussed a goal for next week.',
      'Patient felt worried about a new plan.',
    ];

    const result = groupDiscussionThemes(facts);

    expect(result).toEqual([{ title: null, facts }]);
    expect(renderDiscussionThemes(facts)).toBe(facts.join(' '));
  });

  it('does not add clinical interpretation, causality, severity, risk, or facts', () => {
    const facts = [
      'Patient denied suicidal thoughts.',
      'Patient wondered whether the change was related to a move.',
      'Patient discussed a diagnosis mentioned by another clinician.',
    ];

    const result = groupDiscussionThemes(facts);
    expect(result).toEqual([{ title: null, facts }]);
    expect(renderDiscussionThemes(facts)).not.toContain('#');
  });

  it('retains duplicate source facts as separate occurrences', () => {
    const facts = ['Patient discussed sleep.', 'Patient discussed sleep.', 'Patient discussed school.'];

    expect(groupDiscussionThemes(facts)).toEqual([{ title: null, facts }]);
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
        title: null,
        facts: [
          'Patient discussed sleep at home.',
          'Patient reported waking early.',
          'Patient mentioned a new book.',
        ],
      },
    ]);
  });

  it('gives a single-theme Discussion no subheading, catch-all or otherwise', () => {
    const prose =
      'Dana came to session reporting difficulty falling asleep. Dana said she has been waking at 4 a.m.\nDana mentioned a library book.';

    expect(renderDiscussionThemes(prose)).toBe(prose);
    expect(renderDiscussionThemes(prose)).not.toContain(DISCUSSION_FALLBACK_TITLE);
  });

  it('keeps several subtopics as subheadings, with no catch-all when every fact belongs to one', () => {
    const prose =
      'Dana described difficulty falling asleep. Dana discussed conflict with her partner. Dana reported waking once overnight. Dana discussed support from a friend.';

    expect(renderDiscussionThemes(prose)).toBe(
      [
        '### Daily routines and functioning',
        'Dana described difficulty falling asleep.',
        'Dana reported waking once overnight.',
        '',
        '### Context and relationships',
        'Dana discussed conflict with her partner.',
        'Dana discussed support from a friend.',
      ].join('\n'),
    );
  });

  it('leaves a Discussion that already has subtopic headings as it is', () => {
    const grouped = renderDiscussionThemes([
      'Patient described difficulty falling asleep.',
      'Patient discussed a demanding work environment.',
      'Patient said sleep was more consistent this week.',
      'Patient discussed support from a friend.',
      'Patient mentioned a library book.',
    ]);
    expect(grouped).toContain(`### ${DISCUSSION_FALLBACK_TITLE}`);

    // The refine chat runs the formatter again on its own output.
    expect(renderDiscussionThemes(grouped)).toBe(grouped);
    const edited = '### Sleep\nPatient described difficulty falling asleep.';
    expect(renderDiscussionThemes(edited)).toBe(edited);
  });

  it('drops a catch-all heading that stands alone and regroups what is under it', () => {
    const drafted = `### ${DISCUSSION_FALLBACK_TITLE}\nPatient discussed sleep at home.\nPatient reported waking early.`;

    expect(renderDiscussionThemes(drafted)).toBe(
      'Patient discussed sleep at home.\nPatient reported waking early.',
    );
  });

  it('returns an empty Discussion result for empty input', () => {
    expect(groupDiscussionThemes([])).toEqual([]);
    expect(groupDiscussionThemes('')).toEqual([]);
    expect(renderDiscussionThemes([])).toBe('');
  });
});
