import type { ChatMessage, ChatNoteUpdatedEvent, Note } from '@apunta/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { listChatMessages, sendChatMessage } from '../api/index.js';
import { useChatStream, type ChatStreamHandlers } from '../hooks/useChatStream.js';
import { appendHeard, useDictation } from '../hooks/useDictation.js';
import { useLoader } from '../hooks/useLoader.js';
import { ChatComposer } from './ChatComposer.js';
import { Dialog } from './Dialog.js';
import { ThinkingDots } from './ThinkingDots.js';

export { NOTHING_HEARD_MESSAGE } from '../hooks/useDictation.js';

const REF_CHIP_CHARS = 70;
const SAVE_BEFORE_CHAT_ERROR = "Your latest edits haven't saved, so Apunta can't use them yet. Try again.";

export interface RefineColumnProps {
  note: Note;
  allowWords?: readonly string[];
  refQuote: string | null;
  onClearRefQuote: () => void;
  onNoteUpdated: (event: ChatNoteUpdatedEvent) => void | Promise<void>;
  onFlushPendingEdit?: () => Promise<void>;
  onRefiningChange?: (refining: boolean) => void;
  hidden?: boolean;
  onClose?: () => void;
}

/** The refine chat, with the same stream lifecycle and composer as Brainstorm. */
export function RefineColumn({
  note,
  allowWords = [],
  refQuote,
  onClearRefQuote,
  onNoteUpdated,
  onFlushPendingEdit,
  onRefiningChange,
  hidden = false,
  onClose,
}: RefineColumnProps): React.JSX.Element {
  const noteId = note.id;
  const loadThread = useCallback((signal: AbortSignal) => listChatMessages(noteId, signal), [noteId]);
  const thread = useLoader(loadThread);
  const updateThread = thread.update;
  const reloadThread = thread.reload;
  const [draft, setDraft] = useState('');
  const [dictationError, setDictationError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{
    kind: ChatNoteUpdatedEvent['outcome'];
    reason: string | null;
  } | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const dictation = useDictation({
    onStart: () => setDictationError(null),
    onError: setDictationError,
    onHeard: (heard) => setDraft((current) => appendHeard(current, heard)),
    onSettled: () => inputRef.current?.focus(),
  });

  const append = useCallback(
    (message: ChatMessage): boolean => {
      updateThread((current) =>
        current.some((existing) => existing.id === message.id) ? current : [...current, message],
      );
      return message.role === 'assistant';
    },
    [updateThread],
  );

  const handleNoteUpdated = useCallback(
    (event: ChatNoteUpdatedEvent): void | Promise<void> => {
      setOutcome({ kind: event.outcome, reason: event.outcome_reason });
      return onNoteUpdated(event);
    },
    [onNoteUpdated],
  );

  const request = useCallback(
    async (
      text: string,
      handlers: ChatStreamHandlers<ChatMessage, never>,
      signal: AbortSignal,
    ): Promise<void> => {
      await sendChatMessage(
        noteId,
        { message: text, ...(refQuote === null ? {} : { ref_quote: refQuote }) },
        {
          onStatus: (event) => handlers.onStatus(event.message),
          onToken: handlers.onToken,
          onMessage: handlers.onMessage,
          onNoteUpdated: handleNoteUpdated,
        },
        signal,
      );
    },
    [handleNoteUpdated, noteId, refQuote],
  );

  const chat = useChatStream<ChatMessage, never>(request, {
    beforeSend: async () => {
      try {
        await onFlushPendingEdit?.();
      } catch {
        throw new Error(SAVE_BEFORE_CHAT_ERROR);
      }
    },
    onStarted: () => {
      setDraft('');
      setOutcome(null);
      onClearRefQuote();
    },
    onMessage: append,
  });

  useEffect(() => {
    onRefiningChange?.(chat.sending);
  }, [chat.sending, onRefiningChange]);

  useEffect(() => {
    if (chat.error !== null) reloadThread();
  }, [chat.error, reloadThread]);

  useEffect(() => {
    return () => chat.stop();
  }, [chat.stop]);

  useEffect(() => {
    if (!hidden) inputRef.current?.focus();
  }, [hidden]);

  const messages = thread.state.status === 'ready' ? thread.state.data : [];
  useEffect(() => {
    const element = threadRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, chat.streaming, chat.status]);

  const closePanel = useCallback(() => onClose?.(), [onClose]);
  const empty = messages.length === 0 && chat.streaming === null;
  const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant');

  return (
    <Dialog
      title="Refine note"
      onClose={closePanel}
      variant="sheet"
      modal={false}
      className={hidden ? 'chat-col is-sheet is-closed' : 'chat-col is-sheet'}
      initialFocusRef={inputRef}
      open={!hidden}
      showTitle={false}
      testId="chat-panel"
    >
      <div className="chat-header row between">
        <h2 className="chat-header-title" id="refine-note-title">
          Refine note
        </h2>
        {onClose !== undefined && (
          <button
            type="button"
            className="btn small btn-compact-icon"
            aria-label="Close Refine note"
            data-testid="chat-close"
            onClick={() => {
              dictation.cancel();
              onClose();
            }}
          >
            ×
          </button>
        )}
      </div>

      <div className="chat-thread" ref={threadRef} data-testid="chat-thread">
        {thread.state.status === 'loading' && <p className="state-note">Loading the conversation…</p>}
        {thread.state.status === 'error' && (
          <p className="form-error" role="alert">
            {thread.state.message}{' '}
            <button type="button" className="btn small btn-quick" onClick={reloadThread}>
              Try again
            </button>
          </p>
        )}
        {thread.state.status === 'ready' && empty && (
          <p className="small chat-placeholder">
            Ask a question about this note, or give feedback to refine it.
          </p>
        )}
        {messages.map((message) => (
          <Bubble key={message.id} message={message} announce={message.id === lastAssistant?.id} />
        ))}
        {chat.streaming !== null && (
          <div className="chat-msg ai" data-testid="chat-streaming">
            <div className="chat-bubble">
              {chat.streaming === '' ? (
                <span className="chat-thinking">
                  <ThinkingDots ariaLabel={chat.status ?? 'Thinking'} />
                </span>
              ) : (
                chat.streaming
              )}
              {chat.status?.startsWith('Rewriting ') && (
                <span className="chat-progress" role="status" data-testid="chat-progress">
                  {chat.status}
                </span>
              )}
            </div>
          </div>
        )}
        {outcome !== null && (
          <p className={`chat-outcome is-${outcome.kind}`} role="status" data-testid="refine-outcome">
            <strong>
              {outcome.kind === 'applied'
                ? 'Changes applied'
                : outcome.kind === 'withheld'
                  ? 'No changes applied'
                  : 'No changes applied'}
            </strong>
            {outcome.reason === null ? null : ` — ${outcome.reason}`}
          </p>
        )}
      </div>

      {(chat.error ?? dictationError) !== null && (
        <p className="form-error chat-error" role="alert" data-testid="chat-error">
          {chat.error ?? dictationError}
        </p>
      )}

      {refQuote !== null && (
        <div className="ref-chip" data-testid="ref-chip">
          <span>“{truncate(refQuote)}”</span>
          <button type="button" aria-label="Clear highlighted excerpt" onClick={onClearRefQuote}>
            ×
          </button>
        </div>
      )}

      <ChatComposer
        inputRef={inputRef}
        value={draft}
        onChange={setDraft}
        onSend={() => void chat.send(draft)}
        onStop={chat.stop}
        dictation={dictation}
        sending={chat.sending}
        placeholder="Ask a question or give feedback..."
        ariaLabel="Ask a question or give feedback"
        testId="chat-input"
        allowWords={allowWords}
      />
    </Dialog>
  );
}

function Bubble({
  message,
  announce = false,
}: {
  message: ChatMessage;
  announce?: boolean;
}): React.JSX.Element {
  return (
    <div className={message.role === 'user' ? 'chat-msg user' : 'chat-msg ai'} data-testid="chat-msg">
      <div
        className="chat-bubble"
        {...(message.role === 'assistant' && announce ? { role: 'status', 'aria-live': 'polite' } : {})}
      >
        {message.ref_quote !== null && message.ref_quote !== '' && (
          <div className="chat-quote">“{message.ref_quote}”</div>
        )}
        {message.text}
      </div>
    </div>
  );
}

function truncate(text: string): string {
  return text.length > REF_CHIP_CHARS ? `${text.slice(0, REF_CHIP_CHARS)}…` : text;
}
