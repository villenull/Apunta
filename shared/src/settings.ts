import { z } from 'zod';

import { DEFAULT_LOCALE, isLocale } from './i18n/locales.js';
import type { Locale } from './i18n/locales.js';

/**
 * Settings are a flat key → JSON-value store (PLAN §3), not a fixed record:
 * later packets add keys (`llm_model` in M3; `whisper_binary`, `whisper_model`,
 * `stt_vocabulary`, `keep_audio` in M5) without a migration. Keys are
 * constrained so they stay predictable identifiers rather than free text.
 */
export const SettingKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/, 'Setting keys are lower_snake_case identifiers');

export const SettingsSchema = z.record(SettingKeySchema, z.json());
export type Settings = z.infer<typeof SettingsSchema>;

/** `PUT /api/settings` merges: keys present are written, everything else is untouched. */
export const UpdateSettingsRequestSchema = SettingsSchema;
export type UpdateSettingsRequest = z.infer<typeof UpdateSettingsRequestSchema>;

/** The two local language-model choices exposed in Settings. */
export const LlmProfileSchema = z.enum(['quick', 'thorough']);
export type LlmProfile = z.infer<typeof LlmProfileSchema>;
export const LLM_PROFILE_SETTING = 'llm_profile';

/**
 * C-LANG@1 rule 1: the UI language.
 *
 * The value is a `Locale`, so the setting, a note's `locale` and a format's
 * `locale` are one type rather than three lookalike enums that could drift
 * apart. The row is written only when she actually chooses something other than
 * English: an install that has never been asked answers `'en'` and has nothing
 * in the table, which is what keeps the setting from outrunning the `locale`
 * columns 008 added.
 */
export const LANGUAGE_SETTING = 'language';
export const LANGUAGES = ['en', 'es-MX'] as const;
export type Language = Locale;
export const DEFAULT_LANGUAGE: Language = DEFAULT_LOCALE;

/**
 * C-LANG@1 rule 1's `spanishAvailable`, under the name the API publishes it
 * under. It is a key every settings response carries and **no key the table
 * ever holds**: whether Spanish is offered is a property of the build, not
 * something a client can switch on by writing a row, so `PUT /api/settings`
 * drops it instead of storing it.
 */
export const SPANISH_AVAILABLE_SETTING = 'spanish_available';

/**
 * `settings` holds free-form JSON, so this is the guard that decides whether a
 * stored or submitted value is a language at all — a row written by an older
 * build, or a hand-edited one, falls back to English rather than reaching the UI
 * as something it cannot render.
 */
export function isLanguage(value: unknown): value is Language {
  return isLocale(value);
}

// Re-exported so a caller that already imports the settings vocabulary does not
// have to reach into `i18n/` for the type its values are.
export type { Locale } from './i18n/locales.js';

/**
 * The accent colour, so the practice can look like itself (owner-proxy,
 * 2026-08-30). One setting drives the whole palette: `--accent-hover` and
 * `--accent-tint` are mixed from it in `tokens.css`, so nothing has to be
 * chosen twice or kept in step by hand.
 */
export const ACCENT_COLOR_SETTING = 'accent_color';

/**
 * The Apunta teal, and what an unset or unusable value falls back to.
 *
 * The owner's own value, and the second one: she first took `#218677` from the
 * measured contrast figures, then on 2026-09-27 asked for it "slightly lighter"
 * and chose `#2a9d8f` from the same table, accepting that a lighter teal trades
 * light-background contrast for dark-surface contrast and that button labels
 * flip to near-black. Measured with `web/src/lib/accent.ts`'s own formula:
 * 3.16:1 on `#faf9f5`, 5.49:1 on `#151515`, 5.68:1 on `#111111`, and 3.01:1 on
 * the light sidebar `#f5f4ed` — which clears AM-053's 3:1 warning line, but only
 * just, and that narrow margin is a known and accepted property of this value
 * rather than an oversight. Do not "fix" it by moving the threshold, the
 * comparison or the surface list.
 *
 * This is a setting she changes in Appearance, so it is only what a fresh
 * install and a reset-to-default get; an existing stored colour is untouched.
 */
export const DEFAULT_ACCENT_COLOR = '#2a9d8f';

/**
 * Settings values are free-form JSON, so this reads whatever is in the row
 * and keeps only what is safely paintable. A six-digit hex is the whole
 * grammar on purpose: anything richer is a CSS expression, and a settings
 * row should never be able to inject one into a stylesheet.
 */
export function isAccentColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

/**
 * Text size, app-wide (owner, 2026-09-21). One multiplier, `--font-scale`,
 * sits on every `font-size` in the stylesheets, so text grows together and
 * the spacing around it stays put. Not in the prototype.
 */
export const FONT_SIZE_SETTING = 'font_size';
export const FONT_SIZES = ['small', 'default', 'large', 'extra-large'] as const;
export type FontSize = (typeof FONT_SIZES)[number];
export const DEFAULT_FONT_SIZE: FontSize = 'default';
export const FONT_SCALE: Readonly<Record<FontSize, number>> = {
  small: 0.9,
  default: 1,
  large: 1.15,
  'extra-large': 1.3,
};

export function isFontSize(value: unknown): value is FontSize {
  return typeof value === 'string' && (FONT_SIZES as readonly string[]).includes(value);
}

/**
 * Animations on or off, app-wide (owner, 2026-09-21). A boolean once she has
 * chosen; unset means "follow the system", which is off when the OS asks for
 * reduced motion. Not in the prototype.
 */
export const ANIMATIONS_SETTING = 'animations';

/**
 * Colour theme, app-wide. `dark` is the default: an unset or unusable value
 * falls back to dark, so a fresh install opens dark. `system` is the owner's
 * reference (owner, 2026-09-26): it follows the operating system and keeps
 * following it, so a machine that switches to dark at dusk switches Apunta
 * with it. It is a *choice*, not the default — `DEFAULT_THEME` stays `dark`,
 * so an install that has never been asked still opens dark as before.
 *
 * The order is the order the switcher shows them in: System, Light, Dark.
 */
export const THEME_SETTING = 'theme';
export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];
export const DEFAULT_THEME: Theme = 'dark';

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

/** The two themes the app can actually paint; `system` resolves to one of them. */
export type ResolvedTheme = 'light' | 'dark';
