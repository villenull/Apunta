import type { Note, PatientListItem } from '@apunta/shared';
import { useNavigate } from 'react-router';

import type { LoadState } from '../hooks/useLoader.js';
import { firstName, formatNoteDate, notePreview } from '../lib/format.js';
import { PlusIcon, TrashIcon } from './icons.js';

export interface NotesColumnProps {
  patient: PatientListItem | null;
  notes: LoadState<Note[]>;
  activeNoteId: string | null;
  /** Which of the three things the main pane is showing (M9 adds two). */
  view: 'notes' | 'plan' | 'prep';
  onSelect: (noteId: string) => void;
  onOpenView: (view: 'plan' | 'prep') => void;
  onRetry: () => void;
  onDeletePatient: () => void;
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
}: NotesColumnProps): React.JSX.Element {
  const navigate = useNavigate();

  return (
    <div className="col col-notes">
      <div className="col-header">
        <h3 data-testid="notes-header">{patient ? `${firstName(patient.name)}’s notes` : 'Notes'}</h3>
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

type NoteListProps = Omit<NotesColumnProps, 'patient' | 'onDeletePatient' | 'view' | 'onOpenView'> & {
  patient: PatientListItem;
};

function NoteList({ patient, notes, activeNoteId, onSelect, onRetry }: NoteListProps): React.JSX.Element {
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
    return <p className="small col-hint notes">No notes yet for {patient.name}.</p>;
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
