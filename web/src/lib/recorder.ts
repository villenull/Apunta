import {
  AUDIO_SAMPLE_RATE,
  encodeWav,
  floatToPcm16,
  MAX_RECORDING_SECONDS,
  MIN_RECORDING_SECONDS,
  WAV_CONTENT_TYPE,
} from '@apunta/shared';

/**
 * Recording a session, in the browser, without ever touching the Web Speech
 * API — the hardest rule in this project, because Chrome's default mode ships
 * the audio to Google (CLAUDE.md hard rule 1).
 *
 * `getUserMedia` → `new AudioContext({ sampleRate: 16000 })` →
 * `AudioWorkletNode` → Int16 → a 44-byte RIFF header → one `Blob` POSTed to
 * `/api/transcribe`. `MediaRecorder` is deliberately unused: it emits
 * webm/opus, which is the one container whisper.cpp cannot read, and the whole
 * point of this file is that no transcoder exists anywhere in the app
 * (`docs/research/m8-bundling-2026-08.md` §3.4).
 */

/** The worklet module, copied verbatim into the bundle from `web/public/`. */
const WORKLET_URL = '/pcm-worklet.js';
const WORKLET_NAME = 'pcm-forwarder';

/**
 * How long `stop()` waits for the worklet's `'flushed'` acknowledgement.
 *
 * The ack is normally a round-trip across the port, well under a frame. If the
 * worklet or its context has died — a `processorerror`, a closed context, a
 * device lost after the graph was torn — the ack never comes, and waiting
 * forever would strand the recording in memory with the UI stuck on it. After
 * this bound, whatever is buffered becomes the file. Injectable for tests.
 */
export const FLUSH_TIMEOUT_MS = 1000;

export type RecorderFailure =
  /** She said no to the microphone prompt, or the browser blocks it. */
  | 'permission'
  /** No input device at all. */
  | 'no-device'
  /** The device went away mid-recording — unplugged, or taken by another app. */
  | 'lost-device'
  /** This browser has no AudioWorklet, so there is no private way to record. */
  | 'unsupported'
  /** Anything else the audio stack reported. */
  | 'failed';

export class RecorderError extends Error {
  readonly reason: RecorderFailure;

  constructor(reason: RecorderFailure, message: string) {
    super(message);
    this.name = 'RecorderError';
    this.reason = reason;
  }
}

/** What the user is told, per failure. Every one of them ends somewhere to go. */
const MESSAGES: Record<RecorderFailure, string> = {
  permission:
    'Apunta needs permission to use the microphone. Allow it in your browser, then start the recording again.',
  'no-device': 'No microphone was found. Connect one, then start the recording again.',
  'lost-device': 'The microphone stopped part-way through. Check it is still connected and record again.',
  unsupported: 'This browser cannot record audio privately. Type the summary instead, or use Chrome.',
  failed: 'The recording could not be started. Check your microphone, then try again.',
};

export function recorderMessage(error: unknown): string {
  return error instanceof RecorderError ? MESSAGES[error.reason] : MESSAGES.failed;
}

/** `getUserMedia`'s DOMException names, as the failures they actually are. */
export function classifyMediaError(error: unknown): RecorderFailure {
  // Read `name` structurally rather than via `instanceof Error`: a
  // `DOMException` is not always an `Error` subclass across realms, and it is
  // exactly the thing being classified here.
  const name =
    typeof (error as { name?: unknown } | null)?.name === 'string' ? (error as { name: string }).name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return 'permission';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') {
    return 'no-device';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return 'lost-device';
  }
  return 'failed';
}

/**
 * The samples, accumulating in the tab.
 *
 * A 60-minute recording is ~115 MB of PCM held here (`MAX_RECORDING_SECONDS`),
 * which is survivable but is the reason for the cap: the alternative — a
 * streamed upload holding only a rolling buffer — is more machinery than a
 * 2–5 minute dictation warrants. The cap is enforced here rather than only on
 * the timer, so a clock that drifts or a tab that sleeps cannot get past it.
 */
/** A pause is a run of tenths of a second under this peak; ordinary room noise stays under it. */
const QUIET_PEAK = 0.03;
const BUCKETS_PER_SECOND = 10;
/** Four tenths of a second of quiet is a breath between sentences, not a gap between words. */
const PAUSE_BUCKETS = 4;

export class PcmBuffer {
  private readonly chunks: Int16Array[] = [];
  private samples = 0;
  private readonly levels: number[] = [];
  private bucketPeak = 0;
  private bucketFill = 0;

  constructor(
    readonly sampleRate: number = AUDIO_SAMPLE_RATE,
    readonly maxSeconds: number = MAX_RECORDING_SECONDS,
  ) {}

  private get maxSamples(): number {
    return Math.ceil(this.sampleRate * this.maxSeconds);
  }

  /** True once the recording has hit the cap and stopped accepting audio. */
  get full(): boolean {
    return this.samples >= this.maxSamples;
  }

  get seconds(): number {
    return this.samples / this.sampleRate;
  }

  /** Append one block of frames. Anything past the cap is dropped, not wrapped. */
  push(frames: Float32Array): void {
    const room = this.maxSamples - this.samples;
    if (room <= 0) return;
    const usable = frames.length > room ? frames.subarray(0, room) : frames;
    this.chunks.push(floatToPcm16(usable));
    this.samples += usable.length;
    this.track(usable);
  }

  /** Everything recorded so far — or the seconds in `range` — as the WAV the server transcribes. */
  toWav(range?: { from: number; to: number }): Blob {
    const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));
    const start = range ? clamp(Math.floor(range.from * this.sampleRate), 0, this.samples) : 0;
    const end = range ? clamp(Math.ceil(range.to * this.sampleRate), start, this.samples) : this.samples;
    const pcm = new Int16Array(end - start);
    let offset = 0;
    let position = 0;
    for (const chunk of this.chunks) {
      const chunkStart = position;
      const chunkEnd = position + chunk.length;
      position = chunkEnd;
      if (chunkEnd <= start) continue;
      if (chunkStart >= end) break;
      const part = chunk.subarray(Math.max(0, start - chunkStart), Math.min(chunk.length, end - chunkStart));
      pcm.set(part, offset);
      offset += part.length;
    }
    return new Blob([encodeWav(pcm, this.sampleRate)], { type: WAV_CONTENT_TYPE });
  }

  /**
   * Where a preview chunk may end, in seconds: the middle of the longest
   * pause between `after` and `before`, so the cut falls between words rather
   * than through one. Null when she has not paused there.
   */
  cutPoint(after: number, before: number): number | null {
    const [from, to] = this.bucketRange(after, before);
    if (to - from < 5) return null;
    let bestStart = -1;
    let bestLength = 0;
    let runStart = -1;
    for (let index = from; index <= to; index += 1) {
      const quiet = index < to && (this.levels[index] ?? 1) < QUIET_PEAK;
      if (quiet) {
        if (runStart < 0) runStart = index;
      } else if (runStart >= 0) {
        const length = index - runStart;
        if (length > bestLength) {
          bestLength = length;
          bestStart = runStart;
        }
        runStart = -1;
      }
    }
    return bestLength >= PAUSE_BUCKETS ? (bestStart + bestLength / 2) / BUCKETS_PER_SECOND : null;
  }

  /** The quietest tenth of a second between `after` and `before`, for a cut she never paused for. */
  quietestPoint(after: number, before: number): number | null {
    const [from, to] = this.bucketRange(after, before);
    if (to - from < 1) return null;
    let quietest = from;
    for (let index = from; index < to; index += 1) {
      if ((this.levels[index] ?? 1) < (this.levels[quietest] ?? 1)) quietest = index;
    }
    return (quietest + 0.5) / BUCKETS_PER_SECOND;
  }

  private bucketRange(after: number, before: number): [number, number] {
    const from = Math.max(0, Math.ceil(after * BUCKETS_PER_SECOND));
    const to = Math.min(this.levels.length, Math.floor(before * BUCKETS_PER_SECOND));
    return [from, to];
  }

  /** Peak per tenth of a second, kept alongside the samples for `cutPoint`. */
  private track(frames: Float32Array): void {
    const bucketSamples = this.sampleRate / BUCKETS_PER_SECOND;
    for (const sample of frames) {
      const magnitude = sample < 0 ? -sample : sample;
      if (magnitude > this.bucketPeak) this.bucketPeak = magnitude;
      this.bucketFill += 1;
      if (this.bucketFill >= bucketSamples) {
        this.levels.push(this.bucketPeak);
        this.bucketPeak = 0;
        this.bucketFill = 0;
      }
    }
  }
}

export interface RecorderHandlers {
  /** Called about four times a second with the length recorded so far. */
  onProgress?: (seconds: number) => void;
  /** The cap was reached; the recorder has already stopped itself. */
  onLimit?: () => void;
  /** The microphone went away mid-recording. */
  onError?: (error: RecorderError) => void;
  /**
   * Peak amplitude of the frames just captured, 0..1.
   *
   * The preview below takes several seconds to produce its first words —
   * whisper has to load before it can hear anything — and silence on screen
   * in the meantime undoes the reassurance the preview exists to give. This
   * is the immediate half of that answer, and it costs one pass over frames
   * the worklet has already handed us.
   */
  onLevel?: (peak: number) => void;
}

/**
 * One recording, from permission prompt to finished WAV.
 *
 * Deliberately not a React hook: the audio graph outlives renders, and a hook
 * that owns a `MediaStream` in a ref is harder to reason about than an object
 * with `start`, `stop` and `cancel`.
 */
export class Recorder {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private buffer: PcmBuffer | null = null;
  private acceptingFrames = false;
  private flushResolve: (() => void) | null = null;
  constructor(
    private readonly handlers: RecorderHandlers = {},
    private readonly flushTimeoutMs: number = FLUSH_TIMEOUT_MS,
  ) {}

  get seconds(): number {
    return this.buffer?.seconds ?? 0;
  }

  async start(): Promise<void> {
    if (typeof AudioWorkletNode === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new RecorderError('unsupported', 'this browser has no AudioWorklet');
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (error) {
      throw new RecorderError(classifyMediaError(error), 'getUserMedia failed');
    }

    try {
      // Asking for 16 kHz makes Chrome resample the microphone for us, so the
      // upload is 11× smaller than 48 kHz stereo. If a browser refuses and
      // gives us its own rate, the header records that rate and whisper.cpp
      // resamples internally — a smaller upload is an optimisation here, not a
      // correctness requirement.
      const context = new AudioContext({ sampleRate: AUDIO_SAMPLE_RATE });
      this.context = context;
      await context.audioWorklet.addModule(WORKLET_URL);
      if (context.state === 'suspended') await context.resume();

      this.buffer = new PcmBuffer(context.sampleRate);
      this.node = new AudioWorkletNode(context, WORKLET_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 0,
      });
      this.node.port.onmessage = (event: MessageEvent<Float32Array | 'flushed'>) => {
        if (event.data === 'flushed') {
          this.flushResolve?.();
          this.flushResolve = null;
          return;
        }
        this.receive(event.data);
      };

      this.source = context.createMediaStreamSource(this.stream);
      this.source.connect(this.node);
      // Frames are accepted from here until `stop()`, `cancel()`, or the cap.
      // The gate is a field rather than a local so a late worklet message
      // cannot land after teardown has begun.
      this.acceptingFrames = true;

      // The device being unplugged mid-session is a real failure with a real
      // recovery — say so rather than ending up with a file of silence.
      for (const track of this.stream.getAudioTracks()) {
        track.addEventListener('ended', () => {
          this.handlers.onError?.(new RecorderError('lost-device', 'the audio track ended'));
        });
      }
    } catch (error) {
      this.teardown();
      if (error instanceof RecorderError) throw error;
      throw new RecorderError('failed', `audio graph setup failed: ${String(error)}`);
    }
  }

  /** The whole recording so far as a WAV, without stopping. */
  snapshot(): Blob | null {
    if (this.buffer === null || this.buffer.seconds <= 0) return null;
    return this.buffer.toWav();
  }

  /**
   * The seconds from `from` to `to` as a WAV, without stopping — what the
   * live preview transcribes: the chunk up to a pause when it commits, and
   * the tail since the last commit otherwise. Whisper's cost is one encoder
   * pass per window however short the clip, so the preview keeps its clips
   * short and its block growing rather than re-reading everything. Null when
   * there is less than a fifth of a second in the range.
   */
  slice(from: number, to: number): Blob | null {
    if (this.buffer === null || to - from < MIN_RECORDING_SECONDS) return null;
    return this.buffer.toWav({ from, to });
  }

  /** Where a preview chunk may end: see `PcmBuffer.cutPoint`. */
  cutPoint(after: number, before: number): number | null {
    return this.buffer?.cutPoint(after, before) ?? null;
  }

  quietestPoint(after: number, before: number): number | null {
    return this.buffer?.quietestPoint(after, before) ?? null;
  }

  /** Stop, and answer with the WAV. Safe to call once. */
  async stop(): Promise<Blob> {
    if (!this.buffer) throw new RecorderError('failed', 'stop() before start()');

    await this.flush();
    this.acceptingFrames = false;

    const wav = this.buffer.toWav();
    this.teardown();
    return wav;
  }

  /**
   * Ask the worklet for its partial block and wait for its acknowledgement —
   * but only so long. The acknowledgement is the boundary: no samples accepted
   * before it are discarded by teardown. A worklet or context that has died
   * never answers, so the bound is the boundary then, and whatever is buffered
   * becomes the file. Both paths clear the resolver and the timer, so a late
   * acknowledgement after the timeout is harmless.
   */
  private flush(): Promise<void> {
    const node = this.node;
    if (node === null) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const finish = (): void => {
        clearTimeout(timer);
        if (this.flushResolve === finish) this.flushResolve = null;
        resolve();
      };
      const timer = setTimeout(finish, this.flushTimeoutMs);
      this.flushResolve = finish;
      node.port.postMessage('flush');
    });
  }

  /** Throw the recording away — she navigated off, or it failed. */
  cancel(): void {
    this.acceptingFrames = false;
    this.flushResolve = null;
    this.teardown();
  }

  private receive(frames: Float32Array): void {
    if (this.handlers.onLevel) {
      let peak = 0;
      for (const sample of frames) {
        const magnitude = sample < 0 ? -sample : sample;
        if (magnitude > peak) peak = magnitude;
      }
      this.handlers.onLevel(peak > 1 ? 1 : peak);
    }
    const buffer = this.buffer;
    if (!buffer || !this.acceptingFrames) return;

    buffer.push(frames);
    this.handlers.onProgress?.(buffer.seconds);
    if (buffer.full) {
      this.acceptingFrames = false;
      this.handlers.onLimit?.();
    }
  }

  private teardown(): void {
    try {
      this.source?.disconnect();
      this.node?.disconnect();
      for (const track of this.stream?.getTracks() ?? []) track.stop();
      void this.context?.close();
    } catch {
      // Tearing down a graph that is already gone is not a failure worth
      // showing anyone; the recording is either in hand or lost already.
    }
    this.source = null;
    this.node = null;
    this.stream = null;
    this.context = null;
  }
}

/** `00:14` — the prototype's timer, on `capture.html`. */
export function formatTimer(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}
