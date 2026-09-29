import type { Note, PatientListItem } from '@apunta/shared';
import { useNavigate } from 'react-router';

import type { LoadState } from '../hooks/useLoader.js';
import { firstName, notePreview } from '../lib/format.js';
import { useI18n, type Translate } from '../lib/i18n.js';
import { BackIcon, ChatIcon, DocumentIcon, ExamplesIcon, PlusIcon } from './icons.js';

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

/** Middle column of `prototype/patients.html`. */
export function NotesColumn({
  patient,
  notes,
  activeNoteId,
  view,
  onSelect,
  onOpenView,
  onRetry,
  onBackToPatients,
}: NotesColumnProps): React.JSX.Element {
  const { t } = useI18n();
  const navigate = useNavigate();
  return (
    <div className="col col-notes">
      <div className={patient ? 'col-header notes-header-patient' : 'col-header'}>
        <div className="col-header-title">
          <button type="button" className="narrow-back" onClick={onBackToPatients}>
            <BackIcon className="icon icon-xs" />
            <span>{t('common.patients')}</span>
          </button>
          <h3 data-testid="notes-header" tabIndex={-1}>
            {patient ? firstName(patient.name) : t('notes.title')}
          </h3>
        </div>
      </div>

      <div className="col-body" data-testid="note-list">
        {patient && (
          <button
            type="button"
            className="new-note-btn"
            onClick={() => {
              void navigate(`/capture/${patient.id}`);
            }}
          >
            {/* The plus in a filled circle, as the sidebar's "New patient" and
                Claude's "New chat" (owner, 2026-09-28): a quiet row, not a
                dashed box competing with everything under it. */}
            <span className="new-note-icon" aria-hidden="true">
              <PlusIcon className="icon" />
            </span>
            {t('notes.new')}
          </button>
        )}
        {/* The work around a session, next to the notes that follow one.
            Two separate objects: the plan is a record she authors, the
            briefing is a reading aid generated on demand. */}
        {patient && (
          <div className="col-actions">
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

type NoteListProps = Omit<NotesColumnProps, 'patient' | 'onBackToPatients' | 'view' | 'onOpenView'> & {
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
      <div className="notes-list-heading" role="presentation">
        {t('notes.title')}
      </div>
      {notes.data.map((note) => (
        <button
          key={note.id}
          type="button"
          className={note.id === activeNoteId ? 'note-item active' : 'note-item'}
          onClick={() => {
            onSelect(note.id);
          }}
        >
          <div className="note-date-row">
            <span className="note-date">{noteDay(t, note.created_at)}</span>
            {note.status === 'draft' && <span className="draft-chip">{t('note.draftChip')}</span>}
          </div>
          <div className="note-title">{note.title}</div>
          <div className="note-preview">{notePreview(note.content)}</div>
        </button>
      ))}
    </>
  );
}
