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
