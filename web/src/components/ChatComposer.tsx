import type { RefObject } from 'react';

import { appendHeard, type Dictation } from '../hooks/useDictation.js';
import { AutoGrowTextarea } from './AutoGrowTextarea.js';
import { ComposerButtons } from './ComposerButtons.js';
import { SpellLayer } from './SpellLayer.js';

export interface ChatComposerProps {
  readonly inputRef?: RefObject<HTMLTextAreaElement | null>;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSend: () => void;
  readonly onStop?: () => void;
  readonly dictation: Dictation;
  readonly sending: boolean;
  readonly placeholder: string;
  readonly ariaLabel: string;
  readonly testId: string;
  readonly className?: string;
  readonly allowWords?: readonly string[];
}

/**
 * One predictable composer shared by refine and Brainstorm: a box that grows
 * with what she types, with the microphone and the return arrow inside it
 * (owner, 2026-10-05). Enter sends, Shift+Enter breaks the line.
 *
 * Dictating writes into this same box (owner, 2026-10-05): the provisional
 * words `useLiveRecording` produces ride at the end of whatever she had typed,
 * so there is no panel, dialog or second surface between the microphone and the
 * text. The box is read-only from the first press of the microphone until the
 * final transcript lands, because the provisional tail is rewritten under every
 * keystroke; that transcript arrives through the caller's `onHeard`, appended
 * after the typed text exactly as before, and editability returns with it.
 */
export function ChatComposer({
  inputRef,
  value,
  onChange,
  onSend,
  onStop,
  dictation,
  sending,
  placeholder,
  ariaLabel,
  testId,
  className,
  allowWords,
}: ChatComposerProps): React.JSX.Element {
  const { listening, transcribing } = dictation;
  const { committedPreview, tentativePreview } = dictation.live;
  const provisional = [committedPreview, tentativePreview].filter((part) => part !== '').join(' ');
  // The words stay on screen from the first refresh until the finished
  // transcript replaces them: keeping them through `transcribing` is what
  // makes the swap a swap rather than a flash of an empty box.
  const dictating = listening || transcribing;
  // While she talks the box reads as one thing: her words, then the words
  // whisper has heard so far. `value` itself only ever holds what she typed —
  // the provisional tail is a view of the recording, not state to commit.
  const shown = dictating && provisional !== '' ? appendHeard(value, provisional) : value;
  const inputProps = {
    rows: 1,
    value: shown,
    disabled: sending,
    readOnly: dictating,
    placeholder,
    'aria-label': ariaLabel,
    'data-testid': testId,
    onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value),
    onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        // Enter does not send while the microphone is open either: the box
        // still holds a provisional tail, not the message she means.
        if (!dictating) onSend();
      }
    },
  };
  const hasText = shown.trim() !== '';

  return (
    <div className={className === undefined ? 'chat-input-row' : `chat-input-row ${className}`}>
      {allowWords === undefined ? (
        <AutoGrowTextarea ref={inputRef} {...inputProps} spellCheck={false} />
      ) : (
        <SpellLayer
          as="textarea"
          ref={inputRef}
          rows={1}
          value={shown}
          disabled={sending}
          readOnly={dictating}
          spellCheck={false}
          placeholder={placeholder}
          aria-label={ariaLabel}
          data-testid={testId}
          autoGrow
          onChange={onChange}
          onKeyDown={inputProps.onKeyDown}
          allowWords={allowWords}
        />
      )}
      <ComposerButtons
        dictation={dictation}
        sending={sending}
        testIdPrefix={testId.replace(/-input$/, '')}
        onSend={onSend}
        hasText={hasText}
        {...(onStop === undefined ? {} : { onStop })}
      />
    </div>
  );
}
