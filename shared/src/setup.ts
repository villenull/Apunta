import { z } from 'zod';

/**
 * First-run setup's wire shapes: what the installer prints, one JSON object
 * per line, and what the server mirrors for the page.
 *
 * They live here rather than in `installer/` because two processes read them.
 * The installer writes them; the server validates each line the shell relays
 * (`setup_event{event}`) before keeping it. The server must not import the
 * installer (`installer/src/containment.test.ts`), so the schema has to sit in
 * the one package both may depend on.
 */

export const SETUP_STEP_IDS = ['speech_model', 'preview_model', 'writing_model'] as const;
export type SetupStepId = (typeof SETUP_STEP_IDS)[number];

/** Every way setup can fail. The page words each one; the installer's own sentence is a fallback. */
export const SETUP_ERROR_CODES = [
  'not_enough_disk',
  'download_failed',
  'checksum_mismatch',
  'cancelled',
  'runtime_unreachable',
  'model_pull_failed',
  'unexpected',
] as const;
export type SetupErrorCode = (typeof SETUP_ERROR_CODES)[number];

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
  /** Plain language: what was chosen and why this computer got it. */
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

export const SETUP_STEP_STATUSES = ['started', 'skipped', 'verifying', 'finished'] as const;

export const StepEventSchema = z.object({
  event: z.literal('step'),
  id: z.enum(SETUP_STEP_IDS),
  status: z.enum(SETUP_STEP_STATUSES),
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
 * Where setup stands, as the server mirrors it.
 *
 * - `idle`: nothing asked yet this run of the app.
 * - `planning`: the installer is deciding; nothing is downloaded.
 * - `planned`: a plan is here and waits for her Start.
 * - `running`: downloading, after she pressed Start.
 * - `cancelling`: she pressed Stop; the installer is being stopped.
 * - `done` / `failed`: the run ended. A failed run can be started again.
 */
export const SETUP_STATES = [
  'idle',
  'planning',
  'planned',
  'running',
  'cancelling',
  'done',
  'failed',
] as const;
export const SetupStateSchema = z.enum(SETUP_STATES);
export type SetupState = z.infer<typeof SetupStateSchema>;

export const SETUP_ACTIONS = ['plan', 'run', 'cancel'] as const;
export type SetupAction = (typeof SETUP_ACTIONS)[number];

export const SetupStepStateSchema = z.object({
  id: z.enum(SETUP_STEP_IDS),
  status: z.enum(['pending', ...SETUP_STEP_STATUSES]),
});
export type SetupStepState = z.infer<typeof SetupStepStateSchema>;

/** `GET /api/app/setup` (shell mode only; 404 in browser mode). */
export const SetupStatusResponseSchema = z.object({
  state: SetupStateSchema,
  plan: PlanEventSchema.optional(),
  steps: z.array(SetupStepStateSchema),
  progress: ProgressEventSchema.optional(),
  failure: z
    .object({
      code: z.enum(SETUP_ERROR_CODES),
      retryable: z.boolean(),
    })
    .optional(),
});
export type SetupStatusResponse = z.infer<typeof SetupStatusResponseSchema>;
