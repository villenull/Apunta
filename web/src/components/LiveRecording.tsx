import { useEffect, useRef } from 'react';

import { useI18n } from '../lib/i18n.js';
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
  previewCommitted,
  previewTentative,
  previewNote,
  children,
}: {
  /** 0 at rest, 0.55–1 when she is heard. */
  readonly level: number;
  readonly seconds: number;
  /** Stable words, rendered normally so they do not look provisional. */
  readonly previewCommitted: string;
  /** The short tail Whisper may still revise. */
  readonly previewTentative: string;
  /** Under the words: what they are, and what they are not. */
  readonly previewNote: string;
  readonly children?: React.ReactNode;
}): React.JSX.Element {
  const { t } = useI18n();
  const previewBox = useRef<HTMLDivElement | null>(null);
  const preview = [previewCommitted, previewTentative].filter((part) => part !== '').join(' ');
  // The block follows the words: newest at the bottom, always in view.
  useEffect(() => {
    const box = previewBox.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [preview]);

  return (
    <div className="record-ui capture-stage" data-testid="record-panel">
      <div className="record-stage-copy">
        <p className="capture-stage-status record-label" role="status" data-testid="record-stage-status">
          {t('capture.recordingSession')}
        </p>
        <p className="small muted">{t('capture.liveHint')}</p>
      </div>
      {/*
        The meter answers "is this hearing me" immediately. It is present only
        while the microphone is active; the words and stage label carry the
        actual progress.
      */}
      <div
        className="record-dot recording"
        data-testid="record-dot"
        style={{ ['--level' as string]: String(level) }}
        aria-hidden="true"
      >
        <MicIcon className="icon record-mic" />
      </div>
      <p className="timer" data-testid="record-timer">
        {formatTimer(seconds)}
      </p>

      <div className="record-preview capture-stage-preview" data-testid="record-preview">
        {preview === '' ? (
          <p className="small muted record-preview-waiting">
            <span>{t('capture.listening')}</span> <ThinkingDots ariaLabel={t('capture.listening')} />
          </p>
        ) : (
          <>
            <div className="record-preview-text" ref={previewBox} data-testid="record-preview-text">
              <span className="record-preview-committed">{previewCommitted}</span>
              {previewCommitted !== '' && previewTentative !== '' ? ' ' : null}
              <span className="record-preview-tentative">{previewTentative}</span>
            </div>
            <p className="small muted record-preview-note">{previewNote}</p>
          </>
        )}
      </div>
      {children}
    </div>
  );
}
