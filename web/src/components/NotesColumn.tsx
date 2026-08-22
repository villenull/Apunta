import type { Note, PatientListItem } from '@apunta/shared';
import { useNavigate } from 'react-router';

import type { LoadState } from '../hooks/useLoader.js';
import { firstName, formatNoteDate, notePreview } from '../lib/format.js';
import { PlusIcon, TrashIcon } from './icons.js';

export interface NotesColumnProps {
  patient: PatientListItem | null;
  notes: LoadState<Note[]>;
  activeNoteId: string | null;
  onSelect: (noteId: string) => void;
  onRetry: () => void;
  onDeletePatient: () => void;
}

/** Middle column of `prototype/patients.html`. */
export function NotesColumn({
  patient,
  notes,
  activeNoteId,
  onSelect,
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

type NoteListProps = Omit<NotesColumnProps, 'patient' | 'onDeletePatient'> & { patient: PatientListItem };

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
