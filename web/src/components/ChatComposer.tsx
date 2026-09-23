import type { RefObject } from 'react';

import type { Dictation } from '../hooks/useDictation.js';
import { ComposerButtons, DictationPanel } from './ComposerButtons.js';

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
}: ChatComposerProps): React.JSX.Element {
  return (
    <>
      <DictationPanel dictation={dictation} />
      <div className={className === undefined ? 'chat-input-row' : `chat-input-row ${className}`}>
        <textarea
          ref={inputRef}
          rows={2}
          value={value}
          disabled={sending}
          spellCheck={false}
          placeholder={placeholder}
          aria-label={ariaLabel}
          data-testid={testId}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              onSend();
            }
          }}
        />
        <ComposerButtons
          dictation={dictation}
          sending={sending}
          testIdPrefix={testId.replace(/-input$/, '')}
          onSend={onSend}
          onStop={onStop}
        />
      </div>
    </>
  );
}
