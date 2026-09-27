import {
  sectionsToText,
  suggestInterventionApproach,
  textToSections,
  type ChatNoteUpdatedEvent,
  type Note,
  type NoteFormat,
  type PatientListItem,
} from '@apunta/shared';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  ApiRequestError,
  deleteNote as deleteNoteRequest,
  errorMessage,
  getNote,
  publishNote,
  unpublishNote,
  updateNote,
} from '../api/index.js';
import { copyText } from '../lib/clipboard.js';
import { wasEdited } from '../lib/format.js';
import { useI18n, useReportWork } from '../lib/i18n.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { ChatIcon, CheckIcon, CopyIcon, PublishIcon, TrashIcon } from './icons.js';
import { InterventionApproachSuggestion } from './InterventionApproachSuggestion.js';
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

/**
 * Whether an ISO timestamp fell on the same local day as `now` — the test
 * `format.ts`'s own `sameDay` makes, copied here rather than imported.
 *
 * `web/src/lib/format.ts` is read-only for this card (Fixed decision 4): it
 * keeps the English the app has always shown, and it is the oracle every
 * catalogue entry is pinned against. The same-day test belongs to the screen
 * that picks the key, and it is three comparisons of two values the component
 * already holds — so it is here, and not one line of the oracle changes.
 *
 * A timestamp that is not a date is not today: it falls to the `date`-kinded
 * key, which renders the value as it stands, exactly as `formatNoteDate` did.
 */
function sameDay(iso: string, now: Date): boolean {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
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
  type SaveState = 'saved' | 'saving' | 'error' | 'conflict';

  const { t } = useI18n();
  const [text, setText] = useState(note.content);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState<{ mine: string; theirs: Note } | null>(null);
  /** The excerpt she highlighted, waiting to be attached to a chat message. */
  const [refQuote, setRefQuote] = useState<string | null>(null);
  const [refined, setRefined] = useState(false);
  /** A refine request is in flight: the editor breathes and says updating…. */
  const [refining, setRefining] = useState(false);
  // A save, publish or delete in flight holds the Language control (C-LANG@1 rule 6).
  useReportWork(busy || saveState === 'saving');
  const [chatOpen, setChatOpen] = useState(() => chatStorage()?.getItem(CHAT_OPEN_KEY) === '1');
  /** Which sections the last rewrite changed, named for a moment. */
  const [changedSections, setChangedSections] = useState<readonly string[]>([]);
  /**
   * The Intervention body the therapist declined a suggestion for. The card
   * stays dismissed while this exact body stands; any edit to the section
   * reevaluates and may suggest again.
   */
  const [dismissedInterventionBody, setDismissedInterventionBody] = useState<string | null>(null);

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
  /**
   * A stale write is a user decision, not a failed save to retry. This ref is
   * what the pagehide/visibility cleanup reads after the conflict state has
   * been painted.
   */
  const staleRef = useRef(false);
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
    onNoteChangedRef.current = onNoteChanged;
    const previous = noteRef.current;
    if (note.id === previous.id && note.revision !== previous.revision) {
      if (staleRef.current) {
        // While a conflict is waiting for a choice, keep the local edit and
        // move the remote side forward if another window edits again.
        persistedContentRef.current = note.content;
        draftUnlockedRef.current = note.status !== 'published';
        setStale((current) => (current === null ? current : { mine: current.mine, theirs: note }));
      } else if (latestTextRef.current !== persistedContentRef.current) {
        // The list refresh found a remote write while this window still has
        // an edit of its own. Surface the same explicit choice as a 409.
        persistedContentRef.current = note.content;
        draftUnlockedRef.current = note.status !== 'published';
        staleRef.current = true;
        setStale({ mine: latestTextRef.current, theirs: note });
        setError(null);
        markSaveState('conflict');
      } else {
        // No local edit is pending: quietly accept the newer remote note.
        persistedContentRef.current = note.content;
        latestTextRef.current = note.content;
        draftUnlockedRef.current = note.status !== 'published';
        setText(note.content);
        setError(null);
        markSaveState('saved');
      }
    }
    noteRef.current = note;
  }, [markSaveState, note, onNoteChanged]);

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
   * Persist the body with the revision currently held by the editor. A
   * published lock or a revision race is surfaced rather than silently
   * unpublishing or overwriting another window.
   */
  const persist = useCallback(
    async (value: string, revision: number, keepalive = false): Promise<void> => {
      if (revision !== saveRevisionRef.current || staleRef.current) return;
      const current = noteRef.current;
      if (value === persistedContentRef.current) {
        markSaveState('saved');
        return;
      }

      markSaveState('saving');
      try {
        const updated = await updateNote(
          current.id,
          { revision: current.revision, content: value },
          keepalive ? { keepalive: true } : undefined,
        );
        noteRef.current = updated;
        persistedContentRef.current = updated.content;
        if (revision !== saveRevisionRef.current) return;
        onNoteChangedRef.current(updated);
        markSaveState('saved');
        setError(null);
        staleRef.current = false;
        setStale(null);
      } catch (thrown) {
        if (revision !== saveRevisionRef.current) return;
        if (
          thrown instanceof ApiRequestError &&
          (thrown.code === 'stale_write' || thrown.code === 'conflict')
        ) {
          try {
            const theirs = await getNote(current.id);
            noteRef.current = theirs;
            persistedContentRef.current = theirs.content;
            draftUnlockedRef.current = theirs.status !== 'published';
            onNoteChangedRef.current(theirs);
            staleRef.current = true;
            setStale({ mine: value, theirs });
            setError(null);
            markSaveState('conflict');
            return;
          } catch {
            // Fall through to the ordinary save error if the refetch itself fails.
          }
        }
        markSaveState('error');
        setError(errorMessage(thrown));
        throw thrown;
      }
    },
    [markSaveState],
  );
  /** Saves run one at a time, so a debounce and a flush cannot cross. */
  const enqueue = useCallback(
    (value: string, revision: number, keepalive = false): Promise<void> => {
      // Recover the queue after a failed save; the next edit must still retry.
      queueRef.current = queueRef.current
        .catch(() => undefined)
        .then(() => persist(value, revision, keepalive));
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
  const flush = useCallback(
    (keepalive = false): Promise<void> => {
      let pending: Promise<void>;
      if (staleRef.current) {
        cancelPending();
        pending = queueRef.current;
      } else {
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        const value = pendingRef.current;
        const revision = pendingRevisionRef.current;
        pendingRef.current = null;
        pendingRevisionRef.current = null;
        if (value !== null && revision !== null) {
          pending = enqueue(value, revision, keepalive);
        } else if (
          saveStateRef.current === 'error' &&
          persistedContentRef.current !== latestTextRef.current
        ) {
          pending = enqueue(latestTextRef.current, saveRevisionRef.current, keepalive);
        } else {
          pending = queueRef.current;
        }
      }
      return pending.then(() => {
        if (staleRef.current || saveStateRef.current === 'conflict') {
          throw new Error(t('note.unsavedConflict'));
        }
        if (saveStateRef.current === 'error') {
          throw new Error(t('note.unsavedError'));
        }
      });
    },
    [cancelPending, enqueue, t],
  );

  // Switching notes and closing a tab must not strand the debounced edit.
  // The primary-window handoff also reads this hook so the old primary saves
  // before it steps down; it carries no note text, only a flush signal.
  // A keystroke typed in the old primary while that flush is in flight stays
  // debounced here, so the handoff drains until no pending edit remains —
  // saving late from a blocked window would overwrite the new primary.
  // The pagehide/visibility outcome below stays a single best-effort flush.
  useEffect(() => {
    const owner = window as unknown as { __apuntaFlushBeforeRelease?: () => Promise<void> };
    owner.__apuntaFlushBeforeRelease = async (): Promise<void> => {
      await flush(true);
      while (pendingRef.current !== null || timerRef.current !== null) {
        await flush(true);
      }
    };
    const flushKeepalive = (): void => {
      void flush(true).catch(() => undefined);
    };
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') flushKeepalive();
    };
    window.addEventListener('pagehide', flushKeepalive);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      if (owner.__apuntaFlushBeforeRelease !== undefined) delete owner.__apuntaFlushBeforeRelease;
      window.removeEventListener('pagehide', flushKeepalive);
      document.removeEventListener('visibilitychange', onVisibilityChange);
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
   * The approach candidate comes only from the configured
   * Intervention/Interventions section of the current draft — never from
   * Discussion, Risk review, transcripts, or prior notes. A null means the
   * matcher abstained (generic, ambiguous, negated, future, or already
   * named), so no card renders.
   */
  const noteSectionNames = format?.sections ?? [];
  const interventionSectionName =
    noteSectionNames.find((name) => {
      const lowered = name.toLowerCase();
      return lowered === 'intervention' || lowered === 'interventions';
    }) ?? null;
  const interventionBody =
    interventionSectionName === null
      ? ''
      : (textToSections(text, noteSectionNames)[interventionSectionName] ?? '');
  const suggestionCandidate =
    interventionSectionName === null ? null : suggestInterventionApproach(interventionBody);
  const suggestion =
    suggestionCandidate !== null && dismissedInterventionBody !== interventionBody
      ? suggestionCandidate
      : null;

  function handleAddApproach(): void {
    if (interventionSectionName === null || suggestion === null) return;
    const lines = text.split('\n');
    const target = interventionSectionName.toLowerCase();
    const headerIndex = lines.findIndex((line) => {
      const colon = line.indexOf(':');
      if (colon <= 0) return false;
      return line.slice(0, colon).trim().toLowerCase() === target;
    });
    // The section header is absent from the draft: fall back to the shared
    // serializer so the new section lands in format order.
    if (headerIndex === -1) {
      const sections = textToSections(text, noteSectionNames);
      const current = sections[interventionSectionName] ?? '';
      const updated = current.trim() === '' ? suggestion.approach : `${suggestion.approach}: ${current}`;
      setDismissedInterventionBody(null);
      handleChange(sectionsToText({ ...sections, [interventionSectionName]: updated }, noteSectionNames));
      return;
    }
    const headerLine = lines[headerIndex] ?? '';
    const colon = headerLine.indexOf(':');
    const inlineRest = headerLine.slice(colon + 1);
    if (inlineRest.trim() !== '') {
      lines[headerIndex] =
        `${headerLine.slice(0, colon + 1)} ${suggestion.approach}: ${inlineRest.trimStart()}`;
    } else {
      // The prose starts on a following line: prefix the first body line and
      // leave the header and every other line byte-identical.
      const bodyIndex = lines.findIndex((line, index) => {
        if (index <= headerIndex || line.trim() === '') return false;
        const bodyColon = line.indexOf(':');
        if (bodyColon <= 0) return true;
        return !noteSectionNames.some(
          (name) => line.slice(0, bodyColon).trim().toLowerCase() === name.toLowerCase(),
        );
      });
      if (bodyIndex === -1) lines[headerIndex] = `${headerLine.trimEnd()} ${suggestion.approach}`;
      else lines[bodyIndex] = `${suggestion.approach}: ${(lines[bodyIndex] ?? '').trimStart()}`;
    }
    setDismissedInterventionBody(null);
    handleChange(lines.join('\n'));
  }

  function handleDismissApproach(): void {
    setDismissedInterventionBody(interventionBody);
  }

  /**
   * The chat rewrote the note. The server has already saved it, so a debounced
   * edit still in flight would write the old text back over it — drop it, and
   * light the editor for a moment so the change is not silent.
   *
   * The server also says whether it applied the rewrite: a guard that held the
   * model's revision back, or an instruction that changed nothing, arrives with
   * the note exactly as it stands. Those are outcomes, not edits, so the
   * editor must not flash as though it had been rewritten.
   */
  const handleNoteUpdated = useCallback(
    (event: ChatNoteUpdatedEvent): Promise<void> => {
      cancelPending();
      const previousContent = noteRef.current.content;
      // The server has persisted this rewrite; invalidate every local edit
      // revision so an older response cannot overwrite the new note.
      saveRevisionRef.current += 1;
      staleRef.current = false;
      draftUnlockedRef.current = event.note.status !== 'published';
      noteRef.current = event.note;
      persistedContentRef.current = event.note.content;
      latestTextRef.current = event.note.content;
      setError(null);
      markSaveState('saved');
      return new Promise<void>((resolve) => {
        setText(event.note.content);
        onNoteChangedRef.current(event.note);
        setStale(null);
        if (event.outcome !== 'applied') {
          // Nothing was written, so there is no painted rewrite for the chat
          // to wait on — releasing the ack here is what keeps a withheld edit
          // from leaving the assistant's turn off screen.
          resolve();
          return;
        }
        noteUpdateAckRef.current = resolve;
        // Name what actually changed, so the flash can say which sections moved.
        const sectionNames = format?.sections ?? [];
        const before = textToSections(previousContent, sectionNames);
        const after = textToSections(event.note.content, sectionNames);
        setChangedSections(sectionNames.filter((name) => (before[name] ?? '') !== (after[name] ?? '')));
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
      // Copy the visible text first: persistence must never gate this escape hatch.
      await copyText(text);
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, COPIED_FLASH_MS);
      void flush().catch(() => undefined);
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
        const unlocked = await unpublishNote(note.id);
        noteRef.current = unlocked;
        onNoteChanged(unlocked);
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
  async function keepMine(): Promise<void> {
    const conflictState = stale;
    if (conflictState === null) return;
    setBusy(true);
    try {
      let target = conflictState.theirs;
      if (target.status === 'published') target = await unpublishNote(target.id);
      const updated = await updateNote(target.id, { revision: target.revision, content: conflictState.mine });
      noteRef.current = updated;
      persistedContentRef.current = updated.content;
      latestTextRef.current = updated.content;
      draftUnlockedRef.current = updated.status !== 'published';
      staleRef.current = false;
      setText(updated.content);
      setStale(null);
      setError(null);
      markSaveState('saved');
      onNoteChanged(updated);
    } catch (thrown) {
      setError(errorMessage(thrown));
      markSaveState('error');
    } finally {
      setBusy(false);
    }
  }

  function takeTheirs(): void {
    if (stale === null) return;
    cancelPending();
    saveRevisionRef.current += 1;
    staleRef.current = false;
    noteRef.current = stale.theirs;
    draftUnlockedRef.current = stale.theirs.status !== 'published';
    setText(stale.theirs.content);
    setStale(null);
    setError(null);
    markSaveState('saved');
    onNoteChanged(stale.theirs);
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

  /**
   * "Discussion", "Discussion and Plan", "Discussion, Risk review and Plan".
   *
   * The section names are the format's own, so they are passed through as
   * data; the conjunction is a catalogue key, because it is the one word in
   * the list a language has to choose.
   */
  function joinSectionNames(names: readonly string[]): string {
    if (names.length <= 1) return names[0] ?? '';
    return t('common.listLast', { items: names.slice(0, -1).join(', '), last: String(names.at(-1)) });
  }

  /*
   * The note header's two date sentences.
   *
   * `formatNoteDate` / `formatEditedDate` return whole English sentences —
   * "Today", "today", or `en-US`'s "Aug 8, 2026" — so the component no longer
   * asks them for a string at all. It asks the catalogue for one of four keys
   * and hands `t()` the ISO timestamp, which `t()` formats in the active locale
   * (Fixed decision 4). `web/src/lib/format.ts` stays the English oracle and
   * keeps its two helpers: they are what S2.2 pinned `notes.today` and this
   * card's `note.editedToday` to, and S2.4's own screens still call them.
   */
  const now = new Date();
  const createdToday = sameDay(note.created_at, now);
  const updatedToday = sameDay(note.updated_at, now);

  return (
    <div className={chatOpen ? 'note-chat-split chat-docked' : 'note-chat-split'}>
      <div className="note-editor-col">
        <div className="note-editor-header row between">
          <div>
            <p className="small note-meta" data-testid="note-meta">
              {createdToday
                ? t('note.metaToday', { name: patient.name, today: t('notes.today') })
                : t('note.meta', { name: patient.name, date: note.created_at })}
              {wasEdited(note.created_at, note.updated_at)
                ? updatedToday
                  ? t('note.editedMetaToday', { today: t('note.editedToday') })
                  : t('note.editedMeta', { date: note.updated_at })
                : ''}
            </p>
            <h2 data-testid="note-title">{note.title}</h2>
          </div>
          <div className="row gap-8 note-actions">
            <span className={`note-save-status is-${saveState}`} data-testid="note-save-status">
              {saveState === 'saving'
                ? t('note.saveSaving')
                : saveState === 'error'
                  ? t('note.saveError')
                  : saveState === 'conflict'
                    ? t('note.saveConflict')
                    : t('note.saveSaved')}
            </span>
            {refining && (
              <span className="note-updating-hint" data-testid="note-updating-hint">
                <ThinkingDots label={t('note.updating')} />
              </span>
            )}
            {!refining && refined && changedSections.length > 0 && (
              <span className="note-updated-hint" data-testid="note-updated-hint">
                {t('note.updatedSections', { sections: joinSectionNames(changedSections) })}
              </span>
            )}
            <button
              type="button"
              className="btn small btn-compact-icon"
              title={t('note.deleteLabel')}
              aria-label={t('note.deleteLabel')}
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
              {copied ? t('note.copied') : t('note.copy')}
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
              {published ? t('note.editAgain') : t('note.finishAndCopy')}
            </button>
          </div>
        </div>

        {stale !== null && (
          <div className="note-conflict" role="alert" data-testid="note-conflict">
            <p>{t('note.conflictHelp')}</p>
            <div className="row gap-8">
              <button type="button" className="btn small" disabled={busy} onClick={() => void keepMine()}>
                {stale.theirs.status === 'published'
                  ? t('note.conflictUnlockApply')
                  : t('note.conflictKeepMine')}
              </button>
              <button type="button" className="btn small" disabled={busy} onClick={takeTheirs}>
                {t('note.conflictTakeTheirs')}
              </button>
            </div>
          </div>
        )}
        {error !== null && (
          <p className="form-error" role="alert" data-testid="note-error">
            {error}
          </p>
        )}

        {suggestion !== null && (
          <InterventionApproachSuggestion
            approach={suggestion.approach}
            evidence={suggestion.evidence}
            disabled={published || refining}
            onAdd={handleAddApproach}
            onDismiss={handleDismissApproach}
          />
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
        aria-label={chatOpen ? t('refine.closeLabel') : t('refine.title')}
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
        {refining ? <ThinkingDots ariaLabel={t('note.updatingShort')} /> : <ChatIcon className="icon" />}
        <span className="chat-fab-label">{t('refine.title')}</span>
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
        onRestoreRefQuote={setRefQuote}
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
          title={t('note.deleteTitle')}
          confirmLabel={t('note.deleteLabel')}
          body={
            <>
              <p>{t('note.deleteBodyFirst')}</p>
              <p>{t('note.deleteBodySecond')}</p>
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
