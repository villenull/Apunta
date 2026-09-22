import type { Note, PatientListItem } from '@apunta/shared';
import { useNavigate } from 'react-router';

import type { LoadState } from '../hooks/useLoader.js';
import { firstName, formatNoteDate, notePreview } from '../lib/format.js';
import { BackIcon, PlusIcon, TrashIcon } from './icons.js';

export interface NotesColumnProps {
  patient: PatientListItem | null;
  notes: LoadState<Note[]>;
  activeNoteId: string | null;
  /** Which of the four things the main pane is showing (M9 adds two, M12 one). */
  view: 'notes' | 'plan' | 'prep' | 'brainstorm';
  onSelect: (noteId: string) => void;
  onOpenView: (view: 'plan' | 'prep' | 'brainstorm') => void;
  onRetry: () => void;
  onDeletePatient: () => void;
  onBackToPatients: () => void;
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
  onDeletePatient,
  onBackToPatients,
}: NotesColumnProps): React.JSX.Element {
  const navigate = useNavigate();
  return (
    <div className="col col-notes">
      <div className="col-header">
        <div className="col-header-title">
          <button type="button" className="narrow-back" onClick={onBackToPatients}>
            <BackIcon className="icon icon-xs" />
            <span>Patients</span>
          </button>
          <h3 data-testid="notes-header" tabIndex={-1}>
            {patient ? `${firstName(patient.name)}’s notes` : 'Notes'}
          </h3>
        </div>
        {patient && (
          <button
            type="button"
            className="icon-btn"
            title={`Delete ${patient.name}`}
            aria-label={`Delete ${patient.name}`}
            onClick={onDeletePatient}
          >
            <TrashIcon className="icon-plus" />
          </button>
        )}
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
            <PlusIcon className="icon-plus" />
            New note
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
              Brainstorm
            </button>
            <button
              type="button"
              className={view === 'plan' ? 'col-action-btn active' : 'col-action-btn'}
              data-testid="open-plan"
              onClick={() => {
                onOpenView('plan');
              }}
            >
              Treatment plan
            </button>
            <button
              type="button"
              className={view === 'prep' ? 'col-action-btn active' : 'col-action-btn'}
              data-testid="open-prep"
              onClick={() => {
                onOpenView('prep');
              }}
            >
              Prepare for session
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

type NoteListProps = Omit<
  NotesColumnProps,
  'patient' | 'onDeletePatient' | 'onBackToPatients' | 'view' | 'onOpenView'
> & {
  patient: PatientListItem;
};

function NoteList({ patient, notes, activeNoteId, onSelect, onRetry }: NoteListProps): React.JSX.Element {
  const navigate = useNavigate();
  if (notes.status === 'loading') return <p className="small state-note">Loading notes…</p>;

  if (notes.status === 'error') {
    return (
      <p className="small state-note error-state">
        {notes.message}{' '}
        <button type="button" className="btn small btn-quick" onClick={onRetry}>
          Try again
        </button>
      </p>
    );
  }

  if (notes.data.length === 0) {
    return (
      <div className="empty-column-state notes-empty">
        <p className="small col-hint notes">No notes yet for {patient.name}.</p>
        <button
          type="button"
          className="btn btn-primary btn-compact"
          onClick={() => {
            void navigate(`/capture/${patient.id}`);
          }}
        >
          <PlusIcon className="icon icon-sm" />
          Create first note
        </button>
      </div>
    );
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
          <div className="note-title">
            {note.status === 'draft' && <span className="draft-dot" />}
            {note.title}
          </div>
          <div className="note-date">
            {formatNoteDate(note.created_at)}
            {note.status === 'draft' ? ' · Draft' : ''}
          </div>
          <div className="note-preview">{notePreview(note.content)}</div>
        </button>
      ))}
    </>
  );
}
