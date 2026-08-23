import { z } from 'zod';

/**
 * Shape of `GET /api/health`. Every dependency check is reported separately so
 * the UI can tell the user exactly which local tool is missing, and M7's setup
 * wizard turns it into a checklist. M1 reported the database, M3 made Ollama
 * real, M5 does whisper.
 *
 * There is no `ffmpeg` key. M5 records 16 kHz mono WAV in the browser and
 * `whisper-cli` decodes it directly, so ffmpeg is not a dependency of the
 * running app at all — and a health check that reported it would paint a
 * perfectly working machine red for a tool it never calls
 * (`docs/research/m8-bundling-2026-08.md` §11).
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
    /** What was probed, so the setup screen can name the path that failed. */
    binary: z.string(),
    model: z.string(),
  }),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
