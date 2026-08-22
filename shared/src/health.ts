import { z } from 'zod';

/**
 * Shape of `GET /api/health`. Every dependency check is reported separately so
 * the UI can tell the user exactly which local tool is missing. M0 hard-codes
 * the checks to `false`; M3/M5 fill them in for real.
 */
export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  version: z.string(),
  fakeAi: z.boolean(),
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
