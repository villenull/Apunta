import { z } from 'zod';

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

/**
 * The accent colour, so the practice can look like itself (owner-proxy,
 * 2026-08-30). One setting drives the whole palette: `--accent-hover` and
 * `--accent-tint` are mixed from it in `tokens.css`, so nothing has to be
 * chosen twice or kept in step by hand.
 */
export const ACCENT_COLOR_SETTING = 'accent_color';

/** The prototype's green, and what an unset or unusable value falls back to. */
export const DEFAULT_ACCENT_COLOR = '#1f6f63';

/**
 * Settings values are free-form JSON, so this reads whatever is in the row
 * and keeps only what is safely paintable. A six-digit hex is the whole
 * grammar on purpose: anything richer is a CSS expression, and a settings
 * row should never be able to inject one into a stylesheet.
 */
export function isAccentColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}
