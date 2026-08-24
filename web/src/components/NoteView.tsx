import type { ChatNoteUpdatedEvent, Note, NoteFormat, PatientListItem } from '@apunta/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

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
import { CheckIcon, CopyIcon, PublishIcon, TrashIcon } from './icons.js';
import { NoteBody } from './NoteBody.js';
import { RefineColumn } from './RefineColumn.js';

/** Long enough that a sentence saves as one edit, short enough to feel instant. */
const SAVE_DEBOUNCE_MS = 400;
/** How long the Copy button reads "Copied", as in the prototype. */
const COPIED_FLASH_MS = 1400;
/** How long the editor stays lit after the chat rewrote the note. */
const REFINED_FLASH_MS = 1200;

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
  const [text, setText] = useState(note.content);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The excerpt she highlighted, waiting to be attached to a chat message. */
  const [refQuote, setRefQuote] = useState<string | null>(null);
  const [refined, setRefined] = useState(false);

  // The timers and the save queue outlive any single render.
  const noteRef = useRef(note);
  const pendingRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const onNoteChangedRef = useRef(onNoteChanged);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    noteRef.current = note;
    onNoteChangedRef.current = onNoteChanged;
  });

  /**
   * Persist the body. A published note is unpublished first: the server refuses
   * a content PATCH while it is locked, and editing after unlock is exactly the
   * prototype's `onNoteEdit` behaviour (published → draft).
   */
  const persist = useCallback(async (value: string): Promise<void> => {
    const current = noteRef.current;
    if (value === current.content) return;

    try {
      let target = current;
      if (target.status === 'published') {
        target = await unpublishNote(target.id);
        onNoteChangedRef.current(target);
      }
      onNoteChangedRef.current(await updateNote(target.id, { content: value }));
      setError(null);
    } catch (thrown) {
      setError(errorMessage(thrown));
    }
  }, []);

  /** Saves run one at a time, so a debounce and a flush cannot cross. */
  const enqueue = useCallback(
    (value: string): Promise<void> => {
      queueRef.current = queueRef.current.then(() => persist(value));
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
  }, []);

  const flush = useCallback((): Promise<void> => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const value = pendingRef.current;
    pendingRef.current = null;
    return value === null ? queueRef.current : enqueue(value);
  }, [enqueue]);

  // Switching notes unmounts this view (see the key requirement above); an edit
  // typed a moment earlier must still reach the server.
  useEffect(() => {
    return () => {
      void flush();
    };
  }, [flush]);

  function handleChange(value: string): void {
    setText(value);
    pendingRef.current = value;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void enqueue(value);
    }, SAVE_DEBOUNCE_MS);
  }

  /**
   * The chat rewrote the note. The server has already saved it, so a debounced
   * edit still in flight would write the old text back over it — drop it, and
   * light the editor for a moment so the change is not silent.
   */
  const handleNoteUpdated = useCallback(
    (event: ChatNoteUpdatedEvent) => {
      cancelPending();
      setText(event.note.content);
      onNoteChangedRef.current(event.note);
      setError(null);
      setRefined(true);
      window.setTimeout(() => {
        setRefined(false);
      }, REFINED_FLASH_MS);
    },
    [cancelPending],
  );

  async function handleCopy(): Promise<void> {
    await copyText(text);
    setCopied(true);
    window.setTimeout(() => {
      setCopied(false);
    }, COPIED_FLASH_MS);
  }

  /** Publish copies the note and locks it; clicking again unlocks (prototype). */
  async function handlePublishToggle(): Promise<void> {
    setBusy(true);
    try {
      if (note.status === 'published') {
        onNoteChanged(await unpublishNote(note.id));
      } else {
        await flush();
        onNoteChanged(await publishNote(note.id));
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

  return (
    <div className="note-chat-split">
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
              {published ? 'Published (click to edit)' : 'Publish'}
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
          readOnly={published}
          refined={refined}
          onChange={handleChange}
          onBlur={() => {
            void flush();
          }}
          onSelect={(selected) => {
            // Only a real selection raises the chip. A collapsed caret leaves
            // the last one standing, as the prototype does — she clears it
            // with the ×, or by sending.
            if (selected !== '') setRefQuote(selected);
          }}
        />
      </div>

      <RefineColumn
        key={note.id}
        note={note}
        refQuote={refQuote}
        onClearRefQuote={() => {
          setRefQuote(null);
        }}
        onNoteUpdated={handleNoteUpdated}
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
