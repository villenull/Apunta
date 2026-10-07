import { describe, expect, it } from 'vitest';

import { hasCorrectionCue, removeSuperseded, verifiedSupersessions } from './superseded.js';

const SOURCE =
  'what she came in for. low mood. she said "three years, on and off" then later she corrected herself and said actually it is more like five, since the divorce. so: five years, her revised number.';

describe('verifiedSupersessions', () => {
  it('believes a pair found in order with a correction cue', () => {
    expect(
      verifiedSupersessions(SOURCE, [{ withdrawn: 'three years', replacement: 'more like five' }]),
    ).toEqual([{ withdrawn: 'three years', replacement: 'more like five' }]);
  });

  it('refuses a pair out of order, missing, or without a cue', () => {
    expect(
      verifiedSupersessions(SOURCE, [{ withdrawn: 'more like five', replacement: 'three years' }]),
    ).toEqual([]);
    expect(verifiedSupersessions(SOURCE, [{ withdrawn: 'two years', replacement: 'five' }])).toEqual([]);
    expect(
      verifiedSupersessions('She sleeps three hours. She works five days.', [
        { withdrawn: 'three hours', replacement: 'five days' },
      ]),
    ).toEqual([]);
  });

  it('refuses a single common word as the old figure', () => {
    expect(verifiedSupersessions(SOURCE, [{ withdrawn: 'low', replacement: 'five' }])).toEqual([]);
  });

  it('reads Spanish cues', () => {
    const source = 'Toma el medicamento tres veces al día, digo, dos.';
    expect(hasCorrectionCue(source, 'es-MX')).toBe(true);
    expect(
      verifiedSupersessions(source, [{ withdrawn: 'tres veces al día', replacement: 'dos' }], 'es-MX'),
    ).toEqual([{ withdrawn: 'tres veces al día', replacement: 'dos' }]);
  });
});

describe('removeSuperseded', () => {
  const pairs = [{ withdrawn: 'three years', replacement: 'more like five' }];

  it('takes out the clause that restates the old figure, keeping the corrected one', () => {
    const outcome = removeSuperseded(
      {
        'Presenting problem':
          'Low mood. Symptoms have persisted for five years, though she initially stated three years before correcting herself.',
      },
      pairs,
    );
    expect(outcome.sections['Presenting problem']).toBe('Low mood. Symptoms have persisted for five years.');
    expect(outcome.removed).toEqual(['though she initially stated three years before correcting herself.']);
    expect(outcome.stale).toEqual([]);
  });

  it('leaves an old figure standing alone, and reports it', () => {
    const sections = { 'Presenting problem': 'Symptoms have persisted for three years.' };
    const outcome = removeSuperseded(sections, pairs);
    expect(outcome.sections).toBe(sections);
    expect(outcome.stale).toEqual(['three years']);
  });

  it('never removes the main clause', () => {
    const sections = { History: 'Three years of low mood, now five years by her revised count.' };
    expect(removeSuperseded(sections, pairs).sections).toBe(sections);
  });
});
