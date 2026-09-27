import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { accentInk, accentLuminance, applyAccentColor } from './accent.js';

afterEach(() => {
  document.documentElement.removeAttribute('style');
});

describe('accent contrast', () => {
  it('derives a readable foreground for a light accent', () => {
    applyAccentColor('#ffff00');

    expect(document.documentElement.style.getPropertyValue('--on-accent')).toBe('#111111');
    expect(document.documentElement.style.getPropertyValue('--accent-ink')).not.toBe('#ffff00');
  });

  /**
   * The rule itself, on the one colour where the two candidate rules disagree.
   *
   * The test above cannot tell them apart: `#ffff00` scores 1.07:1 in white and
   * well over 3:1 in near-black, so "whichever scores higher" and "white unless
   * it falls under 3:1" both answer `#111111`, and a reversion would pass. The
   * Apunta teal is the discriminating case — 3.32:1 in white against 5.68:1 in
   * near-black — so it separates them, and it is the default accent, which is
   * why this is the shipped button rather than an edge case.
   *
   * The numbers are asserted as well as the answer, so a change to either
   * contrast function shows up here as a failure to recompute rather than as a
   * silent change of policy.
   */
  it('keeps the label white on the default teal, where picking the winner would not', () => {
    const teal = '#2a9d8f';
    /*
     * Both ratios answer the same question — a label sitting **on the teal
     * button** — so the teal is on one side of each. White is the lighter of the
     * two, so it goes on top; `#111111` is the darker, so it goes underneath and
     * the ratio is the other way round.
     *
     * The first version of this measured `#111111` against *white*, which is a
     * different question: it scored 18.9:1, and the assertion it supported
     * (`inWhite < inNearBlack`) held for the wrong reason — it was comparing a
     * label on teal with a label on white. Measured properly the two are 3.32:1
     * and 5.68:1, which is the pair the rule is actually about, and they still
     * disagree, which is the whole point of the test.
     */
    const inWhite = (1 + 0.05) / (accentLuminance(teal) + 0.05);
    const inNearBlack = (accentLuminance(teal) + 0.05) / (accentLuminance('#111111') + 0.05);

    // The precondition for the whole point: the higher-scoring colour is *not*
    // the one the rule picks. If this ever inverts, the rule and the reasoning
    // behind it have stopped describing the same thing.
    expect(inWhite).toBeGreaterThan(3);
    expect(inWhite).toBeLessThan(inNearBlack);

    applyAccentColor(teal);
    expect(document.documentElement.style.getPropertyValue('--on-accent')).toBe('#ffffff');
  });

  /**
   * The declaration and the function have to agree, and this is the only place
   * that says so.
   *
   * `tokens.css` is what a fresh install renders with; `applyAccentColor` is what
   * she gets the moment she touches the colour picker. If they drift, the button
   * changes colour under her hand for no reason she can see — the accent
   * matches, the label does not.
   */
  it('agrees with the value a fresh install ships', () => {
    const tokens = readFileSync(resolve(import.meta.dirname, '../styles/tokens.css'), 'utf8');
    const declared = /--on-accent:\s*(#[0-9a-f]{3,8})/.exec(tokens)?.[1];
    expect(declared).toBe('#ffffff');

    // Same input, both paths, one answer.
    applyAccentColor('#2a9d8f');
    expect(document.documentElement.style.getPropertyValue('--on-accent')).toBe(declared);
  });

  it('darkens accent ink until it reaches AA against white', () => {
    const ink = accentInk('#ffff00');
    expect(1.05 / (accentLuminance(ink) + 0.05)).toBeGreaterThanOrEqual(4.5);
  });

  it('rejects malformed values without leaving stale derived variables', () => {
    applyAccentColor('#1f6f63');
    applyAccentColor('url(https://example.invalid)');

    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--on-accent')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--accent-ink')).toBe('');
  });
});
