import type { BrainstormContext, BrainstormMessage, PatientListItem } from '@apunta/shared';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

import { clearBrainstorm, listBrainstorm, sendBrainstormMessage } from '../api/index.js';
import { useChatStream, type ChatStreamHandlers } from '../hooks/useChatStream.js';
import { appendHeard, useDictation } from '../hooks/useDictation.js';
import { useLoader } from '../hooks/useLoader.js';
import { firstName } from '../lib/format.js';
import { Markdown } from '../lib/markdown.js';
import { ChatComposer } from './ChatComposer.js';
import { ConfirmDialog } from './ConfirmDialog.js';

export interface BrainstormViewProps {
  patient: PatientListItem;
}

/** Brainstorm is a thinking aid, never a record. */
export function BrainstormView({ patient }: BrainstormViewProps): React.JSX.Element {
  const patientId = patient.id;
  const loadThread = useCallback((signal: AbortSignal) => listBrainstorm(patientId, signal), [patientId]);
  const thread = useLoader(loadThread);
  const reloadThread = thread.reload;
  const [messages, setMessages] = useState<BrainstormMessage[]>([]);
  const [context, setContext] = useState<BrainstormContext | null>(null);
  const [draft, setDraft] = useState('');
  const [dictationError, setDictationError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const optimisticIdRef = useRef<string | null>(null);
  const stickRef = useRef(true);
  const [confirmingNew, setConfirmingNew] = useState(false);

  const dictation = useDictation({
    onStart: () => setDictationError(null),
    onError: setDictationError,
    onHeard: (heard) => setDraft((current) => appendHeard(current, heard)),
    onSettled: () => inputRef.current?.focus(),
  });

  useEffect(() => {
    if (thread.state.status === 'ready') {
      setMessages(thread.state.data.messages);
      setContext(thread.state.data.context);
    }
  }, [thread.state]);

  const request = useCallback(
    async (
      text: string,
      handlers: ChatStreamHandlers<BrainstormMessage, BrainstormContext>,
      signal: AbortSignal,
    ): Promise<void> => {
      await sendBrainstormMessage(
        patientId,
        { message: text },
        {
          onStatus: (event) => handlers.onStatus(event.message),
          onToken: handlers.onToken,
          onMessage: handlers.onMessage,
          onContext: handlers.onContext,
        },
        signal,
      );
    },
    [patientId],
  );

  const chat = useChatStream<BrainstormMessage, BrainstormContext>(request, {
    onStarted: (text) => {
      setDraft('');
      const optimisticId = `optimistic-${Date.now().toString()}`;
      optimisticIdRef.current = optimisticId;
      setMessages((current) => [
        ...current,
        {
          id: optimisticId,
          patient_id: patientId,
          role: 'user',
          text,
          created_at: new Date().toISOString(),
        },
      ]);
    },
    onMessage: (persisted) => {
      setMessages((current) => {
        if (persisted.role === 'user') {
          return current.map((message) => (message.id === optimisticIdRef.current ? persisted : message));
        }
        return current.some((message) => message.id === persisted.id) ? current : [...current, persisted];
      });
      return persisted.role === 'assistant';
    },
    onContext: setContext,
  });
  const { clearError, error, send, sending, status, streaming, stop } = chat;

  useEffect(() => {
    if (error !== null) reloadThread();
  }, [error, reloadThread]);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  useEffect(() => {
    const element = threadRef.current;
    if (element && stickRef.current) element.scrollTop = element.scrollHeight;
  }, [messages, streaming, status]);

  const startNew = useCallback(async (): Promise<void> => {
    setConfirmingNew(false);
    clearError();
    setDictationError(null);
    try {
      const fresh = await clearBrainstorm(patientId);
      setMessages(fresh.messages);
      setContext(fresh.context);
      inputRef.current?.focus();
    } catch (thrown) {
      setDictationError(thrown instanceof Error ? thrown.message : String(thrown));
    }
  }, [clearError, patientId]);

  return (
    <div className="brainstorm-view" data-testid="brainstorm-view">
      <header className="note-editor-header row between">
        <div>
          <p className="small note-meta">{patient.name}</p>
          <h2>Brainstorm</h2>
        </div>
        <button
          type="button"
          className="btn small btn-compact"
          data-testid="brainstorm-new"
          disabled={sending}
          onClick={() => setConfirmingNew(true)}
        >
          New conversation
        </button>
      </header>

      {context !== null && (
        <details className="brainstorm-context" data-testid="brainstorm-context">
          <summary className="small note-meta">{contextSummary(context)}</summary>
          {context.notes.length > 0 && (
            <ul className="brainstorm-context-notes">
              {context.notes.map((note) => (
                <li key={note.id} className="small note-meta">
                  {note.title} — {note.date}
                </li>
              ))}
            </ul>
          )}
        </details>
      )}

      <div
        className="chat-thread brainstorm-thread"
        data-testid="brainstorm-thread"
        ref={threadRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          stickRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
        }}
      >
        {thread.state.status === 'loading' && <p className="small state-note">Loading…</p>}
        {thread.state.status === 'error' && (
          <p className="small state-note error-state" role="alert">
            {thread.state.message}{' '}
            <button type="button" className="btn small btn-quick" onClick={reloadThread}>
              Try again
            </button>
          </p>
        )}
        {thread.state.status === 'ready' && messages.length === 0 && !sending && (
          <p className="small state-note" data-testid="brainstorm-empty">
            Think out loud about {firstName(patient.name)} — this conversation is never written into their
            notes.
          </p>
        )}
        {messages.map((message) =>
          message.role === 'user' ? (
            <div key={message.id} className="chat-msg user" data-testid="brainstorm-user">
              <div className="chat-bubble">{message.text}</div>
            </div>
          ) : (
            <MarkdownBubble key={message.id} message={message} />
          ),
        )}
        {streaming !== null && (
          <div className="chat-msg ai" data-testid="brainstorm-streaming">
            <div className="chat-bubble">{streaming === '' ? (status ?? 'Thinking…') : streaming}</div>
          </div>
        )}
      </div>

      {(error ?? dictationError) !== null && (
        <p className="form-error" role="alert" data-testid="brainstorm-error">
          {error ?? dictationError}
        </p>
      )}

      <ChatComposer
        inputRef={inputRef}
        value={draft}
        onChange={setDraft}
        onSend={() => void send(draft)}
        onStop={stop}
        dictation={dictation}
        sending={sending}
        placeholder="Think out loud…"
        ariaLabel="Brainstorm message"
        testId="brainstorm-input"
        className="brainstorm-composer"
      />

      {confirmingNew && (
        <ConfirmDialog
          title="Start a new conversation?"
          body={
            <p>
              This forgets the conversation above. {firstName(patient.name)}&rsquo;s notes stay exactly as
              they are.
            </p>
          }
          confirmLabel="Forget it"
          onCancel={() => setConfirmingNew(false)}
          onConfirm={() => void startNew()}
        />
      )}
    </div>
  );
}

const MarkdownBubble = memo(function MarkdownBubble({
  message,
}: {
  message: BrainstormMessage;
}): React.JSX.Element {
  return (
    <div className="chat-msg ai" data-testid="brainstorm-reply">
      <div className="chat-bubble">
        <Markdown text={message.text} />
      </div>
    </div>
  );
});

function contextSummary(context: BrainstormContext): string {
  const count = context.notes.length;
  const total = Math.max(context.total, count);
  if (total === 0) return 'No notes yet';
  if (count === total) return `Thinking with ${String(count)} note${count === 1 ? '' : 's'}`;
  if (count === 0) return `No room for any of ${String(total)} notes`;
  return context.most_recent
    ? `Using the ${count === 1 ? 'most recent' : `${String(count)} most recent`} of ${String(total)} notes`
    : `Using ${String(count)} of ${String(total)} notes`;
}
