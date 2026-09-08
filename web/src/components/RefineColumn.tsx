import {
  MAX_DICTATION_SECONDS,
  type ChatMessage,
  type ChatNoteUpdatedEvent,
  type Note,
} from '@apunta/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { dictateClip, errorMessage, listChatMessages, sendChatMessage } from '../api/index.js';
import { useLiveRecording } from '../hooks/useLiveRecording.js';
import { useLoader } from '../hooks/useLoader.js';
import { formatTimer } from '../lib/recorder.js';
import { MicIcon, SendIcon } from './icons.js';
import { LiveRecording } from './LiveRecording.js';
import { ThinkingDots } from './ThinkingDots.js';

/** What the composer says when whisper heard no words in the clip. */
export const NOTHING_HEARD_MESSAGE =
  'Apunta didn’t catch any words. Try again, a little closer to the microphone.';

/**
 * The quick actions from `prototype/patients.html`.
 *
 * The button wears a short label and sends a full phrase, which is what the
 * model actually reads — "Shorter" on its own is not an instruction, and
 * every one of these is one click from a rewrite of a clinical note.
 *
 * Three phrases are the prototype's verbatim. "What's missing?" is not: the
 * prototype sent an imperative ("Check for…"), and without a question mark
 * both the model and the published-note question detector
 * (`server/src/routes/chat.ts`) read it as an edit command — in live testing
 * it rewrote a note nobody asked to change. The chip now sends a genuine
 * question, so the answer comes back as a reply, never a rewrite. Only the
 * hidden message changed; the visible label is still the prototype's copy.
 */
const QUICK_ACTIONS: readonly { readonly label: string; readonly message: string }[] = [
  { label: 'Shorter', message: 'Make it shorter' },
  { label: 'More clinical', message: 'Use a more clinical tone' },
  { label: 'Expand plan', message: 'Expand the plan section' },
  { label: "What's missing?", message: 'What is missing from this note?' },
];

/** The prototype truncates the highlight chip here. */
const REF_CHIP_CHARS = 70;

export interface RefineColumnProps {
  note: Note;
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
 * floating card rather than a column.
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
  /** Whisper has the clip; the words are on their way to the box. */
  const [transcribing, setTranscribing] = useState(false);

  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dictationAbortRef = useRef<AbortController | null>(null);
  const updateThread = thread.update;

  /**
   * Dictating into the composer (owner-proxy, 2026-09-07): the capture
   * screen's recorder, dot and growing transcript, a clip instead of a
   * session, and the words land in the box for her to read and edit before
   * anything is sent. Whisper runs on the server as always; nothing here
   * touches a browser speech API.
   */
  const live = useLiveRecording({
    onError: setError,
    stopAfterSeconds: MAX_DICTATION_SECONDS,
    onLimit: () => {
      void finishDictation();
    },
  });

  // Switching notes or closing the tab mid-reply must stop the model, not
  // leave it generating into a stream nobody is reading: the server watches
  // for the disconnect and aborts its call to Ollama. The microphone is the
  // hook's to close.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      dictationAbortRef.current?.abort();
    };
  }, []);

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
      await onFlushPendingEdit?.();
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

  async function startDictation(): Promise<void> {
    if (sending || live.phase !== 'idle') return;
    setError(null);
    await live.start();
  }

  async function finishDictation(): Promise<void> {
    const clip = await live.stop();
    if (clip === null) return;
    setTranscribing(true);
    const controller = new AbortController();
    dictationAbortRef.current = controller;

    try {
      const heard = (await dictateClip(clip, controller.signal)).text.trim();
      if (controller.signal.aborted) return;
      if (heard === '') {
        setError(NOTHING_HEARD_MESSAGE);
      } else {
        // Appended, never replacing: she may have typed half of it already.
        setDraft((current) => (current.trim() === '' ? heard : `${current.trimEnd()} ${heard}`));
      }
    } catch (thrown) {
      if (controller.signal.aborted) return;
      setError(errorMessage(thrown));
    } finally {
      if (dictationAbortRef.current === controller) dictationAbortRef.current = null;
      setTranscribing(false);
      if (!controller.signal.aborted) {
        inputRef.current?.focus();
      }
    }
  }

  const listening = live.phase !== 'idle';

  const empty = messages.length === 0 && streaming === null;

  return (
    <div className={hidden ? 'chat-col is-closed' : 'chat-col'} data-testid="chat-panel">
      {/* No heading (owner-proxy, 2026-08-30): the panel is unmistakably a
          chat, and a title inside a small floating card is a line of the
          conversation's height spent saying what it plainly is. */}
      <div className="chat-header row between">
        {onClose !== undefined && (
          <button
            type="button"
            className="btn small btn-compact-icon"
            aria-label="Close chat"
            data-testid="chat-close"
            onClick={() => {
              live.cancel();
              dictationAbortRef.current?.abort();
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

      {live.phase === 'recording' ? (
        <LiveRecording
          level={live.level}
          seconds={live.seconds}
          preview={live.preview}
          previewNote="Everything so far, roughly. Your message is written from the finished recording."
        >
          <button
            type="button"
            className="btn btn-primary"
            data-testid="record-stop"
            onClick={() => {
              void finishDictation();
            }}
          >
            Stop dictating
          </button>
        </LiveRecording>
      ) : (
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
      )}

      <div className="chat-input-row">
        <input
          ref={inputRef}
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
          className={listening ? 'btn btn-mic is-recording' : 'btn btn-mic'}
          aria-label={listening ? 'Stop dictating' : 'Dictate a message'}
          aria-pressed={listening}
          data-testid="chat-mic"
          disabled={sending || transcribing}
          onClick={() => {
            void (listening ? finishDictation() : startDictation());
          }}
        >
          {listening ? (
            <>
              <span className="chat-mic-dot" aria-hidden="true" />
              <span className="chat-mic-timer" data-testid="chat-mic-timer">
                {formatTimer(live.seconds)}
              </span>
            </>
          ) : transcribing ? (
            <ThinkingDots ariaLabel="Transcribing" />
          ) : (
            <MicIcon className="icon icon-sm" />
          )}
        </button>
        {/* Full colour whatever the box holds: dimmed for an empty box, the
            arrow read as grey on faint green (owner-proxy, 2026-09-07). An
            empty send is simply nothing. */}
        <button
          type="button"
          className="btn btn-primary btn-send"
          aria-label="Send"
          data-testid="chat-send"
          disabled={sending}
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
