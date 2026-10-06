import { useI18n } from '../lib/i18n.js';
import type { Dictation } from '../hooks/useDictation.js';
import { formatTimer } from '../lib/recorder.js';
import { MicIcon, ReturnIcon, StopIcon } from './icons.js';
import { ThinkingDots } from './ThinkingDots.js';

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
  /**
   * The box holds something other than whitespace: the return arrow wears the
   * accent instead of the quiet grey (owner, 2026-10-05). An empty box is
   * still sendable — she can send whitespace on purpose — so this only paints.
   */
  readonly hasText: boolean;
}

/**
 * The microphone and the return arrow inside a chat composer's box — one
 * component so the refine chat and Brainstorm wear the very same pair
 * (owner, 2026-09-22). Grey glyphs on the box's own ground, no button of
 * their own; the arrow takes the accent once the box holds words
 * (owner, 2026-10-05).
 */
export function ComposerButtons({
  dictation,
  sending,
  onSend,
  onStop,
  testIdPrefix,
  hasText,
}: ComposerButtonsProps): React.JSX.Element {
  const { t } = useI18n();
  const { listening, transcribing } = dictation;
  return (
    <>
      <button
        type="button"
        className={listening ? 'chat-icon-btn btn-mic is-recording' : 'chat-icon-btn btn-mic'}
        aria-label={listening ? t('dictation.stop') : t('dictation.mic')}
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
          <ThinkingDots ariaLabel={t('dictation.transcribing')} />
        ) : (
          <MicIcon className="icon icon-sm" />
        )}
      </button>
      {sending && onStop !== undefined ? (
        <button
          type="button"
          className="chat-icon-btn btn-send is-stop"
          aria-label={t('common.stop')}
          data-testid={`${testIdPrefix}-stop`}
          onClick={onStop}
        >
          <StopIcon className="icon icon-sm" />
        </button>
      ) : (
        // A glyph on the box, never a filled button (owner, 2026-10-05): it
        // stays clickable with an empty box, because sending whitespace is
        // still something she may mean; only its colour answers the box.
        <button
          type="button"
          className={hasText ? 'chat-icon-btn btn-send is-ready' : 'chat-icon-btn btn-send'}
          aria-label={t('common.send')}
          data-testid={`${testIdPrefix}-send`}
          // Sending mid-dictation would post the box without the words she is
          // still speaking; the arrow waits for the transcript to land.
          disabled={sending || listening || transcribing}
          onClick={onSend}
        >
          <ReturnIcon className="icon icon-sm" />
        </button>
      )}
    </>
  );
}
