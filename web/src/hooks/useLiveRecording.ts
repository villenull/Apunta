import {
  MAX_RECORDING_SECONDS,
  PREVIEW_COMMIT_AFTER_SECONDS,
  PREVIEW_COMMIT_FORCE_SECONDS,
  PREVIEW_FIRST_MS,
  PREVIEW_INTERVAL_MS,
  PREVIEW_MAX_SECONDS,
  PREVIEW_MIN_GAP_MS,
  PREVIEW_SLOW_GAP_MS,
} from '@apunta/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { previewTranscript } from '../api/index.js';
import { Recorder, RecorderError, recorderMessage } from '../lib/recorder.js';

/**
 * The live half of a recording, shared by the capture screen and the refine
 * chat's microphone (owner-proxy, 2026-09-07: dictating into the chat should
 * look and behave exactly like recording a note).
 *
 * What it owns: the `Recorder`, a level that moves the moment she speaks, the
 * timer, and the provisional words growing as a block. What it does not own:
 * what happens to the finished WAV — the capture screen drafts a note from
 * it, the chat transcribes it into the composer. `stop()` hands the WAV back
 * and the caller decides.
 *
 * `level` answers "is this hearing me" immediately. `preview` answers "are
 * the words coming out right", but cannot answer it for a few seconds —
 * whisper's encoder takes its time even on a short clip — so the two are
 * separate on purpose rather than one indicator that starts late.
 */

export type LivePhase = 'idle' | 'starting' | 'recording';

export interface LiveRecordingOptions {
  /** The recorder's own words when the microphone cannot be opened, or goes away. */
  readonly onError: (message: string) => void;
  /** A warning worth showing — the recording is getting long, or was stopped at the cap. */
  readonly onNotice?: (message: string) => void;
  /** Warn, without stopping, once the recording passes this length. */
  readonly warnAfterSeconds?: number;
  /**
   * Stop on its own past this length. The recorder's own hour is the
   * outer limit; a chat message stops far sooner.
   */
  readonly stopAfterSeconds?: number;
  /** The recording reached a cap: the caller stops it and keeps what it has. */
  readonly onLimit?: () => void;
}

export interface LiveRecording {
  readonly phase: LivePhase;
  /** Length recorded so far, about four times a second; the final length after `stop()`. */
  readonly seconds: number;
  /** 0 at rest, 0.55–1 when she is heard: presence, not loudness. */
  readonly level: number;
  /** Everything so far, roughly: committed words, then the tail still being re-read. */
  readonly preview: string;
  /** Open the microphone. Resolves true once recording, false when it could not (after `onError`). */
  readonly start: () => Promise<boolean>;
  /** Stop, and hand back the WAV — or null when nothing was recording. */
  readonly stop: () => Promise<Blob | null>;
  /** Throw the recording away. */
  readonly cancel: () => void;
}
export interface PreviewRequest {
  readonly kind: 'commit' | 'tail';
  /** The audio cursor this request was based on. */
  readonly committedAt: number;
  /** The end of the audio sent to whisper. */
  readonly to: number;
}

export interface PreviewResult {
  readonly committed: { readonly text: string; readonly at: number };
  readonly preview: string;
}

/**
 * Apply one preview response only to the cursor that requested it.
 *
 * A tail is provisional and replaces the previous tail. A commit replaces
 * that provisional view with the committed chunk. If another response has
 * already advanced the cursor, this response is stale — appending it would
 * briefly show a sentence twice before the next final chunk corrected it.
 */
export function reconcilePreviewResult(
  current: { readonly text: string; readonly at: number },
  request: PreviewRequest,
  text: string,
): PreviewResult | null {
  if (current.at !== request.committedAt) return null;
  if (request.kind === 'tail') {
    return {
      committed: current,
      preview: joinWords(current.text, text),
    };
  }
  const committed = { text: joinWords(current.text, text), at: request.to };
  return { committed, preview: committed.text };
}

function joinWords(head: string, tail: string): string {
  const a = head.trim();
  const b = tail.trim();
  return a === '' ? b : b === '' ? a : `${a} ${b}`;
}

export function useLiveRecording(options: LiveRecordingOptions): LiveRecording {
  // Read through a ref so the callbacks the recorder captured when she
  // pressed record see the caller's current handlers an hour later.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [phase, setPhase] = useState<LivePhase>('idle');
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [preview, setPreview] = useState('');

  const recorder = useRef<Recorder | null>(null);
  const starting = useRef(false);
  /** The smoothed voice level behind the dot, and when it last reached the screen. */
  const voice = useRef({ smoothed: 0, shownAt: 0, shown: 0 });
  /** Words committed for good, and the second of audio they run up to. */
  const committed = useRef({ text: '', at: 0 });
  const previewGeneration = useRef(0);
  const limited = useRef(false);
  /** The active preview request must stop before final transcription starts. */
  const previewAbort = useRef<AbortController | null>(null);

  // A recording is a live microphone and an open audio graph, so leaving the
  // screen has to close them rather than leave the tab's mic light on.
  useEffect(
    () => () => {
      previewAbort.current?.abort();
      previewAbort.current = null;
      recorder.current?.cancel();
      recorder.current = null;
    },
    [],
  );

  /**
   * Refresh the provisional words while she speaks, and let them grow.
   *
   * Each refresh transcribes only the audio since the last *committed* point.
   * Once that stretch is long enough, the next pause in her speech becomes a
   * cut: the chunk up to it is transcribed once more, appended to the block
   * for good, and never re-read — so the words already on screen stop
   * changing, the cost of a refresh stays flat however long she talks, and
   * the cut falls between words rather than through one. If she never pauses,
   * the cut is forced at the quietest moment once the stretch is long.
   *
   * The first refresh goes early; each one after that is scheduled when the
   * previous returns, so refreshes never overlap. After four minutes they
   * slow to a walking pace rather than stop. A failure goes quiet: the
   * preview is reassurance, and reassurance that raises an alarm about a
   * recording which is going fine would be worse than none.
   */
  useEffect(() => {
    if (phase !== 'recording') return;
    const generation = previewGeneration.current + 1;
    previewGeneration.current = generation;
    committed.current = { text: '', at: 0 };
    setPreview('');

    let cancelled = false;
    let timer = 0;
    let requestSequence = 0;
    let activeRequest = 0;
    const schedule = (ms: number): void => {
      timer = window.setTimeout(run, ms);
    };
    const settle = (started: number, now: number, requestId: number): void => {
      if (cancelled || activeRequest !== requestId) return;
      activeRequest = 0;
      // Rest for as long as the refresh took: whisper gets at most half the
      // machine, and a fast machine gets a caption that keeps up.
      let gap = Math.min(PREVIEW_INTERVAL_MS, Math.max(PREVIEW_MIN_GAP_MS, performance.now() - started));
      if (now > PREVIEW_MAX_SECONDS) gap = Math.max(gap, PREVIEW_SLOW_GAP_MS);
      schedule(gap);
    };
    const run = (): void => {
      const active = recorder.current;
      if (cancelled || !active || generation !== previewGeneration.current) return;
      const now = active.seconds;
      const done = committed.current;
      const pending = now - done.at;
      const started = performance.now();

      if (pending >= PREVIEW_COMMIT_AFTER_SECONDS) {
        const searchFrom = done.at + PREVIEW_COMMIT_AFTER_SECONDS / 2;
        const cut =
          active.cutPoint(searchFrom, now - 1) ??
          (pending >= PREVIEW_COMMIT_FORCE_SECONDS
            ? (active.quietestPoint(searchFrom, now - 1) ?? now - 1)
            : null);
        const chunk = cut === null ? null : active.slice(done.at, cut);
        if (cut !== null && chunk !== null) {
          const request = {
            kind: 'commit' as const,
            committedAt: done.at,
            to: cut,
          };
          const requestId = ++requestSequence;
          activeRequest = requestId;
          const controller = new AbortController();
          previewAbort.current = controller;
          void previewTranscript(chunk, controller.signal)
            .then((result) => {
              if (
                cancelled ||
                generation !== previewGeneration.current ||
                activeRequest !== requestId ||
                result === null ||
                recorder.current === null
              )
                return;
              const next = reconcilePreviewResult(committed.current, request, result.text);
              if (next === null) return;
              committed.current = next.committed;
              setPreview(next.preview);
            })
            .finally(() => {
              if (previewAbort.current === controller) previewAbort.current = null;
              settle(started, now, requestId);
            });
          return;
        }
      }

      const tail = active.slice(done.at, now);
      if (tail === null) {
        schedule(PREVIEW_MIN_GAP_MS);
        return;
      }
      const request = {
        kind: 'tail' as const,
        committedAt: done.at,
        to: now,
      };
      const requestId = ++requestSequence;
      activeRequest = requestId;
      const controller = new AbortController();
      previewAbort.current = controller;
      void previewTranscript(tail, controller.signal)
        .then((result) => {
          // Still recording? A result that lands after she stopped belongs to
          // a screen that has moved on. A result from an older cursor is also
          // stale: the final chunk already superseded that partial view.
          if (
            cancelled ||
            generation !== previewGeneration.current ||
            activeRequest !== requestId ||
            result === null ||
            recorder.current === null
          )
            return;
          const next = reconcilePreviewResult(committed.current, request, result.text);
          if (next !== null) setPreview(next.preview);
        })
        .finally(() => {
          if (previewAbort.current === controller) previewAbort.current = null;
          settle(started, now, requestId);
        });
    };
    schedule(PREVIEW_FIRST_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      previewAbort.current?.abort();
      previewAbort.current = null;
    };
  }, [phase]);

  const start = useCallback(async (): Promise<boolean> => {
    if (recorder.current !== null || starting.current) return false;
    starting.current = true;
    setSeconds(0);
    setLevel(0);
    voice.current = { smoothed: 0, shownAt: 0, shown: 0 };
    setPreview('');
    limited.current = false;
    setPhase('starting');

    const active = new Recorder({
      onProgress: (elapsed) => {
        setSeconds(elapsed);
        const { warnAfterSeconds, stopAfterSeconds, onNotice, onLimit } = optionsRef.current;
        if (warnAfterSeconds !== undefined && elapsed >= warnAfterSeconds) {
          onNotice?.(
            `This recording is over ${String(Math.floor(warnAfterSeconds / 60))} minutes. Apunta stops at ${String(Math.floor(MAX_RECORDING_SECONDS / 60))}.`,
          );
        }
        if (stopAfterSeconds !== undefined && elapsed >= stopAfterSeconds && !limited.current) {
          limited.current = true;
          onLimit?.();
        }
      },
      onLimit: () => {
        // The recorder's own cap; it has already stopped itself.
        limited.current = true;
        optionsRef.current.onNotice?.(
          `Recording stopped at ${String(Math.floor(MAX_RECORDING_SECONDS / 60))} minutes, the longest Apunta takes.`,
        );
        optionsRef.current.onLimit?.();
      },
      onLevel: (peak) => {
        // The dot answers "is this hearing me", not "how loud": below the
        // noise floor it rests; sound lifts it at once and lets it settle
        // over about a second, so word gaps do not make it twitch.
        const heard = peak < VOICE_FLOOR ? 0 : peak;
        const state = voice.current;
        state.smoothed =
          heard > state.smoothed
            ? state.smoothed + (heard - state.smoothed) * 0.5
            : state.smoothed * VOICE_DECAY;
        const now = performance.now();
        const presence = presenceOf(state.smoothed);
        // The lift from rest never waits for the frame budget: her first
        // word is the answer the dot exists to give.
        const lifting = state.shown === 0 && presence > 0;
        if (lifting || state.shownAt === 0 || now - state.shownAt >= VOICE_FRAME_MS) {
          state.shownAt = now;
          state.shown = presence;
          setLevel(presence);
        }
      },
      onError: (failure) => {
        optionsRef.current.onError(recorderMessage(failure));
        recorder.current?.cancel();
        recorder.current = null;
        setPhase('idle');
      },
    });

    try {
      await active.start();
      recorder.current = active;
      setPhase('recording');
      return true;
    } catch (thrown) {
      optionsRef.current.onError(recorderMessage(thrown));
      setPhase('idle');
      if (!(thrown instanceof RecorderError)) throw thrown;
      return false;
    } finally {
      starting.current = false;
    }
  }, []);

  const stop = useCallback(async (): Promise<Blob | null> => {
    const active = recorder.current;
    if (active === null) return null;
    // Abort before awaiting Recorder.stop(): final transcription should not
    // overlap a stale preview child reading the previous slice.
    previewAbort.current?.abort();
    previewAbort.current = null;
    recorder.current = null;
    const wav = await active.stop();
    setSeconds(active.seconds);
    setPhase('idle');
    return wav;
  }, []);

  const cancel = useCallback((): void => {
    previewAbort.current?.abort();
    previewAbort.current = null;
    recorder.current?.cancel();
    recorder.current = null;
    setSeconds(0);
    setLevel(0);
    setPhase('idle');
  }, []);

  return { phase, seconds, level, preview, start, stop, cancel };
}

/** Peaks under this are the room, not her: the same floor the recorder uses to find a pause. */
const VOICE_FLOOR = 0.03;
/** Per audio frame (about 8 ms): the dot loses a sixth of its lift every hundred milliseconds. */
const VOICE_DECAY = 0.985;
/** The screen is updated at most this often; the CSS transition smooths the rest. */
const VOICE_FRAME_MS = 40;

/**
 * How much the dot shows for a smoothed level: nothing for silence, and for
 * any voice at all clearly more than half — louder is only a little bigger.
 * The user does not care whether the input is at 25% or 80%, only whether
 * something is being picked up.
 */
function presenceOf(smoothed: number): number {
  if (smoothed < 0.01) return 0;
  return Math.min(1, 0.55 + 0.45 * Math.min(1, smoothed / 0.25));
}
