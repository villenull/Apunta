import type { Note } from '@apunta/shared';
import { describe, expect, it } from 'vitest';

import {
  DRAFTING_PRIOR_NOTE_CHARACTER_BUDGET,
  DRAFTING_PRIOR_NOTE_COUNT,
  fitDraftingPriorNotes,
  fitNotesNewestFirst,
  notesBeforeThisOne,
  priorNoteTokens,
  toPriorNote,
} from './prior-notes.js';

/** Synthetic notes, newest first, as `listNotesForPatient` returns them. */
function note(index: number, text: string): Note {
  const day = String(28 - index).padStart(2, '0');
  return {
    id: `0198c0f0-0000-7000-8000-${String(index).padStart(12, '0')}`,
    patient_id: '0198c0f0-0000-7000-8000-00000000aaaa',
    format_id: '0198c0f0-0000-7000-8000-00000000bbbb',
    title: 'Progress note',
    status: 'draft',
    revision: 0,
    content: text,
    created_at: `2026-08-${day}T09:00:00.000Z`,
    updated_at: `2026-08-${day}T09:00:00.000Z`,
    published_at: null,
  };
}

describe('fitNotesNewestFirst', () => {
  const small = (index: number): Note => note(index, `Subjective: Session ${String(index)}. Slept well.`);
  const cost = priorNoteTokens(toPriorNote(small(0)));

  it('takes every note when they all fit', () => {
    const fitted = fitNotesNewestFirst([small(0), small(1), small(2)], 10_000);
    expect(fitted.notes.map((n) => n.text)).toEqual([
      'Subjective: Session 0. Slept well.',
      'Subjective: Session 1. Slept well.',
      'Subjective: Session 2. Slept well.',
    ]);
    expect(fitted.omittedIds).toEqual([]);
    expect(fitted.mostRecent).toBe(true);
    expect(fitted.notes[0]?.date).toBe('2026-08-28');
  });

  it('stops at the first note that does not fit: the newest, as a run, with no holes', () => {
    const candidates = [small(0), small(1), note(2, `Subjective: ${'long '.repeat(40)}`), small(3)];
    // Room for two small notes, not the long third — and the small fourth
    // must not jump the queue, or recent history would have a hole in it.
    const fitted = fitNotesNewestFirst(candidates, cost * 2 + 3);
    expect(fitted.notes.map((n) => n.id)).toEqual([candidates[0]?.id, candidates[1]?.id]);
    expect(fitted.omittedIds).toEqual([candidates[2]?.id, candidates[3]?.id]);
    expect(fitted.mostRecent).toBe(true);
    expect(fitted.tokens).toBe(cost * 2);
  });

  it('skips a note too long to fit even alone, and no longer calls the rest the most recent', () => {
    const huge = note(0, `Subjective: ${'A very long session. '.repeat(500)}`);
    const fitted = fitNotesNewestFirst([huge, small(1), small(2)], cost * 3);
    expect(fitted.notes.map((n) => n.text)).toEqual([
      'Subjective: Session 1. Slept well.',
      'Subjective: Session 2. Slept well.',
    ]);
    expect(fitted.omittedIds).toEqual([huge.id]);
    expect(fitted.mostRecent).toBe(false);
  });

  it('fits nothing into no room', () => {
    const fitted = fitNotesNewestFirst([small(0)], 0);
    expect(fitted.notes).toEqual([]);
    expect(fitted.omittedIds).toHaveLength(1);
  });
});
describe('notesBeforeThisOne', () => {
  const older = note(2, 'Subjective: Earlier session.');
  const current = note(1, 'Subjective: This session.');
  const later = note(0, 'Subjective: The next session, which had not happened yet.');
  const candidates = [later, current, older];

  it('takes the notes after the one being refined, newest first, and never a later one', () => {
    expect(notesBeforeThisOne(candidates, current.id).map((item) => item.id)).toEqual([older.id]);
    expect(notesBeforeThisOne(candidates, older.id)).toEqual([]);
  });

  it('drops every note that came after the one being refined', () => {
    // The failure this exists for: asked to shorten the older note, the model
    // "corrected" its Location from what the later note said.
    const earlier = notesBeforeThisOne(candidates, current.id);
    expect(earlier.map((item) => item.text)).not.toContain(later.content);
  });

  it('offers nothing for a note that is not in the list', () => {
    expect(notesBeforeThisOne(candidates, '0198c0f0-0000-7000-8000-000000000fff')).toEqual([]);
  });
});

describe('fitDraftingPriorNotes', () => {
  it('selects only published notes, newest first, up to the shared count cap', () => {
    const candidates = Array.from({ length: DRAFTING_PRIOR_NOTE_COUNT + 2 }, (_, index) => {
      const item = note(index, `Subjective: Published session ${String(index)}.`);
      return index === 1 || index === 4
        ? item
        : { ...item, status: 'published' as const, published_at: item.created_at };
    });
    const fitted = fitDraftingPriorNotes(candidates);
    expect(fitted.map((item) => item.text)).toEqual(['Subjective: Published session 0.']);
  });

  it('never crosses the character budget or cuts a note', () => {
    const first = {
      ...note(0, 'Subjective: First.'),
      status: 'published' as const,
      published_at: note(0, '').created_at,
    };
    const second = {
      ...note(1, 'Subjective: '.concat('x'.repeat(DRAFTING_PRIOR_NOTE_CHARACTER_BUDGET))),
      status: 'published' as const,
      published_at: note(1, '').created_at,
    };
    expect(fitDraftingPriorNotes([first, second])).toEqual([toPriorNote(first)]);
  });
});
