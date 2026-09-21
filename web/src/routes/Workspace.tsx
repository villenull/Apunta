import type { Note, PatientListItem } from '@apunta/shared';
import { useCallback, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';

import {
  deletePatient,
  errorMessage,
  listFormats,
  listNotes,
  listPatients,
  setPatientArchived,
  updatePatient,
} from '../api/index.js';
import { AiBanner } from '../components/AiBanner.js';
import { BrainstormView } from '../components/BrainstormView.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { DocumentIcon, PeopleIcon, PlusIcon } from '../components/icons.js';
import { NotesColumn } from '../components/NotesColumn.js';
import { NoteView } from '../components/NoteView.js';
import { PatientsColumn } from '../components/PatientsColumn.js';
import { PlanView } from '../components/PlanView.js';
import { PrepView } from '../components/PrepView.js';
import { Toast } from '../components/Toast.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useLoader } from '../hooks/useLoader.js';

/**
 * The workspace — `prototype/patients.html`. Three columns: patients, that
 * patient's notes, and the note itself beside the refine column.
 *
 * Which patient and note are open lives in the query string rather than in
 * component state, so the capture screen can hand a freshly created draft back
 * ("/?patient=…&note=…") and a reload keeps the user where they were.
 */
export function Workspace(): React.JSX.Element {
  const [params, setParams] = useSearchParams();
  const patientId = params.get('patient');
  const noteId = params.get('note');
  // `view` is the main pane's mode: her notes, a brainstorm, the plan, or a
  // briefing. In the query string like the rest, so a reload keeps her where
  // she was.
  const rawView = params.get('view');
  const view: 'notes' | 'plan' | 'prep' | 'brainstorm' =
    rawView === 'plan' || rawView === 'prep' || rawView === 'brainstorm' ? rawView : 'notes';
  const [actionError, setActionError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PatientListItem | null>(null);

  // No patient name in the tab title: it is read over a shoulder, shown in the
  // window switcher, and written into browser history.
  useDocumentTitle('Patients');

  const loadPatients = useCallback(
    (signal: AbortSignal) => listPatients(signal, showArchived),
    [showArchived],
  );
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
  // The note's format supplies its section list, which the editor needs to
  // tell an empty section from a gap. Formats are already loaded here for the
  // first-run redirect, so this costs no extra request.
  const noteFormat =
    formats.state.status === 'ready' && note !== null
      ? (formats.state.data.find((candidate) => candidate.id === note.format_id) ?? null)
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
      // Following a citation out of the plan or a briefing lands on the note,
      // which means leaving that view.
      setParams({ patient: patientId, note: id });
    },
    [patientId, setParams],
  );

  const openView = useCallback(
    (next: 'plan' | 'prep' | 'brainstorm') => {
      if (patientId === null) return;
      setParams({ patient: patientId, view: next });
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
    try {
      await deletePatient(target.id);
      setActionError(null);
      setParams({});
      reloadPatients();
    } catch (thrown) {
      setActionError(errorMessage(thrown));
    }
  }

  /**
   * Archiving is the answer to "I am not seeing this person any more", and it
   * is the one the app should make easy: it hides the row and deletes nothing.
   * Deleting stays available and stays behind a dialog that says what it
   * cannot reach.
   */
  async function handleSetArchived(target: PatientListItem, archived: boolean): Promise<void> {
    try {
      await setPatientArchived(target.id, archived);
      setActionError(null);
      // Archiving the open patient would leave the middle column showing
      // someone the list no longer has.
      if (archived && !showArchived && target.id === patientId) setParams({});
      reloadPatients();
    } catch (thrown) {
      setActionError(errorMessage(thrown));
    }
  }

  async function handleRename(target: PatientListItem, name: string): Promise<void> {
    try {
      await updatePatient(target.id, { name });
      setActionError(null);
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
    <div className="workspace">
      <AiBanner />
      <div className="app-shell">
        <PatientsColumn
          patients={patients.state}
          activePatientId={patient?.id ?? null}
          showArchived={showArchived}
          onSelect={selectPatient}
          onRetry={patients.reload}
          onToggleArchived={setShowArchived}
          onSetArchived={(target, archived) => {
            void handleSetArchived(target, archived);
          }}
          onRename={(target, name) => {
            void handleRename(target, name);
          }}
        />

        <NotesColumn
          patient={patient}
          notes={notes.state}
          activeNoteId={view === 'notes' ? (note?.id ?? null) : null}
          view={view}
          onSelect={selectNote}
          onOpenView={openView}
          onRetry={notes.reload}
          onDeletePatient={() => {
            if (patient) setPendingDelete(patient);
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
          {patient === null ? (
            <NoPatientSelected />
          ) : view === 'plan' ? (
            <PlanView key={`plan-${patient.id}`} patient={patient} onOpenNote={selectNote} />
          ) : view === 'prep' ? (
            <PrepView key={`prep-${patient.id}`} patient={patient} onOpenNote={selectNote} />
          ) : view === 'brainstorm' ? (
            <BrainstormView key={`brainstorm-${patient.id}`} patient={patient} />
          ) : note === null ? (
            <NoNoteSelected patient={patient} />
          ) : (
            <NoteView
              key={note.id}
              patient={patient}
              note={note}
              format={noteFormat}
              onNoteChanged={handleNoteChanged}
              onNoteDeleted={handleNoteDeleted}
            />
          )}
        </div>
      </div>

      {actionError !== null && (
        <Toast
          message={actionError}
          onDismiss={() => {
            setActionError(null);
          }}
        />
      )}

      {pendingDelete !== null && (
        <ConfirmDialog
          title={`Delete ${pendingDelete.name}?`}
          confirmLabel={`Delete ${pendingDelete.name}`}
          body={
            <>
              <p>
                This removes {pendingDelete.name}, every note for them, the transcripts of those notes, and
                the refine and brainstorm conversations. It cannot be undone here.
              </p>
              <p>
                It also cannot reach copies that already exist elsewhere: a backup you have written, a Time
                Machine copy, or the records system you pasted the finished notes into.
              </p>
              <p>
                If you only want them out of the list, <strong>Archive</strong> does that and deletes nothing.
              </p>
            </>
          }
          onCancel={() => {
            setPendingDelete(null);
          }}
          onConfirm={() => {
            const target = pendingDelete;
            setPendingDelete(null);
            void handleDeletePatient(target);
          }}
        />
      )}
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
