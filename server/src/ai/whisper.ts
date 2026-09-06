import { spawn, type ChildProcess } from 'node:child_process';
import { statSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { basename } from 'node:path';

import { DEFAULT_STT_LANGUAGE, MAX_STT_PROMPT_TOKENS } from '@apunta/shared';

import { aiError } from './errors.js';
import { approximateTokens } from './prompts.js';
import type { SttDescription, SttEvent, SttProvider, TranscribeRequest } from './types.js';

/**
 * The real speech-to-text provider: `whisper-cli` (whisper.cpp) as a child
 * process, reading the WAV the browser recorded.
 *
 * **No ffmpeg, and no transcode.** whisper.cpp decodes through miniaudio and
 * resamples internally, and the browser already hands us 16 kHz mono 16-bit
 * PCM, so the file goes straight to the binary. The packet's ffmpeg step and
 * its `ffprobe` duration probe are both superseded by
 * `docs/research/m8-bundling-2026-08.md` §3.4 — which also explains why this
 * matters beyond tidiness: Homebrew's ffmpeg is GPL-3.0-or-later, and M8 has
 * to ship a signed `.dmg`.
 *
 * Nothing about the audio is logged. A recording is the therapist's account of
 * a session in its rawest form (CLAUDE.md hard rule 2), so the diagnostics
 * this class produces are exit codes, byte counts and classifications —
 * never whisper's stdout, and never a line of stderr verbatim.
 */

/** Fixed cost before the first second of audio: model load, mostly. */
export const TRANSCRIBE_BASE_TIMEOUT_MS = 120_000;

/**
 * Wall-clock budget per second of audio. whisper.cpp Q5 large-v3-turbo runs at
 * roughly 1× real time on a fast CPU (research §3), so 6× is a slow machine
 * having a bad day rather than a limit anyone should hit.
 */
export const TRANSCRIBE_TIMEOUT_FACTOR = 6;

/** How long `whisper-cli --help` gets to prove the binary exists. */
const PROBE_TIMEOUT_MS = 5000;

type Spawn = typeof spawn;

export interface WhisperOptions {
  /** `whisper-cli` on PATH, or an absolute path from Settings. */
  readonly resolveBinary: () => string;
  /** Absolute path of the GGUF model file. */
  readonly resolveModel: () => string;
  /**
   * A smaller model for the live preview only, or null. Read per call like
   * the others. A configured file that is not there falls back to the
   * note's model without a word: the preview must never be the thing that
   * errors.
   */
  readonly resolvePreviewModel?: () => string | null;
  /** `en`, `es`… or `auto`. Read per call. Pinned by default: detection costs every clip a pass. */
  readonly resolveLanguage?: () => string;
  /** Injected by tests; production always uses `node:child_process`. */
  readonly spawnImpl?: Spawn;
  /**
   * Threads for whisper-cli, whose own default is four. Every core is the
   * production answer — on this machine eight halved the encoder's time
   * (2026-09-04) — and tests pin a number so the command line is stable.
   */
  readonly threads?: number;
  /** Overrides the computed timeout. Tests use it; nothing else does. */
  readonly timeoutMs?: number;
  /**
   * Shape-only diagnostics per transcription: seconds of audio, which model,
   * whisper's own timings and its fallback counts. Never a word of the
   * transcript. Found necessary on 2026-09-04, when a 47-second recording
   * took 43 seconds to transcribe and nothing in the log could say why.
   */
  readonly log?: (message: string, detail: Record<string, unknown>) => void;
}

/**
 * The command line, built in one place so the unit tests can read it.
 *
 * Timestamps stay ON, and `parseTranscript` strips them. They were off until
 * 2026-09-05, "because we want prose, not a subtitle file" — and on a real
 * 83-second dictation that mode dropped a whole sentence, the plan decision
 * ("we talked about dropping to every other week, actually no, hold on"),
 * while the same model on the same file with timestamps kept every word.
 * `--no-timestamps` is a different decoding, not a different print-out.
 * `--print-progress` because it is the only progress signal whisper.cpp emits
 * and a 20-minute dictation must not look like a hang; `--prompt` because
 * medication names are Whisper's known weak spot and vocabulary biasing is the
 * one knob it offers.
 */
export function buildWhisperArgs(input: {
  readonly modelPath: string;
  readonly wavPath: string;
  readonly prompt?: string | undefined;
  readonly threads?: number | undefined;
  /** Only the live preview sets this; see `previewAudioContext`. */
  readonly audioContext?: number | undefined;
  /** A language code, or `auto` to let whisper detect it per clip. */
  readonly language?: string | undefined;
  /**
   * Greedy decoding — one beam, one candidate, no temperature fallback — for
   * the preview only. The note's transcript keeps whisper's beam search and
   * its retries; a rough caption does not need them and reads sooner without
   * them. The fallback was measured on a live dictation: a three-second clip
   * right after a commit failed whisper's probability check, ran five hotter
   * retries and took 3.9 s instead of 0.3 s — and what a hot retry produces
   * on a clip that short is noise, shown until the next refresh replaced it.
   */
  readonly greedy?: boolean | undefined;
}): string[] {
  const args = ['--model', input.modelPath, '--file', input.wavPath, '--print-progress'];
  const prompt = (input.prompt ?? '').trim();
  if (prompt !== '') args.push('--prompt', prompt);
  if (input.threads !== undefined) args.push('--threads', String(input.threads));
  if (input.audioContext !== undefined) args.push('--audio-ctx', String(input.audioContext));
  if (input.language !== undefined) args.push('--language', input.language);
  if (input.greedy === true) args.push('--beam-size', '1', '--best-of', '1', '--no-fallback');
  return args;
}

/** Whisper's encoder frames per second of audio: 1500 for its 30-second window. */
const AUDIO_CONTEXT_PER_SECOND = 50;
const AUDIO_CONTEXT_FULL = 1500;
/** Below this the decoder loops on short clips — measured, see `previewAudioContext`. */
const AUDIO_CONTEXT_MIN = 384;
/** Seconds of headroom over the clip. Two was not enough at five seconds; three is. */
const AUDIO_CONTEXT_MARGIN_SECONDS = 3;

/**
 * An encoder context fitted to a short clip, for the live preview only.
 *
 * Whisper's encoder always processes a padded 30-second window, so a
 * three-second clip costs what a thirty-second one does — ~4 s on this
 * machine's eight threads, and the reason the first words used to take
 * twenty seconds to appear. `--audio-ctx` shrinks the window. Measured on
 * real speech (2026-09-04): with the context covering the audio plus a
 * margin, the transcript was identical to the full window's at under half
 * the time; with the context *shorter* than the audio it hallucinated a
 * repeat. Hence two seconds of margin, a floor, and the full window as the
 * ceiling. The transcript that becomes a note never goes through this.
 *
 * The floor and the margin are both measured, on the same speech: a context
 * too tight for the clip makes the decoder *loop* ("And so my fellow. And so
 * my fellow. And so my fellow.") — 256 looped on 1.5 s and 2.5 s, 320 looped
 * on 5 s, while 384 was clean on all three and 448 on 5 s. Greedy decoding
 * and padding the clip with silence changed nothing; only the context did.
 */
export function previewAudioContext(durationSeconds: number): number {
  const wanted = (durationSeconds + AUDIO_CONTEXT_MARGIN_SECONDS) * AUDIO_CONTEXT_PER_SECOND;
  const rounded = Math.ceil(wanted / 64) * 64;
  return Math.min(AUDIO_CONTEXT_FULL, Math.max(AUDIO_CONTEXT_MIN, rounded));
}

/**
 * The vocabulary list, rendered as Whisper's `initial_prompt`.
 *
 * Whisper biases toward words it has just "seen", so the prompt is a plain
 * sentence naming the terms rather than a config block. It shares the text
 * context window with the transcript, so it is truncated by whole terms to
 * `MAX_STT_PROMPT_TOKENS` — an over-long prompt is silently cut mid-word by
 * whisper.cpp otherwise, which is how a truncation bug hides.
 */
/**
 * The first words whisper reads, before any audio.
 *
 * Whisper writes in the style of its prompt. Left empty, the timestamped
 * decoding of a real dictation came back entirely lowercase without a single
 * full stop (2026-09-05); with one punctuated, capitalised sentence in front
 * it came back as prose. The sentence is deliberately empty of content — no
 * clinical term, no name — so it can bias style and nothing else.
 */
export const STT_LEAD_IN = "Okay, notes from today's session.";

/** The lead-in, then her vocabulary if she has any. Never empty. */
export function sttPrompt(vocabulary: readonly string[]): string {
  const terms = buildVocabularyPrompt(vocabulary);
  return terms === '' ? STT_LEAD_IN : `${STT_LEAD_IN} ${terms}`;
}

export function buildVocabularyPrompt(vocabulary: readonly string[]): string {
  const terms = vocabulary.map((term) => term.trim()).filter((term) => term !== '');
  if (terms.length === 0) return '';

  const lead = 'Clinical terms that may come up:';
  const kept: string[] = [];
  for (const term of terms) {
    const candidate = `${lead} ${[...kept, term].join(', ')}.`;
    if (approximateTokens(candidate) > MAX_STT_PROMPT_TOKENS) break;
    kept.push(term);
  }
  if (kept.length === 0) return '';
  return `${lead} ${kept.join(', ')}.`;
}

/** whisper.cpp's progress callback: `progress =  40%`, on stderr. */
const PROGRESS_PATTERN = /progress\s*=\s*(\d{1,3})\s*%/g;

/** A timestamped segment, in case `--no-timestamps` ever stops being honoured. */
const TIMESTAMP_PREFIX = /^\[[\d:.]+\s*-->\s*[\d:.]+\]\s*/;

/** whisper's non-speech annotations: `[BLANK_AUDIO]`, `(music)`, `[ Silence ]`. */
const NON_SPEECH_LINE = /^(\[[^\]]*\]|\([^)]*\))$/;

/** stdout → the transcript, with whisper's own furniture removed. */
export function parseTranscript(stdout: string): string {
  return stdout
    .split('\n')
    .map((line) => line.replace(TIMESTAMP_PREFIX, '').trim())
    .filter((line) => line !== '' && !NON_SPEECH_LINE.test(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * whisper.cpp's closing timings on stderr, as numbers: `fallbacks = 2 p / 1 h`
 * (temperature retries for low probability and high entropy), and the
 * per-stage milliseconds. A recording that takes far longer than its encoder
 * passes should is explained by these, and by nothing else in the log.
 */
export function parseTimings(stderr: string): Record<string, number> {
  const timings: Record<string, number> = {};
  const fallbacks = /fallbacks\s*=\s*(\d+)\s*p\s*\/\s*(\d+)\s*h/.exec(stderr);
  if (fallbacks) {
    timings['fallbacksLowProbability'] = Number(fallbacks[1]);
    timings['fallbacksHighEntropy'] = Number(fallbacks[2]);
  }
  for (const stage of ['load', 'mel', 'encode', 'decode', 'batchd', 'prompt', 'total']) {
    const match = new RegExp(`${stage} time\\s*=\\s*([\\d.]+) ms`).exec(stderr);
    if (match) timings[`${stage}Ms`] = Math.round(Number(match[1]));
  }
  return timings;
}

/** stderr → progress fractions, in order, deduplicated. */
export function parseProgress(chunk: string): number[] {
  const fractions: number[] = [];
  for (const match of chunk.matchAll(PROGRESS_PATTERN)) {
    const percent = Number(match[1]);
    if (Number.isFinite(percent)) fractions.push(Math.min(Math.max(percent, 0), 100) / 100);
  }
  return fractions;
}

/**
 * What a non-zero exit meant, from the shape of stderr rather than its words.
 *
 * Classifying here — and returning a code, never the text — is what keeps a
 * whisper diagnostic out of the log while still telling the user which of the
 * three things went wrong.
 */
export function classifyFailure(
  stderr: string,
): 'whisper_model_missing' | 'audio_decode_failed' | 'transcription_failed' {
  const text = stderr.toLowerCase();
  if (/failed to (initialize|load).*(model|whisper context)|invalid model|no such file.*ggml/.test(text)) {
    return 'whisper_model_missing';
  }
  if (/failed to (open|read|decode)|unsupported|not a wave|invalid.*(wav|audio)/.test(text)) {
    return 'audio_decode_failed';
  }
  return 'transcription_failed';
}

export class WhisperCppSttProvider implements SttProvider {
  private readonly spawnImpl: Spawn;

  constructor(private readonly options: WhisperOptions) {
    this.spawnImpl = options.spawnImpl ?? spawn;
  }

  /**
   * For `GET /api/health` and M7's setup checklist: is the binary runnable and
   * is the model on disk?
   *
   * "Runnable" is judged by whether the process starts at all, not by its exit
   * code: `whisper-cli --help` exits 0 on some builds and non-zero on others,
   * and the question being asked is only whether the tool is installed.
   */
  async describe(): Promise<SttDescription> {
    const binary = this.options.resolveBinary();
    const model = this.options.resolveModel();
    return {
      binary,
      model,
      binaryPresent: await this.probeBinary(binary),
      modelPresent: fileExists(model),
    };
  }

  async *transcribe(request: TranscribeRequest): AsyncIterable<SttEvent> {
    const binary = this.options.resolveBinary();
    const model = this.options.resolveModel();

    // Checked before the spawn so "the model was never downloaded" — the
    // overwhelmingly common first-run state — is a clear message rather than
    // whichever exit code this whisper build happens to use.
    if (!fileExists(model)) {
      throw aiError('whisper_model_missing', `no model file at the configured path (${model.length} chars)`);
    }
    const previewModel = request.preview === true ? (this.options.resolvePreviewModel?.() ?? null) : null;
    const chosen = previewModel !== null && fileExists(previewModel) ? previewModel : model;

    const prompt = sttPrompt(request.vocabulary);
    const args = buildWhisperArgs({
      modelPath: chosen,
      wavPath: request.wavPath,
      prompt,
      threads: this.options.threads ?? availableParallelism(),
      language: this.options.resolveLanguage?.() ?? DEFAULT_STT_LANGUAGE,
      ...(request.preview === true
        ? { audioContext: previewAudioContext(request.durationSeconds), greedy: true }
        : {}),
    });
    const timeoutMs = this.options.timeoutMs ?? timeoutFor(request.durationSeconds);

    const child = this.spawnImpl(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] as const });
    const events = new EventQueue<SttEvent>();

    let stdout = '';
    let stderr = '';
    let lastFraction = -1;

    const timer = setTimeout(() => {
      events.fail(aiError('transcription_timeout', `no transcript after ${String(timeoutMs)}ms`));
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
      for (const fraction of parseProgress(chunk)) {
        // whisper repeats a percentage across chunk boundaries; only forward
        // movement is worth an SSE frame.
        if (fraction <= lastFraction) continue;
        lastFraction = fraction;
        events.push({ type: 'progress', fraction, message: 'Transcribing…' });
      }
    });

    child.on('error', (error: NodeJS.ErrnoException) => {
      events.fail(
        error.code === 'ENOENT'
          ? aiError('whisper_missing', `spawn ${binary} failed with ENOENT`)
          : aiError('transcription_failed', `spawn failed: ${error.code ?? 'unknown'}`),
      );
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (signal === 'SIGKILL') {
        // The timeout (or a client disconnect) already decided the outcome.
        events.close();
        return;
      }
      if (code !== 0) {
        events.fail(
          aiError(classifyFailure(stderr), `whisper-cli exited ${String(code)} (signal ${String(signal)})`),
        );
        return;
      }
      const text = parseTranscript(stdout);
      if (text === '') {
        events.fail(aiError('transcription_empty', 'whisper-cli exited 0 with no transcript'));
        return;
      }
      // whisper usually reports 100% itself; this is for the builds that stop
      // at 90-something, so the bar never freezes just short of the end.
      if (lastFraction < 1) events.push({ type: 'progress', fraction: 1, message: 'Transcribing…' });
      this.options.log?.('transcription finished', {
        seconds: Math.round(request.durationSeconds),
        preview: request.preview === true,
        model: basename(chosen),
        threads: args[args.indexOf('--threads') + 1] ?? null,
        ...parseTimings(stderr),
      });
      events.push({ type: 'transcript', text });
      events.close();
    });

    try {
      yield* events.drain();
    } finally {
      // The consumer broke out of the loop — she closed the tab, or the draft
      // failed. Leaving whisper chewing on a 40-minute file into a stream
      // nobody reads is exactly the kind of thing that makes a laptop hot.
      clearTimeout(timer);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
  }

  private probeBinary(binary: string): Promise<boolean> {
    return new Promise((resolve) => {
      let child: ChildProcess;
      try {
        child = this.spawnImpl(binary, ['--help'], { stdio: ['ignore', 'ignore', 'ignore'] as const });
      } catch {
        resolve(false);
        return;
      }
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve(false);
      }, PROBE_TIMEOUT_MS);
      const settle = (present: boolean) => () => {
        clearTimeout(timer);
        resolve(present);
      };
      child.on('error', settle(false));
      child.on('close', settle(true));
    });
  }
}

/** The wall-clock budget for one file. Generous; a hung child is the enemy. */
export function timeoutFor(durationSeconds: number): number {
  const audio = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0;
  return TRANSCRIBE_BASE_TIMEOUT_MS + Math.ceil(audio * TRANSCRIBE_TIMEOUT_FACTOR) * 1000;
}

function fileExists(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * A child process is event-driven and an `SttProvider` is an async iterator, so
 * something has to bridge them. Events queue up if the consumer is slow, and a
 * failure is delivered in order rather than thrown out of band — otherwise a
 * spawn error could beat the first `yield` and escape the route's try block.
 */
class EventQueue<T> {
  private readonly items: T[] = [];
  private error: Error | null = null;
  private done = false;
  private wake: (() => void) | null = null;

  push(item: T): void {
    if (this.done) return;
    this.items.push(item);
    this.signal();
  }

  fail(error: Error): void {
    if (this.done) return;
    this.error = error;
    this.done = true;
    this.signal();
  }

  close(): void {
    this.done = true;
    this.signal();
  }

  async *drain(): AsyncIterable<T> {
    for (;;) {
      while (this.items.length > 0) yield this.items.shift() as T;
      if (this.error) throw this.error;
      if (this.done) return;
      await new Promise<void>((resolve) => {
        this.wake = resolve;
      });
    }
  }

  private signal(): void {
    const wake = this.wake;
    this.wake = null;
    wake?.();
  }
}
