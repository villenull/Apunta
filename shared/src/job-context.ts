import type { Locale } from './i18n/locales.js';

/**
 * C-LANG@1 rule 4: what a job is made of, captured once.
 *
 * A job is a recording, a transcription, a draft, a refine, a plan, a briefing
 * or a brainstorm, and it can take minutes. The language, the speech model, the
 * model and the prompt set that were right when it started must stay right for
 * every second of it — so they are read once, at the start, and carried in this
 * object. A retry, an SSE frame and the row that finally gets written all read
 * the captured values, never the settings as they stand when that later step
 * runs. Otherwise a note drafted in English and finished in Spanish would carry
 * whichever language happened to be selected halfway through, and a retry after
 * a settings change would quietly be a different job from the one that failed.
 *
 * Types and the capture helper only. Nothing consumes the object yet: S5.4
 * selects prompt sets from it and P4.3 selects the speech model from it, so a
 * route that builds one today would be a card guessing at those two.
 */
export interface JobContext {
  /** The language this job is running in, for anything it writes. */
  readonly locale: Locale;
  /**
   * The speech model dictation runs on, or `null` for a job that dictates
   * nothing — a draft from typed notes, a refine of existing text. `null` is
   * also what C-LANG@1 rule 7 refuses to substitute: Spanish audio is never
   * sent to the English model.
   */
  readonly sttModel: string | null;
  /** The local model tag the job will run on. */
  readonly llmModel: string;
  /** The prompt-set id the job's prompts are loaded from. */
  readonly promptSet: string;
}

/** The same four values as read at job start, before anything is captured. */
export interface JobContextInput {
  readonly locale: Locale;
  readonly sttModel?: string | null;
  readonly llmModel: string;
  readonly promptSet: string;
}

/**
 * Take the reading and hand back the context.
 *
 * Frozen on purpose: a capture that any later step can edit is not a capture,
 * it is a second source of truth that happens to agree for a while. Rule 4's
 * guarantee is that the values cannot move under the job, and the cheapest way
 * to keep that true is to make the object itself refuse.
 */
export function captureJobContext(input: JobContextInput): JobContext {
  return Object.freeze({
    locale: input.locale,
    sttModel: input.sttModel ?? null,
    llmModel: input.llmModel,
    promptSet: input.promptSet,
  });
}
