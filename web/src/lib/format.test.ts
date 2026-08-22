import { describe, expect, it } from 'vitest';

import {
  firstName,
  formatEditedDate,
  formatNoteDate,
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
