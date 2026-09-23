import { AUDIO_SAMPLE_RATE, parseWavHeader, WAV_CONTENT_TYPE } from '@apunta/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  classifyMediaError,
  formatTimer,
  PcmBuffer,
  Recorder,
  RecorderError,
  recorderMessage,
  type RecorderHandlers,
} from './recorder.js';

/**
 * The parts of the recorder that are not the browser.
 *
 * The audio graph itself is exercised in Playwright against Chromium's fake
 * microphone; what is worth asserting here is the accounting: that the samples
 * become a WAV the server can read, that the 60-minute cap holds, and that a
 * denied microphone becomes the message that tells her how to fix it.
 */

async function headerOf(blob: Blob): Promise<ReturnType<typeof parseWavHeader>> {
  return parseWavHeader(new Uint8Array(await blob.arrayBuffer()));
}

describe('PcmBuffer', () => {
  it('turns recorded frames into a WAV the server can read', async () => {
    const buffer = new PcmBuffer();
    buffer.push(new Float32Array(AUDIO_SAMPLE_RATE)); // one second
    buffer.push(new Float32Array(AUDIO_SAMPLE_RATE / 2)); // half a second

    const wav = buffer.toWav();
    expect(wav.type).toBe(WAV_CONTENT_TYPE);

    const header = await headerOf(wav);
    expect(header.sampleRate).toBe(AUDIO_SAMPLE_RATE);
    expect(header.channels).toBe(1);
    expect(header.durationSeconds).toBeCloseTo(1.5, 5);
    expect(buffer.seconds).toBeCloseTo(1.5, 5);
  });

  it('can hand over any stretch of seconds, for the growing preview', async () => {
    const buffer = new PcmBuffer();
    buffer.push(new Float32Array(AUDIO_SAMPLE_RATE * 4)); // four seconds
    buffer.push(new Float32Array(AUDIO_SAMPLE_RATE * 2)); // two more

    expect((await headerOf(buffer.toWav({ from: 1, to: 3 }))).durationSeconds).toBeCloseTo(2, 5);
    // A range that straddles the chunk boundary, and one past the end.
    expect((await headerOf(buffer.toWav({ from: 3.5, to: 5 }))).durationSeconds).toBeCloseTo(1.5, 5);
    expect((await headerOf(buffer.toWav({ from: 5, to: 30 }))).durationSeconds).toBeCloseTo(1, 5);
    expect((await headerOf(buffer.toWav())).durationSeconds).toBeCloseTo(6, 5);
  });

  it('finds the pause between two sentences, and the quietest moment when there is none', () => {
    const buffer = new PcmBuffer();
    const loud = (seconds: number): Float32Array => new Float32Array(AUDIO_SAMPLE_RATE * seconds).fill(0.3);
    const quiet = (seconds: number): Float32Array =>
      new Float32Array(AUDIO_SAMPLE_RATE * seconds).fill(0.002);
    buffer.push(loud(2));
    buffer.push(quiet(1)); // a breath, from 2.0 to 3.0
    buffer.push(loud(2));

    const cut = buffer.cutPoint(0, 5) as number;
    expect(cut).toBeGreaterThan(2.3);
    expect(cut).toBeLessThan(2.7);
    // Nothing quiet enough in the first two seconds, so no pause to cut at.
    expect(buffer.cutPoint(0, 1.9)).toBeNull();
    // But a quietest moment always exists.
    expect(buffer.quietestPoint(0, 1.9)).not.toBeNull();
  });

  it('writes whatever rate the browser gave us into the header', async () => {
    // A browser that refuses a 16 kHz context still produces a usable file:
    // whisper.cpp resamples internally, so the rate only has to be honest.
    const buffer = new PcmBuffer(48_000);
    buffer.push(new Float32Array(48_000));

    const header = await headerOf(buffer.toWav());
    expect(header.sampleRate).toBe(48_000);
    expect(header.durationSeconds).toBe(1);
  });

  /**
   * The 60-minute stop. Enforced on the samples, not on the clock: a tab that
   * was asleep, or a timer that drifted, must not be able to hand the server a
   * file bigger than the cap it was promised.
   */
  it('stops accepting audio at the cap', () => {
    const buffer = new PcmBuffer(AUDIO_SAMPLE_RATE, 2);
    buffer.push(new Float32Array(AUDIO_SAMPLE_RATE));
    expect(buffer.full).toBe(false);

    buffer.push(new Float32Array(AUDIO_SAMPLE_RATE * 5));
    expect(buffer.full).toBe(true);
    expect(buffer.seconds).toBe(2);
  });

  it('holds the samples it was given, clamped to 16-bit range', async () => {
    const buffer = new PcmBuffer(AUDIO_SAMPLE_RATE);
    buffer.push(Float32Array.from([0, 1, -1, 4]));

    const wav = new Uint8Array(await buffer.toWav().arrayBuffer());
    const samples = new DataView(wav.buffer, 44);
    expect(samples.getInt16(2, true)).toBe(32_767);
    expect(samples.getInt16(4, true)).toBe(-32_768);
    expect(samples.getInt16(6, true)).toBe(32_767);
  });
});

/**
 * The audio graph, stubbed just enough to drive the real `Recorder`: the
 * browser half is Chromium's fake microphone in Playwright, but the gate
 * between "the worklet is wired" and "a frame counts" is this class's own
 * bookkeeping, and nothing else covers it.
 */
describe('Recorder', () => {
  class FakePort {
    onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
    postMessage(data: unknown): void {
      if (data !== 'flush') return;
      // The real worklet acknowledges once its partial block has crossed.
      queueMicrotask(() => {
        this.onmessage?.({ data: 'flushed' } as MessageEvent<unknown>);
      });
    }

    /** Stand in for the worklet forwarding a block of samples. */
    emit(frames: Float32Array): void {
      this.onmessage?.({ data: frames } as MessageEvent<unknown>);
    }
  }

  const original = {
    AudioWorkletNode: globalThis.AudioWorkletNode,
    AudioContext: globalThis.AudioContext,
  };
  /** The port of the node the last `start()` built. */
  let port: FakePort | null = null;

  beforeEach(() => {
    port = null;
    class FakeAudioWorkletNode {
      readonly port = new FakePort();
      constructor(..._args: unknown[]) {
        port = this.port;
      }
      connect(): void {}
      disconnect(): void {}
    }
    class FakeAudioContext {
      readonly sampleRate = AUDIO_SAMPLE_RATE;
      readonly state = 'running';
      readonly audioWorklet = { addModule: (): Promise<void> => Promise.resolve() };
      createMediaStreamSource(): { connect: () => void } {
        return { connect: () => undefined };
      }
      resume(): Promise<void> {
        return Promise.resolve();
      }
      close(): Promise<void> {
        return Promise.resolve();
      }
    }
    (globalThis as { AudioWorkletNode?: unknown }).AudioWorkletNode = FakeAudioWorkletNode;
    (globalThis as { AudioContext?: unknown }).AudioContext = FakeAudioContext;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () =>
          Promise.resolve({ getTracks: () => [{ stop: () => undefined }], getAudioTracks: () => [] }),
      },
    });
  });

  afterEach(() => {
    (globalThis as { AudioWorkletNode?: unknown }).AudioWorkletNode = original.AudioWorkletNode;
    (globalThis as { AudioContext?: unknown }).AudioContext = original.AudioContext;
    Reflect.deleteProperty(navigator, 'mediaDevices');
  });

  /** A started recorder and the worklet port feeding it. */
  async function started(handlers: RecorderHandlers = {}): Promise<{ recorder: Recorder; port: FakePort }> {
    const recorder = new Recorder(handlers);
    await recorder.start();
    if (port === null) throw new Error('the recorder never built a worklet node');
    return { recorder, port };
  }

  it('keeps the frames that arrive between start and stop', async () => {
    const progress: number[] = [];
    const { recorder, port } = await started({ onProgress: (seconds) => progress.push(seconds) });
    port.emit(new Float32Array(AUDIO_SAMPLE_RATE));
    port.emit(new Float32Array(AUDIO_SAMPLE_RATE / 2));

    expect(progress).toEqual([1, 1.5]);
    expect(recorder.seconds).toBeCloseTo(1.5, 5);
    expect(recorder.snapshot()).not.toBeNull();

    const wav = await recorder.stop();
    expect((await headerOf(wav)).durationSeconds).toBeCloseTo(1.5, 5);
  });

  it('drops frames that arrive after stop', async () => {
    const { recorder, port } = await started();
    port.emit(new Float32Array(AUDIO_SAMPLE_RATE));
    const wav = await recorder.stop();
    expect((await headerOf(wav)).durationSeconds).toBeCloseTo(1, 5);

    // A frame the worklet sends after the flush boundary is not in the file.
    port.emit(new Float32Array(AUDIO_SAMPLE_RATE));
    expect(recorder.seconds).toBeCloseTo(1, 5);
  });
});

describe('classifyMediaError', () => {
  it('reads the DOMException names getUserMedia actually throws', () => {
    expect(classifyMediaError(new DOMException('denied', 'NotAllowedError'))).toBe('permission');
    expect(classifyMediaError(new DOMException('none', 'NotFoundError'))).toBe('no-device');
    expect(classifyMediaError(new DOMException('busy', 'NotReadableError'))).toBe('lost-device');
    expect(classifyMediaError(new Error('something else'))).toBe('failed');
  });
});

describe('recorderMessage', () => {
  it('tells her what to do about a refused microphone', () => {
    const message = recorderMessage(new RecorderError('permission', 'denied'));
    expect(message).toContain('permission to use the microphone');
  });

  it('falls back to the general message for anything unrecognised', () => {
    expect(recorderMessage(new Error('boom'))).toContain('could not be started');
  });

  /** Hard rule 1: the alternative to recording is typing, never Web Speech. */
  it('points an unsupported browser at typing, not at a browser API', () => {
    const message = recorderMessage(new RecorderError('unsupported', 'no worklet'));
    expect(message).toContain('Type the summary instead');
  });
});

describe('formatTimer', () => {
  it('matches the prototype: mm:ss, zero-padded', () => {
    expect(formatTimer(0)).toBe('00:00');
    expect(formatTimer(14)).toBe('00:14');
    expect(formatTimer(75.9)).toBe('01:15');
    expect(formatTimer(3600)).toBe('60:00');
  });
});
