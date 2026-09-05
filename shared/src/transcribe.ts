import { z } from 'zod';

import { boundedText, IdSchema, MAX_BODY_CHARS, optionalText } from './common.js';
import type { AiErrorCodeSchema } from './generate.js';

/**
 * `POST /api/transcribe` — record → transcript → draft, in one request (M5).
 *
 * The browser records 16 kHz mono and writes the WAV itself, so the server
 * spawns `whisper-cli` on what arrives and never transcodes anything. The
 * stream then continues into the *same* drafting path `/api/generate` uses, so
 * the capture screen shows one continuous progression: transcribing, then a
 * draft taking shape, then the saved note.
 */

/** Multipart text fields. The audio itself is the one file part. */
export const TranscribeFieldsSchema = z.object({
  patient_id: IdSchema,
  format_id: IdSchema,
  /** Defaults to the format's name, as `/api/generate` does. */
  title: boundedText(200).optional(),
  /**
   * Anything she typed alongside the recording. Her own words outrank a
   * machine transcript, so both are sent and the prompt labels them
   * differently (`shared/src/generate.ts`).
   */
  typed_notes: optionalText(MAX_BODY_CHARS).optional(),
});
export type TranscribeFields = z.infer<typeof TranscribeFieldsSchema>;

/**
 * SSE event names on `POST /api/transcribe`.
 *
 * `progress` is transcription; everything after it is `/api/generate`'s
 * vocabulary unchanged (`status`, `token`, `note`, `error`), because it is
 * literally the same code drafting the note. The stream ends after `note` or
 * `error`.
 */
export const TRANSCRIBE_EVENT_NAMES = ['progress', 'status', 'token', 'note', 'error'] as const;
export type TranscribeEventName = (typeof TRANSCRIBE_EVENT_NAMES)[number];

/** How far through the recording whisper is, so a long file is not a hang. */
export const TranscribeProgressEventSchema = z.object({
  /** 0–1. whisper.cpp reports whole percents; the UI renders them. */
  fraction: z.number().min(0).max(1),
  message: z.string(),
});
export type TranscribeProgressEvent = z.infer<typeof TranscribeProgressEventSchema>;

/** Failures specific to the speech-to-text half. `AiErrorCode` carries them. */
export const STT_ERROR_CODES = [
  'whisper_missing',
  'whisper_model_missing',
  'audio_unsupported',
  'audio_decode_failed',
  'transcription_failed',
  'transcription_timeout',
  'transcription_empty',
] as const satisfies readonly z.infer<typeof AiErrorCodeSchema>[];

// --- settings --------------------------------------------------------------

/** `whisper-cli` on PATH by default; an absolute path also works. */
export const WHISPER_BINARY_SETTING = 'whisper_binary';
export const DEFAULT_WHISPER_BINARY = 'whisper-cli';

/** Defaults to `<data dir>/models/<WHISPER_MODEL_FILENAME>` (PLAN §2). */
export const WHISPER_MODEL_SETTING = 'whisper_model';
export const WHISPER_MODEL_FILENAME = 'ggml-large-v3-turbo-q5_0.bin';

/**
 * An optional, smaller whisper model for the live preview only.
 *
 * The preview's floor is whisper's encoder, and on the note's model that is
 * about a second per refresh on a CPU (2026-09-04). A small model runs the
 * same pass in a fraction of that — `ggml-small` in ~0.3–0.6 s with the same
 * words on clear speech, `ggml-base` faster and rougher — which is what puts
 * the caption a second behind her voice rather than two. The note's
 * transcript never uses it. Unset, or pointing at a file that is not there,
 * the preview simply runs on the note's model.
 */
export const WHISPER_PREVIEW_MODEL_SETTING = 'whisper_preview_model';
/**
 * What the installer downloads for the preview, and what the server looks for
 * in the models folder when the setting above is empty. `small` rather than
 * `base`: on the same speech it gave the big model's words and punctuation
 * in a third of a second, where `base` was faster and rougher (2026-09-04).
 */
export const WHISPER_PREVIEW_MODEL_FILENAME = 'ggml-small.bin';

/**
 * Terms fed to whisper's `--prompt`. Medication and clinical names are
 * Whisper's known weak spot and the one knob that biases it (research §3).
 */
export const STT_VOCABULARY_SETTING = 'stt_vocabulary';
export const MAX_VOCABULARY_TERMS = 200;
export const MAX_VOCABULARY_TERM_CHARS = 60;

/**
 * Whisper's `initial_prompt` shares the text context window, so the rendered
 * prompt is truncated to this many tokens rather than sent whole. Upstream's
 * budget is ~224; 200 leaves room for the framing sentence.
 */
export const MAX_STT_PROMPT_TOKENS = 200;

/**
 * Keep the uploaded audio after a successful transcription?
 *
 * Off by default: the recording is the rawest form of the session that exists,
 * the transcript and the note both survive it, and an app whose premise is
 * that nothing leaves the machine should not leave more on it than it needs.
 */
export const KEEP_AUDIO_SETTING = 'keep_audio';
export const DEFAULT_KEEP_AUDIO = false;

// --- recording limits ------------------------------------------------------

/** Hard stop. A 60-minute recording is ~115 MB of PCM held in the tab. */
export const MAX_RECORDING_SECONDS = 60 * 60;

/**
 * Below this there is nothing to transcribe.
 *
 * A recording this short is a mis-click or a microphone that produced no
 * frames at all — the muted-input case — and saying so beats handing whisper
 * an empty file and reporting whatever it makes of it.
 */
export const MIN_RECORDING_SECONDS = 0.2;

/** Where the UI warns that the recording is getting long, without stopping it. */
export const WARN_RECORDING_SECONDS = 30 * 60;

/**
 * Upload ceiling, checked server-side too — a client is not a guard.
 * The 60-minute cap at 16 kHz mono 16-bit is ~115 MB; this rounds up.
 */
export const MAX_AUDIO_BYTES = 128 * 1024 * 1024;

// --- the live preview during a recording -----------------------------------

/**
 * The provisional text shown while she is still speaking.
 *
 * It exists to answer one question — "is this hearing me?" — and it is not the
 * record: when she stops, the whole file is transcribed once more and *that*
 * transcript is what becomes the note. The preview may therefore revise itself
 * as more speech arrives, which is normal for streaming recognition and the
 * reason nothing downstream reads it.
 *
 * What a refresh costs, measured (2026-09-04, this machine, CPU only): whisper
 * loads its model in ~60 ms; the cost is the encoder, which always works on a
 * padded 30-second window — ~8 s at whisper-cli's default four threads, ~4 s
 * on eight — however short the clip. A resident whisper process would save
 * nothing. Two things do: threads, and an audio context fitted to the clip
 * (`server/src/ai/whisper.ts`), which on real speech gave the identical
 * transcript in under half the time as long as the context covers the audio.
 * So a refresh sends only the last `PREVIEW_WINDOW_SECONDS`, which keeps it
 * at one short pass whatever the recording's length.
 */
/** The first refresh: under a second of speech is a word or two, and that is reassurance. */
export const PREVIEW_FIRST_MS = 800;
/**
 * The gap after a refresh completes is the time that refresh took, clamped
 * between these two: whisper gets at most half the machine, and a fast
 * model or a fast Mac is rewarded with a caption that keeps up, while a
 * slow one simply sees refreshes further apart. Refreshes never overlap.
 * The floor is not lower on purpose: each refresh re-transcribes a slightly
 * different window, so a caption refreshed twice a second jitters — words
 * change under her eyes — where one refreshed every 0.7 s or so reads as
 * live (owner, 2026-09-04, on the small model).
 */
export const PREVIEW_MIN_GAP_MS = 400;
export const PREVIEW_INTERVAL_MS = 5_000;
/**
 * How much of the tail a refresh transcribes: a rolling caption, not a
 * running transcript. Fifteen seconds keeps a couple of sentences on
 * screen; on the small model the longer pass costs a quarter of a second.
 */
export const PREVIEW_WINDOW_SECONDS = 15;

/**
 * After this much audio the preview stops refreshing.
 *
 * Not for cost — a refresh is one short pass whatever the length — but
 * because the preview is reassurance, and four minutes in she has it; what
 * remains would be a laptop running whisper flat out for the rest of an
 * hour's dictation. The screen says it has paused, so a caption that stops
 * moving is not mistaken for a microphone that has.
 */
export const PREVIEW_MAX_SECONDS = 4 * 60;

export const TranscribePreviewResponseSchema = z.object({
  /** Provisional, possibly empty when there is not yet speech to hear. */
  text: z.string(),
  /** Seconds of audio this text came from, for the UI to caption honestly. */
  seconds: z.number().nonnegative(),
});
export type TranscribePreviewResponse = z.infer<typeof TranscribePreviewResponseSchema>;
