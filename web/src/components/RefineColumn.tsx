import type { ChatMessage, ChatNoteUpdatedEvent, Note } from '@apunta/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { errorMessage, listChatMessages, sendChatMessage } from '../api/index.js';
import { appendHeard, useDictation } from '../hooks/useDictation.js';
import { useLoader } from '../hooks/useLoader.js';
import { ComposerButtons, DictationPanel } from './ComposerButtons.js';
import { SpellcheckInput } from './SpellcheckInput.js';
import { ThinkingDots } from './ThinkingDots.js';

export { NOTHING_HEARD_MESSAGE } from '../hooks/useDictation.js';

/** The prototype truncates the highlight chip here. */
const REF_CHIP_CHARS = 70;
const SAVE_BEFORE_CHAT_ERROR = "Your latest edits haven't saved, so Apunta can't use them yet. Try again.";

export interface RefineColumnProps {
  note: Note;
  /** Words the patient's conversation may contain that the dictionary would not know. */
  allowWords?: readonly string[];
  /** The excerpt selected in the editor, waiting to be attached to a message. */
  refQuote: string | null;
  onClearRefQuote: () => void;
  /** The model rewrote the note: the editor and the notes list both move. */
  onNoteUpdated: (event: ChatNoteUpdatedEvent) => void | Promise<void>;
  /** Flush the editor's debounce before the server snapshots this note. */
  onFlushPendingEdit?: () => Promise<void>;
  /**
   * A refine request is in flight, so the note may be about to change. The
   * editor uses this to breathe and say "updating…" — the reply text often
   * finishes seconds before the rewrite arrives, and without this the chat
   * reads as done while the note sits still (live finding, 2026-08-28).
   */
  onRefiningChange?: (refining: boolean) => void;
  /**
   * The chat floats behind a launcher (owner-proxy, 2026-08-30). Closed is a
   * class, never an unmount: this component's cleanup aborts an in-flight
   * refine, so unmounting on close would cancel work she just asked for.
   */
  hidden?: boolean;
  onClose?: () => void;
}

/**
 * The refine chat — the right half of `prototype/patients.html`, now a
 * titled floating card rather than a column. At the shared narrow breakpoint
 * the same mounted conversation becomes a sheet, so closing it never discards
 * a draft or an in-flight reply.
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

  const [draft, setDraft] = useState('');
  /** The assistant's reply as it streams, before its persisted row arrives. */
  const [streaming, setStreaming] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const updateThread = thread.update;

  /**
   * Dictating into the composer (owner-proxy, 2026-09-07): the words land in
   * the box for her to read and edit before anything is sent.
   */
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

  // Switching notes or closing the tab mid-reply must stop the model, not
  // leave it generating into a stream nobody is reading: the server watches
  // for the disconnect and aborts its call to Ollama. The microphone is the
  // dictation hook's to close.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Opening the floating card or narrow sheet puts the keyboard in its
  // composer. Closing is handled by NoteView, which restores launcher focus.
  useEffect(() => {
    if (!hidden) inputRef.current?.focus();
  }, [hidden]);

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
    setSending(true);
    onRefiningChange?.(true);
    setError(null);
    setStreaming('');
    setStatus(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // The chat endpoint reads the note immediately. Await the editor's
      // debounce first, or its rewrite can be based on stale text and the
      // eventual note save can write that stale snapshot back over it.
      try {
        await onFlushPendingEdit?.();
      } catch {
        // A refine request against the last server copy would ignore her
        // latest edits. Keep the message in the composer so she can retry.
        setError(SAVE_BEFORE_CHAT_ERROR);
        setStreaming(null);
        return;
      }
      setDraft('');
      onClearRefQuote();
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
        controller.signal,
      );
    } catch (thrown) {
      // An abort is her navigating away, not a failure to report.
      if (controller.signal.aborted) return;
      setError(errorMessage(thrown));
      // Her message is already saved server-side; drop only the half-written
      // reply, which is not.
      setStreaming(null);
      // The user's turn may not have reached the thread if the failure came
      // before its `message` event.
      thread.reload();
    } finally {
      abortRef.current = null;
      onRefiningChange?.(false);
      if (!controller.signal.aborted) {
        setSending(false);
        setStatus(null);
      }
    }
  }

  const empty = messages.length === 0 && streaming === null;

  return (
    <div
      className={hidden ? 'chat-col is-sheet is-closed' : 'chat-col is-sheet'}
      data-testid="chat-panel"
      role="dialog"
      aria-labelledby="refine-note-title"
      aria-hidden={hidden}
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
              {streaming === '' ? (
                // Dots alone (owner-proxy, 2026-08-30): the cycling is the
                // signal, and a caption under it read as clutter. The stage
                // text still reaches assistive tech through the aria-label.
                <span className="chat-thinking">
                  <ThinkingDots ariaLabel={status ?? 'Thinking'} />
                </span>
              ) : (
                streaming
              )}
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

      <DictationPanel dictation={dictation} />

      <div className="chat-input-row">
        <SpellcheckInput
          ref={inputRef}
          type="text"
          placeholder="Ask a question or give feedback..."
          aria-label="Ask a question or give feedback"
          data-testid="chat-input"
          value={draft}
          allowWords={allowWords}
          disabled={sending}
          onChange={(value) => {
            setDraft(value);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            void send(draft);
          }}
        />
        <ComposerButtons
          dictation={dictation}
          sending={sending}
          testIdPrefix="chat"
          onSend={() => {
            void send(draft);
          }}
        />
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
