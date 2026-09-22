import {
  textToSections,
  type ChatNoteUpdatedEvent,
  type Note,
  type NoteFormat,
  type PatientListItem,
} from '@apunta/shared';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  deleteNote as deleteNoteRequest,
  errorMessage,
  publishNote,
  unpublishNote,
  updateNote,
} from '../api/index.js';
import { copyText } from '../lib/clipboard.js';
import { formatEditedDate, formatNoteDate, wasEdited } from '../lib/format.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { ChatIcon, CheckIcon, CopyIcon, PublishIcon, TrashIcon } from './icons.js';
import { NoteBody } from './NoteBody.js';
import { RefineColumn } from './RefineColumn.js';
import { ThinkingDots } from './ThinkingDots.js';

/** Long enough that a sentence saves as one edit, short enough to feel instant. */
const SAVE_DEBOUNCE_MS = 400;
/** How long the Copy button reads "Copied", as in the prototype. */
const COPIED_FLASH_MS = 1400;
/** How long the editor stays lit after the chat rewrote the note. */
const REFINED_FLASH_MS = 1200;

/**
 * The chat launcher's open state survives note switches (this view remounts
 * per note) and reloads, so the chat feels like one ongoing surface rather
 * than a panel that keeps shutting itself. jsdom has no localStorage.
 */
const CHAT_OPEN_KEY = 'apunta-chat-open';

function chatStorage(): Storage | null {
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export interface NoteViewProps {
  patient: PatientListItem;
  note: Note;
  /** The note's format, for its section list. Null while formats are loading. */
  format: NoteFormat | null;
  /** Called with every note the server hands back, so the columns stay in step. */
  onNoteChanged: (note: Note) => void;
  onNoteDeleted: (noteId: string) => void;
}

/**
 * The note editor and its refine column — `renderNoteView` in
 * `prototype/patients.html`.
 *
 * **Render this with `key={note.id}`.** The editor holds the body text locally
 * so typing is not a round trip per keystroke; the key is what resets it when
 * the user switches notes, and what flushes an unsaved edit on the way out.
 */
export function NoteView({
  patient,
  note,
  format,
  onNoteChanged,
  onNoteDeleted,
}: NoteViewProps): React.JSX.Element {
  type SaveState = 'saved' | 'saving' | 'error';

  const [text, setText] = useState(note.content);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The excerpt she highlighted, waiting to be attached to a chat message. */
  const [refQuote, setRefQuote] = useState<string | null>(null);
  const [refined, setRefined] = useState(false);
  /** A refine request is in flight: the editor breathes and says updating…. */
  const [refining, setRefining] = useState(false);
  const [chatOpen, setChatOpen] = useState(() => chatStorage()?.getItem(CHAT_OPEN_KEY) === '1');
  /** Which sections the last rewrite changed, named for a moment. */
  const [changedSections, setChangedSections] = useState<readonly string[]>([]);

  // The timers and the save queue outlive any single render.
  const noteRef = useRef(note);
  const pendingRef = useRef<string | null>(null);
  const pendingRevisionRef = useRef<number | null>(null);
  const saveRevisionRef = useRef(0);
  const saveStateRef = useRef<SaveState>('saved');
  const persistedContentRef = useRef(note.content);
  const latestTextRef = useRef(note.content);
  /** Avoid a second unpublish when rapid edits queue behind the first one. */
  const draftUnlockedRef = useRef(note.status !== 'published');
  const timerRef = useRef<number | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const onNoteChangedRef = useRef(onNoteChanged);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const markSaveState = useCallback((next: SaveState): void => {
    saveStateRef.current = next;
    setSaveState(next);
  }, []);
  const hadChatOpenRef = useRef(false);
  /** Releases the chat stream only after the committed rewrite is painted. */
  const noteUpdateAckRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    noteRef.current = note;
    onNoteChangedRef.current = onNoteChanged;
  });

  useLayoutEffect(() => {
    const ack = noteUpdateAckRef.current;
    if (ack !== null) {
      noteUpdateAckRef.current = null;
      ack();
    }
  });

  useEffect(() => {
    return () => {
      // Do not strand a stream if the user switches notes while its committed
      // update is waiting for a layout pass.
      noteUpdateAckRef.current?.();
      noteUpdateAckRef.current = null;
    };
  }, []);

  // Returning from the sheet restores keyboard focus to its launcher.
  useEffect(() => {
    if (chatOpen) {
      hadChatOpenRef.current = true;
      return;
    }
    if (hadChatOpenRef.current) {
      hadChatOpenRef.current = false;
      window.requestAnimationFrame(() => fabRef.current?.focus());
    }
  }, [chatOpen]);

  /**
   * Persist the body. A published note is unpublished first: the server refuses
   * a content PATCH while it is locked, and editing after unlock is exactly the
   * prototype's `onNoteEdit` behaviour (published → draft).
   * Every save carries the edit revision that scheduled it. A response from an
   * older revision must not make the current text look saved.
   */
  const persist = useCallback(
    async (value: string, revision: number): Promise<void> => {
      if (revision !== saveRevisionRef.current) return;
      const current = noteRef.current;
      if (value === persistedContentRef.current) {
        markSaveState('saved');
        return;
      }

      markSaveState('saving');
      try {
        let target = current;
        if (target.status === 'published' && !draftUnlockedRef.current) {
          target = await unpublishNote(target.id);
          draftUnlockedRef.current = true;
          onNoteChangedRef.current(target);
        }
        const updated = await updateNote(target.id, { content: value });
        // Record server truth even when this response is stale for the editor.
        persistedContentRef.current = updated.content;
        if (revision !== saveRevisionRef.current) return;
        onNoteChangedRef.current(updated);
        markSaveState('saved');
        setError(null);
      } catch (thrown) {
        if (revision !== saveRevisionRef.current) return;
        const message = errorMessage(thrown);
        markSaveState('error');
        setError(message);
        throw thrown;
      }
    },
    [markSaveState],
  );

  /** Saves run one at a time, so a debounce and a flush cannot cross. */
  const enqueue = useCallback(
    (value: string, revision: number): Promise<void> => {
      // Recover the queue after a failed save; the next edit must still retry.
      queueRef.current = queueRef.current.catch(() => undefined).then(() => persist(value, revision));
      return queueRef.current;
    },
    [persist],
  );

  const cancelPending = useCallback((): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = null;
    pendingRevisionRef.current = null;
  }, []);

  const flush = useCallback((): Promise<void> => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const value = pendingRef.current;
    const revision = pendingRevisionRef.current;
    pendingRef.current = null;
    pendingRevisionRef.current = null;
    if (value !== null && revision !== null) return enqueue(value, revision);
    if (saveStateRef.current === 'error' && persistedContentRef.current !== latestTextRef.current) {
      return enqueue(latestTextRef.current, saveRevisionRef.current);
    }
    return queueRef.current;
  }, [enqueue]);

  // Switching notes unmounts this view (see the key requirement above); an edit
  // typed a moment earlier must still reach the server.
  useEffect(() => {
    return () => {
      void flush().catch(() => undefined);
    };
  }, [flush]);
  function handleChange(value: string): void {
    const revision = saveRevisionRef.current + 1;
    saveRevisionRef.current = revision;
    latestTextRef.current = value;
    setText(value);
    markSaveState('saving');
    pendingRef.current = value;
    pendingRevisionRef.current = revision;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (pendingRef.current === value && pendingRevisionRef.current === revision) {
        pendingRef.current = null;
        pendingRevisionRef.current = null;
      }
      void enqueue(value, revision).catch(() => undefined);
    }, SAVE_DEBOUNCE_MS);
  }

  /**
   * The chat rewrote the note. The server has already saved it, so a debounced
   * edit still in flight would write the old text back over it — drop it, and
   * light the editor for a moment so the change is not silent.
   */
  const handleNoteUpdated = useCallback(
    (event: ChatNoteUpdatedEvent): Promise<void> => {
      cancelPending();
      // The server has persisted this rewrite; invalidate every local edit
      // revision so an older response cannot overwrite the new note.
      saveRevisionRef.current += 1;
      draftUnlockedRef.current = event.note.status !== 'published';
      persistedContentRef.current = event.note.content;
      latestTextRef.current = event.note.content;
      markSaveState('saved');
      return new Promise<void>((resolve) => {
        noteUpdateAckRef.current = resolve;
        // Name what actually changed, so the flash can say which sections moved.
        const sectionNames = format?.sections ?? [];
        const before = textToSections(noteRef.current.content, sectionNames);
        const after = textToSections(event.note.content, sectionNames);
        setChangedSections(sectionNames.filter((name) => (before[name] ?? '') !== (after[name] ?? '')));
        setText(event.note.content);
        onNoteChangedRef.current(event.note);
        setError(null);
        setRefined(true);
        window.setTimeout(() => {
          setRefined(false);
          setChangedSections([]);
        }, REFINED_FLASH_MS);
      });
    },
    [cancelPending, format, markSaveState],
  );

  async function handleCopy(): Promise<void> {
    try {
      await flush();
      await copyText(text);
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, COPIED_FLASH_MS);
    } catch (thrown) {
      setError(errorMessage(thrown));
    }
  }

  /** Finish copies the note and locks it; Edit again releases that lock. */
  async function handlePublishToggle(): Promise<void> {
    setBusy(true);
    try {
      if (note.status === 'published') {
        draftUnlockedRef.current = true;
        onNoteChanged(await unpublishNote(note.id));
      } else {
        await flush();
        const finished = await publishNote(note.id);
        onNoteChanged(finished);
        await copyText(text);
      }
      setError(null);
    } catch (thrown) {
      setError(errorMessage(thrown));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(): Promise<void> {
    setBusy(true);
    try {
      await deleteNoteRequest(note.id);
      cancelPending();
      onNoteDeleted(note.id);
    } catch (thrown) {
      setError(errorMessage(thrown));
      setBusy(false);
    }
  }

  const published = note.status === 'published';

  /** "Discussion", "Discussion and Plan", "Discussion, Risk review and Plan". */
  function joinSectionNames(names: readonly string[]): string {
    if (names.length <= 1) return names[0] ?? '';
    return `${names.slice(0, -1).join(', ')} and ${String(names.at(-1))}`;
  }

  return (
    <div className={chatOpen ? 'note-chat-split chat-docked' : 'note-chat-split'}>
      <div className="note-editor-col">
        <div className="note-editor-header row between">
          <div>
            <p className="small note-meta" data-testid="note-meta">
              {patient.name} · created {formatNoteDate(note.created_at)}
              {wasEdited(note.created_at, note.updated_at)
                ? ` · edited ${formatEditedDate(note.updated_at)}`
                : ''}
            </p>
            <h2 data-testid="note-title">{note.title}</h2>
          </div>
          <div className="row gap-8 note-actions">
            <span className={`note-save-status is-${saveState}`} data-testid="note-save-status">
              {saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Couldn’t save' : 'Saved'}
            </span>
            {refining && (
              <span className="note-updating-hint" data-testid="note-updating-hint">
                <ThinkingDots label="Updating the note…" />
              </span>
            )}
            {!refining && refined && changedSections.length > 0 && (
              <span className="note-updated-hint" data-testid="note-updated-hint">
                Updated {joinSectionNames(changedSections)}
              </span>
            )}
            <button
              type="button"
              className="btn small btn-compact-icon"
              title="Delete note"
              aria-label="Delete note"
              disabled={busy}
              onClick={() => {
                setConfirmingDelete(true);
              }}
            >
              <TrashIcon className="icon icon-xs" />
            </button>
            <button
              type="button"
              className="btn small btn-compact"
              data-testid="copy-button"
              onClick={() => {
                void handleCopy();
              }}
            >
              {copied ? <CheckIcon className="icon icon-xs" /> : <CopyIcon className="icon icon-xs" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              className={
                published
                  ? 'btn small btn-compact btn-publish is-published'
                  : 'btn small btn-compact btn-publish'
              }
              data-testid="publish-button"
              disabled={busy}
              onClick={() => {
                void handlePublishToggle();
              }}
            >
              {published ? <CheckIcon className="icon icon-xs" /> : <PublishIcon className="icon icon-xs" />}
              {published ? 'Edit again' : 'Finish & copy'}
            </button>
          </div>
        </div>

        {error !== null && (
          <p className="form-error" role="alert" data-testid="note-error">
            {error}
          </p>
        )}

        <NoteBody
          ref={bodyRef}
          value={text}
          sections={format?.sections ?? []}
          // Locked while a rewrite may be in flight (owner-proxy, 2026-08-30):
          // an edit typed into a note the model is about to replace would be
          // silently lost, so while the editor breathes it does not take input.
          readOnly={published || refining}
          refined={refined}
          refining={refining}
          allowWords={[patient.name]}
          onChange={handleChange}
          onBlur={() => {
            void flush().catch(() => undefined);
          }}
          onSelect={(selected) => {
            // Only a real selection raises the chip. A collapsed caret leaves
            // the last one standing, as the prototype does — she clears it
            // with the ×, or by sending. Highlighting is aimed at the chat,
            // so it opens the panel the chip lives in.
            if (selected !== '') {
              setRefQuote(selected);
              setChatOpen(true);
              chatStorage()?.setItem(CHAT_OPEN_KEY, '1');
            }
          }}
        />
      </div>

      <button
        ref={fabRef}
        type="button"
        className="chat-fab"
        aria-label={chatOpen ? 'Close Refine note' : 'Refine note'}
        aria-expanded={chatOpen}
        data-testid="chat-fab"
        onClick={() => {
          setChatOpen((open) => {
            chatStorage()?.setItem(CHAT_OPEN_KEY, open ? '0' : '1');
            return !open;
          });
        }}
      >
        {/* While a refine runs behind a closed panel, the launcher thinks. */}
        {refining ? <ThinkingDots ariaLabel="Updating the note" /> : <ChatIcon className="icon" />}
        <span className="chat-fab-label">Refine note</span>
      </button>

      <RefineColumn
        key={note.id}
        note={note}
        allowWords={[patient.name]}
        onFlushPendingEdit={flush}
        refQuote={refQuote}
        onClearRefQuote={() => {
          setRefQuote(null);
        }}
        onNoteUpdated={handleNoteUpdated}
        onRefiningChange={setRefining}
        hidden={!chatOpen}
        onClose={() => {
          setChatOpen(false);
          chatStorage()?.setItem(CHAT_OPEN_KEY, '0');
        }}
      />

      {confirmingDelete && (
        <ConfirmDialog
          title="Delete this note?"
          confirmLabel="Delete note"
          body={
            <>
              <p>The note, its transcript and the refine conversation all go. It cannot be undone here.</p>
              <p>
                If you have already pasted this note into your records system, that copy is untouched — and so
                is any backup written before now.
              </p>
            </>
          }
          onCancel={() => {
            setConfirmingDelete(false);
          }}
          onConfirm={() => {
            setConfirmingDelete(false);
            void handleDelete();
          }}
        />
      )}
    </div>
  );
}
