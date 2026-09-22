import { MAX_DICTATION_SECONDS } from '@apunta/shared';
import { useEffect, useRef, useState } from 'react';

import { dictateClip, errorMessage } from '../api/index.js';
import { useLiveRecording, type LiveRecording } from './useLiveRecording.js';

/** What a composer says when whisper heard no words in the clip. */
export const NOTHING_HEARD_MESSAGE =
  'Apunta didn’t catch any words. Try again, a little closer to the microphone.';

export interface DictationOptions {
  /** She pressed the microphone: a good moment to clear an old error. */
  readonly onStart?: () => void;
  /** A recorder or whisper failure, in its own words — or "nothing heard". */
  readonly onError: (message: string) => void;
  /** Whisper heard these words; the caller appends them to its box. */
  readonly onHeard: (text: string) => void;
  /** Transcription finished (heard or not): give the box its focus back. */
  readonly onSettled?: () => void;
}

export interface Dictation {
  readonly live: LiveRecording;
  /** The microphone is open (or opening). */
  readonly listening: boolean;
  /** Whisper has the clip; the words are on their way to the box. */
  readonly transcribing: boolean;
  readonly start: () => Promise<void>;
  /** Stop listening and transcribe what was said. */
  readonly finish: () => Promise<void>;
  /** Throw the recording and any transcription in flight away. */
  readonly cancel: () => void;
}

/**
 * Dictating into a chat composer (owner-proxy, 2026-09-07): the capture
 * screen's recorder, dot and growing transcript, a clip instead of a
 * session, and the words land in the box for her to read and edit before
 * anything is sent. Shared by the refine chat and Brainstorm, so the two
 * microphones cannot drift apart. Whisper runs on the server as always;
 * nothing here touches a browser speech API.
 */
export function useDictation(options: DictationOptions): Dictation {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [transcribing, setTranscribing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const live = useLiveRecording({
    onError: (message) => {
      optionsRef.current.onError(message);
    },
    stopAfterSeconds: MAX_DICTATION_SECONDS,
    onLimit: () => {
      void finish();
    },
  });

  // Leaving mid-transcription drops the words rather than writing them into
  // a box nobody is looking at. The microphone is the recording hook's to close.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function start(): Promise<void> {
    if (live.phase !== 'idle') return;
    optionsRef.current.onStart?.();
    await live.start();
  }

  async function finish(): Promise<void> {
    const clip = await live.stop();
    if (clip === null) return;
    setTranscribing(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const heard = (await dictateClip(clip, controller.signal)).text.trim();
      if (controller.signal.aborted) return;
      if (heard === '') {
        optionsRef.current.onError(NOTHING_HEARD_MESSAGE);
      } else {
        optionsRef.current.onHeard(heard);
      }
    } catch (thrown) {
      if (controller.signal.aborted) return;
      optionsRef.current.onError(errorMessage(thrown));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setTranscribing(false);
      if (!controller.signal.aborted) {
        optionsRef.current.onSettled?.();
      }
    }
  }

  function cancel(): void {
    live.cancel();
    abortRef.current?.abort();
  }

  return { live, listening: live.phase !== 'idle', transcribing, start, finish, cancel };
}

/** Appended, never replacing: she may have typed half of it already. */
export function appendHeard(current: string, heard: string): string {
  return current.trim() === '' ? heard : `${current.trimEnd()} ${heard}`;
}
