import type { AiErrorCode } from '@apunta/shared';

/**
 * A local-AI failure the user can act on.
 *
 * Every code here is a failure mode observed against a real Ollama and
 * catalogued in `docs/research/m3-preflight-2026-08.md` §3 — not a
 * hypothetical, and not an assertion. The message is written for a therapist,
 * not a programmer: it says what happened and what to do about it.
 */
export class AiError extends Error {
  readonly code: AiErrorCode;
  /**
   * Technical context for the server log. Never sent to the browser.
   *
   * **Shape only — never model output, never source text.** A prompt and a
   * draft are the therapist's account of a session, which is real patient
   * material (CLAUDE.md hard rule 2), and this field has two routes to a log
   * file: the provider's own logger, and pino's `err` serializer, which copies
   * every *enumerable* own property of a thrown error onto the record. So it
   * is defined non-enumerable: an `AiError` that escapes to the Fastify error
   * handler cannot print its detail even by accident. Lengths, counts, key
   * names and validation paths carry all the diagnostic value anyway.
   */
  readonly detail: string | undefined;

  constructor(code: AiErrorCode, message: string, detail?: string) {
    super(message);
    this.name = 'AiError';
    this.code = code;
    Object.defineProperty(this, 'detail', { value: detail, enumerable: false, writable: false });
  }
}

/** The exact banner copy from the M3 packet, so the two paths agree. */
export const UNREACHABLE_MESSAGE = "Apunta can't reach the local AI — see Setup";

const MESSAGES: Record<AiErrorCode, string> = {
  ollama_unreachable: `${UNREACHABLE_MESSAGE}. Ollama does not appear to be running on this machine.`,
  model_missing:
    "Apunta's AI model isn't installed yet. Run the setup script to download it, then try again.",
  non_gguf_model:
    'The configured model is not a GGUF build, and Apunta cannot make it follow the note format reliably. Choose a GGUF model in Settings.',
  unsupported_model_tag:
    'That model tag is an MLX/safetensors build. Apunta cannot make those follow the note format reliably — pick a GGUF tag instead.',
  insufficient_memory:
    'This machine ran out of memory loading the AI model. Choose a smaller model in Settings and try again.',
  input_too_long:
    'This session summary is too long for the AI to read in one go. Shorten it, or split it into two notes.',
  context_overflow:
    "The AI ran out of room and had to drop part of Apunta's instructions, so the draft was thrown away. Shorten the summary and try again.",
  output_truncated: 'The AI ran out of room mid-note. Try again, or shorten the summary.',
  empty_response: 'The AI returned nothing. Try again — if it keeps happening, check Setup.',
  invalid_output:
    "The AI returned something that wasn't a note. Try again — if it keeps happening, the model may not be following the note format.",
  degenerate_output:
    'The AI got stuck repeating itself instead of writing the note. Try again — if it keeps happening, try a different model in Settings.',
  timeout: 'The AI took too long to answer. It may still be loading the model — try again in a moment.',
  ollama_error: 'The local AI reported an error. Check Setup, then try again.',

  // Speech-to-text (M5). The recording still exists in the browser when one of
  // these fires, so every message ends somewhere she can act.
  whisper_missing:
    "Apunta can't find whisper on this machine, so it can't transcribe the recording. Run the setup script, or set the whisper path in Settings.",
  whisper_model_missing:
    "Apunta's transcription model isn't installed yet. Run the setup script to download it, then try again.",
  audio_unsupported:
    'That recording is in a format Apunta cannot transcribe. Record it again from this screen.',
  audio_decode_failed:
    'The recording could not be read — it may have been cut off mid-save. Please record it again.',
  transcription_failed: 'Transcribing the recording failed. Try again — if it keeps happening, check Setup.',
  transcription_timeout:
    'Transcribing took too long and was stopped. A shorter recording will go through; a very long one may need a faster machine.',
  transcription_empty:
    'No speech was picked up in that recording. Check that the right microphone is selected, then record again.',
};

export function aiError(code: AiErrorCode, detail?: string): AiError {
  return new AiError(code, MESSAGES[code], detail);
}

/**
 * `fetch` rejects with a useless `TypeError: fetch failed`; the reason is on
 * `cause.code`. A refused connection is Ollama not running, which is by far
 * the most common state on a machine that has not been set up yet.
 */
const CONNECTION_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENOTFOUND',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

export function isConnectionFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const cause = (error as { cause?: { code?: unknown } }).cause;
  return typeof cause?.code === 'string' && CONNECTION_CODES.has(cause.code);
}
