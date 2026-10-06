import { z } from 'zod';

/**
 * C-UPD@1's updater states, in order, as the shell reports them
 * (`update_status{state}`) and the server relays them (`GET /api/app/update`).
 */
export const UPDATE_STATES = [
  'idle',
  'checking',
  'available',
  'downloading',
  'verified',
  'quiescing',
  'snapshotting',
  'installing',
  'relaunching',
  'health_check',
  'done',
] as const;
export const UpdateStateSchema = z.enum(UPDATE_STATES);
export type UpdateState = z.infer<typeof UpdateStateSchema>;

/**
 * Why the shell last left a state sideways. The notice maps each to words; the
 * server never interprets one. `close_*` are the native-close intent codes
 * (C-BRIDGE@1 rule 2), not failures.
 */
export const UPDATE_CODES = [
  'offline',
  'rejected',
  'quiesce_refused',
  'snapshot_failed',
  'install_failed',
  'not_configured',
  'close_requested',
  'close_refused',
  'close_cancelled',
] as const;
export const UpdateCodeSchema = z.enum(UPDATE_CODES);
export type UpdateCode = z.infer<typeof UpdateCodeSchema>;

/** Where a native close attempt stands, as the renderer needs to see it. */
export const CloseStateSchema = z.enum(['none', 'requested', 'refused']);
export type CloseState = z.infer<typeof CloseStateSchema>;

/**
 * `GET /api/app/update` (shell mode only; 404 in browser mode).
 *
 * `blockers` is the last canonical close check's blocker list, passed through
 * verbatim for the renderer to word; it is empty unless `close.state` is
 * `refused`.
 */
export const UpdateStatusResponseSchema = z.object({
  state: UpdateStateSchema,
  version: z.string().optional(),
  code: UpdateCodeSchema.optional(),
  autoCheck: z.boolean(),
  close: z.object({
    state: CloseStateSchema,
    blockers: z.array(z.string()),
  }),
});
export type UpdateStatusResponse = z.infer<typeof UpdateStatusResponseSchema>;

/** `PUT /api/app/update/settings`. */
export const UpdateAutoCheckRequestSchema = z.object({ autoCheck: z.boolean() }).strict();
export type UpdateAutoCheckRequest = z.infer<typeof UpdateAutoCheckRequestSchema>;

/** `POST /api/app/close/decision`: the renderer's explicit word after a refused close. */
export const CloseDecisionRequestSchema = z.object({ confirm: z.boolean() }).strict();
export type CloseDecisionRequest = z.infer<typeof CloseDecisionRequestSchema>;

/** The three actions `POST /api/app/update/{action}` forwards to the shell. */
export const UPDATE_ACTIONS = ['check', 'download', 'install'] as const;
export const UpdateActionSchema = z.enum(UPDATE_ACTIONS);
export type UpdateAction = z.infer<typeof UpdateActionSchema>;

/** The update journal's phases (`server/src/update-journal.ts`), as recovery reports them. */
export const RecoveryPhaseSchema = z.enum(['pending', 'health_attempted', 'recovery']);
export type RecoveryPhase = z.infer<typeof RecoveryPhaseSchema>;

/**
 * `GET /api/app/recovery` (recovery mode only). `previousAvailable` says whether
 * the kept previous image can be reinstalled.
 */
export const RecoveryStatusSchema = z.object({
  phase: RecoveryPhaseSchema,
  fromVersion: z.string(),
  toVersion: z.string(),
  createdAt: z.string().optional(),
  previousAvailable: z.boolean(),
});
export type RecoveryStatus = z.infer<typeof RecoveryStatusSchema>;

/** C-BRIDGE@1 rule 2's `startup_context`, written before `ready`. */
export interface StartupContext {
  readonly mode: 'normal' | 'recovery';
  readonly updateId?: string;
  readonly targetVersion?: string;
  readonly previousVersion?: string;
}
