import type { Note, PatientListItem } from '@apunta/shared';
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
import { AutoGrowTextarea } from './AutoGrowTextarea.js';
import { CheckIcon, CopyIcon, PublishIcon, TrashIcon } from './icons.js';
import { RefineColumn } from './RefineColumn.js';

/** Long enough that a sentence saves as one edit, short enough to feel instant. */
const SAVE_DEBOUNCE_MS = 400;
/** How long the Copy button reads "Copied", as in the prototype. */
const COPIED_FLASH_MS = 1400;

export interface NoteViewProps {
  patient: PatientListItem;
  note: Note;
  /** Called with every note the server hands back, so the columns stay in step. */
  onNoteChanged: (note: Note) => void;
  onNoteDeleted: (noteId: string) => void;
}

/**
 * The note editor and its (M4) refine column — `renderNoteView` in
 * `prototype/patients.html`.
 *
 * **Render this with `key={note.id}`.** The editor holds the body text locally
 * so typing is not a round trip per keystroke; the key is what resets it when
 * the user switches notes, and what flushes an unsaved edit on the way out.
 */
export function NoteView({ patient, note, onNoteChanged, onNoteDeleted }: NoteViewProps): React.JSX.Element {
  const [text, setText] = useState(note.content);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The timers and the save queue outlive any single render.
  const noteRef = useRef(note);
  const pendingRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const onNoteChangedRef = useRef(onNoteChanged);

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
    if (!window.confirm('Delete this note? This cannot be undone.')) return;
    setBusy(true);
    try {
      await deleteNoteRequest(note.id);
      pendingRef.current = null;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
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
                void handleDelete();
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

        <div className="note-editor-body">
          <AutoGrowTextarea
            className={published ? 'note-editable is-published' : 'note-editable'}
            data-testid="note-body"
            aria-label="Note body"
            spellCheck
            value={text}
            readOnly={published}
            onChange={(event) => {
              handleChange(event.target.value);
            }}
            onBlur={() => {
              void flush();
            }}
          />
        </div>
      </div>

      <RefineColumn />
    </div>
  );
}
