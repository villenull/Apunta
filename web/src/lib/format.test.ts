import { describe, expect, it } from 'vitest';

import {
  firstName,
  formatDayGap,
  formatRelativeTime,
  formatEditedDate,
  formatInstantAsDate,
  formatNoteDate,
  formatPlanDate,
  formatShortDate,
  initials,
  noteCountLabel,
  notePreview,
  wasEdited,
} from './format.js';

describe('initials', () => {
  it('takes the first two words, as the prototype avatars do', () => {
    expect(initials('John Smith')).toBe('JS');
    expect(initials('Maria Ruiz')).toBe('MR');
    expect(initials('  ana   torres  ')).toBe('AT');
    expect(initials('Prince')).toBe('P');
    expect(initials('')).toBe('');
  });
});

describe('firstName', () => {
  it('is what the notes column header greets', () => {
    expect(firstName('John Smith')).toBe('John');
    expect(firstName('Ana')).toBe('Ana');
  });
});

describe('note dates', () => {
  const now = new Date('2026-08-22T18:00:00.000Z');

  it('spells out an older date and says Today for this one', () => {
    expect(formatNoteDate('2026-08-08T09:00:00.000Z', now)).toBe('Aug 8, 2026');
    expect(formatNoteDate('2026-08-22T09:00:00.000Z', now)).toBe('Today');
  });

  it('uses the lower-case "today" in the edited line', () => {
    expect(formatEditedDate('2026-08-22T09:00:00.000Z', now)).toBe('today');
    expect(formatEditedDate('2026-07-24T09:00:00.000Z', now)).toBe('Jul 24, 2026');
  });

  it('treats a note as edited only once it changed after creation', () => {
    expect(wasEdited('2026-08-22T09:00:00.000Z', '2026-08-22T09:00:00.000Z')).toBe(false);
    expect(wasEdited('2026-08-22T09:00:00.000Z', '2026-08-22T09:05:00.000Z')).toBe(true);
  });
});

describe('notePreview', () => {
  it('flattens the first 60 characters onto one line', () => {
    const content = 'Subjective: Patient reports improved sleep since last session.\n\nPlan: Continue.';
    expect(notePreview(content)).toBe('Subjective: Patient reports improved sleep since last sessio…');
  });

  it('shows nothing at all for an empty draft', () => {
    expect(notePreview('')).toBe('');
    expect(notePreview('   \n ')).toBe('');
  });
});

describe('noteCountLabel', () => {
  it('pluralizes like the prototype', () => {
    expect(noteCountLabel(0)).toBe('0 notes');
    expect(noteCountLabel(1)).toBe('1 note');
    expect(noteCountLabel(3)).toBe('3 notes');
  });
});

describe('formatShortDate', () => {
  const now = new Date('2026-09-26T12:00:00.000Z');

  it('drops the year for this year and keeps it for anything older', () => {
    expect(formatShortDate('2026-09-07T09:00:00.000Z', now)).toBe('Sep 7');
    expect(formatShortDate('2025-09-07T09:00:00.000Z', now)).toBe('Sep 7, 2025');
  });

  it('says an em dash for a patient with no note, and passes junk through', () => {
    expect(formatShortDate(null, now)).toBe('—');
    expect(formatShortDate('not a date', now)).toBe('not a date');
  });
});

describe('formatPlanDate', () => {
  it('renders a calendar date as the day it says, in any timezone', () => {
    // `new Date('2026-08-12')` is UTC midnight, which is 11 August west of
    // Greenwich. A review date that moves by a day is a review date that is
    // wrong on the document a payer reads.
    expect(formatPlanDate('2026-08-12')).toBe('Aug 12, 2026');
  });

  it('passes anything that is not a calendar date straight through', () => {
    expect(formatPlanDate('')).toBe('');
    expect(formatPlanDate('soon')).toBe('soon');
  });
});

describe('formatDayGap', () => {
  it('reads as a person would say it', () => {
    expect(formatDayGap(0)).toBe('today');
    expect(formatDayGap(1)).toBe('in 1 day');
    expect(formatDayGap(12)).toBe('in 12 days');
    expect(formatDayGap(-11)).toBe('11 days ago');
  });
});

describe('formatInstantAsDate', () => {
  it('reads an instant as the local day it fell on, with no "Today"', () => {
    expect(formatInstantAsDate('2026-08-12T15:00:00.000Z')).toBe('Aug 12, 2026');
    expect(formatInstantAsDate('nonsense')).toBe('nonsense');
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-09-21T12:00:00.000Z');
  it('reads as a person would say it', () => {
    expect(formatRelativeTime('2026-09-21T11:59:40.000Z', now)).toBe('just now');
    expect(formatRelativeTime('2026-09-21T11:59:00.000Z', now)).toBe('1 minute ago');
    expect(formatRelativeTime('2026-09-21T09:00:00.000Z', now)).toBe('3 hours ago');
    expect(formatRelativeTime('2026-09-20T09:00:00.000Z', now)).toBe('yesterday');
    expect(formatRelativeTime('2026-09-14T12:00:00.000Z', now)).toBe('7 days ago');
  });
});
