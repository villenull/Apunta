import {
  AUDIO_SAMPLE_RATE,
  encodeWav,
  floatToPcm16,
  MAX_RECORDING_SECONDS,
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
export class PcmBuffer {
  private readonly chunks: Int16Array[] = [];
  private samples = 0;

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
  }

  /** Everything recorded so far — or, with `lastSeconds`, just the tail — as the WAV the server transcribes. */
  toWav(lastSeconds?: number): Blob {
    const keep =
      lastSeconds === undefined
        ? this.samples
        : Math.min(this.samples, Math.ceil(lastSeconds * this.sampleRate));
    const pcm = new Int16Array(keep);
    let skip = this.samples - keep;
    let offset = 0;
    for (const chunk of this.chunks) {
      if (skip >= chunk.length) {
        skip -= chunk.length;
        continue;
      }
      const part = skip > 0 ? chunk.subarray(skip) : chunk;
      skip = 0;
      pcm.set(part, offset);
      offset += part.length;
    }
    return new Blob([encodeWav(pcm, this.sampleRate)], { type: WAV_CONTENT_TYPE });
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
  private stopped = false;

  constructor(private readonly handlers: RecorderHandlers = {}) {}

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
      this.node.port.onmessage = (event: MessageEvent<Float32Array>) => {
        this.receive(event.data);
      };

      this.source = context.createMediaStreamSource(this.stream);
      this.source.connect(this.node);

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

  /**
   * The recording so far — or just its tail — as a WAV, without stopping.
   *
   * The live preview asks for the last few seconds only. Whisper's cost is
   * one encoder pass per 30-second window however short the clip (measured
   * 2026-09-04 — it is not model loading, which takes 60 ms), so "everything
   * so far" would grow by a window at a time while the reassurance it buys
   * did not. A rolling window keeps a refresh at one short pass. Its first
   * word may be cut at the window's edge; the caption says the words are
   * rough.
   */
  snapshot(lastSeconds?: number): Blob | null {
    if (this.buffer === null || this.buffer.seconds <= 0) return null;
    return this.buffer.toWav(lastSeconds);
  }

  /** Stop, and answer with the WAV. Safe to call once. */

  async stop(): Promise<Blob> {
    if (!this.buffer) throw new RecorderError('failed', 'stop() before start()');
    this.stopped = true;

    // Ask the worklet for its partial block before tearing the graph down, so
    // the last fraction of a second survives.
    this.node?.port.postMessage('flush');
    await nextTick();

    const wav = this.buffer.toWav();
    this.teardown();
    return wav;
  }

  /** Throw the recording away — she navigated off, or it failed. */
  cancel(): void {
    this.stopped = true;
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
    if (!buffer || this.stopped) return;

    buffer.push(frames);
    this.handlers.onProgress?.(buffer.seconds);
    if (buffer.full) {
      this.stopped = true;
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

/** Let the worklet's flush message cross the thread boundary. */
function nextTick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 20);
  });
}

/** `00:14` — the prototype's timer, on `capture.html`. */
export function formatTimer(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}
