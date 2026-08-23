import { describe, expect, it } from 'vitest';

import {
  AUDIO_SAMPLE_RATE,
  encodeWav,
  floatToPcm16,
  parseWavHeader,
  WAV_HEADER_BYTES,
  WavFormatError,
  wavHeader,
} from './wav.js';

/**
 * The browser writes these bytes and the server reads them, so the round trip
 * is the contract. Everything ffmpeg used to do for M5 — container, sample
 * rate, and the duration `ffprobe` reported — is now these ~150 lines.
 */

function pcm(samples: number[]): Int16Array {
  return Int16Array.from(samples);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

describe('floatToPcm16', () => {
  it('scales full-scale samples to the ends of the range', () => {
    const converted = floatToPcm16(Float32Array.from([0, 1, -1, 0.5]));
    expect([...converted]).toEqual([0, 32_767, -32_768, 16_384]);
  });

  /**
   * The bug this exists for: without clamping, 1.2 × 32767 overflows Int16 and
   * wraps to a large *negative* sample — a click in the middle of the speech
   * whisper is being asked to read, not a quiet clip.
   */
  it('clamps out-of-range samples instead of wrapping them', () => {
    const converted = floatToPcm16(Float32Array.from([1.4, -2.7, 1e9]));
    expect([...converted]).toEqual([32_767, -32_768, 32_767]);
  });
});

describe('wavHeader', () => {
  it('writes a 44-byte RIFF/WAVE header for 16 kHz mono 16-bit', () => {
    const header = wavHeader(3200);
    const view = new DataView(header.buffer);

    expect(header).toHaveLength(WAV_HEADER_BYTES);
    expect(ascii(header, 0, 4)).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(36 + 3200);
    expect(ascii(header, 8, 4)).toBe('WAVE');
    expect(ascii(header, 12, 4)).toBe('fmt ');
    expect(view.getUint32(16, true)).toBe(16);
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(AUDIO_SAMPLE_RATE);
    expect(view.getUint32(28, true)).toBe(AUDIO_SAMPLE_RATE * 2); // byte rate
    expect(view.getUint16(32, true)).toBe(2); // block align
    expect(view.getUint16(34, true)).toBe(16);
    expect(ascii(header, 36, 4)).toBe('data');
    expect(view.getUint32(40, true)).toBe(3200);
  });
});

describe('encodeWav → parseWavHeader', () => {
  it('round-trips the format and the samples', () => {
    const wav = encodeWav(pcm([0, 1000, -1000, 32_767]));
    const format = parseWavHeader(wav);

    expect(format.sampleRate).toBe(AUDIO_SAMPLE_RATE);
    expect(format.channels).toBe(1);
    expect(format.bitsPerSample).toBe(16);
    expect(format.dataBytes).toBe(8);
    expect(format.dataOffset).toBe(WAV_HEADER_BYTES);

    const samples = new DataView(wav.buffer, WAV_HEADER_BYTES);
    expect(samples.getInt16(2, true)).toBe(1000);
    expect(samples.getInt16(4, true)).toBe(-1000);
  });

  /** The ffprobe replacement: duration is byte length ÷ byte rate, exactly. */
  it('reports duration from the data chunk, not from a probe', () => {
    const oneSecond = encodeWav(new Int16Array(AUDIO_SAMPLE_RATE));
    expect(parseWavHeader(oneSecond).durationSeconds).toBe(1);

    const tenSeconds = encodeWav(new Int16Array(AUDIO_SAMPLE_RATE * 10));
    expect(parseWavHeader(tenSeconds).durationSeconds).toBe(10);
  });

  it('reads a header written at another sample rate', () => {
    const wav = encodeWav(new Int16Array(48_000 * 2), 48_000, 2);
    const format = parseWavHeader(wav);

    expect(format.sampleRate).toBe(48_000);
    expect(format.channels).toBe(2);
    // 48000 stereo frames' worth of samples is one second of stereo audio.
    expect(format.durationSeconds).toBe(1);
  });
});

describe('parseWavHeader', () => {
  it('needs only the head of the file, with the size taken from the stat', () => {
    const wav = encodeWav(new Int16Array(AUDIO_SAMPLE_RATE * 5));
    const head = wav.slice(0, 4096);

    expect(parseWavHeader(head, wav.length).durationSeconds).toBe(5);
  });

  it('walks past chunks it does not know, including odd-sized ones', () => {
    const body = encodeWav(pcm([1, 2, 3, 4]));
    // A 3-byte LIST chunk (plus its pad byte) spliced in after "WAVE".
    const extra = new Uint8Array(12);
    extra.set([0x4c, 0x49, 0x53, 0x54], 0); // "LIST"
    new DataView(extra.buffer).setUint32(4, 3, true);
    const wav = new Uint8Array(body.length + extra.length);
    wav.set(body.slice(0, 12), 0);
    wav.set(extra, 12);
    wav.set(body.slice(12), 12 + extra.length);

    expect(parseWavHeader(wav).dataBytes).toBe(8);
  });

  it('treats a zero-length data chunk as "the rest of the file"', () => {
    const wav = encodeWav(new Int16Array(AUDIO_SAMPLE_RATE));
    new DataView(wav.buffer).setUint32(40, 0, true);

    expect(parseWavHeader(wav).durationSeconds).toBe(1);
  });

  /**
   * The non-WAV rejection. `MediaRecorder`'s webm/opus is what a browser hands
   * you by default and what whisper.cpp cannot read at all, so it has to fail
   * here — loudly, with a typed error — rather than reach a child process.
   */
  it('rejects a WebM upload', () => {
    const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(() => parseWavHeader(webm)).toThrow(WavFormatError);
  });

  it('rejects a file too short to hold a header', () => {
    expect(() => parseWavHeader(new Uint8Array([0x52, 0x49]))).toThrow(WavFormatError);
  });

  it('rejects a WAV with no data chunk', () => {
    const wav = encodeWav(pcm([1]));
    expect(() => parseWavHeader(wav.slice(0, 40))).toThrow(WavFormatError);
  });

  it('rejects a compressed format tag', () => {
    const wav = encodeWav(pcm([1, 2]));
    new DataView(wav.buffer).setUint16(20, 0x0011, true); // IMA ADPCM
    expect(() => parseWavHeader(wav)).toThrow(WavFormatError);
  });
});
