import { describe, expect, it } from 'vitest';

import { collapseRepeats } from './preview-text.js';

/**
 * Whisper's decoder loops on a short clip when its context is tight; these are
 * the loops it actually produced on real speech (2026-09-04), and the preview
 * is the only text this ever touches.
 */
describe('collapseRepeats', () => {
  it('collapses a looped phrase to one, keeping the first occurrence as written', () => {
    expect(collapseRepeats('And so my fellow. And so my fellow. And so my fellow.')).toBe(
      'And so my fellow.',
    );
    expect(collapseRepeats('And so, my fellow Americans, ask not. Ask not. Ask not. Ask not.')).toBe(
      'And so, my fellow Americans, ask not.',
    );
    // A one-second clip's stutter.
    expect(collapseRepeats('And so... And so...')).toBe('And so...');
  });

  it('collapses a looped single word only from three, so speech keeps its emphasis', () => {
    expect(collapseRepeats('Oh, oh, oh, oh, oh, oh.')).toBe('Oh,');
    expect(collapseRepeats('a very very long week')).toBe('a very very long week');
  });

  it('leaves an honest transcript alone', () => {
    const text = 'He says the intrusive thoughts are less frequent, not gone.';
    expect(collapseRepeats(text)).toBe(text);
    expect(collapseRepeats('')).toBe('');
  });
});
