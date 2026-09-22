import type { BrainstormContext, BrainstormMessage, PatientListItem } from '@apunta/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { clearBrainstorm, errorMessage, listBrainstorm, sendBrainstormMessage } from '../api/index.js';
import { appendHeard, useDictation } from '../hooks/useDictation.js';
import { useLoader } from '../hooks/useLoader.js';
import { firstName } from '../lib/format.js';
import { Markdown } from '../lib/markdown.js';
import { ComposerButtons, DictationPanel } from './ComposerButtons.js';
import { ConfirmDialog } from './ConfirmDialog.js';

/**
 * Brainstorm (M12): a freeform chat with the local model about one patient.
 *
 * A thinking aid, never a record. Nothing typed or streamed here can revise
 * a note, a plan or the patient's details — the endpoint has no write path
 * to any of them, and the screen offers none either: there are no citations,
 * no follow-through into notes, no way to attach a reply anywhere.
 *
 * The composer wears the refine chat's microphone and send arrow (owner,
 * 2026-09-22): dictation goes through local whisper into the box, and
 * nothing is sent until she presses the arrow.
 *
 * Enter sends and Shift+Enter breaks the line; Stop abandons the reply (the
 * user's turn stays saved, no assistant turn is written); the thread follows
 * along until she scrolls up; the Context line says which notes the model
 * was given. Replies render as Markdown through our own renderer — React
 * text nodes only, so no reply can smuggle in an element.
 */
export interface BrainstormViewProps {
  patient: PatientListItem;
}

export function BrainstormView({ patient }: BrainstormViewProps): React.JSX.Element {
  const patientId = patient.id;

  const loadThread = useCallback((signal: AbortSignal) => listBrainstorm(patientId, signal), [patientId]);
  const thread = useLoader(loadThread);
  const reloadThread = thread.reload;

  const [messages, setMessages] = useState<BrainstormMessage[]>([]);
  const [context, setContext] = useState<BrainstormContext | null>(null);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingNew, setConfirmingNew] = useState(false);

  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stickRef = useRef(true);
  const optimisticIdRef = useRef<string | null>(null);

  const dictation = useDictation({
    onStart: () => {
      setError(null);
    },
    onError: setError,
    onHeard: (heard) => {
      setDraft((current) => appendHeard(current, heard));
    },
    onSettled: () => {
      inputRef.current?.focus();
    },
  });

  // Opening the view loads the saved conversation; a send below keeps the
  // local copy current turn by turn after that.
  useEffect(() => {
    if (thread.state.status === 'ready') {
      setMessages(thread.state.data.messages);
      setContext(thread.state.data.context);
    }
  }, [thread.state]);

  // Leaving the view mid-reply stops the model rather than leaving it writing
  // into a stream nobody is reading.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Follow the conversation down, until she scrolls up to reread — then let go.
  useEffect(() => {
    const element = threadRef.current;
    if (element && stickRef.current) element.scrollTop = element.scrollHeight;
  }, [messages, streaming, status]);

  const send = useCallback(
    async (text: string): Promise<void> => {
      const trimmed = text.trim();
      if (trimmed === '' || sending) return;

      setDraft('');
      setSending(true);
      setError(null);
      setStreaming('');
      setStatus(null);

      const optimisticId = `optimistic-${Date.now().toString()}`;
      optimisticIdRef.current = optimisticId;
      setMessages((current) => [
        ...current,
        {
          id: optimisticId,
          patient_id: patientId,
          role: 'user',
          text: trimmed,
          created_at: new Date().toISOString(),
        },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await sendBrainstormMessage(
          patientId,
          { message: trimmed },
          {
            onStatus: (event) => {
              setStatus(event.message);
            },
            onToken: (chunk) => {
              setStreaming((current) => (current ?? '') + chunk);
            },
            onMessage: (persisted) => {
              // The persisted row supersedes whatever streamed, so the bubble
              // on screen is the one a reload would show.
              if (persisted.role === 'assistant') setStreaming(null);
              setMessages((current) =>
                current.map((message) =>
                  message.id === optimisticIdRef.current && persisted.role === 'user' ? persisted : message,
                ),
              );
              if (persisted.role === 'assistant') {
                setMessages((current) =>
                  current.some((existing) => existing.id === persisted.id)
                    ? current
                    : [...current, persisted],
                );
              }
            },
            onContext: (value) => {
              setContext(value);
            },
          },
          controller.signal,
        );
      } catch (thrown) {
        // Stopping is her choice, not a failure to report.
        if (controller.signal.aborted) return;
        setError(errorMessage(thrown));
        // Her message is already saved server-side; drop only the half-written
        // reply, which is not.
        setStreaming(null);
        // The user's turn may not have reached the thread if the failure came
        // before its `message` event.
        reloadThread();
      } finally {
        abortRef.current = null;
        optimisticIdRef.current = null;
        setSending(false);
        setStatus(null);
      }
    },
    [patientId, sending, reloadThread],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    // The send's catch sees the abort and stands down; clear the half-written
    // bubble now so stopping feels immediate.
    setStreaming(null);
  }, []);

  const startNew = useCallback(async (): Promise<void> => {
    setConfirmingNew(false);
    setError(null);
    try {
      const fresh = await clearBrainstorm(patientId);
      setMessages(fresh.messages);
      setContext(fresh.context);
      inputRef.current?.focus();
    } catch (thrown) {
      setError(errorMessage(thrown));
    }
  }, [patientId]);

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
          onClick={() => {
            setConfirmingNew(true);
          }}
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
            <div key={message.id} className="chat-msg ai" data-testid="brainstorm-reply">
              <div className="chat-bubble">
                <Markdown text={message.text} />
              </div>
            </div>
          ),
        )}
        {streaming !== null && (
          <div className="chat-msg ai" data-testid="brainstorm-streaming">
            <div className="chat-bubble">{streaming === '' ? (status ?? 'Thinking…') : streaming}</div>
          </div>
        )}
      </div>

      {error !== null && (
        <p className="form-error" role="alert" data-testid="brainstorm-error">
          {error}
        </p>
      )}

      <DictationPanel dictation={dictation} />

      <div className="chat-input-row brainstorm-composer">
        <textarea
          ref={inputRef}
          rows={2}
          data-testid="brainstorm-input"
          placeholder="Think out loud…"
          aria-label="Brainstorm message"
          value={draft}
          disabled={sending}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void send(draft);
            }
          }}
        />
        <ComposerButtons
          dictation={dictation}
          sending={sending}
          testIdPrefix="brainstorm"
          onSend={() => {
            void send(draft);
          }}
          onStop={stop}
        />
      </div>

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
          onCancel={() => {
            setConfirmingNew(false);
          }}
          onConfirm={() => {
            void startNew();
          }}
        />
      )}
    </div>
  );
}

/**
 * The Context line. When notes had to be left out for space it says so, in
 * so many words: she should never think the model read a note it did not.
 */
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
