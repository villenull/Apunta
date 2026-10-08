import { DEFAULT_LOCALE, type AiErrorCode } from '@apunta/shared';

import { msg, type Locale, type MessageKey } from '../http/locale.js';

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

  /**
   * The locale this failure's sentence is rendered in.
   *
   * It is a field rather than an argument every `aiError()` call has to grow,
   * because most of those calls are deep inside a provider that has no locale
   * to give: they are diagnostics about a failed request, and the route that
   * owns the job re-renders with `inLocale` on the way out (C-LANG@1 rule 4 —
   * the job's captured context, not the provider's guess at it).
   */
  readonly locale: Locale;

  constructor(code: AiErrorCode, message: string, detail?: string, locale: Locale = DEFAULT_LOCALE) {
    super(message);
    this.name = 'AiError';
    this.code = code;
    this.locale = locale;
    Object.defineProperty(this, 'detail', { value: detail, enumerable: false, writable: false });
  }

  /**
   * The same failure, sentence rendered in `locale`.
   *
   * A route calls this on the way to `stream.send('error', …)`, so the `code`
   * the client branches on is untouched and only the words change. Detail
   * travels with it and is still never enumerable.
   */
  inLocale(locale: Locale): AiError {
    if (this.locale === locale) return this;
    return new AiError(this.code, aiMessage(this.code, locale), this.detail, locale);
  }
}

/**
 * The exact banner copy from the M3 packet, so the two paths agree.
 *
 * English, and English on purpose: it is the marker a log line carries and the
 * base for the catalogue lookups below. A sentence a person reads is rendered
 * from the key, not from this constant — `aiMessage` interpolates
 * `ai.unreachable_banner` **in the requested locale**, which is why the es-MX
 * entry is not dead code.
 */
export const UNREACHABLE_MESSAGE = msg('en', 'ai.unreachable_banner');

/**
 * Which catalogue entry each closed `AiErrorCode` is rendered from.
 *
 * A `Record` over the whole enum on purpose: a code added to
 * `AiErrorCodeSchema` without a sentence here is a `tsc` error, not a runtime
 * `undefined` that would reach the browser as a hole. The enum is closed and
 * this card does not open it; a code is never added to make a sentence fit.
 */
const MESSAGE_KEYS: Record<AiErrorCode, MessageKey> = {
  ollama_unreachable: 'ai.ollama_unreachable',
  // Points at the setup notice rather than a command: the packaged app has no
  // Terminal, and the notice is where the models are downloaded.
  model_missing: 'ai.model_missing',
  non_gguf_model: 'ai.non_gguf_model',
  unsupported_model_tag: 'ai.unsupported_model_tag',
  insufficient_memory: 'ai.insufficient_memory',
  input_too_long: 'ai.input_too_long',
  context_overflow: 'ai.context_overflow',
  output_truncated: 'ai.output_truncated',
  empty_response: 'ai.empty_response',
  invalid_output: 'ai.invalid_output',
  degenerate_output: 'ai.degenerate_output',
  timeout: 'ai.timeout',
  ollama_error: 'ai.ollama_error',

  // Speech-to-text (M5). The recording still exists in the browser when one of
  // these fires, so every message ends somewhere she can act.
  whisper_missing: 'ai.whisper_missing',
  whisper_model_missing: 'ai.whisper_model_missing',
  audio_unsupported: 'ai.audio_unsupported',
  audio_decode_failed: 'ai.audio_decode_failed',
  transcription_failed: 'ai.transcription_failed',
  transcription_timeout: 'ai.transcription_timeout',
  transcription_empty: 'ai.transcription_empty',
};

/** The catalogue key an `AiErrorCode`'s sentence comes from. */
export function aiMessageKey(code: AiErrorCode): MessageKey {
  return MESSAGE_KEYS[code];
}

/** The sentence for `code`, in `locale`. */
export function aiMessage(code: AiErrorCode, locale: Locale = DEFAULT_LOCALE): string {
  // The banner is a placeholder of `ai.ollama_unreachable`, so it is looked up
  // in `locale` like every other word in the sentence. Reading it from the
  // English constant here is what made a Spanish `ollama_unreachable` half
  // Spanish — the es-MX entry existed and nothing ever rendered it.
  return msg(locale, MESSAGE_KEYS[code], { banner: msg(locale, 'ai.unreachable_banner') });
}

export function aiError(code: AiErrorCode, detail?: string, locale: Locale = DEFAULT_LOCALE): AiError {
  return new AiError(code, aiMessage(code, locale), detail, locale);
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
