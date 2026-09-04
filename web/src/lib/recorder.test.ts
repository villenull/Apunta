import { AUDIO_SAMPLE_RATE, parseWavHeader, WAV_CONTENT_TYPE } from '@apunta/shared';
import { describe, expect, it } from 'vitest';

import { classifyMediaError, formatTimer, PcmBuffer, RecorderError, recorderMessage } from './recorder.js';

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

  it('can hand over just the tail, for the rolling preview', async () => {
    const buffer = new PcmBuffer();
    buffer.push(new Float32Array(AUDIO_SAMPLE_RATE * 4)); // four seconds
    buffer.push(new Float32Array(AUDIO_SAMPLE_RATE * 2)); // two more

    expect((await headerOf(buffer.toWav(3))).durationSeconds).toBeCloseTo(3, 5);
    // Asking for more than there is gives what there is.
    expect((await headerOf(buffer.toWav(30))).durationSeconds).toBeCloseTo(6, 5);
    // And the untailed WAV is still everything.
    expect((await headerOf(buffer.toWav())).durationSeconds).toBeCloseTo(6, 5);
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
