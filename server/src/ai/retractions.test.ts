import { describe, expect, it } from 'vitest';

import { applyRetractions, hasRetraction, retractionNotice } from './retractions.js';

/**
 * The transcripts here are shaped after live dictations (fabricated content,
 * prototype names): the retracted number restated as history a breath later,
 * a plan option withdrawn, three markers in a row, and — the part that
 * matters — a model that also lists things she never took back.
 */
const SLEEP =
  "Okay. John Smith, Thursday. He says he's sleeping about four hours at night. Scratch that. It's more like six hours now. Four was back in February. He did the thought records five out of seven days. I asked about risk directly. No thoughts of harming himself. He was clear on that. Plan, we talked about dropping to every other week. Actually, no. Hold on. He'd rather stay weekly until after the November surgery. Revisit in a month.";

describe('hasRetraction', () => {
  it('knows the spoken markers and nothing else', () => {
    expect(hasRetraction('four hours, scratch that, six')).toBe(true);
    expect(hasRetraction('we talked about it, actually no, hold on')).toBe(true);
    expect(hasRetraction('that was last session')).toBe(true);
    expect(hasRetraction('he actually got no sleep')).toBe(false);
    expect(hasRetraction('')).toBe(false);
  });
});

describe('applyRetractions', () => {
  it('cuts the quote that ends at the marker, and the marker, and nothing the model merely listed', () => {
    const { text, applied } = applyRetractions(SLEEP, [
      { withdrawn: 'sleeping about four hours at night', replacement: "It's more like six hours now" },
      { withdrawn: 'Four was back in February', replacement: '' },
      { withdrawn: 'five out of seven days', replacement: '' },
      { withdrawn: 'No thoughts of harming himself', replacement: '' },
      { withdrawn: 'He was clear on that', replacement: '' },
      {
        withdrawn: 'we talked about dropping to every other week',
        replacement: 'stay weekly until after the November surgery',
      },
    ]);
    expect(text).toBe(
      "Okay. John Smith, Thursday. It's more like six hours now. Four was back in February. He did the thought records five out of seven days. I asked about risk directly. No thoughts of harming himself. He was clear on that. Hold on. He'd rather stay weekly until after the November surgery. Revisit in a month.",
    );
    expect(applied).toEqual([
      { withdrawn: 'sleeping about four hours at night', replacement: "It's more like six hours now" },
      {
        withdrawn: 'we talked about dropping to every other week',
        replacement: 'stay weekly until after the November surgery',
      },
    ]);
  });
  it('recognizes the Whisper inflection in a spoken correction', () => {
    const transcript =
      'The client said sleep was better, but she woke at four hours actually scratched that. Six hours, not four. Home she denied suicidal thoughts.';
    expect(hasRetraction(transcript)).toBe(true);

    const { text, applied } = applyRetractions(transcript, [
      { withdrawn: 'woke at four hours', replacement: 'Six hours' },
    ]);
    expect(applied).toEqual([{ withdrawn: 'woke at four hours', replacement: 'Six hours' }]);
    expect(text).toBe(
      'The client said sleep was better, but she actually. Six hours, not four. Home she denied suicidal thoughts.',
    );
  });

  it('never adds a word: every character of the output is in the input, in order', () => {
    const { text } = applyRetractions(SLEEP, [
      { withdrawn: 'sleeping about four hours at night', replacement: 'six hours' },
    ]);
    const source = SLEEP.toLowerCase();
    let cursor = 0;
    for (const char of text.toLowerCase()) {
      const at = source.indexOf(char, cursor);
      expect(at, `"${char}" after position ${String(cursor)}`).toBeGreaterThanOrEqual(0);
      cursor = at + 1;
    }
  });

  it('ignores a paraphrase — the quote has to be verbatim', () => {
    const { text, applied } = applyRetractions(SLEEP, [
      { withdrawn: 'he sleeps roughly four hours nightly', replacement: 'six hours' },
    ]);
    expect(applied).toEqual([]);
    expect(text).toBe(SLEEP);
  });

  it('ignores a quote that sits too far before the marker', () => {
    // Sixteen words is the limit; "He did the thought records" ends 29 words before "Actually, no".
    const { applied } = applyRetractions(SLEEP, [
      { withdrawn: 'He did the thought records', replacement: '' },
    ]);
    expect(applied).toEqual([]);
  });

  it('takes the nearest quote for a marker, then the shorter one', () => {
    const { applied } = applyRetractions(SLEEP, [
      { withdrawn: "He says he's sleeping about four hours at night", replacement: '' },
      { withdrawn: 'about four hours at night', replacement: '' },
      { withdrawn: 'John Smith, Thursday', replacement: '' },
    ]);
    expect(applied.map((item) => item.withdrawn)).toEqual(['about four hours at night']);
  });

  it('keeps a marker the model found nothing for, so the drafting reminder still fires', () => {
    const { text, applied } = applyRetractions(SLEEP, [
      { withdrawn: 'we talked about dropping to every other week', replacement: '' },
    ]);
    expect(applied).toHaveLength(1);
    expect(text).toContain('Scratch that');
    expect(hasRetraction(text)).toBe(true);
  });

  it('treats markers said in a row as one, and drops a two-word stub with its sentence', () => {
    const typed =
      'Dana Doe, online. She said the anniversary is hitting her hard, actually no, scratch that, that was last session. Today she was steady, talked about the new flat.';
    const { text, applied } = applyRetractions(typed, [
      { withdrawn: 'the anniversary is hitting her hard', replacement: '' },
    ]);
    expect(text).toBe('Dana Doe, online. Today she was steady, talked about the new flat.');
    expect(applied).toEqual([{ withdrawn: 'the anniversary is hitting her hard', replacement: '' }]);
  });

  it('keeps a lead-in whose sentence carries on after the cut', () => {
    const spoken =
      "He says he's sleeping four hours a night, scratch that, it's more like six. Mood is better.";
    const { text } = applyRetractions(spoken, [
      { withdrawn: 'sleeping four hours a night', replacement: "it's more like six" },
    ]);
    expect(text).toBe("He says he's, it's more like six. Mood is better.");
  });

  it('starts the next sentence cleanly when the cut opened it', () => {
    const spoken =
      'He says he is sleeping four hours a night. Scratch that, it is more like six. Mood is better.';
    const { text } = applyRetractions(spoken, [
      { withdrawn: 'He says he is sleeping four hours a night.', replacement: 'it is more like six.' },
    ]);
    expect(text).toBe('It is more like six. Mood is better.');
  });

  it('reports the replacement only when she said it, verbatim, right after the marker', () => {
    const { applied } = applyRetractions(SLEEP, [
      { withdrawn: 'sleeping about four hours at night', replacement: 'he now sleeps six hours' },
    ]);
    expect(applied[0]?.replacement).toBe('');
  });

  it('will not cut a marker quoted as if it were content', () => {
    const { text, applied } = applyRetractions(SLEEP, [
      { withdrawn: 'Actually, no.', replacement: 'Hold on.' },
    ]);
    expect(applied).toEqual([]);
    expect(text).toBe(SLEEP);
  });

  it('leaves a transcript without markers, or without corrections, untouched', () => {
    const plain = 'John slept six hours a night this week. Mood is better.';
    expect(applyRetractions(plain, [{ withdrawn: 'six hours a night', replacement: '' }]).text).toBe(plain);
    expect(applyRetractions(SLEEP, []).text).toBe(SLEEP);
  });

  it('cuts the occurrence before the marker when the same words appear twice', () => {
    const spoken =
      'Sleep is four hours. Scratch that, six hours. In February sleep is four hours was the story.';
    const { text } = applyRetractions(spoken, [
      { withdrawn: 'sleep is four hours', replacement: 'six hours' },
    ]);
    expect(text).toBe('Six hours. In February sleep is four hours was the story.');
  });
});

describe('retractionNotice', () => {
  it('lists what was left out, in her words, and what replaced it when known', () => {
    expect(
      retractionNotice([
        { withdrawn: 'four hours at night', replacement: 'six hours now' },
        { withdrawn: 'every other week', replacement: '' },
      ]),
    ).toBe(
      'Apunta applied the corrections you made as you spoke, before drafting: left out “four hours at night” in favor of “six hours now”; and left out “every other week”.',
    );
    expect(retractionNotice([{ withdrawn: 'the old plan', replacement: '' }])).toBe(
      'Apunta applied the corrections you made as you spoke, before drafting: left out “the old plan”.',
    );
  });

  /**
   * The notice is appended to the first-pass opening in the note's own chat
   * (`routes/draft.ts`), so it is persisted text in the note's language — the
   * same rule the lock notices follow. English before: it used to be a raw
   * string, which put "…left out “four hours”." under a Spanish opening.
   */
  it('renders the whole notice in the note’s language, list and all', () => {
    expect(
      retractionNotice([{ withdrawn: 'four hours at night', replacement: 'six hours now' }], 'es-MX'),
    ).toBe(
      'Apunta aplicó las correcciones que hiciste al hablar, antes de redactar: dejó fuera «four hours at night» en lugar de «six hours now».',
    );
    // Two items, so the conjunction is exercised: Spanish joins the last one
    // with `y`, and the two joining keys have to agree with that.
    expect(
      retractionNotice(
        [
          { withdrawn: 'four hours at night', replacement: 'six hours now' },
          { withdrawn: 'every other week', replacement: '' },
        ],
        'es-MX',
      ),
    ).toBe(
      'Apunta aplicó las correcciones que hiciste al hablar, antes de redactar: dejó fuera «four hours at night» en lugar de «six hours now»; y dejó fuera «every other week».',
    );
    // Her own words are never translated — only the sentence around them.
    expect(retractionNotice([{ withdrawn: 'cuatro horas', replacement: '' }], 'es-MX')).toContain(
      '«cuatro horas»',
    );
  });
});
