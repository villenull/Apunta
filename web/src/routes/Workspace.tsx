import type { Note, PatientListItem } from '@apunta/shared';
import { useCallback, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';

import { deletePatient, errorMessage, listFormats, listNotes, listPatients } from '../api/index.js';
import { DocumentIcon, PeopleIcon, PlusIcon } from '../components/icons.js';
import { NotesColumn } from '../components/NotesColumn.js';
import { NoteView } from '../components/NoteView.js';
import { PatientsColumn } from '../components/PatientsColumn.js';
import { useLoader } from '../hooks/useLoader.js';

/**
 * The workspace — `prototype/patients.html`. Three columns: patients, that
 * patient's notes, and the note itself beside the (M4) refine column.
 *
 * Which patient and note are open lives in the query string rather than in
 * component state, so the capture screen can hand a freshly created draft back
 * ("/?patient=…&note=…") and a reload keeps the user where they were.
 */
export function Workspace(): React.JSX.Element {
  const [params, setParams] = useSearchParams();
  const patientId = params.get('patient');
  const noteId = params.get('note');
  const [actionError, setActionError] = useState<string | null>(null);

  const loadPatients = useCallback((signal: AbortSignal) => listPatients(signal), []);
  const patients = useLoader(loadPatients);

  const loadFormats = useCallback((signal: AbortSignal) => listFormats(signal), []);
  const formats = useLoader(loadFormats);

  const loadNotes = useCallback(
    (signal: AbortSignal) =>
      patientId === null ? Promise.resolve<Note[]>([]) : listNotes(patientId, signal),
    [patientId],
  );
  const notes = useLoader(loadNotes);

  const patient =
    patients.state.status === 'ready'
      ? (patients.state.data.find((candidate) => candidate.id === patientId) ?? null)
      : null;
  const note =
    notes.state.status === 'ready'
      ? (notes.state.data.find((candidate) => candidate.id === noteId) ?? null)
      : null;

  const selectPatient = useCallback(
    (id: string) => {
      setParams({ patient: id });
    },
    [setParams],
  );

  const selectNote = useCallback(
    (id: string) => {
      if (patientId === null) return;
      setParams({ patient: patientId, note: id });
    },
    [patientId, setParams],
  );

  const updateNotes = notes.update;
  const reloadPatients = patients.reload;

  const handleNoteChanged = useCallback(
    (updated: Note) => {
      updateNotes((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    },
    [updateNotes],
  );

  const handleNoteDeleted = useCallback(
    (deletedId: string) => {
      updateNotes((current) => current.filter((item) => item.id !== deletedId));
      if (patientId !== null) setParams({ patient: patientId });
      // The patients column shows a note count, which just changed.
      reloadPatients();
    },
    [updateNotes, reloadPatients, patientId, setParams],
  );

  async function handleDeletePatient(target: PatientListItem): Promise<void> {
    if (!window.confirm(`Delete ${target.name} and every note for them? This cannot be undone.`)) return;
    try {
      await deletePatient(target.id);
      setActionError(null);
      setParams({});
      reloadPatients();
    } catch (thrown) {
      setActionError(errorMessage(thrown));
    }
  }

  // First run: with no note format defined there is nothing to draft into, so
  // the app opens on onboarding instead of an empty workspace.
  if (formats.state.status === 'ready' && formats.state.data.length === 0) {
    return <Navigate to="/onboarding/format" replace />;
  }

  return (
    <div className="app-shell">
      <PatientsColumn
        patients={patients.state}
        activePatientId={patient?.id ?? null}
        onSelect={selectPatient}
        onRetry={patients.reload}
      />

      <NotesColumn
        patient={patient}
        notes={notes.state}
        activeNoteId={note?.id ?? null}
        onSelect={selectNote}
        onRetry={notes.reload}
        onDeletePatient={() => {
          if (patient) void handleDeletePatient(patient);
        }}
      />

      <div className="col col-main" data-testid="main-pane">
        {/* Formats are loaded to decide the first-run redirect; if that call
            fails, say so rather than quietly behaving as if formats exist. */}
        {formats.state.status === 'error' && (
          <p className="form-error" role="alert">
            {formats.state.message}
          </p>
        )}
        {actionError !== null && (
          <p className="form-error" role="alert">
            {actionError}
          </p>
        )}
        {patient === null ? (
          <NoPatientSelected />
        ) : note === null ? (
          <NoNoteSelected patient={patient} />
        ) : (
          <NoteView
            key={note.id}
            patient={patient}
            note={note}
            onNoteChanged={handleNoteChanged}
            onNoteDeleted={handleNoteDeleted}
          />
        )}
      </div>
    </div>
  );
}

function NoPatientSelected(): React.JSX.Element {
  return (
    <div className="empty-state" data-testid="empty-no-patient">
      <PeopleIcon />
      <p>Select a patient to see their notes</p>
    </div>
  );
}

function NoNoteSelected({ patient }: { patient: PatientListItem }): React.JSX.Element {
  return (
    <div className="empty-state" data-testid="empty-no-note">
      <DocumentIcon />
      <p className="empty-message">No note selected for {patient.name}</p>
      <Link to={`/capture/${patient.id}`} className="btn btn-primary">
        <PlusIcon className="icon icon-sm" />
        Create new note
      </Link>
    </div>
  );
}
