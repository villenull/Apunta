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
