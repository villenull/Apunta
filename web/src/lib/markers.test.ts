import { describe, expect, it } from 'vitest';

import { emptySections, markNoteText } from './markers.js';

const SECTIONS = ['Subjective', 'Objective', 'Assessment', 'Plan'];

/** The backdrop and the textarea must lay out identically, character for character. */
function rejoin(text: string): string {
  return markNoteText(text, SECTIONS)
    .map((segment) => segment.text)
    .join('');
}

describe('markNoteText', () => {
  it('reproduces the note exactly, whatever it marks', () => {
    const notes = [
      'Subjective: Improved sleep.\n\nObjective:\n\nAssessment: Progressing.\n\nPlan: Weekly.',
      'Subjective: Possibly propranolol [unclear in dictation]; she was unsure.',
      '',
      '\n\n\n',
      'Nothing that looks like a note at all.',
    ];
    for (const note of notes) expect(rejoin(note)).toBe(note);
  });

  it('marks the header of a section with nothing under it', () => {
    const segments = markNoteText('Subjective: Slept well.\n\nObjective:\n\nPlan: Weekly.', SECTIONS);

    const marked = segments.filter((segment) => segment.kind === 'empty-section');
    // Assessment is absent from the text entirely, so only Objective has a
    // header on screen to mark.
    expect(marked.map((segment) => segment.text)).toEqual(['Objective:']);
  });

  it('leaves a section header alone when it has a body', () => {
    const segments = markNoteText('Objective: Alert and engaged.', SECTIONS);
    expect(segments.every((segment) => segment.kind === 'plain')).toBe(true);
  });

  it('marks every unclear-dictation flag, keeping the text’s own casing', () => {
    const segments = markNoteText(
      'Subjective: Possibly propranolol [unclear in dictation], and [Unclear In Dictation] again.',
      SECTIONS,
    );

    expect(segments.filter((segment) => segment.kind === 'unclear').map((segment) => segment.text)).toEqual([
      '[unclear in dictation]',
      '[Unclear In Dictation]',
    ]);
  });

  it('merges adjacent plain runs so the backdrop is not one span per line', () => {
    const segments = markNoteText('Subjective: One.\nStill one.\nAnd one.', SECTIONS);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.kind).toBe('plain');
  });

  it('marks nothing when the format has no sections yet', () => {
    const text = 'Subjective:\n\nPlan:';
    expect(markNoteText(text, []).every((segment) => segment.kind === 'plain')).toBe(true);
  });
});

describe('emptySections', () => {
  it('names the blanks in format order', () => {
    const text = 'Subjective: Slept well.\n\nObjective:\n\nAssessment:\n\nPlan: Weekly.';
    expect(emptySections(text, SECTIONS)).toEqual(['Objective', 'Assessment']);
  });

  it('counts a section the therapist deleted outright as empty', () => {
    expect(emptySections('Subjective: Slept well.', SECTIONS)).toEqual(['Objective', 'Assessment', 'Plan']);
  });

  it('finds nothing to report on a complete note', () => {
    const text = SECTIONS.map((name) => `${name}: Something.`).join('\n\n');
    expect(emptySections(text, SECTIONS)).toEqual([]);
  });
});
