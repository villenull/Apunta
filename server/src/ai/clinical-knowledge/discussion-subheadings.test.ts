import { describe, expect, it } from 'vitest';

import { headingIsGrounded, tidyDiscussionSubheadings } from './discussion-subheadings.js';

const HERS = [
  'Location',
  'Client presentation',
  'Risk review',
  'Discussion',
  'Intervention',
  'Out of session actions',
  'Note for next session',
];

const SOURCE =
  "John Smith, online. Sleep has been better, he is waking once a night. He also talked about the argument with his partner on Sunday, and about moving house next month. John's sister is visiting.";

function tidy(body: string, source = SOURCE) {
  return tidyDiscussionSubheadings(body, { source, sectionNames: HERS });
}

describe('tidyDiscussionSubheadings', () => {
  it('returns a Discussion with no subheadings byte for byte', () => {
    const prose = 'John reports sleeping better.\n\nJohn described an argument with his partner.';
    expect(tidy(prose)).toEqual({ body: prose, headings: [], outcome: 'none' });
  });
  it('leaves a two-topic prose response alone when the model supplied no labels', () => {
    const body =
      'John reports waking once a night. He also described an argument with his partner on Sunday.';
    expect(tidy(body)).toEqual({ body, headings: [], outcome: 'none' });
  });

  it('keeps two topics under her lowercase subheadings as written', () => {
    const body = [
      'sleep:',
      'John reports waking once a night.',
      '',
      'argument with his partner:',
      'John described an argument with his partner on Sunday.',
    ].join('\n');
    expect(tidy(body)).toEqual({ body, headings: ['sleep', 'argument with his partner'], outcome: 'kept' });
  });

  it('rewrites markdown, bold and title-case headings into her form', () => {
    const body = [
      '### Sleep',
      'John reports waking once a night.',
      '',
      '**Moving House:** John is moving house next month.',
      '',
      '__The Argument__',
      'John described an argument with his partner.',
    ].join('\n');
    const result = tidy(body);
    expect(result.outcome).toBe('kept');
    expect(result.body).toBe(
      [
        'sleep:',
        'John reports waking once a night.',
        '',
        'moving house:',
        'John is moving house next month.',
        '',
        'the argument:',
        'John described an argument with his partner.',
      ].join('\n'),
    );
  });
  it('normalises plain inline labels onto their own lines', () => {
    const body = [
      'sleep: John reports waking once a night.',
      '',
      'argument with his partner: John described an argument with his partner on Sunday.',
    ].join('\n');
    expect(tidy(body)).toEqual({
      body: [
        'sleep:',
        'John reports waking once a night.',
        '',
        'argument with his partner:',
        'John described an argument with his partner on Sunday.',
      ].join('\n'),
      headings: ['sleep', 'argument with his partner'],
      outcome: 'kept',
    });
  });

  it('keeps an ordinary sentence with a colon intact', () => {
    const body = 'John reports: sleep is better.\n\nJohn is moving next month.';
    expect(tidy(body)).toEqual({ body, headings: [], outcome: 'none' });
  });

  it('keeps inline prose after a Markdown heading instead of dropping the fact', () => {
    const body = [
      '### Sleep: John said sleep is better.',
      '',
      '### Moving',
      'John is moving house next month.',
    ].join('\n');
    expect(tidy(body)).toEqual({
      body: ['sleep:', 'John said sleep is better.', '', 'moving:', 'John is moving house next month.'].join(
        '\n',
      ),
      headings: ['sleep', 'moving'],
      outcome: 'kept',
    });
  });

  it('rejects a heading with no topic word', () => {
    const body = ['### The', 'John reports waking once a night.', '', 'sleep:', 'John sleeps.'].join('\n');
    expect(tidy(body)).toEqual({
      body: 'John reports waking once a night. John sleeps.',
      headings: [],
      outcome: 'ungrounded',
    });
  });

  it('removes an unsupported inline label without dropping its prose', () => {
    const body = [
      'sleep: John reports waking once a night.',
      '',
      'unicorn: John described an argument with his partner.',
    ].join('\n');
    expect(tidy(body)).toEqual({
      body: 'John reports waking once a night. John described an argument with his partner.',
      headings: [],
      outcome: 'ungrounded',
    });
  });

  it('removes a lone inline label without dropping its prose', () => {
    const body = 'sleep: John reports waking once a night.';
    expect(tidy(body)).toEqual({
      body: 'John reports waking once a night.',
      headings: [],
      outcome: 'single',
    });
  });

  it('does not keep inflectional duplicates as two topics', () => {
    const body = ['sleep: John reports waking once a night.', '', 'sleeping: John sleeps better.'].join('\n');
    expect(tidy(body).outcome).toBe('invalid');
    expect(tidy(body).body).toBe('John reports waking once a night. John sleeps better.');
  });

  it('keeps a name capitalised, and lowercases a word the source capitalises only to start a sentence', () => {
    const body = [
      "John's Sister:",
      "John's sister is visiting.",
      '',
      'Sleep:',
      'John reports waking once a night.',
    ].join('\n');
    expect(tidy(body).headings).toEqual(["John's sister", 'sleep']);
  });

  it('drops a lone subheading: one topic is one block of prose', () => {
    const body = 'sleep:\nJohn reports waking once a night.\nJohn says it is better than last month.';
    expect(tidy(body)).toEqual({
      body: 'John reports waking once a night.\nJohn says it is better than last month.',
      headings: [],
      outcome: 'single',
    });
  });

  it('runs single paragraphs together when the headings go', () => {
    const body = 'sleep:\nJohn reports waking once a night.\n\nwork routines:\nJohn has kept to his routine.';
    // "work" and "routines" are not in the source.
    expect(tidy(body)).toEqual({
      body: 'John reports waking once a night. John has kept to his routine.',
      headings: [],
      outcome: 'ungrounded',
    });
  });

  it('turns the retired grouper’s generic categories back into prose', () => {
    const body = [
      '### Daily routines and functioning',
      'John reports waking once a night.',
      '',
      '### Context and relationships',
      'John described an argument with his partner.',
    ].join('\n');
    expect(tidy(body).outcome).toBe('ungrounded');
    expect(tidy(body).body).not.toMatch(/routines|relationships|#/i);
  });

  it('refuses a heading that wears one of the format’s section names', () => {
    const body = 'sleep:\nJohn reports waking once a night.\n\nintervention:\nJohn described the argument.';
    // A line reading "intervention:" would split the note on the way back in.
    expect(tidy(body, `${SOURCE} intervention`).outcome).toBe('invalid');
  });

  it('refuses a heading that is a sentence rather than a few words', () => {
    // Both read as headings — one bold, one short and label-like — so the
    // checks refuse them rather than recognition never seeing them.
    const long =
      '**Sleep and the argument with his partner on Sunday**\nJohn described both.\n\nsleep:\nJohn sleeps.';
    expect(tidy(long).outcome).toBe('invalid');
    const punctuated = '### Sleep, partner\nJohn described both.\n\nsleep:\nJohn sleeps.';
    expect(tidy(punctuated).outcome).toBe('invalid');
  });

  /**
   * A `#` in front of a sentence is a sentence. Reading it as a heading and
   * then rejecting the title would delete the line, which is the one thing the
   * fallback must never do.
   */
  it('reads a Markdown sentence as prose, so it survives byte for byte', () => {
    const body = [
      '### John said he slept better last night.',
      'He also talked about the argument with his partner on Sunday.',
    ].join('\n');
    expect(tidy(body)).toEqual({ body, headings: [], outcome: 'none' });
  });

  it('leaves an overlong Markdown line as prose, not a heading', () => {
    const body = ['### Sleep and the argument with his partner on Sunday', 'John described both.'].join('\n');
    expect(tidy(body)).toEqual({ body, headings: [], outcome: 'none' });
  });

  it('keeps a Markdown sentence that sits between two real subheadings', () => {
    const sentence = '### John described the argument with his partner on Sunday.';
    const body = [
      '### Sleep',
      'John reports waking once a night.',
      '',
      sentence,
      'He was upset about it.',
      '',
      '### Moving',
      'John is moving house next month.',
    ].join('\n');
    const result = tidy(body);
    expect(result.outcome).toBe('kept');
    expect(result.headings).toEqual(['sleep', 'moving']);
    expect(result.body).toContain(sentence);
  });

  it('keeps a Markdown sentence when the headings around it are dropped', () => {
    const sentence = '### John said he slept better last night.';
    const body = [
      sentence,
      'He also talked about the argument with his partner on Sunday.',
      '',
      '### Work stress',
      'John mentioned work.',
    ].join('\n');
    // The heading goes — "work" is not in the source — and the sentence stays.
    const result = tidy(body);
    expect(result.outcome).toBe('ungrounded');
    expect(result.headings).toEqual([]);
    expect(result.body).toContain(sentence);
    expect(result.body).not.toContain('### Work stress');
  });

  it('keeps an opening line of prose above the first subheading', () => {
    const body = [
      'John came to session wanting to talk about two things.',
      'sleep:',
      'John reports waking once a night.',
      'moving:',
      'John is moving house next month.',
    ].join('\n');
    expect(tidy(body).body).toBe(
      [
        'John came to session wanting to talk about two things.',
        '',
        'sleep:',
        'John reports waking once a night.',
        '',
        'moving:',
        'John is moving house next month.',
      ].join('\n'),
    );
  });

  it('drops a heading with nothing under it before counting topics', () => {
    const body = 'sleep:\nJohn reports waking once a night.\n\nmoving:\n';
    expect(tidy(body)).toEqual({
      body: 'John reports waking once a night.',
      headings: [],
      outcome: 'single',
    });
  });

  it('leaves prose that merely ends in a colon alone', () => {
    const list = 'John named two worries:\n- sleep\n- moving house';
    expect(tidy(list)).toEqual({ body: list, headings: [], outcome: 'none' });
    const inline = 'John reports: sleep is better.\n\nJohn is moving next month.';
    expect(tidy(inline)).toEqual({ body: inline, headings: [], outcome: 'none' });
  });

  it('is idempotent, so the refine chat can apply it again', () => {
    for (const body of [
      '### Sleep\nJohn sleeps.\n\n### Moving\nJohn moves.',
      'sleep:\nJohn sleeps.',
      '### Daily routines\nJohn sleeps.\n\n### Moving\nJohn moves.',
      '### John said he slept better last night.\nHe also talked about the argument.',
    ]) {
      const once = tidy(body).body;
      expect(tidy(once).body).toBe(once);
    }
  });
});

describe('headingIsGrounded', () => {
  it('finds a heading word in the source through inflection', () => {
    expect(headingIsGrounded('moving', 'She will move next month.')).toBe(true);
    expect(headingIsGrounded('arguments at home', 'They argued at home.')).toBe(true);
    expect(headingIsGrounded('sleeping', 'Sleep is better.')).toBe(true);
  });

  it('ignores words that name nothing, and rejects words she never said', () => {
    expect(headingIsGrounded('the move and her sister', 'Her sister is helping with the move.')).toBe(true);
    expect(headingIsGrounded('work', 'She is worried about the move.')).toBe(false);
    expect(headingIsGrounded('family relationships', 'Her sister is helping with the move.')).toBe(false);
  });
});
