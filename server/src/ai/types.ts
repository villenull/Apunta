import type { DetectedFormat, GenerateStage, Sections } from '@apunta/shared';

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
}

export interface DetectFormatRequest {
  readonly kind: 'template' | 'examples' | 'manual';
  readonly text: string;
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

export type LlmEvent =
  /** Progress, so a cold model load does not look like a hang. */
  | { readonly type: 'status'; readonly stage: GenerateStage; readonly message: string }
  /**
   * A decoded slice of one top-level string field. For `generateNote` the
   * `section` is a section name; for `refineNote` it is `reply`.
   */
  | { readonly type: 'token'; readonly section: string; readonly text: string }
  | { readonly type: 'sections'; readonly sections: Sections; readonly stats: LlmStats }
  | {
      readonly type: 'refined';
      readonly reply: string;
      readonly updatedSections: Sections | null;
      readonly stats: LlmStats;
    };

export interface LlmProvider {
  /** Streams a draft, then yields the validated sections object. Throws `AiError`. */
  generateNote(request: GenerateNoteRequest): AsyncIterable<LlmEvent>;
  /** Streams the assistant's reply, then yields it with any rewritten sections (M4). */
  refineNote(request: RefineNoteRequest): AsyncIterable<LlmEvent>;
  /** Reads a template or an example note and names its sections (M6). */
  detectFormat(request: DetectFormatRequest): Promise<DetectedFormat>;
  /** For `/api/health` and `smoke:live`: what this provider is talking to. */
  describe(): Promise<LlmDescription>;
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
  readonly wavPath: string;
  readonly vocabulary: readonly string[];
}

export type SttEvent =
  | { readonly type: 'progress'; readonly fraction: number; readonly message: string }
  | { readonly type: 'transcript'; readonly text: string };

export interface SttProvider {
  transcribe(request: TranscribeRequest): AsyncIterable<SttEvent>;
}

export interface AiProviders {
  readonly llm: LlmProvider;
  readonly stt: SttProvider;
}
