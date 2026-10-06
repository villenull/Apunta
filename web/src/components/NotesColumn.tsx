import type { Note, PatientListItem } from '@apunta/shared';
import { useNavigate, useLocation } from 'react-router';

import type { LoadState } from '../hooks/useLoader.js';
import { notePreview } from '../lib/format.js';
import { useI18n, type Translate } from '../lib/i18n.js';
import { BackIcon, ChatIcon, DocumentIcon, ExamplesIcon, PlusIcon } from './icons.js';
import '../styles/notes-column.css';

export interface NotesColumnProps {
  patient: PatientListItem | null;
  notes: LoadState<Note[]>;
  activeNoteId: string | null;
  /** Which of the four things the main pane is showing (M9 adds two, M12 one). */
  view: 'notes' | 'plan' | 'prep' | 'brainstorm';
  onSelect: (noteId: string) => void;
  onOpenView: (view: 'plan' | 'prep' | 'brainstorm') => void;
  onRetry: () => void;
  onBackToPatients: () => void;
  /** Blank space in the column: clear the note and the view, keep the patient. */
  onDeselect: () => void;
}

/**
 * A note's own date, through the catalogue.
 *
 * `formatNoteDate` returned a whole English sentence — `Today` or `en-US`'s
 * `Aug 8, 2026` — so the column asks for one of two keys and hands `t()` the
 * ISO timestamp, which it formats in the active locale (Fixed decision 3).
 * `web/src/lib/format.ts` stays the oracle; S2.3's `NoteView.tsx` has the same
 * two-key shape.
 */
function noteDay(t: Translate, iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const today =
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  return today ? t('notes.today') : t('notes.date', { day: iso });
}

/**
 * Anything the owner can press inside the column. A click that lands on one of
 * these is not a click on the column's empty space, so it must not clear the
 * selection — and neither is a click on the *label* above the notes, which is
 * the same empty space with a word in it.
 */
const PRESSABLE =
  'button, a, input, textarea, select, [role="button"], [role="link"], [contenteditable="true"]';

/**
 * Middle column of the workspace (owner, 2026-10-05).
 *
 * The patient's name is gone from its own header: the sidebar row she just
 * clicked already says who she is with, and the column repeated it one screen
 * away. The column now reads top to bottom in the order she works in — the
 * three tools (Brainstorm, Treatment plan, Prepare for session) she opens a
 * session with, then the "Notes" heading and the row that starts one, then the
 * notes themselves — with only the notes scrolling and the tools pinned, so
 * the notes are the only thing in the column that moves.
 *
 * There is no rule between "New note" and the list under it: the heading is
 * what groups them, and a second edge there read as a boxed cell.
 *
 * Clicking the empty part of the notes band goes back to the patient's welcome
 * while keeping the patient (the workspace's own `onDeselect`, which flushes
 * the open note first). The heading band carries the same handler: it is the
 * same empty space with a word in it.
 */
export function NotesColumn({
  patient,
  notes,
  activeNoteId,
  view,
  onSelect,
  onOpenView,
  onRetry,
  onBackToPatients,
  onDeselect,
}: NotesColumnProps): React.JSX.Element {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  /**
   * Capture opens as a window over this workspace, so the navigation carries
   * the location it was opened from: `App.tsx` renders this column, still
   * mounted and still on this patient, behind the window.
   */
  const openCapture = (): void => {
    if (patient === null) return;
    void navigate(`/capture/${patient.id}`, { state: { backgroundLocation: location } });
  };

  const onBlankSpace = (event: React.MouseEvent<HTMLDivElement>): void => {
    if ((event.target as HTMLElement).closest(PRESSABLE) !== null) return;
    onDeselect();
  };

  return (
    <div className="col col-notes" data-testid="notes-column">
      {/*
       * The work around a session, at the top of the column (owner,
       * 2026-10-05), and the work she does *about* the notes rather than
       * through them, so it does not scroll away under a long list. The
       * narrow-window way back to the patients rides along as the band's
       * first row: on a phone this column is the whole screen, and without it
       * she cannot leave. Two separate objects: the plan is a record she
       * authors, the briefing is a reading aid generated on demand.
       */}
      {patient && (
        <div className="col-actions notes-col-tools" data-testid="notes-tools">
          <button type="button" className="narrow-back notes-col-back" onClick={onBackToPatients}>
            <BackIcon className="icon icon-xs" />
            <span>{t('common.patients')}</span>
          </button>
          <button
            type="button"
            className={view === 'brainstorm' ? 'col-action-btn active' : 'col-action-btn'}
            data-testid="open-brainstorm"
            onClick={() => {
              onOpenView('brainstorm');
            }}
          >
            <ChatIcon className="icon icon-sm" />
            {t('brainstorm.title')}
          </button>
          <button
            type="button"
            className={view === 'plan' ? 'col-action-btn active' : 'col-action-btn'}
            data-testid="open-plan"
            onClick={() => {
              onOpenView('plan');
            }}
          >
            <DocumentIcon className="icon icon-sm" />
            {t('plan.title')}
          </button>
          <button
            type="button"
            className={view === 'prep' ? 'col-action-btn active' : 'col-action-btn'}
            data-testid="open-prep"
            onClick={() => {
              onOpenView('prep');
            }}
          >
            <ExamplesIcon className="icon icon-sm" />
            {t('notes.prepareForSession')}
          </button>
        </div>
      )}

      {/* The notes' own heading, and the row that starts one. Pinned above the
          list rather than inside it, and with no rule under either of them. */}
      {patient && (
        <div className="notes-col-start" data-testid="notes-head" onClick={onBlankSpace}>
          <div className="notes-list-heading" role="presentation">
            {t('notes.title')}
          </div>
          {/* The plus in a filled circle, as the sidebar's "New patient" and
              Claude's "New chat" (owner, 2026-09-28): a quiet row, not a
              dashed box competing with everything under it. */}
          <button
            type="button"
            className="new-note-btn notes-col-new"
            data-testid="notes-new-note"
            onClick={openCapture}
          >
            <span className="new-note-icon" aria-hidden="true">
              <PlusIcon className="icon" />
            </span>
            {t('notes.new')}
          </button>
        </div>
      )}

      {/* The only band that scrolls. The click surface is this element, so the
          empty space below a short list counts as empty space rather than as a
          click on the last row. */}
      <div className="col-body notes-col-body" data-testid="note-list" onClick={onBlankSpace}>
        {patient && (
          <NoteList
            patient={patient}
            notes={notes}
            activeNoteId={activeNoteId}
            onSelect={onSelect}
            onRetry={onRetry}
          />
        )}
      </div>
    </div>
  );
}

type NoteListProps = Omit<
  NotesColumnProps,
  'patient' | 'onBackToPatients' | 'view' | 'onOpenView' | 'onDeselect'
> & {
  patient: PatientListItem;
};

function NoteList({ patient, notes, activeNoteId, onSelect, onRetry }: NoteListProps): React.JSX.Element {
  const { t } = useI18n();
  if (notes.status === 'loading') return <p className="small state-note">{t('notes.loading')}</p>;

  if (notes.status === 'error') {
    return (
      <p className="small state-note error-state">
        {notes.message}{' '}
        <button type="button" className="btn small btn-quick" onClick={onRetry}>
          {t('common.tryAgain')}
        </button>
      </p>
    );
  }

  /*
   * One muted line and no second button (owner, 2026-09-28): "New note" is at
   * the top of the column already. This is only reached with the plan, the
   * briefing or the brainstorm open — with none of them, a patient with no notes
   * has no notes column at all, and the welcome says the rest.
   */
  if (notes.data.length === 0) {
    return <p className="small col-hint notes-empty">{t('notes.emptyFor', { name: patient.name })}</p>;
  }

  return (
    <>
      {notes.data.map((note) => (
        <button
          key={note.id}
          type="button"
          className={note.id === activeNoteId ? 'note-item active' : 'note-item'}
          onClick={() => {
            onSelect(note.id);
          }}
        >
          {/*
           * Format first, date second (owner, 2026-10-05): the format name is
           * what tells two notes apart and the date is what she scans for, so
           * the date is the line that carries the weight and the format is the
           * quiet one above it.
           */}
          <div className="note-format">{note.title}</div>
          <div className="note-date-row">
            <span className="note-date">{noteDay(t, note.created_at)}</span>
            {note.status === 'draft' && <span className="draft-chip">{t('note.draftChip')}</span>}
          </div>
          <div className="note-preview">{notePreview(note.content)}</div>
        </button>
      ))}
    </>
  );
}
