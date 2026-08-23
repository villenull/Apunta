/**
 * RIFF/WAVE, written by the browser and read by the server.
 *
 * This is the whole reason Apunta needs no ffmpeg. `whisper-cli` decodes
 * through miniaudio, which handles WAV/MP3/FLAC/Ogg-Vorbis but **not** Opus or
 * the WebM container — exactly what `MediaRecorder` emits. Chrome will however
 * give us a 16 kHz mono audio graph directly (`new AudioContext({ sampleRate:
 * 16000 })`), so the browser writes the 44-byte header itself and the server
 * spawns whisper on the file as it arrives. No transcode, no ffmpeg, no
 * ffprobe (`docs/research/m8-bundling-2026-08.md` §3.4).
 *
 * Writer and reader live in the same file on purpose: the format is the
 * contract between them, and one round-trip test holds both halves to it.
 */

/** What whisper.cpp works in natively (`WHISPER_SAMPLE_RATE`). */
export const AUDIO_SAMPLE_RATE = 16_000;
export const AUDIO_CHANNELS = 1;
export const AUDIO_BITS_PER_SAMPLE = 16;

/** `RIFF` + `WAVE` + a 16-byte `fmt ` chunk + the `data` header. */
export const WAV_HEADER_BYTES = 44;

/** `audio/wav` — the only content type `POST /api/transcribe` accepts. */
export const WAV_CONTENT_TYPE = 'audio/wav';

/** WAVE format tags. Anything else is rejected rather than guessed at. */
const FORMAT_PCM = 1;
const FORMAT_IEEE_FLOAT = 3;
/** `WAVE_FORMAT_EXTENSIBLE`: the real tag is the first 2 bytes of the extension. */
const FORMAT_EXTENSIBLE = 0xfffe;

export class WavFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WavFormatError';
  }
}

export interface WavFormat {
  readonly sampleRate: number;
  readonly channels: number;
  readonly bitsPerSample: number;
  /** Bytes of PCM payload, per the `data` chunk. */
  readonly dataBytes: number;
  /** Where the payload starts, so a reader can seek past the header. */
  readonly dataOffset: number;
  /** `dataBytes / byteRate`, exact — this is what replaces `ffprobe`. */
  readonly durationSeconds: number;
}

/**
 * Float frames from the audio graph to 16-bit PCM.
 *
 * Clamping is not decoration: a sample slightly outside [-1, 1] (a limiter
 * overshoot, a resampler ripple) wraps around to full-scale of the opposite
 * sign in two's complement, which is an audible click on top of the speech
 * whisper is trying to read.
 */
export function floatToPcm16(frames: Float32Array): Int16Array {
  const pcm = new Int16Array(frames.length);
  for (let i = 0; i < frames.length; i += 1) {
    const sample = frames[i] ?? 0;
    const clamped = sample > 1 ? 1 : sample < -1 ? -1 : sample;
    // Asymmetric on purpose: Int16 runs -32768..32767, so -1 and +1 both map
    // inside the range rather than +1 wrapping to -32768.
    pcm[i] = Math.round(clamped * (clamped < 0 ? 32_768 : 32_767));
  }
  return pcm;
}

/** The 44-byte header for a PCM payload of `dataBytes`. */
export function wavHeader(
  dataBytes: number,
  sampleRate: number = AUDIO_SAMPLE_RATE,
  channels: number = AUDIO_CHANNELS,
): Uint8Array<ArrayBuffer> {
  const header = new Uint8Array(WAV_HEADER_BYTES);
  const view = new DataView(header.buffer);
  const bytesPerFrame = (channels * AUDIO_BITS_PER_SAMPLE) / 8;

  ascii(header, 0, 'RIFF');
  // Everything after this field: the 4-byte "WAVE" tag, the 24-byte fmt chunk,
  // the 8-byte data header, and the payload.
  view.setUint32(4, 36 + dataBytes, true);
  ascii(header, 8, 'WAVE');

  ascii(header, 12, 'fmt ');
  view.setUint32(16, 16, true); // PCM fmt chunks are 16 bytes.
  view.setUint16(20, FORMAT_PCM, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerFrame, true); // byte rate
  view.setUint16(32, bytesPerFrame, true); // block align
  view.setUint16(34, AUDIO_BITS_PER_SAMPLE, true);

  ascii(header, 36, 'data');
  view.setUint32(40, dataBytes, true);
  return header;
}

/** Header + samples, as one buffer ready to be POSTed. */
export function encodeWav(
  pcm: Int16Array,
  sampleRate: number = AUDIO_SAMPLE_RATE,
  channels: number = AUDIO_CHANNELS,
): Uint8Array<ArrayBuffer> {
  const dataBytes = pcm.length * 2;
  const wav = new Uint8Array(WAV_HEADER_BYTES + dataBytes);
  wav.set(wavHeader(dataBytes, sampleRate, channels), 0);
  // Copy through a byte view so the result is little-endian on any host.
  const view = new DataView(wav.buffer, WAV_HEADER_BYTES);
  for (let i = 0; i < pcm.length; i += 1) view.setInt16(i * 2, pcm[i] ?? 0, true);
  return wav;
}

/**
 * Read the header of an uploaded file.
 *
 * `bytes` need only be the first few KB: chunk walking stops at `data`, and
 * `totalBytes` (from a `stat`) is what bounds the payload. A `data` size of 0
 * or 0xFFFFFFFF — what a streaming writer leaves behind — falls back to "the
 * rest of the file", which is the honest reading of it.
 */
export function parseWavHeader(bytes: Uint8Array, totalBytes: number = bytes.length): WavFormat {
  if (bytes.length < 12) throw new WavFormatError('file is too short to be a WAV');
  if (readAscii(bytes, 0, 4) !== 'RIFF' || readAscii(bytes, 8, 4) !== 'WAVE') {
    throw new WavFormatError('not a RIFF/WAVE file');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let formatTag = 0;

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = readAscii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;

    if (id === 'fmt ') {
      if (body + 16 > bytes.length) throw new WavFormatError('truncated fmt chunk');
      formatTag = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bitsPerSample = view.getUint16(body + 14, true);
      if (formatTag === FORMAT_EXTENSIBLE && body + 26 <= bytes.length) {
        formatTag = view.getUint16(body + 24, true);
      }
    } else if (id === 'data') {
      if (sampleRate === 0 || channels === 0 || bitsPerSample === 0) {
        throw new WavFormatError('data chunk before a usable fmt chunk');
      }
      if (formatTag !== FORMAT_PCM && formatTag !== FORMAT_IEEE_FLOAT) {
        throw new WavFormatError(`unsupported WAVE format tag ${String(formatTag)}`);
      }
      const available = Math.max(totalBytes - body, 0);
      const declared = size === 0 || size === 0xffffffff ? available : size;
      const dataBytes = Math.min(declared, available);
      const byteRate = (sampleRate * channels * bitsPerSample) / 8;
      if (byteRate <= 0) throw new WavFormatError('fmt chunk describes a zero byte rate');
      return {
        sampleRate,
        channels,
        bitsPerSample,
        dataBytes,
        dataOffset: body,
        durationSeconds: dataBytes / byteRate,
      };
    }

    // RIFF chunks are word-aligned: an odd size is followed by a pad byte.
    offset = body + size + (size % 2);
  }

  throw new WavFormatError('no data chunk found');
}

function ascii(target: Uint8Array, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) target[offset + i] = text.charCodeAt(i);
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  let text = '';
  for (let i = 0; i < length; i += 1) text += String.fromCharCode(bytes[offset + i] ?? 0);
  return text;
}
