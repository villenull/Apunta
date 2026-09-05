import { z } from 'zod';

import { SETUP_ERROR_CODES } from './errors.js';

/**
 * What the setup process says, and the only thing the app shell has to
 * understand.
 *
 * One JSON object per line on stdout. The shell renders; it does not compute
 * (`docs/research/m8-shell-and-runtime-2026-08.md` §3.1). That division is
 * what lets the disk arithmetic, the tier choice, the checksum and the resume
 * bookkeeping be unit-tested on Linux while the window that shows them is
 * Swift.
 *
 * NDJSON rather than a socket or a pipe protocol because a line is atomic
 * enough for `readLine` on the other side, it survives being read by a person
 * (`node setup.js run | cat` is a debuggable session), and it costs the shell
 * one `JSONSerialization` call per line.
 */

export const SETUP_STEP_IDS = ['speech_model', 'preview_model', 'writing_model'] as const;
export type SetupStepId = (typeof SETUP_STEP_IDS)[number];

export const LicenceReferenceSchema = z.object({
  name: z.string(),
  url: z.string(),
  verified: z.boolean(),
});

export const PlannedStepSchema = z.object({
  id: z.enum(SETUP_STEP_IDS),
  /** "The speech model", "The writing model" — what the window lists. */
  label: z.string(),
  /** False when it is already on disk; the window shows it ticked. */
  needed: z.boolean(),
  approxBytes: z.number().int().nonnegative(),
});

export const DiskReportSchema = z.object({
  ok: z.boolean(),
  freeBytes: z.number().nonnegative(),
  requiredBytes: z.number().nonnegative(),
  headroomBytes: z.number().nonnegative(),
  shortfallBytes: z.number().nonnegative(),
  message: z.string(),
});

export const ChosenModelSchema = z.object({
  tag: z.string(),
  publisher: z.string(),
  /** Plain language: what was chosen and why this Mac got it. */
  reason: z.string(),
  licence: LicenceReferenceSchema,
});

/** Emitted once, before anything is downloaded. */
export const PlanEventSchema = z.object({
  event: z.literal('plan'),
  /** Null where the machine's memory could not be read. */
  memoryGib: z.number().nullable(),
  model: ChosenModelSchema,
  steps: z.array(PlannedStepSchema),
  disk: DiskReportSchema,
  /** True when there is nothing to download and the app can just start. */
  ready: z.boolean(),
});

export const StepEventSchema = z.object({
  event: z.literal('step'),
  id: z.enum(SETUP_STEP_IDS),
  status: z.enum(['started', 'skipped', 'verifying', 'finished']),
  label: z.string(),
});

export const ProgressEventSchema = z.object({
  event: z.literal('progress'),
  id: z.enum(SETUP_STEP_IDS),
  completedBytes: z.number().nonnegative(),
  totalBytes: z.number().nonnegative().nullable(),
  percent: z.number().min(0).max(100).nullable(),
  bytesPerSecond: z.number().nonnegative().nullable(),
  etaSeconds: z.number().nonnegative().nullable(),
  /** "412 MB of 574 MB — about 2 minutes left". Rendered verbatim. */
  detail: z.string(),
});

/** A line for the window's status area. Never a path, never a command. */
export const MessageEventSchema = z.object({
  event: z.literal('message'),
  text: z.string(),
});

export const DoneEventSchema = z.object({
  event: z.literal('done'),
  ok: z.literal(true),
});

export const FailedEventSchema = z.object({
  event: z.literal('failed'),
  code: z.enum(SETUP_ERROR_CODES),
  title: z.string(),
  detail: z.string(),
  retryable: z.boolean(),
});

export const SetupEventSchema = z.discriminatedUnion('event', [
  PlanEventSchema,
  StepEventSchema,
  ProgressEventSchema,
  MessageEventSchema,
  DoneEventSchema,
  FailedEventSchema,
]);

export type SetupEvent = z.infer<typeof SetupEventSchema>;
export type PlanEvent = z.infer<typeof PlanEventSchema>;
export type ProgressEvent = z.infer<typeof ProgressEventSchema>;
export type PlannedStep = z.infer<typeof PlannedStepSchema>;
export type DiskReport = z.infer<typeof DiskReportSchema>;
export type ChosenModel = z.infer<typeof ChosenModelSchema>;

/**
 * One event, one line.
 *
 * Validated on the way out rather than trusted: the shell is in another
 * language and cannot re-check the shape, so a malformed event would be a
 * window stuck at 0% with no way to find out why.
 */
export function encodeEvent(event: SetupEvent): string {
  return `${JSON.stringify(SetupEventSchema.parse(event))}\n`;
}

/** The shell's side, and the tests'. Returns null for a line that is not ours. */
export function decodeEvent(line: string): SetupEvent | null {
  const trimmed = line.trim();
  if (trimmed === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  const result = SetupEventSchema.safeParse(parsed);
  return result.success ? result.data : null;
}
