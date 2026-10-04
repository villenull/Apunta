/**
 * One real transcription through the shipped `WhisperCppSttProvider`, as
 * EOD English readiness evidence (AM-198 model, P3.1 Linux resource binary).
 *
 * What this is *not*: it is not a replacement for the native integration tests
 * (still dependency-held), not a card approval, not a benchmark, and not a
 * quality claim. It is one invocation, recorded exactly as it happened.
 *
 * Fidelity rules this harness holds itself to, because each one is a way the
 * proof could have been faked without anyone noticing:
 *
 *  - the shipped provider is imported from `server/src/ai/whisper.ts`, not
 *    reimplemented, and there is no `spawnImpl`, no `threads`, no `timeoutMs`
 *    and no `resolveLanguage` override: the command line is the production one
 *    (whisper's own beam search and fallbacks, `availableParallelism()` threads,
 *    `timeoutFor(durationSeconds)`, and `DEFAULT_STT_LANGUAGE`);
 *  - `log` is wired up because it is the provider's documented shape-only
 *    diagnostic hook. It changes no behaviour and returns no transcript text.
 *  - exactly one `transcribe()` call. There is no retry, no second pass and no
 *    "try the preview mode instead" branch: a failure is reported, not repaired.
 *  - the watchdog cleans up through the iterator, which is what runs the
 *    provider's own `finally` (SIGKILL to its child). Nothing is pattern-killed.
 *
 * `console` is avoided deliberately: every line goes to `process.stdout.write`
 * so the captured stream is exactly this process's output and nothing is
 * interleaved or reformatted on the way out.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { DEFAULT_STT_LANGUAGE, parseWavHeader } from '@apunta/shared';

import { WhisperCppSttProvider } from '../../server/src/ai/whisper.js';

const ROOT = resolve(import.meta.dirname, '..', '..');

const BINARY = join(ROOT, 'build', 'linux-resources', 'bin', 'whisper-cli');
const MODEL = join(ROOT, 'build', 'eod-model-cache', 'models', 'ggml-tiny.en.bin');
const WAV = '/tmp/apunta-v2/2026-10-03T22-37-12-589Z-2b44c153/audio-en/dictation-30s.wav';

/**
 * A safety net above the provider's own budget (`timeoutFor(10s)` is 180_000 ms),
 * never a substitute for it. If it ever fires the run is reported as a timeout.
 *
 * Copied unchanged from the a749 tone run, so with this 30 s input the watchdog
 * (300_000 ms) now coincides with `timeoutFor(30)` rather than sitting above it.
 */
const WATCHDOG_MS = 300_000;

interface Emitted {
  readonly kind: string;
  readonly [key: string]: unknown;
}

const emitted: Emitted[] = [];

function emit(entry: Emitted): void {
  emitted.push(entry);
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

async function main(): Promise<void> {
  emit({
    kind: 'environment',
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    fakeAi: process.env['APUNTA_FAKE_AI'] ?? null,
    defaultSttLanguage: DEFAULT_STT_LANGUAGE,
  });

  const bytes = readFileSync(WAV);
  const format = parseWavHeader(bytes, bytes.length);

  for (const [role, path] of [
    ['input', WAV],
    ['model', MODEL],
    ['binary', BINARY],
  ] as const) {
    emit({ kind: 'artifact', role, path, sha256: sha256(path), bytes: readFileSync(path).length });
  }

  emit({
    kind: 'wav',
    path: WAV,
    sha256: sha256(WAV),
    bytes: bytes.length,
    sampleRate: format.sampleRate,
    channels: format.channels,
    bitsPerSample: format.bitsPerSample,
    durationSeconds: format.durationSeconds,
  });

  const provider = new WhisperCppSttProvider({
    resolveBinary: () => BINARY,
    resolveModel: () => MODEL,
    log: (message, detail) => {
      emit({ kind: 'provider_log', message, detail });
    },
  });

  const described = await provider.describe();
  emit({ kind: 'describe', ...described });

  if (!described.binaryPresent || !described.modelPresent) {
    emit({ kind: 'aborted', reason: 'describe_reported_absent_binary_or_model' });
    process.exitCode = 1;
    return;
  }

  const started = Date.now();
  // Cancellation goes through the provider's own shipped path — the same
  // `signal` a closing browser tab sends — which SIGKILLs the whisper child this
  // process started. Own pid only: no pkill, no pattern match, nothing that
  // could reach another process on the machine.
  const abort = new AbortController();
  let watchdogFired = false;
  const watchdog = setTimeout(() => {
    watchdogFired = true;
    emit({ kind: 'watchdog_fired', afterMs: Date.now() - started });
    abort.abort();
  }, WATCHDOG_MS);
  watchdog.unref();

  let transcript: string | null = null;
  let progressFrames = 0;
  try {
    for await (const event of provider.transcribe({
      wavPath: WAV,
      durationSeconds: format.durationSeconds,
      vocabulary: [],
      signal: abort.signal,
    })) {
      if (event.type === 'progress') {
        progressFrames += 1;
        emit({ kind: 'stt_event', type: event.type, fraction: event.fraction, message: event.message });
      } else {
        transcript = event.text;
        emit({ kind: 'stt_event', type: event.type, text: event.text });
      }
    }
  } catch (error) {
    emit({
      kind: 'failed',
      elapsedMs: Date.now() - started,
      code: (error as { code?: string }).code ?? null,
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
    });
    clearTimeout(watchdog);
    process.exitCode = 1;
    return;
  }
  clearTimeout(watchdog);

  if (watchdogFired) {
    emit({ kind: 'result', progressFrames, transcript, timedOut: true, elapsedMs: Date.now() - started });
    process.exitCode = 1;
    return;
  }

  emit({
    kind: 'result',
    progressFrames,
    transcript,
    transcriptNonEmpty: typeof transcript === 'string' && transcript !== '',
    elapsedMs: Date.now() - started,
  });
}

await main();