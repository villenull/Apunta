import { useEffect, useRef } from 'react';

import { formatTimer } from '../lib/recorder.js';
import { MicIcon } from './icons.js';
import { ThinkingDots } from './ThinkingDots.js';

/**
 * A recording in progress, as the capture screen shows it: the dot that
 * breathes with her voice, the timer, and the provisional words growing as a
 * block. The refine chat's microphone renders the same panel, so dictating a
 * message looks exactly like dictating a note (owner-proxy, 2026-09-07).
 *
 * The caller supplies the stop control as children — "Stop and process" on
 * the capture screen, "Stop dictating" in the chat — because what stopping
 * leads to is the one thing the two have not got in common.
 */
export function LiveRecording({
  level,
  seconds,
  preview,
  previewNote,
  children,
}: {
  /** 0 at rest, 0.55–1 when she is heard. */
  readonly level: number;
  readonly seconds: number;
  /** Everything so far, roughly; empty until whisper has heard something. */
  readonly preview: string;
  /** Under the words: what they are, and what they are not. */
  readonly previewNote: string;
  readonly children?: React.ReactNode;
}): React.JSX.Element {
  const previewBox = useRef<HTMLDivElement | null>(null);

  // The block follows the words: newest at the bottom, always in view.
  useEffect(() => {
    const box = previewBox.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [preview]);

  return (
    <div className="record-ui" data-testid="record-panel">
      {/*
        The dot is the meter: faint and still when nothing is heard, swelling
        and colouring with her voice — the one answer to "is this hearing me"
        on the timescale of her voice itself (owner, 2026-09-05; the bar it
        replaces looked like a stray widget).
      */}
      <div
        className="record-dot recording"
        data-testid="record-dot"
        style={{ ['--level' as string]: String(level) }}
      >
        <MicIcon className="icon record-mic" />
      </div>
      <p className="timer" data-testid="record-timer">
        {formatTimer(seconds)}
      </p>
      <p className="muted record-label" role="status">
        Recording…
      </p>

      <div className="record-preview" data-testid="record-preview">
        {preview === '' ? (
          <p className="small muted record-preview-waiting">
            <ThinkingDots ariaLabel="Listening" /> Listening…
          </p>
        ) : (
          <>
            <div className="record-preview-text" ref={previewBox} data-testid="record-preview-text">
              {preview}
            </div>
            <p className="small muted record-preview-note">{previewNote}</p>
          </>
        )}
      </div>
      {children}
    </div>
  );
}
