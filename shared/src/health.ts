import { z } from 'zod';

/**
 * Disk encryption, from `fdesetup status` on darwin (M7 deliverable 2).
 *
 * `not_applicable` everywhere else, and `unknown` when the command could not
 * be read — never `off`. Reporting an unread state as "off" would teach the
 * one person this check exists for to ignore it
 * (`docs/research/data-at-rest-2026-08.md` ranked risk 2).
 */
export const FileVaultStateSchema = z.enum(['on', 'off', 'deferred', 'unknown', 'not_applicable']);
export type FileVaultState = z.infer<typeof FileVaultStateSchema>;

export const FileVaultStatusSchema = z.object({
  state: FileVaultStateSchema,
  /** The first line of what the machine actually said, for the setup screen. */
  detail: z.string(),
});
export type FileVaultStatus = z.infer<typeof FileVaultStatusSchema>;

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
  /**
   * True inside `Apunta.app`, where the AI runtime ships with the app and the
   * first-run window downloads the models; false on a source checkout, where
   * the setup script does. The setup screen's advice differs completely
   * between the two — a Terminal command is the wrong answer for her.
   */
  bundled: z.boolean(),
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
  /**
   * Not an AI dependency, and the only item here the app cannot fix for her —
   * but it is the one thing standing between a stolen laptop and every
   * clinical record on it, so the setup screen refuses to call the app private
   * while it is off.
   */
  fileVault: FileVaultStatusSchema,
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
