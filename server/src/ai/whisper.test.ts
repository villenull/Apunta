import type { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';

import { MAX_STT_PROMPT_TOKENS } from '@apunta/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AiError } from './errors.js';
import { approximateTokens } from './prompts.js';
import type { SttEvent } from './types.js';
import {
  buildVocabularyPrompt,
  buildWhisperArgs,
  classifyFailure,
  parseProgress,
  parseTimings,
  parseTranscript,
  previewAudioContext,
  STT_LEAD_IN,
  sttPrompt,
  timeoutFor,
  TRANSCRIBE_BASE_TIMEOUT_MS,
  whisperThreads,
  WhisperCppSttProvider,
} from './whisper.js';

/**
 * The real STT provider, driven through a fake `spawn`.
 *
 * No whisper.cpp is installed in CI (hard rule 3), and installing one would
 * make this suite prove something about a machine rather than about the code.
 * What is worth asserting is the part we wrote: the command line, the prompt
 * budget, the progress parser against captured whisper output, and which typed
 * error each failure becomes.
 */

/** Real captured shape of `whisper-cli --print-progress` output on stderr. */
const STDERR_SAMPLE = [
  'whisper_init_from_file_with_params_no_state: loading model from ggml-large-v3-turbo-q5_0.bin',
  'whisper_print_progress_callback: progress =  10%',
  'whisper_print_progress_callback: progress =  20%',
  'whisper_print_progress_callback: progress = 100%',
].join('\n');

interface FakeChild extends EventEmitter {
  stdout: PassThrough;
  stderr: PassThrough;
  kill: (signal?: NodeJS.Signals) => boolean;
  killed: boolean;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
}

interface SpawnCall {
  readonly command: string;
  readonly args: readonly string[];
}

function fakeSpawn(drive: (child: FakeChild) => void, calls: SpawnCall[] = []) {
  return ((command: string, args: readonly string[]) => {
    calls.push({ command, args });
    const child = new EventEmitter() as FakeChild;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.exitCode = null;
    child.signalCode = null;
    child.killed = false;
    child.kill = (signal?: NodeJS.Signals) => {
      child.killed = true;
      child.signalCode = signal ?? 'SIGTERM';
      return true;
    };
    setTimeout(() => {
      drive(child);
    }, 0);
    return child;
    // The provider only uses the pipe overload; the cast keeps the fake honest
    // about that rather than reimplementing every `spawn` signature.
  }) as unknown as typeof spawn;
}

let dir: string;
let modelPath: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'apunta-whisper-'));
  modelPath = join(dir, 'ggml-large-v3-turbo-q5_0.bin');
  writeFileSync(modelPath, 'not really a model, but a real file');
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function provider(drive: (child: FakeChild) => void, calls: SpawnCall[] = [], model = () => modelPath) {
  return new WhisperCppSttProvider({
    resolveBinary: () => 'whisper-cli',
    resolveModel: model,
    spawnImpl: fakeSpawn(drive, calls),
    timeoutMs: 2000,
  });
}

async function collect(events: AsyncIterable<SttEvent>): Promise<SttEvent[]> {
  const seen: SttEvent[] = [];
  for await (const event of events) seen.push(event);
  return seen;
}

describe('previewAudioContext', () => {
  it('covers the clip plus a margin, in whisper-cli-friendly steps of 64', () => {
    // Measured 2026-09-04 on real speech: 448 was clean on 5 s where 320
    // looped; 704 was clean on 11 s where 512 hallucinated a repeat.
    expect(previewAudioContext(5)).toBe(448);
    expect(previewAudioContext(11)).toBe(704);
    expect(previewAudioContext(15)).toBe(960);
  });

  it('never goes below the floor the short clips need, or above the full window', () => {
    // 256 looped on 1.5 s and 2.5 s of speech; 384 did not.
    expect(previewAudioContext(1)).toBe(384);
    expect(previewAudioContext(2.5)).toBe(384);
    expect(previewAudioContext(60)).toBe(1500);
  });
});

describe('buildWhisperArgs', () => {
  it('pins the language, and decodes greedily only for a preview', () => {
    const preview = buildWhisperArgs({
      modelPath: '/m.bin',
      wavPath: '/a.wav',
      language: 'en',
      greedy: true,
    });
    expect(preview[preview.indexOf('--language') + 1]).toBe('en');
    expect(preview[preview.indexOf('--beam-size') + 1]).toBe('1');
    expect(preview[preview.indexOf('--best-of') + 1]).toBe('1');
    expect(preview).toContain('--no-fallback');
    const note = buildWhisperArgs({ modelPath: '/m.bin', wavPath: '/a.wav', language: 'auto' });
    expect(note[note.indexOf('--language') + 1]).toBe('auto');
    expect(note).not.toContain('--beam-size');
    expect(note).not.toContain('--no-fallback');
  });

  it('passes the thread count, and a fitted audio context only when given one', () => {
    const args = buildWhisperArgs({ modelPath: '/m.bin', wavPath: '/a.wav', threads: 8, audioContext: 320 });
    expect(args[args.indexOf('--threads') + 1]).toBe('8');
    expect(args[args.indexOf('--audio-ctx') + 1]).toBe('320');
    // The transcript that becomes a note never carries a shrunken context.
    expect(buildWhisperArgs({ modelPath: '/m.bin', wavPath: '/a.wav', threads: 8 })).not.toContain(
      '--audio-ctx',
    );
  });

  it('names the model and the file, asks for prose and for progress', () => {
    const args = buildWhisperArgs({ modelPath: '/m.bin', wavPath: '/a.wav' });

    // Timestamps on: the no-timestamps decoding dropped a sentence of a real dictation (2026-09-05).
    expect(args).toEqual(['--model', '/m.bin', '--file', '/a.wav', '--print-progress']);
    expect(args).not.toContain('--no-timestamps');
  });

  it('passes the vocabulary prompt only when there is one', () => {
    expect(buildWhisperArgs({ modelPath: '/m.bin', wavPath: '/a.wav', prompt: '   ' })).not.toContain(
      '--prompt',
    );

    const args = buildWhisperArgs({ modelPath: '/m.bin', wavPath: '/a.wav', prompt: 'Vraylar, Latuda.' });
    expect(args.at(-2)).toBe('--prompt');
    expect(args.at(-1)).toBe('Vraylar, Latuda.');
  });

  /** No transcode step exists, so nothing may quietly reintroduce one. */
  it('never mentions ffmpeg', () => {
    expect(buildWhisperArgs({ modelPath: '/m.bin', wavPath: '/a.wav' }).join(' ')).not.toMatch(/ffmpeg/i);
  });
});

describe('sttPrompt', () => {
  it('always opens with the punctuated lead-in, and adds her vocabulary after it', () => {
    expect(sttPrompt([])).toBe(STT_LEAD_IN);
    expect(sttPrompt(['Vraylar'])).toBe(`${STT_LEAD_IN} Clinical terms that may come up: Vraylar.`);
    // Style, not content: nothing clinical, nothing that could be heard as a name.
    expect(STT_LEAD_IN).toMatch(/^[A-Z].*\.$/);
  });
});

describe('buildVocabularyPrompt', () => {
  it('renders the terms as a sentence whisper can bias on', () => {
    expect(buildVocabularyPrompt(['Vraylar', 'lamotrigine'])).toBe(
      'Clinical terms that may come up: Vraylar, lamotrigine.',
    );
  });

  it('is empty for an empty list, and ignores blank entries', () => {
    expect(buildVocabularyPrompt([])).toBe('');
    expect(buildVocabularyPrompt(['  ', ''])).toBe('');
    expect(buildVocabularyPrompt([' Latuda '])).toBe('Clinical terms that may come up: Latuda.');
  });

  /**
   * The truncation the packet asks for. Whisper's `initial_prompt` shares the
   * text context window: an over-long one is cut mid-word inside whisper.cpp,
   * where nothing surfaces it. Truncating by whole terms keeps the failure
   * visible in the list rather than hidden in the binary.
   */
  it('truncates a long list to the token budget, on a term boundary', () => {
    const terms = Array.from({ length: 400 }, (_, index) => `medication-name-${String(index)}`);
    const prompt = buildVocabularyPrompt(terms);

    expect(approximateTokens(prompt)).toBeLessThanOrEqual(MAX_STT_PROMPT_TOKENS);
    expect(prompt.endsWith('.')).toBe(true);
    expect(prompt).toContain('medication-name-0,');
    expect(prompt).not.toContain('medication-name-399');
    // Cut between terms, never inside one.
    expect(prompt.slice(0, -1).split(', ').at(-1)).toMatch(/^medication-name-\d+$/);
  });
});

describe('parseTimings', () => {
  it("reads whisper.cpp's closing timings and fallback counts, as numbers", () => {
    const stderr = [
      'whisper_print_timings:     load time =    56.31 ms',
      'whisper_print_timings:     fallbacks =   2 p /   1 h',
      'whisper_print_timings:   encode time =  8441.42 ms /     2 runs (  4220.71 ms per run)',
      'whisper_print_timings:   batchd time =  1200.00 ms /   397 runs (     3.02 ms per run)',
      'whisper_print_timings:    total time = 42743.18 ms',
    ].join('\n');
    expect(parseTimings(stderr)).toEqual({
      loadMs: 56,
      fallbacksLowProbability: 2,
      fallbacksHighEntropy: 1,
      encodeMs: 8441,
      batchdMs: 1200,
      totalMs: 42743,
    });
    expect(parseTimings('nothing here')).toEqual({});
  });
});

describe('parseProgress', () => {
  it('reads whisper.cpp progress callbacks off stderr', () => {
    expect(parseProgress(STDERR_SAMPLE)).toEqual([0.1, 0.2, 1]);
  });

  it('ignores lines that carry no progress', () => {
    expect(parseProgress('whisper_model_load: n_vocab = 51866\n')).toEqual([]);
  });
});

describe('parseTranscript', () => {
  it('joins whisper stdout into one block of prose', () => {
    const stdout = ' Okay, John Smith today.\n He is sleeping better.\n\n';
    expect(parseTranscript(stdout)).toBe('Okay, John Smith today. He is sleeping better.');
  });

  it('drops non-speech annotations and any stray timestamps', () => {
    const stdout = [
      '[00:00:00.000 --> 00:00:03.000]  Sleeping better.',
      '[BLANK_AUDIO]',
      '(soft music)',
    ].join('\n');
    expect(parseTranscript(stdout)).toBe('Sleeping better.');
  });
});

describe('classifyFailure', () => {
  it('recognises a model that will not load', () => {
    expect(classifyFailure('error: failed to initialize whisper context')).toBe('whisper_model_missing');
  });

  it('recognises audio it could not read', () => {
    expect(classifyFailure('error: failed to open the audio file')).toBe('audio_decode_failed');
  });

  it('falls back to a plain failure', () => {
    expect(classifyFailure('segmentation fault')).toBe('transcription_failed');
  });
});

describe('timeoutFor', () => {
  it('scales with the length of the recording', () => {
    expect(timeoutFor(0)).toBe(TRANSCRIBE_BASE_TIMEOUT_MS);
    expect(timeoutFor(600)).toBe(TRANSCRIBE_BASE_TIMEOUT_MS + 3_600_000);
  });
});

describe('whisperThreads', () => {
  it('uses half the scheduler-visible cores for contention work and all for final work', () => {
    const cores = availableParallelism();
    expect(whisperThreads(true)).toBe(Math.max(1, Math.floor(cores / 2)));
    expect(whisperThreads(false)).toBe(cores);
  });
});

describe('WhisperCppSttProvider.transcribe', () => {
  const request = { wavPath: '/tmp/session.wav', durationSeconds: 12, vocabulary: ['Vraylar'] };

  it('streams progress, then the transcript', async () => {
    const calls: SpawnCall[] = [];
    const events = await collect(
      provider((child) => {
        child.stderr.write(STDERR_SAMPLE);
        child.stdout.write(' Sleeping better, fewer intrusive thoughts.\n');
        child.emit('close', 0, null);
      }, calls).transcribe(request),
    );

    expect(events.filter((event) => event.type === 'progress').map((event) => event.fraction)).toEqual([
      0.1, 0.2, 1,
    ]);
    expect(events.at(-1)).toEqual({
      type: 'transcript',
      text: 'Sleeping better, fewer intrusive thoughts.',
    });
    expect(calls[0]?.command).toBe('whisper-cli');
    expect(calls[0]?.args).toContain('--prompt');
    expect(calls[0]?.args[calls[0]?.args.indexOf('--threads') + 1]).toBe(String(whisperThreads(false)));
  });

  it('runs a preview on the smaller model when one is configured and present, and the note on the main one', async () => {
    const small = join(dir, 'ggml-small.bin');
    writeFileSync(small, 'a small model, allegedly');
    const calls: SpawnCall[] = [];
    const stt = new WhisperCppSttProvider({
      resolveBinary: () => 'whisper-cli',
      resolveModel: () => modelPath,
      resolvePreviewModel: () => small,
      spawnImpl: fakeSpawn((child) => {
        child.stdout.write(' words\n');
        child.emit('close', 0, null);
      }, calls),
      timeoutMs: 2000,
    });

    await collect(stt.transcribe({ ...request, preview: true }));
    await collect(stt.transcribe(request));

    const modelOf = (call: SpawnCall | undefined): string | undefined =>
      call?.args[call.args.indexOf('--model') + 1];
    expect(modelOf(calls[0])).toBe(small);
    expect(modelOf(calls[1])).toBe(modelPath);
    // The preview decodes greedily and in the pinned language; the note keeps beam search.
    expect(calls[0]?.args).toContain('--beam-size');
    expect(calls[1]?.args).not.toContain('--beam-size');
    expect(calls[1]?.args).toContain('--language');
    expect(calls[0]?.args[calls[0]?.args.indexOf('--threads') + 1]).toBe(String(whisperThreads(true)));
    expect(calls[1]?.args[calls[1]?.args.indexOf('--threads') + 1]).toBe(String(whisperThreads(false)));
  });

  it('fits the audio context to a dictated clip but keeps the note model, beam search and fallbacks', async () => {
    const small = join(dir, 'ggml-small.bin');
    writeFileSync(small, 'a small model, allegedly');
    const calls: SpawnCall[] = [];
    const stt = new WhisperCppSttProvider({
      resolveBinary: () => 'whisper-cli',
      resolveModel: () => modelPath,
      resolvePreviewModel: () => small,
      spawnImpl: fakeSpawn((child) => {
        child.stdout.write(' words\n');
        child.emit('close', 0, null);
      }, calls),
      timeoutMs: 2000,
    });

    await collect(stt.transcribe({ ...request, durationSeconds: 8, fitted: true }));

    const args = calls[0]?.args ?? [];
    expect(args[args.indexOf('--model') + 1]).toBe(modelPath);
    expect(args).toContain('--audio-ctx');
    expect(args).not.toContain('--beam-size');
    expect(args).not.toContain('--no-fallback');
  });

  it('falls back to the main model, silently, when the preview model is not there', async () => {
    const calls: SpawnCall[] = [];
    const stt = new WhisperCppSttProvider({
      resolveBinary: () => 'whisper-cli',
      resolveModel: () => modelPath,
      resolvePreviewModel: () => join(dir, 'not-downloaded.bin'),
      spawnImpl: fakeSpawn((child) => {
        child.stdout.write(' words\n');
        child.emit('close', 0, null);
      }, calls),
      timeoutMs: 2000,
    });

    const events = await collect(stt.transcribe({ ...request, preview: true }));

    expect(events.at(-1)?.type).toBe('transcript');
    expect(calls[0]?.args).toContain(modelPath);
  });

  it('never moves the progress bar backwards', async () => {
    const events = await collect(
      provider((child) => {
        child.stderr.write('progress =  40%\n');
        child.stderr.write('progress =  40%\nprogress =  30%\n');
        child.stdout.write('Something was said.\n');
        child.emit('close', 0, null);
      }).transcribe(request),
    );

    expect(events.filter((event) => event.type === 'progress').map((event) => event.fraction)).toEqual([
      0.4, 1,
    ]);
  });

  it('maps a missing binary to whisper_missing', async () => {
    const failing = provider((child) => {
      const error = new Error('spawn whisper-cli ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      child.emit('error', error);
    });

    await expect(collect(failing.transcribe(request))).rejects.toMatchObject({
      name: 'AiError',
      code: 'whisper_missing',
    });
  });

  it('maps a missing model file to whisper_model_missing before spawning anything', async () => {
    const calls: SpawnCall[] = [];
    const missing = provider(
      (child) => {
        child.emit('close', 0, null);
      },
      calls,
      () => join(dir, 'not-downloaded.bin'),
    );

    await expect(collect(missing.transcribe(request))).rejects.toMatchObject({
      code: 'whisper_model_missing',
    });
    expect(calls).toHaveLength(0);
  });

  it('maps a non-zero exit to the failure its stderr describes', async () => {
    const failing = provider((child) => {
      child.stderr.write('error: failed to open the audio file\n');
      child.emit('close', 1, null);
    });

    await expect(collect(failing.transcribe(request))).rejects.toMatchObject({
      code: 'audio_decode_failed',
    });
  });

  it('treats a clean exit with no words as transcription_empty', async () => {
    const silent = provider((child) => {
      child.stdout.write('[BLANK_AUDIO]\n');
      child.emit('close', 0, null);
    });

    await expect(collect(silent.transcribe(request))).rejects.toMatchObject({
      code: 'transcription_empty',
    });
  });

  it('kills whisper and reports a timeout when it never finishes', async () => {
    let child: FakeChild | undefined;
    const stuck = new WhisperCppSttProvider({
      resolveBinary: () => 'whisper-cli',
      resolveModel: () => modelPath,
      spawnImpl: fakeSpawn((spawned) => {
        child = spawned;
        spawned.stderr.write('progress =  10%\n');
      }),
      timeoutMs: 30,
    });

    await expect(collect(stuck.transcribe(request))).rejects.toMatchObject({
      code: 'transcription_timeout',
    });
    expect(child?.killed).toBe(true);
  });

  /**
   * The consumer breaking out of the loop — she closed the tab — has to reach
   * the child process. Otherwise whisper keeps grinding through a 40-minute
   * file for a stream nobody is reading.
   */
  it('kills whisper when the consumer stops reading', async () => {
    let child: FakeChild | undefined;
    const running = new WhisperCppSttProvider({
      resolveBinary: () => 'whisper-cli',
      resolveModel: () => modelPath,
      spawnImpl: fakeSpawn((spawned) => {
        child = spawned;
        spawned.stderr.write('progress =  10%\n');
      }),
      timeoutMs: 5000,
    });

    for await (const event of running.transcribe(request)) {
      expect(event.type).toBe('progress');
      break;
    }

    expect(child?.killed).toBe(true);
  });

  it('kills whisper when a preview or dictation request is aborted', async () => {
    let child: FakeChild | undefined;
    const controller = new AbortController();
    const running = new WhisperCppSttProvider({
      resolveBinary: () => 'whisper-cli',
      resolveModel: () => modelPath,
      spawnImpl: fakeSpawn((spawned) => {
        child = spawned;
      }),
      timeoutMs: 5000,
    });

    const events = running.transcribe({ ...request, signal: controller.signal });
    const first = events[Symbol.asyncIterator]();
    const pending = first.next();
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    await pending;
    await first.return?.();

    expect(child?.killed).toBe(true);
  });

  it('throws an AiError, so the route reports it like any other local-AI failure', async () => {
    const failing = provider((child) => {
      child.emit('close', 3, null);
    });

    await expect(collect(failing.transcribe(request))).rejects.toBeInstanceOf(AiError);
  });
});

describe('WhisperCppSttProvider.describe', () => {
  it('reports the binary present when it runs, and the model when it is on disk', async () => {
    const described = await provider((child) => {
      child.emit('close', 0, null);
    }).describe();

    expect(described).toEqual({
      binaryPresent: true,
      modelPresent: true,
      binary: 'whisper-cli',
      model: modelPath,
    });
  });

  it('reports the binary missing when the spawn fails', async () => {
    const described = await provider((child) => {
      child.emit('error', new Error('ENOENT'));
    }).describe();

    expect(described.binaryPresent).toBe(false);
  });

  it('reports the model missing when the file is not there', async () => {
    const described = await provider(
      (child) => {
        child.emit('close', 0, null);
      },
      [],
      () => join(dir, 'absent.bin'),
    ).describe();

    expect(described.modelPresent).toBe(false);
    expect(described.model).toContain('absent.bin');
  });
});
