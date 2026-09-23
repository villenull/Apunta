import type { Dictation } from '../hooks/useDictation.js';
import { formatTimer } from '../lib/recorder.js';
import { MicIcon, SendIcon, StopIcon } from './icons.js';
import { LiveRecording } from './LiveRecording.js';
import { ThinkingDots } from './ThinkingDots.js';

/**
 * The recording panel above a chat composer while she dictates: the capture
 * screen's dot, timer and growing words, with "Stop dictating".
 */
export function DictationPanel({ dictation }: { dictation: Dictation }): React.JSX.Element | null {
  const { live } = dictation;
  if (live.phase !== 'recording') return null;
  return (
    <LiveRecording
      level={live.level}
      seconds={live.seconds}
      preview={live.preview}
      previewCommitted={live.committedPreview}
      previewTentative={live.tentativePreview}
      previewNote="Everything so far, roughly. Your message is written from the finished recording."
    >
      <button
        type="button"
        className="btn btn-primary"
        data-testid="record-stop"
        onClick={() => {
          void dictation.finish();
        }}
      >
        Stop dictating
      </button>
    </LiveRecording>
  );
}

export interface ComposerButtonsProps {
  dictation: Dictation;
  /** A message is on its way: the microphone and the arrow both wait. */
  sending: boolean;
  onSend: () => void;
  /**
   * Given, the arrow becomes a Stop square while a reply streams (Brainstorm);
   * without it the arrow just waits, disabled (the refine chat).
   */
  onStop?: () => void;
  /** `chat` gives `chat-mic`, `chat-send`…; each composer keeps its own test ids. */
  testIdPrefix: string;
}

/**
 * The microphone and the send arrow at the end of a chat composer — one
 * component so the refine chat and Brainstorm wear the very same pair
 * (owner, 2026-09-22).
 */
export function ComposerButtons({
  dictation,
  sending,
  onSend,
  onStop,
  testIdPrefix,
}: ComposerButtonsProps): React.JSX.Element {
  const { listening, transcribing } = dictation;
  return (
    <>
      <button
        type="button"
        className={listening ? 'btn btn-mic is-recording' : 'btn btn-mic'}
        aria-label={listening ? 'Stop dictating' : 'Dictate a message'}
        aria-pressed={listening}
        data-testid={`${testIdPrefix}-mic`}
        disabled={sending || transcribing}
        onClick={() => {
          void (listening ? dictation.finish() : dictation.start());
        }}
      >
        {listening ? (
          <>
            <span className="chat-mic-dot" aria-hidden="true" />
            <span className="chat-mic-timer" data-testid={`${testIdPrefix}-mic-timer`}>
              {formatTimer(dictation.live.seconds)}
            </span>
          </>
        ) : transcribing ? (
          <ThinkingDots ariaLabel="Transcribing" />
        ) : (
          <MicIcon className="icon icon-sm" />
        )}
      </button>
      {sending && onStop !== undefined ? (
        <button
          type="button"
          className="btn btn-primary btn-send"
          aria-label="Stop"
          data-testid={`${testIdPrefix}-stop`}
          onClick={onStop}
        >
          <StopIcon className="icon icon-sm" />
        </button>
      ) : (
        // Full colour whatever the box holds: dimmed for an empty box, the
        // arrow read as grey on faint green (owner-proxy, 2026-09-07). An
        // empty send is simply nothing.
        <button
          type="button"
          className="btn btn-primary btn-send"
          aria-label="Send"
          data-testid={`${testIdPrefix}-send`}
          disabled={sending}
          onClick={onSend}
        >
          <SendIcon className="icon icon-sm" />
        </button>
      )}
    </>
  );
}
