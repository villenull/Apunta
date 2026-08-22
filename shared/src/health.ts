import { z } from 'zod';

/**
 * Shape of `GET /api/health`. Every dependency check is reported separately so
 * the UI can tell the user exactly which local tool is missing. M1 reports the
 * database for real; the AI checks stay hard-coded to `false` until M3/M5.
 */
export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  version: z.string(),
  fakeAi: z.boolean(),
  db: z.object({
    /** Absolute path of the SQLite file, so the UI can tell the user where their data lives. */
    path: z.string(),
    /** Highest applied migration number; 0 on an unmigrated database. */
    migrationLevel: z.number().int().nonnegative(),
  }),
  ollama: z.object({
    reachable: z.boolean(),
    model: z.string().nullable(),
    modelPresent: z.boolean(),
  }),
  whisper: z.object({
    binaryPresent: z.boolean(),
    modelPresent: z.boolean(),
  }),
  ffmpeg: z.object({
    present: z.boolean(),
  }),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
