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

  it('shows a section header with a body as a label, not as empty', () => {
    expect(markNoteText('Objective: Alert and engaged.', SECTIONS)).toEqual([
      { kind: 'label', text: 'Objective:' },
      { kind: 'plain', text: ' Alert and engaged.' },
    ]);
  });

  it('marks a short leading label on any line, after a bullet too', () => {
    const segments = markNoteText(
      'Location: Online\nPresentation/MSE: Alert\n- Risk review: None\n  Mood (self-report): 6/10',
      SECTIONS,
    );
    expect(segments.filter((segment) => segment.kind === 'label').map((segment) => segment.text)).toEqual([
      'Location:',
      'Presentation/MSE:',
      'Risk review:',
      'Mood (self-report):',
    ]);
  });

  it('does not mark times, links, sentences or long runs as labels', () => {
    const lines = [
      '10:30 session start',
      'https://example.invalid/sheet',
      'He said it plainly. Then: nothing more.',
      'She described the week, which was hard: poor sleep.',
      'A very long run of words that is far too long to be a label: text',
      'Ratio:3',
    ];
    for (const line of lines) {
      expect(markNoteText(line, SECTIONS).some((segment) => segment.kind === 'label')).toBe(false);
    }
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
    const segments = markNoteText('One.\nStill one.\nAnd one.', SECTIONS);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.kind).toBe('plain');
  });

  it('marks nothing when the format has no sections yet', () => {
    const text = 'Subjective:\n\nPlan:';
    expect(markNoteText(text, []).some((segment) => segment.kind === 'empty-section')).toBe(false);
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
