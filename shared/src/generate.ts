import { z } from 'zod';

import { boundedText, IdSchema, MAX_BODY_CHARS, optionalText } from './common.js';
import { NoteSchema } from './note.js';

/**
 * `POST /api/generate` — the drafting call (PLAN §4).
 *
 * Two source fields, not one, and they are labelled differently in the prompt.
 * The practice owner writes rough notes far more often than she dictates
 * ("mostly written, speaking is occasional" —
 * `docs/feedback/2026-08-22-owner-answers.md`), and her written notes are her
 * own words with no transcription noise, so they are the authoritative source.
 * A machine transcript is not. M5 adds audio *alongside* typed notes rather
 * than instead of them, so both fields exist from the start and a request may
 * carry either or both.
 */
export const GenerateRequestSchema = z
  .object({
    patient_id: IdSchema,
    format_id: IdSchema,
    /** The therapist's own written notes. The primary path. */
    typed_notes: optionalText(MAX_BODY_CHARS).optional(),
    /** Speech-to-text output for a recording (M5). */
    transcript: optionalText(MAX_BODY_CHARS).optional(),
    /** Defaults to the format's name, matching the prototype's note titles. */
    title: boundedText(200).optional(),
  })
  .refine((body) => (body.typed_notes ?? '').trim() !== '' || (body.transcript ?? '').trim() !== '', {
    message: 'Provide typed notes, a transcript, or both',
  });
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

/**
 * Everything that can go wrong between the request and a validated note.
 *
 * These are expected error paths with real user-facing messages, not
 * assertions: every one of them is a failure mode observed in the wild
 * against a local Ollama (`docs/research/m3-preflight-2026-08.md` §3).
 */
export const AiErrorCodeSchema = z.enum([
  /** `fetch` refused: Ollama is not running. */
  'ollama_unreachable',
  /** 404 from Ollama: the configured model has not been pulled. */
  'model_missing',
  /** The model's weights are not GGUF, so `format` is not enforced (ollama#16563). */
  'non_gguf_model',
  /** The configured tag names a non-GGUF flavour (`-mlx`, `-nvfp4`, `-mxfp8`, `-bf16`). */
  'unsupported_model_tag',
  /** 500 from Ollama with a memory-shaped message. */
  'insufficient_memory',
  /** The source text cannot fit the context window alongside the instructions. */
  'input_too_long',
  /** `prompt_eval_count` came back flush against `num_ctx`: the prompt was truncated. */
  'context_overflow',
  /** `done_reason: "length"` — the JSON was cut off mid-string. */
  'output_truncated',
  /** The model produced nothing, or nothing outside its reasoning block. */
  'empty_response',
  /** Parsed, but did not match the format's schema — after every retry. */
  'invalid_output',
  /** Valid JSON full of a repetition loop (ollama#15502). */
  'degenerate_output',
  /** No first byte inside the timeout. */
  'timeout',
  /** Anything else Ollama reported. */
  'ollama_error',

  // Speech-to-text (M5). Same enum because they are the same kind of thing —
  // a local tool that is missing, wrong or too slow — and they surface through
  // the same `error` event, with a message written for the user.
  /** `whisper-cli` is not on PATH, or `whisper_binary` names nothing runnable. */
  'whisper_missing',
  /** The GGUF model file named by `whisper_model` is not there. */
  'whisper_model_missing',
  /** The upload was not a WAV. Nothing transcodes it; whisper cannot read it. */
  'audio_unsupported',
  /** A WAV whisper could not decode — truncated, or a codec miniaudio lacks. */
  'audio_decode_failed',
  /** whisper exited non-zero for any other reason. */
  'transcription_failed',
  /** whisper produced no transcript inside its timeout. */
  'transcription_timeout',
  /** whisper ran fine and heard no speech — a muted mic, or the wrong input. */
  'transcription_empty',
]);
export type AiErrorCode = z.infer<typeof AiErrorCodeSchema>;

/**
 * SSE event names on `POST /api/generate`, and the `data` payload of each.
 * `note` carries a full `Note`; the stream ends after `note` or `error`.
 */
export const GENERATE_EVENT_NAMES = ['status', 'token', 'note', 'error'] as const;
export type GenerateEventName = (typeof GENERATE_EVENT_NAMES)[number];

/** What the server is waiting on, so a slow cold model does not look frozen. */
export const GenerateStageSchema = z.enum(['connecting', 'loading-model', 'drafting', 'retrying', 'saving']);
export type GenerateStage = z.infer<typeof GenerateStageSchema>;

export const GenerateStatusEventSchema = z.object({
  stage: GenerateStageSchema,
  message: z.string(),
});
export type GenerateStatusEvent = z.infer<typeof GenerateStatusEventSchema>;

/**
 * A decoded slice of one section's body.
 *
 * With `format` set, the model's token stream is raw JSON — the first tokens
 * on the wire are `{`, `"Sub`, `jective`, `":`. Rendering that verbatim would
 * show the therapist escaped JSON scrolling past, so the provider decodes the
 * partial JSON and emits per-section text instead. The fake provider emits the
 * identical shape, so a test against it proves something about the real path.
 */
export const GenerateTokenEventSchema = z.object({
  section: z.string(),
  text: z.string(),
});
export type GenerateTokenEvent = z.infer<typeof GenerateTokenEventSchema>;

export const GenerateNoteEventSchema = z.object({
  note: NoteSchema,
  /** Sections whose body came back blank, in format order. */
  empty_sections: z.array(z.string()),
});
export type GenerateNoteEvent = z.infer<typeof GenerateNoteEventSchema>;

export const GenerateErrorEventSchema = z.object({
  code: AiErrorCodeSchema,
  message: z.string(),
});
export type GenerateErrorEvent = z.infer<typeof GenerateErrorEventSchema>;
