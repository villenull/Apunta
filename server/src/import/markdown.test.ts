import { describe, expect, it } from 'vitest';

import { plainFromMarkdown } from './markdown.js';

/** Sample content is the prototype's practice (John Smith); nothing real. */
describe('plainFromMarkdown', () => {
  it('turns a Claude-style note into plain text with bold labels as Label: lines', () => {
    const note = [
      '# Progress note',
      '',
      '**Location:** Online',
      '**Presentation/MSE:** Alert and *engaged*; mood "better".',
      '',
      '## Risk review',
      'None.',
      '',
      '---',
      '',
      '**Plan**',
      '- Continue weekly sessions',
      '* Introduce grounding exercises',
      '+ Review sleep log',
    ].join('\n');

    expect(plainFromMarkdown(note)).toBe(
      [
        'Progress note:',
        '',
        'Location: Online',
        'Presentation/MSE: Alert and engaged; mood "better".',
        '',
        'Risk review:',
        'None.',
        '',
        'Plan:',
        '- Continue weekly sessions',
        '- Introduce grounding exercises',
        '- Review sleep log',
      ].join('\n'),
    );
  });

  it('handles both bold spellings, and a colon inside or outside the bold', () => {
    expect(plainFromMarkdown('**Location:** Online')).toBe('Location: Online');
    expect(plainFromMarkdown('**Location**: Online')).toBe('Location: Online');
    expect(plainFromMarkdown('__Location:__ Online')).toBe('Location: Online');
    expect(plainFromMarkdown('**Risk review:**')).toBe('Risk review:');
    expect(plainFromMarkdown('***Very*** important')).toBe('Very important');
  });

  it('leaves asterisks and underscores that are not Markdown alone', () => {
    expect(plainFromMarkdown('Scored 2*3*4 on the scale.')).toBe('Scored 2*3*4 on the scale.');
    expect(plainFromMarkdown('a * b * c')).toBe('a * b * c');
    expect(plainFromMarkdown('Saved as sleep_log_v2.txt and snake_case_name.')).toBe(
      'Saved as sleep_log_v2.txt and snake_case_name.',
    );
    expect(plainFromMarkdown('See my__dunder__name')).toBe('See my__dunder__name');
    expect(plainFromMarkdown('PHQ-9 = 12; GAD-7 > 10')).toBe('PHQ-9 = 12; GAD-7 > 10');
    expect(plainFromMarkdown('Unbalanced **bold stays')).toBe('Unbalanced **bold stays');
  });

  it('strips italics written either way', () => {
    expect(plainFromMarkdown('He felt *much* calmer and _slept_ well.')).toBe(
      'He felt much calmer and slept well.',
    );
    expect(plainFromMarkdown('*Whole line in italics.*')).toBe('Whole line in italics.');
  });

  it('keeps backslash-escaped characters literally', () => {
    expect(plainFromMarkdown('Rated 5\\*, file\\_name')).toBe('Rated 5*, file_name');
  });

  it('strips backticks and keeps code verbatim, Markdown inside it included', () => {
    expect(plainFromMarkdown('Use `**not bold**` here')).toBe('Use **not bold** here');
    expect(plainFromMarkdown('```\n**kept** as is\n# not a heading\n```')).toBe(
      '**kept** as is\n# not a heading',
    );
  });

  it('keeps a link’s text and drops its address', () => {
    expect(plainFromMarkdown('See [the sleep hygiene sheet](https://example.invalid/sheet).')).toBe(
      'See the sleep hygiene sheet.',
    );
    expect(plainFromMarkdown('![diagram](chart.png)')).toBe('diagram');
    expect(plainFromMarkdown('A bare https://example.invalid/a_b_c link')).toBe(
      'A bare https://example.invalid/a_b_c link',
    );
  });

  it('keeps numbered lists as they are, and nested bullets indented', () => {
    expect(plainFromMarkdown('1. First\n2. **Second**\n  * nested')).toBe('1. First\n2. Second\n  - nested');
  });

  it('drops rules and table separators, and collapses the gaps they leave', () => {
    expect(plainFromMarkdown('Above\n\n***\n\n\n___\nBelow')).toBe('Above\n\nBelow');
    expect(plainFromMarkdown('| a | b |\n|---|:---:|\n| 1 | 2 |')).toBe('| a | b |\n| 1 | 2 |');
  });

  it('does not turn a heading that reads as a sentence into a label', () => {
    expect(plainFromMarkdown('## Session with John Smith, 12 August')).toBe(
      'Session with John Smith, 12 August',
    );
    expect(plainFromMarkdown('### 1. Presenting problem')).toBe('1. Presenting problem');
    expect(plainFromMarkdown('#hashtag is not a heading')).toBe('#hashtag is not a heading');
  });

  it('strips blockquote markers and trailing spaces, and normalises line endings', () => {
    expect(plainFromMarkdown('> He said it was **better**.  \r\nNext')).toBe('He said it was better.\nNext');
  });

  it('leaves plain text exactly as it was', () => {
    const plain = 'Subjective: Patient reports improved sleep.\n\nPlan: Continue weekly sessions.';
    expect(plainFromMarkdown(plain)).toBe(plain);
  });
});
