import { afterEach, describe, expect, it } from 'vitest';

import { applyTheme, readBootTheme, resolveTheme, systemPrefersDark } from './appearance.js';

/**
 * The System choice (owner, 2026-09-26) is one rule: `system` follows the
 * operating system and nothing else does. It is pinned here as a pure function
 * because `matchMedia` cannot be driven from a test — jsdom has none — and
 * because a rule this small is worth stating outright.
 */
describe('resolveTheme', () => {
  it('follows the operating system only for the system choice', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('leaves a chosen theme alone whichever way the system is set', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });
});

describe('systemPrefersDark', () => {
  it('is false when the platform cannot say', () => {
    expect(systemPrefersDark()).toBe(false);
  });
});

describe('applyTheme', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.removeProperty('color-scheme');
    window.localStorage.clear();
  });

  it('paints dark for an unset choice, as a fresh install has always done', () => {
    applyTheme(undefined);
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('resolves the system choice to what the platform asks for', () => {
    // No matchMedia here, so "the platform cannot say" is light: the point is
    // that the value stored is `system` and the value painted is not.
    applyTheme('system');
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(readBootTheme()).toBe('light');
  });

  it('remembers the painted theme for the frame before settings arrive', () => {
    applyTheme('light');
    expect(readBootTheme()).toBe('light');
    applyTheme('dark');
    expect(readBootTheme()).toBe('dark');
  });
});
