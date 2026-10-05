/**
 * Which long-running jobs are in flight right now.
 *
 * C-LANG@1 rule 6 blocks a language change while anything is running, and the
 * web control is only half of that rule — a second tab, or a request that
 * arrives without the control, has to be refused by the server too. That needs
 * one answer to "is anything running", which is this.
 *
 * It is a plain in-process map on purpose. A job is a request in this process
 * and lasts seconds, so a registry that outlived a restart or needed a
 * round trip would be a durability problem bought for a question that is only
 * ever asked while the app is open. Nothing is persisted, and nothing here
 * touches a note.
 *
 * The kinds are the whole vocabulary the plan names, so a later card adopts one
 * by calling `begin` and not by editing a union.
 *
 * **P5.3 wired the remaining kinds (2026-10-04).** Every kind except
 * `recording` now has a call site, one per route that starts a long-running job
 * or holds an open stream: `transcription` in `routes/transcribe.ts` (all three
 * of its routes), `plan` in `routes/plans.ts`, `briefing` in `routes/prep.ts`,
 * `brainstorm` in `routes/brainstorm.ts`, `import` in `routes/import.ts` and
 * `routes/halaxy.ts`, `restore` and `backup` in `routes/backup.ts`, and `save`
 * in `routes/notes.ts` — beside `draft` (`routes/draft.ts`) and `refine`
 * (`routes/chat.ts`), which S2.1 wired. `recording` has **no** server site by
 * construction: the microphone is in the browser, so a recording travels on the
 * client half of C-UPD@1's quiescence and is never a registry job.
 *
 * `settings.ts` reads `anyActive()` for C-LANG@1 rule 6 and keeps working
 * unchanged; P5.3 neither weakened nor widened that read. Nothing in this file
 * changed but this comment: the union, `JobKind`, `begin`, `end`, `active` and
 * `anyActive` are exactly as S2.1 left them.
 */
export const JOB_KINDS = [
  'recording',
  'transcription',
  'draft',
  'refine',
  'plan',
  'briefing',
  'brainstorm',
  'import',
  'restore',
  'backup',
  'save',
] as const;

export type JobKind = (typeof JOB_KINDS)[number];

export interface ActiveJob {
  readonly kind: JobKind;
  /**
   * What the job is about — the note a refine is refining, the note id a draft
   * has just been given. Callers that have no subject yet, as `streamDraft` has
   * none before the note exists, pass an id they minted for the job.
   */
  readonly id: string;
}

const activeJobs = new Map<string, ActiveJob>();

/**
 * Register a job and return it. An id that is already active is taken over by
 * the newer job: from outside, the same id *is* the same work, and the two
 * streams cannot both be "the" job. Callers pass an id that is unique per
 * concurrent job, and `end(id)` is what releases it.
 */
export function begin(kind: JobKind, id: string): ActiveJob {
  const job: ActiveJob = Object.freeze({ kind, id });
  activeJobs.set(id, job);
  return job;
}

/**
 * Release a job. Idempotent, because the honest way to call it is from a
 * `finally` on a path that may already have ended the job.
 */
export function end(id: string): void {
  activeJobs.delete(id);
}

/** The jobs in flight, in the order they began. */
export function active(): readonly ActiveJob[] {
  return Object.freeze([...activeJobs.values()]);
}

/** True when a job of any kind is running — C-LANG@1 rule 6's question. */
export function anyActive(): boolean {
  return activeJobs.size > 0;
}
