/**
 * Read-only derivation of what the one real invocation was given.
 *
 * Nothing here spawns anything: `detectTrailingSilenceDurationMs` only reads
 * the WAV's own bytes, and `buildWhisperArgs`/`whisperThreads`/`timeoutFor` are
 * pure functions. It exists so the evidence carries the *production* command
 * line, computed from the same shipped code the provider used, instead of an
 * approximation written by hand — and so the run is not repeated to find out
 * whether `--duration` was added. Zero inference.
 */

import { join, resolve } from 'node:path';

import { DEFAULT_STT_LANGUAGE, parseWavHeader } from '@apunta/shared';

import {
  buildWhisperArgs,
  detectTrailingSilenceDurationMs,
  sttPrompt,
  timeoutFor,
  whisperThreads,
} from '../../server/src/ai/whisper.js';

const ROOT = resolve(import.meta.dirname, '..', '..');
const BINARY = join(ROOT, 'build', 'linux-resources', 'bin', 'whisper-cli');
const MODEL = join(ROOT, 'build', 'eod-model-cache', 'models', 'ggml-tiny.en.bin');
const WAV = '/tmp/apunta-v2/2026-10-03T22-37-12-589Z-2b44c153/audio-en/dictation-30s.wav';

const bytes = await import('node:fs').then((fs) => fs.readFileSync(WAV));
const format = parseWavHeader(bytes, bytes.length);
const durationMs = await detectTrailingSilenceDurationMs(WAV, format.durationSeconds);
const threads = whisperThreads(false);

process.stdout.write(
  `${JSON.stringify(
    {
      kind: 'derived_command',
      binary: BINARY,
      argv: [
        BINARY,
        ...buildWhisperArgs({
          modelPath: MODEL,
          wavPath: WAV,
          prompt: sttPrompt([]),
          threads,
          language: DEFAULT_STT_LANGUAGE,
          ...(durationMs === null ? {} : { durationMs }),
        }),
      ],
      derived: {
        durationSeconds: format.durationSeconds,
        trailingSilenceDurationMs: durationMs,
        durationArgApplied: durationMs !== null,
        threads,
        threadPolicy: 'availableParallelism() (authoritative final, preview/fitted unset)',
        language: DEFAULT_STT_LANGUAGE,
        languageSource: 'DEFAULT_STT_LANGUAGE (no resolveLanguage override)',
        prompt: sttPrompt([]),
        promptSource: 'sttPrompt([]) — no Settings vocabulary',
        greedy: false,
        audioContext: null,
        beamSearch: 'whisper.cpp defaults (provider sets beam-size only for previews)',
        timeoutMs: timeoutFor(format.durationSeconds),
        timeoutSource: 'timeoutFor(durationSeconds) (no timeoutMs override)',
      },
    },
    null,
    2,
  )}\n`,
);