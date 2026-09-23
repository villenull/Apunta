import type { RefObject } from 'react';

import type { Dictation } from '../hooks/useDictation.js';
import { ComposerButtons, DictationPanel } from './ComposerButtons.js';
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

/** One predictable multiline composer shared by refine and Brainstorm. */
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
  const inputProps = {
    rows: 2,
    value,
    disabled: sending,
    placeholder,
    'aria-label': ariaLabel,
    'data-testid': testId,
    onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value),
    onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        onSend();
      }
    },
  };

  return (
    <>
      <DictationPanel dictation={dictation} />
      <div className={className === undefined ? 'chat-input-row' : `chat-input-row ${className}`}>
        {allowWords === undefined ? (
          <textarea ref={inputRef} {...inputProps} spellCheck={false} />
        ) : (
          <SpellLayer
            as="textarea"
            ref={inputRef}
            rows={2}
            value={value}
            disabled={sending}
            spellCheck={false}
            placeholder={placeholder}
            aria-label={ariaLabel}
            data-testid={testId}
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
          {...(onStop === undefined ? {} : { onStop })}
        />
      </div>
    </>
  );
}
