import type { ChatMessage, ChatNoteUpdatedEvent, Note } from '@apunta/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { errorMessage, listChatMessages, sendChatMessage } from '../api/index.js';
import { useLoader } from '../hooks/useLoader.js';
import { SendIcon } from './icons.js';

/**
 * The quick actions from `prototype/patients.html`.
 *
 * The button wears a short label and sends the prototype's full phrase, which
 * is what the model actually reads — "Shorter" on its own is not an
 * instruction, and every one of these is one click from a rewrite of a
 * clinical note.
 */
const QUICK_ACTIONS: readonly { readonly label: string; readonly message: string }[] = [
  { label: 'Shorter', message: 'Make it shorter' },
  { label: 'More clinical', message: 'Use a more clinical tone' },
  { label: 'Expand plan', message: 'Expand the plan section' },
  { label: "What's missing?", message: 'Check for anything missing' },
];

/** The prototype truncates the highlight chip here. */
const REF_CHIP_CHARS = 70;

export interface RefineColumnProps {
  note: Note;
  /** The excerpt selected in the editor, waiting to be attached to a message. */
  refQuote: string | null;
  onClearRefQuote: () => void;
  /** The model rewrote the note: the editor and the notes list both move. */
  onNoteUpdated: (event: ChatNoteUpdatedEvent) => void;
}

/**
 * "Refine with AI" — the right half of `prototype/patients.html`.
 *
 * This is the owner's primary repair path, not a co-equal feature: asked what
 * she reaches for when a paragraph is wrong, she chose describing the problem
 * in a chat over editing it directly or highlighting it
 * (`docs/feedback/2026-08-22-owner-answers.md`, design question 4). The
 * highlight chip is the secondary affordance layered over it.
 *
 * **Render this with `key={note.id}`.** The thread, the in-flight reply and
 * the composer are all per-note; the key is what resets them when she switches.
 */
export function RefineColumn({
  note,
  refQuote,
  onClearRefQuote,
  onNoteUpdated,
}: RefineColumnProps): React.JSX.Element {
  const noteId = note.id;
  const loadThread = useCallback((signal: AbortSignal) => listChatMessages(noteId, signal), [noteId]);
  const thread = useLoader(loadThread);

  const [draft, setDraft] = useState('');
  /** The assistant's reply as it streams, before its persisted row arrives. */
  const [streaming, setStreaming] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const threadRef = useRef<HTMLDivElement>(null);
  const updateThread = thread.update;

  const messages = thread.state.status === 'ready' ? thread.state.data : [];

  // Follow the conversation down, as the prototype's `renderChatThread` does.
  useEffect(() => {
    const element = threadRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, streaming, status]);

  const append = useCallback(
    (message: ChatMessage) => {
      updateThread((current) =>
        // The user's own turn arrives twice — once optimistically, once as the
        // persisted row — and a retried send must not duplicate either.
        current.some((existing) => existing.id === message.id) ? current : [...current, message],
      );
    },
    [updateThread],
  );

  async function send(message: string): Promise<void> {
    const text = message.trim();
    if (text === '' || sending) return;

    const quote = refQuote;
    setDraft('');
    onClearRefQuote();
    setSending(true);
    setError(null);
    setStreaming('');
    setStatus(null);

    try {
      await sendChatMessage(
        noteId,
        { message: text, ...(quote === null ? {} : { ref_quote: quote }) },
        {
          onStatus: (event) => {
            setStatus(event.message);
          },
          onToken: (chunk) => {
            setStreaming((current) => (current ?? '') + chunk);
          },
          onMessage: (persisted) => {
            // The persisted row supersedes whatever streamed, so the bubble on
            // screen is the one a reload would show.
            if (persisted.role === 'assistant') setStreaming(null);
            append(persisted);
          },
          onNoteUpdated,
        },
      );
    } catch (thrown) {
      setError(errorMessage(thrown));
      // Her message is already saved server-side; drop only the half-written
      // reply, which is not.
      setStreaming(null);
      // The user's turn may not have reached the thread if the failure came
      // before its `message` event.
      thread.reload();
    } finally {
      setSending(false);
      setStatus(null);
    }
  }

  const empty = messages.length === 0 && streaming === null;

  return (
    <div className="chat-col">
      <div className="chat-header">
        <h3>Refine with AI</h3>
      </div>

      <div className="chat-thread" ref={threadRef} data-testid="chat-thread">
        {thread.state.status === 'loading' && <p className="state-note">Loading the conversation…</p>}
        {thread.state.status === 'error' && (
          <p className="form-error" role="alert">
            {thread.state.message}{' '}
            <button type="button" className="btn small btn-quick" onClick={thread.reload}>
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
          <Bubble key={message.id} message={message} />
        ))}

        {streaming !== null && (
          <div className="chat-msg ai" data-testid="chat-streaming">
            <div className="chat-bubble">
              {streaming === '' ? <span className="chat-thinking">{status ?? 'Thinking…'}</span> : streaming}
            </div>
          </div>
        )}
      </div>

      {error !== null && (
        <p className="form-error chat-error" role="alert" data-testid="chat-error">
          {error}
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

      <div className="quick-actions">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.label}
            type="button"
            className="btn small btn-quick"
            disabled={sending}
            onClick={() => {
              void send(action.message);
            }}
          >
            {action.label}
          </button>
        ))}
      </div>

      <div className="chat-input-row">
        <input
          type="text"
          placeholder="Ask a question or give feedback..."
          aria-label="Ask a question or give feedback"
          data-testid="chat-input"
          value={draft}
          disabled={sending}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            void send(draft);
          }}
        />
        <button
          type="button"
          className="btn btn-primary"
          aria-label="Send"
          data-testid="chat-send"
          disabled={sending || draft.trim() === ''}
          onClick={() => {
            void send(draft);
          }}
        >
          <SendIcon className="icon icon-sm" />
        </button>
      </div>
    </div>
  );
}

function Bubble({ message }: { message: ChatMessage }): React.JSX.Element {
  return (
    <div className={message.role === 'user' ? 'chat-msg user' : 'chat-msg ai'} data-testid="chat-msg">
      <div className="chat-bubble">
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
