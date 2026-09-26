import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_THEME,
  isAccentColor,
  isTheme,
  SettingKeySchema,
  UpdateSettingsRequestSchema,
} from './settings.js';

/**
 * The accent is the one setting whose value is written into a style
 * attribute, so its validator is a safety boundary rather than a convenience:
 * settings rows are free-form JSON and can be hand-edited or restored from an
 * old backup.
 */
describe('isAccentColor', () => {
  it('accepts a six-digit hex, in either case', () => {
    expect(isAccentColor('#1f6f63')).toBe(true);
    expect(isAccentColor('#1F6F63')).toBe(true);
    expect(isAccentColor(DEFAULT_ACCENT_COLOR)).toBe(true);
  });

  it('refuses anything that is not one', () => {
    for (const value of [
      '#fff', // shorthand: a colour, but not the grammar this stores
      'red',
      'rgb(0,0,0)',
      '#1f6f6', // five digits
      '#1f6f633', // seven
      'var(--danger)',
      // The reason the grammar is this narrow: a settings row must not be
      // able to carry CSS into the stylesheet.
      '#000; background-image: url(https://example.com/x.png)',
      '',
      42,
      null,
      undefined,
      ['#1f6f63'],
    ]) {
      expect(isAccentColor(value), String(value)).toBe(false);
    }
  });

  it('is stored under a key the settings store accepts', () => {
    expect(SettingKeySchema.safeParse('accent_color').success).toBe(true);
  });
});

describe('isTheme', () => {
  it('defaults to dark and accepts the three choices the switcher offers', () => {
    expect(DEFAULT_THEME).toBe('dark');
    expect(isTheme('dark')).toBe(true);
    expect(isTheme('light')).toBe(true);
    expect(isTheme('system')).toBe(true);
    for (const value of ['Dark', 'System', 'auto', '', null, undefined, 42]) {
      expect(isTheme(value), String(value)).toBe(false);
    }
  });

  it('stores the theme as a free-form JSON value the API already accepts', () => {
    // The settings store is `record(key, json)`, so `system` needs no schema
    // of its own — this pins that, so a future per-value schema has to be
    // written deliberately rather than by accident.
    expect(UpdateSettingsRequestSchema.safeParse({ theme: 'system' }).success).toBe(true);
    expect(SettingKeySchema.safeParse('theme').success).toBe(true);
  });
});
