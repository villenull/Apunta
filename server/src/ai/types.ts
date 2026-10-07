import type {
  BriefComposition,
  DetectedFormat,
  GenerateStage,
  Locale,
  NoteSummary,
  PlanSuggestion,
  Sections,
  AppliedRetraction,
} from '@apunta/shared';

/**
 * The two provider interfaces from PLAN §5, each with a real and a fake
 * implementation selected by `APUNTA_FAKE_AI`.
 *
 * M3 implements both LLM providers and the STT fake; real whisper is M5.
 */

/** Where the model's raw material came from, and how far to trust it. */
export interface DraftSource {
  /**
   * The therapist's own written notes: her words, chosen deliberately, with no
   * transcription noise. The primary path and the authoritative source.
   */
  readonly typedNotes?: string | undefined;
  /** Speech-to-text output. Same session, lower confidence (M5). */
  readonly transcript?: string | undefined;
}

export interface GenerateNoteRequest extends DraftSource {
  /** The format's flattened prompt; empty falls back to the built-in default. */
  readonly instructions: string;
  readonly sections: readonly string[];
  /** Only used to pick a default when `instructions` is empty. */
  readonly formatName?: string | undefined;
  /** Deterministic, section-scoped vocabulary guidance; never source text. */
  readonly clinicalGuidance?: string | undefined;
  /**
   * The patient's recent published notes, newest first, as read-only style
   * examples. They are continuity context only, never evidence for this session.
   */
  readonly priorNotes?: readonly PriorNoteInput[] | undefined;
  /**
   * The language the note is written in (its format's), which the server's own
   * checks on the draft read. Falls back to the request's interface locale.
   */
  readonly noteLocale?: Locale | undefined;
}

export interface ChatTurn {
  readonly role: 'user' | 'assistant';
  readonly text: string;
}

export interface RefineNoteRequest {
  readonly instructions: string;
  readonly sections: readonly string[];
  readonly formatName?: string | undefined;
  /** What the editor currently shows, which the therapist may have hand-edited. */
  readonly noteText: string;
  readonly history: readonly ChatTurn[];
  readonly message: string;
  /** The excerpt she highlighted, if any (M4). */
  readonly refQuote?: string | undefined;
  /** Deterministic, section-scoped vocabulary guidance; never source text. */
  readonly clinicalGuidance?: string | undefined;
  /**
   * The patient's other notes, newest first, as read-only background (2026-09-21):
   * for answering "how does this compare to last session?", never material for
   * the revision unless she asks. Fitted by the route; absent or empty leaves
   * the prompt exactly as it was without them.
   */
  readonly priorNotes?: readonly PriorNoteInput[] | undefined;
  /** `YYYY-MM-DD` of the note being revised, so "last session" can be placed. */
  readonly noteDate?: string | undefined;
}

export interface DetectFormatRequest {
  readonly kind: 'template' | 'examples' | 'manual';
  readonly text: string;
}

/** One of the patient's notes as a prompt shows it: Brainstorm's context, the refine chat's background. */
export interface PriorNoteInput {
  readonly title: string;
  /** `YYYY-MM-DD`, so the model can place it in time. */
  readonly date: string;
  /** Exactly what the editor shows for that note. */
  readonly text: string;
}

export type BrainstormNoteInput = PriorNoteInput;

export interface BrainstormRequest {
  readonly patientName: string;
  readonly notes: readonly BrainstormNoteInput[];
  /**
   * How many of the patient's notes are not in `notes` because they did not
   * fit, so the model can say "not in the notes I have" rather than "never
   * happened". Zero or absent when every note went.
   */
  readonly omittedNotes?: number | undefined;
  readonly history: readonly ChatTurn[];
  readonly message: string;
}

/** What the final Ollama frame reports about the call. Logged on every request. */
export interface LlmStats {
  readonly model: string;
  readonly promptTokens: number;
  readonly outputTokens: number;
  /** Nanoseconds spent generating, per Ollama's `eval_duration`. */
  readonly evalNanos: number;
  /** Nanoseconds spent loading the model — a cold start, after the fact. */
  readonly loadNanos: number;
  readonly doneReason: string;
  /** How many attempts the retry ladder took. 1 means it worked first time. */
  readonly attempts: number;
}

/** The server's own changes to a draft (`risk-review.ts`, `not-obtained.ts`, `diagnostic-words.ts`). */
export interface DraftRepairs {
  /** The section her own risk-review sentences were added to, or null. */
  readonly riskReview: string | null;
  /** Drafted sentences replaced by `NOT_GATHERED_NOTE`, verbatim. */
  readonly notGathered: readonly string[];
  /** Sections rewritten without diagnostic words she never used. */
  readonly reworded: readonly { readonly section: string; readonly words: readonly string[] }[];
  /** Clauses taken out because they restated a figure she corrected. */
  readonly superseded: readonly string[];
  /** Corrected figures the draft still states on their own, for her to fix. */
  readonly stale: readonly string[];
}

export const NO_REPAIRS: DraftRepairs = {
  riskReview: null,
  notGathered: [],
  reworded: [],
  superseded: [],
  stale: [],
};

export function hasRepairs(repairs: DraftRepairs): boolean {
  return (
    repairs.riskReview !== null ||
    repairs.notGathered.length > 0 ||
    repairs.reworded.length > 0 ||
    repairs.superseded.length > 0 ||
    repairs.stale.length > 0
  );
}

export type LlmEvent =
  /** Progress, so a cold model load does not look like a hang. */
  | { readonly type: 'status'; readonly stage: GenerateStage; readonly message: string }
  /**
   * A decoded slice of one top-level string field. For `generateNote` the
   * `section` is a section name; for `refineNote` it is `reply`.
   */
  | { readonly type: 'token'; readonly section: string; readonly text: string }
  | { readonly type: 'sections'; readonly sections: Sections; readonly stats: LlmStats }
  /**
   * Spoken retractions the provider cut from the transcript before drafting
   * (`retractions.ts`); `offered` is how many the model listed, for the log.
   */
  | { readonly type: 'retractions'; readonly applied: readonly AppliedRetraction[]; readonly offered: number }
  /**
   * What the provider changed in the draft after the model wrote it, so she can
   * be told in the note's chat (`routes/draft.ts`). Sent before `sections`, and
   * only when something changed.
   */
  | { readonly type: 'repairs'; readonly repairs: DraftRepairs }
  | {
      readonly type: 'refined';
      readonly reply: string;
      readonly updatedSections: Sections | null;
      readonly stats: LlmStats;
    }
  /**
   * A brainstorm reply (M12): freeform discussion, and there is no note to
   * revise, so no `updatedSections` — the route that reads this has no write
   * path at all.
   */
  | { readonly type: 'discussed'; readonly reply: string; readonly stats: LlmStats };

/**
 * The material one note contributes to a second-stage call (M9).
 *
 * Both of M9's AI paths are two-stage: each note is summarised in its own call
 * first, and the call that matters sees only these small objects. Ollama
 * truncates an over-long prompt from the head — dropping the instructions and
 * keeping the patient material — so "put six notes in one prompt" is not a
 * quality trade-off, it is the silent failure this project is built against
 * (`docs/research/m3-preflight-2026-08.md`).
 */
export interface SummariseNoteRequest {
  /** Exactly what the editor shows for that note. */
  readonly noteText: string;
  readonly sections: readonly string[];
}

/** One note's verbatim excerpts, offered to the drafting call by index. */
export interface SuggestNoteMaterial {
  /** The number the model cites this note by. Its position in the list. */
  readonly index: number;
  /** `YYYY-MM-DD`, so a citation reads as a date. */
  readonly date: string;
  readonly excerpts: readonly string[];
}

export interface SuggestPlanGoalsRequest {
  /**
   * The diagnosis, as **input**. Goals are drafted toward it; the model never
   * proposes one, and the schema it writes into has no field for one.
   */
  readonly diagnoses: readonly string[];
  readonly modality: string;
  readonly frequency: string;
  /** Accepted goal statements, so a second run proposes beside them, not over them. */
  readonly existingGoals: readonly string[];
  readonly notes: readonly SuggestNoteMaterial[];
}

/** One note's summary points, offered to the briefing call by index. */
export interface BriefNoteMaterial {
  readonly index: number;
  readonly date: string;
  readonly title: string;
  readonly points: readonly string[];
}

export interface ComposeBriefRequest {
  readonly notes: readonly BriefNoteMaterial[];
}

/** A non-streamed call: the validated value plus what the call cost. */
export interface LlmResult<T> {
  readonly value: T;
  readonly stats: LlmStats;
}

export interface LlmProvider {
  /**
   * Streams a draft, then yields the validated sections object. Throws `AiError`.
   *
   * `locale` is the job's captured locale (C-LANG@1 rule 4), passed in rather
   * than read: the provider builds the `status` frames, and a frame rendered
   * from a setting read mid-stream would change language under a job that
   * already started in one. The `stage` cannot stand in for it — `drafting`
   * alone carries two different sentences.
   *
   * Optional, defaulting to English, so a caller with no locale to give stays
   * the caller it was before this parameter existed rather than a compile
   * error; all four production call sites pass one.
   */
  generateNote(request: GenerateNoteRequest, locale?: Locale): AsyncIterable<LlmEvent>;
  /** Streams the assistant's reply, then yields it with any rewritten sections (M4). */
  refineNote(request: RefineNoteRequest, locale?: Locale): AsyncIterable<LlmEvent>;
  /** Streams a brainstorm reply, then yields it (M12). Nothing is revised. */
  discussPatient(request: BrainstormRequest, locale?: Locale): AsyncIterable<LlmEvent>;
  /** Reads a template or an example note and names its sections (M6). */
  detectFormat(request: DetectFormatRequest): Promise<DetectedFormat>;
  /** Stage one of both M9 paths: one note in, a small structured object out. */
  summariseNote(request: SummariseNoteRequest): Promise<LlmResult<NoteSummary>>;
  /** Stage two of plan drafting: proposed goals, each citing offered excerpts (M9). */
  suggestPlanGoals(request: SuggestPlanGoalsRequest): Promise<LlmResult<PlanSuggestion>>;
  /** Stage two of session prep: a briefing, every line tied to one note (M9). */
  composeBrief(request: ComposeBriefRequest): Promise<LlmResult<BriefComposition>>;
  /** For `/api/health` and `smoke:live`: what this provider is talking to. */
  describe(): Promise<LlmDescription>;
  /**
   * Ask the local provider to load the drafting model ahead of a recording.
   * This is deliberately fire-and-forget at the route boundary; providers
   * swallow failures so recording can never depend on model availability.
   */
  preloadDraft(): Promise<void>;
}

export interface LlmDescription {
  readonly reachable: boolean;
  readonly model: string | null;
  readonly modelPresent: boolean;
  /**
   * `details.format` from `GET /api/tags` — `"gguf"` is the only value whose
   * engine actually enforces `format` (ollama#16563). Null when unknown.
   */
  readonly weightsFormat: string | null;
}

export interface TranscribeRequest {
  /** A 16-bit PCM WAV on disk. Nothing transcodes it; whisper reads it as-is. */
  readonly wavPath: string;
  /** Read from the WAV's own header, and what the timeout is scaled from. */
  readonly durationSeconds: number;
  /** `stt_vocabulary` from Settings, rendered into whisper's `--prompt`. */
  readonly vocabulary: readonly string[];
  /**
   * A rough, fast pass for the live preview: the audio context is fitted to
   * the clip instead of whisper's padded 30-second window. Never set for the
   * transcript that becomes a note.
   */
  readonly preview?: boolean;
  /**
   * A short clip dictated into the refine chat: the note's model, beam search
   * and fallbacks as for a note, with only the audio context fitted to the
   * clip, so a ten-second instruction does not pay for a thirty-second
   * window. Never set for the transcript that becomes a note.
   */
  readonly fitted?: boolean;
  /** The browser can cancel preview/dictation; providers must stop child work. */
  readonly signal?: AbortSignal;
}

export type SttEvent =
  /** `fraction` is 0–1 through the recording. whisper reports whole percents. */
  | { readonly type: 'progress'; readonly fraction: number; readonly message: string }
  | { readonly type: 'transcript'; readonly text: string };

/** For `/api/health` and M7's setup checklist: is whisper actually installed? */
export interface SttDescription {
  readonly binaryPresent: boolean;
  readonly modelPresent: boolean;
  /** What was probed, so the setup screen can name the path that failed. */
  readonly binary: string;
  readonly model: string;
}

/**
 * How one transcription is carried out, as the caller sees it.
 *
 * Only the locale is a caller's decision. Everything else on
 * `WhisperOptions` (`ai/whisper.ts`) is the provider's own configuration and
 * stays there; this is the slice of it a request has to be able to set, which
 * is what lets the STT frame say the same thing in the same language as the
 * rest of the job without the request knowing what a GGUF file is.
 */
export interface TranscribeOptions {
  /**
   * The job's captured locale, for the `progress` frames (C-LANG@1 rule 4).
   * Absent means English, which is what a preview outside a job gets.
   */
  readonly locale?: Locale;
}

export interface SttProvider {
  /** Streams progress, then yields the transcript. Throws `AiError`. */
  transcribe(request: TranscribeRequest, options?: TranscribeOptions): AsyncIterable<SttEvent>;
  describe(): Promise<SttDescription>;
}

export interface AiProviders {
  readonly llm: LlmProvider;
  readonly stt: SttProvider;
}
