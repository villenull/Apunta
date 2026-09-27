import type { Note, PatientListItem } from '@apunta/shared';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';

import {
  deletePatient,
  errorMessage,
  listFormats,
  listNotes,
  listPatients,
  NETWORK_ERROR_MESSAGE,
  createPatientGroup,
  updatePatientGroup,
  setPatientArchived,
  setPatientGroup,
  updatePatient,
} from '../api/index.js';
import { AiBanner } from '../components/AiBanner.js';
import { BrainstormView } from '../components/BrainstormView.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { Dialog } from '../components/Dialog.js';
import { LanguageDialog } from '../components/LanguageDialog.js';
import { HomeLauncher } from '../components/HomeLauncher.js';
import { BackIcon, DocumentIcon, PlusIcon } from '../components/icons.js';
import { NotesColumn } from '../components/NotesColumn.js';
import { NoteView } from '../components/NoteView.js';
import { PatientDirectory } from '../components/PatientDirectory.js';
import { SidebarRail } from '../components/SidebarRail.js';
import { SidebarResizer } from '../components/SidebarResizer.js';
import { PatientsColumn } from '../components/PatientsColumn.js';
import { PlanView } from '../components/PlanView.js';
import { PrepView } from '../components/PrepView.js';
import { Toast } from '../components/Toast.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useLoader } from '../hooks/useLoader.js';
import { usePatientRecency } from '../hooks/usePatientRecency.js';
import { usePatientGroups } from '../hooks/usePatientGroups.js';
import { usePinnedPatients } from '../hooks/usePinnedPatients.js';
import { readSidebarView } from '../lib/sidebarView.js';
import { useI18n } from '../lib/i18n.js';
import { orderPatients } from '../lib/patientOrder.js';
import {
  readSidebarCollapsed,
  readSidebarWidth,
  SIDEBAR_DEFAULT_W,
  writeSidebarCollapsed,
  writeSidebarWidth,
} from '../lib/patientPins.js';

/*
 * Settings, opened over the workspace rather than as its own screen (owner
 * preview, 2026-09-26: a centred panel over a blurred page, with the sections
 * down its left, as in Claude). It stays code-split for the same reason the
 * route is: the workspace opens first and must not carry the backup and import
 * machinery.
 */
const SettingsModalPanel = lazy(async () => ({
  default: (await import('./Settings.js')).SettingsModalPanel,
}));

/** A stable empty list, so the loaders below never see a new array identity. */
const NO_PATIENTS: PatientListItem[] = [];

/**
 * The workspace — `prototype/patients.html`. Three columns: patients, that
 * patient's notes, and the note itself beside the refine column.
 *
 * Which patient and note are open lives in the query string rather than in
 * component state, so the capture screen can hand a freshly created draft back
 * ("/?patient=…&note=…") and a reload keeps the user where she were.
 */
export function Workspace(): React.JSX.Element {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const patientId = params.get('patient');
  const noteId = params.get('note');
  // `view` is the main pane's mode: her notes, a brainstorm, the plan, or a
  // briefing. In the query string like the rest, so a reload keeps her where
  // she was.
  const rawView = params.get('view');
  const view: 'notes' | 'plan' | 'prep' | 'brainstorm' =
    rawView === 'plan' || rawView === 'prep' || rawView === 'brainstorm' ? rawView : 'notes';
  const [actionError, setActionError] = useState<string | null>(null);
  const [previewNote, setPreviewNote] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PatientListItem | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The language chooser (owner, 2026-09-27): a window over the workspace, not
  // a settings row, because every word changes underneath it.
  const [languageOpen, setLanguageOpen] = useState(false);
  // "View all" is a route of its own, so a reload keeps her on the full list.
  const atDirectory = location.pathname === '/patients';
  const [directoryTab, setDirectoryTab] = useState<'active' | 'archived'>('active');
  // The sidebar never shows archived patients; only the Archived tab asks for
  // them, so opening the tab is the one request that widens the list.
  /*
   * Archived patients are fetched when the "View all" page asks for them **or**
   * when the sidebar's Status filter does (owner, 2026-09-27) — otherwise
   * choosing "Archived" beside Recents would show an empty list, because the
   * working list never contained them in the first place.
   *
   * The filter itself is owned and written by the column, which is where the
   * rest of the view state lives; this mirrors the one field that decides what
   * has to be on the wire. Read once, at mount: changing it re-reads the same
   * stored value, and the column re-renders its own list when she picks another.
   */
  /*
   * Whether the patient fetch has to include archived patients, and **reactive**
   * (F1). This used to be `useMemo(..., [])` — read once at mount — so choosing
   * `Status: Archived` beside Recents fetched the same active-only list, the
   * column filtered it to nothing, and she was told "No patients match these
   * filters" until she reloaded the tab. At mount the stored value is still the
   * right answer (and avoids a flash), and after that the column reports the
   * field, because the column is what owns and writes it.
   */
  const [sidebarWantsArchived, setSidebarWantsArchived] = useState(
    () => readSidebarView().status !== 'active',
  );
  const includeArchived = (atDirectory && directoryTab === 'archived') || sidebarWantsArchived;
  // preview-only: the collapsed panel is remembered per browser (see
  // lib/patientPins); a real card would keep it beside the other preferences.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  // `null` until she drags the edge: the token's default width applies.
  const [sidebarWidth, setSidebarWidth] = useState<number | null>(readSidebarWidth);
  const pins = usePinnedPatients();
  const groups = usePatientGroups();

  // No patient name in the tab title: it is read over a shoulder, shown in the
  // window switcher, and written into browser history.
  useDocumentTitle(t('doc.patients'));

  const loadPatients = useCallback(
    (signal: AbortSignal) => listPatients(signal, includeArchived),
    [includeArchived],
  );
  const patients = useLoader(loadPatients);

  const patientList = patients.state.status === 'ready' ? patients.state.data : NO_PATIENTS;
  const recency = usePatientRecency(patientList);
  // The sidebar's own list: pinned first, then by when the last note was
  // edited. The directory page keeps every row and shows the date instead.
  const activePatients = useMemo(
    () => patientList.filter((candidate) => candidate.archived_at === null),
    [patientList],
  );
  const ordered = useMemo(
    () => orderPatients(activePatients, recency, pins.ids),
    [activePatients, recency, pins.ids],
  );
  const directoryRows = useMemo(
    () => orderPatients(patientList, recency, pins.ids),
    [patientList, recency, pins.ids],
  );

  const loadFormats = useCallback((signal: AbortSignal) => listFormats(signal), []);
  const formats = useLoader(loadFormats);

  const loadNotes = useCallback(
    (signal: AbortSignal) =>
      patientId === null ? Promise.resolve<Note[]>([]) : listNotes(patientId, signal),
    [patientId],
  );
  const notes = useLoader(loadNotes);
  // A visibility refresh must not briefly unmount the editor: its cleanup
  // flushes local edits, and a conflicted edit must wait for an explicit
  // Keep mine / Take theirs choice.
  const lastNotesPatientRef = useRef<string | null>(null);
  const lastNotesRef = useRef<Note[]>([]);
  if (lastNotesPatientRef.current !== patientId) {
    lastNotesPatientRef.current = patientId;
    lastNotesRef.current = [];
  }
  if (notes.state.status === 'ready') lastNotesRef.current = notes.state.data;
  const visibleNotes = notes.state.status === 'ready' ? notes.state.data : lastNotesRef.current;

  const note = visibleNotes.find((candidate) => candidate.id === noteId) ?? null;
  const notesForColumn =
    notes.state.status === 'loading' && lastNotesRef.current.length > 0
      ? { status: 'ready' as const, data: lastNotesRef.current }
      : notes.state;
  useEffect(() => {
    const refreshNotesWhenVisible = (): void => {
      if (document.visibilityState === 'visible') notes.reload();
    };
    // A handoff lands with this tab still visible, so the visibility refresh
    // above never fires: reload the current note list on primary acquisition
    // instead, through the same `notes.reload` path (which keeps the editor
    // mounted on `lastNotesRef` while loading).
    const refreshNotesOnPrimary = (): void => {
      notes.reload();
    };
    document.addEventListener('visibilitychange', refreshNotesWhenVisible);
    window.addEventListener('apunta:became-primary', refreshNotesOnPrimary);
    return () => {
      document.removeEventListener('visibilitychange', refreshNotesWhenVisible);
      window.removeEventListener('apunta:became-primary', refreshNotesOnPrimary);
    };
  }, [notes.reload]);

  const patient =
    patients.state.status === 'ready'
      ? (patients.state.data.find((candidate) => candidate.id === patientId) ?? null)
      : null;
  // The note's format supplies its section list, which the editor needs to
  // tell an empty section from a gap. Formats are already loaded here for the
  // first-run redirect, so this costs no extra request.
  const noteFormat =
    formats.state.status === 'ready' && note !== null
      ? (formats.state.data.find((candidate) => candidate.id === note.format_id) ?? null)
      : null;

  /*
   * Opening a patient always lands on their notes at `/`, wherever she clicked
   * from. Setting only the query string kept the path, so a sidebar click made
   * while "View all" (`/patients`) was open changed nothing on screen (owner,
   * 2026-09-26): the directory is a way into a patient, not a place to stay.
   */
  const selectPatient = useCallback(
    (id: string) => {
      navigate(`/?patient=${encodeURIComponent(id)}`);
    },
    [navigate],
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
      // someone the working list no longer has.
      if (archived && target.id === patientId) setParams({});
      reloadPatients();
    } catch (thrown) {
      setActionError(errorMessage(thrown));
    }
  }

  /**
   * Filing a patient under a group, and taking them out again (owner,
   * 2026-09-27). Same shape as archiving: the call, then the list, and a failure
   * said out loud rather than swallowed — she has just pointed at a group and
   * nothing moving would look like the app ignoring her.
   */
  async function handleMoveToGroup(target: PatientListItem, groupId: string | null): Promise<void> {
    try {
      await setPatientGroup(target.id, groupId);
      setActionError(null);
      reloadPatients();
    } catch (thrown) {
      setActionError(errorMessage(thrown));
    }
  }

  /**
   * The end of a group, for a drop on its heading: one past the highest position
   * anyone holds, so the patient lands at the bottom rather than colliding with
   * somebody else's number.
   */
  const endOfGroup = (groupId: string): number => {
    const positions = patientList
      .filter((candidate) => candidate.group_id === groupId && candidate.group_position !== null)
      .map((candidate) => candidate.group_position ?? 0);
    return positions.length === 0 ? 0 : Math.max(...positions) + 1;
  };

  /**
   * Putting a patient at a place in a group by dragging them there (owner,
   * 2026-09-27). One PATCH carries both halves — which group, and where in it —
   * because a drop that moved a patient between groups and left their position
   * behind would be a drop that half happened.
   */
  async function handleMoveIntoGroup(
    target: PatientListItem,
    groupId: string,
    position: number | null,
  ): Promise<void> {
    try {
      await updatePatient(target.id, {
        group_id: groupId,
        group_position: position ?? endOfGroup(groupId),
      });
      setActionError(null);
      reloadPatients();
    } catch (thrown) {
      setActionError(errorMessage(thrown));
    }
  }

  /**
   * A group and a filing in one go, because that is the only way she reaches
   * this: the submenu's "New group…" row. If the patient cannot be filed after
   * the group exists, the group is still there and the error names the move —
   * dropping the new group on the floor would be the more destructive of the
   * two surprises.
   */
  async function handleCreateGroup(target: PatientListItem, name: string): Promise<void> {
    try {
      const group = await createPatientGroup({ name });
      groups.reload();
      await handleMoveToGroup(target, group.id);
    } catch (thrown) {
      setActionError(errorMessage(thrown));
    }
  }

  /**
   * Put one group above another. The server is the order of record (migration
   * 011) so it is the only place the decision lives — an optimistic guess here
   * would put the sidebar out of step with the database every time it guessed
   * wrong, and she would find out tomorrow.
   */
  async function handleReorderGroup(groupId: string, index: number): Promise<void> {
    try {
      await updatePatientGroup(groupId, { position: index });
      setActionError(null);
      groups.reload();
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
  // Home is the no-patient screen. A patient id whose list is still loading
  // is not home yet — it would flash the welcome screen on every reload. The
  // full patient list is its own page, not home.
  const atHome =
    !atDirectory && patient === null && (patientId === null || patients.state.status !== 'loading');
  const narrowPane = atDirectory
    ? 'main'
    : patient === null
      ? 'patients'
      : note !== null || view !== 'notes'
        ? 'main'
        : 'notes';
  const previousPane = useRef(narrowPane);

  useEffect(() => {
    if (previousPane.current === narrowPane) return;
    previousPane.current = narrowPane;
    const targetSelector =
      narrowPane === 'patients'
        ? "[data-testid='patient-search']"
        : narrowPane === 'notes'
          ? "[data-testid='notes-header']"
          : '.main-back';
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(targetSelector)?.focus();
    });
  }, [narrowPane]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((was) => {
      writeSidebarCollapsed(!was);
      return !was;
    });
  }, []);

  /** The rail's Search: the sidebar comes back with its search field focused. */
  const searchFromRail = useCallback(() => {
    setSidebarCollapsed(false);
    writeSidebarCollapsed(false);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>("[data-testid='patient-search']")?.focus();
    });
  }, []);

  const resizeSidebar = useCallback((width: number, done: boolean) => {
    setSidebarWidth(width);
    if (done) writeSidebarWidth(width);
  }, []);

  // Ctrl+B (⌘B on a Mac) shows and hides the sidebar from anywhere, as in
  // Claude. The note editor is plain text, so the chord has no bold to steal.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      if (event.key !== 'b' && event.key !== 'B') return;
      event.preventDefault();
      toggleSidebar();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [toggleSidebar]);

  // One place for the controls this preview has not built, so a row that says
  // so says the same thing wherever it is pressed from.
  const onUnavailable = useCallback(
    (what: string) => {
      // `what` arrives already localised: `PatientsColumn` and
      // `PatientDirectory` pass `t(…)`, so the toast names the control in the
      // same language as the button that was pressed.
      setPreviewNote(t('preview.unavailable', { what }));
    },
    [t],
  );

  const serverUnavailable = [patients.state, formats.state, notes.state].some(
    (state) => state.status === 'error' && state.message === NETWORK_ERROR_MESSAGE,
  );

  if (serverUnavailable) {
    return (
      <div className="empty-state" data-testid="server-unavailable" role="alert">
        <h1>{t('workspace.serverUnreachable')}</h1>
        <p>{t('workspace.serverUnreachableBody')}</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          {t('common.tryAgain')}
        </button>
      </div>
    );
  }

  // First run: with no note format defined there is nothing to draft into, so
  // the app opens on onboarding instead of an empty workspace.
  if (formats.state.status === 'ready' && formats.state.data.length === 0) {
    return <Navigate to="/onboarding/format" replace />;
  }
  return (
    <div className="workspace">
      <AiBanner />
      <div
        className={`app-shell pane-${narrowPane}${atHome ? ' at-home' : ''}${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}
        style={
          sidebarWidth === null
            ? undefined
            : ({ '--sidebar-w': `${String(sidebarWidth)}px` } as React.CSSProperties)
        }
      >
        <PatientsColumn
          patients={patients.state}
          ordered={ordered}
          activePatientId={patient?.id ?? null}
          recency={recency}
          pinnedIds={pins.ids}
          sidebarPatients={patientList}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebar}
          onSelect={selectPatient}
          onRetry={patients.reload}
          onSetArchived={(target, archived) => {
            void handleSetArchived(target, archived);
          }}
          onRename={(target, name) => {
            void handleRename(target, name);
          }}
          onDelete={setPendingDelete}
          onTogglePin={pins.toggle}
          onReorderPins={pins.move}
          groups={groups.groups}
          groupsState={groups.state}
          onReloadGroups={groups.reload}
          onMoveToGroup={(target, groupId) => {
            void handleMoveToGroup(target, groupId);
          }}
          onCreateGroup={(target, name) => {
            void handleCreateGroup(target, name);
          }}
          onStatusChange={(status) => {
            setSidebarWantsArchived(status !== 'active');
          }}
          onReorderGroup={(groupId, index) => {
            void handleReorderGroup(groupId, index);
          }}
          onMoveIntoGroup={(target, groupId, position) => {
            void handleMoveIntoGroup(target, groupId, position);
          }}
          onOpenAll={() => {
            navigate('/patients');
          }}
          onOpenSettings={() => {
            setSettingsOpen(true);
          }}
          onUnavailable={onUnavailable}
          onOpenLanguage={() => {
            setLanguageOpen(true);
          }}
          onOpenImport={() => {
            // A first-level row in "More" (owner, 2026-09-27), so
            // importing is where she expects it and not two levels into
            // Settings. The import screens themselves are untouched.
            navigate('/import');
          }}
          edge={
            <SidebarResizer
              width={sidebarWidth ?? SIDEBAR_DEFAULT_W}
              onResize={resizeSidebar}
              onCollapse={toggleSidebar}
            />
          }
        />

        {/* Collapsed, the sidebar leaves a rail of icons behind rather than
            nothing (owner, 2026-09-26): the way back, and the main things. */}
        {sidebarCollapsed && (
          <SidebarRail
            onExpand={toggleSidebar}
            onSearch={searchFromRail}
            onOpenAll={() => {
              navigate('/patients');
            }}
            onOpenSettings={() => {
              setSettingsOpen(true);
            }}
            onUnavailable={onUnavailable}
            onOpenLanguage={() => {
              setLanguageOpen(true);
            }}
          />
        )}

        {!atHome && !atDirectory && (
          <NotesColumn
            patient={patient}
            notes={notesForColumn}
            activeNoteId={view === 'notes' ? (note?.id ?? null) : null}
            view={view}
            onSelect={selectNote}
            onOpenView={openView}
            onRetry={notes.reload}
            onBackToPatients={() => {
              setParams({});
            }}
          />
        )}

        <div className="col col-main" data-testid="main-pane">
          {patient !== null && !atDirectory && (
            <button
              type="button"
              className="narrow-back main-back"
              onClick={() => {
                setParams({ patient: patient.id });
              }}
            >
              <BackIcon className="icon icon-xs" />
              <span>{t('notes.title')}</span>
            </button>
          )}
          {/* Formats are loaded to decide the first-run redirect; if that call
            fails, say so rather than quietly behaving as if formats exist. */}
          {formats.state.status === 'error' && (
            <p className="form-error" role="alert">
              {formats.state.message}
            </p>
          )}
          {atDirectory ? (
            <PatientDirectory
              patients={directoryRows}
              status={patients.state.status}
              errorMessage={patients.state.status === 'error' ? patients.state.message : null}
              onRetry={patients.reload}
              tab={directoryTab}
              onTab={setDirectoryTab}
              onSelect={selectPatient}
              onSetArchived={(target, archived) => {
                void handleSetArchived(target, archived);
              }}
              onRename={(target, name) => {
                void handleRename(target, name);
              }}
              onDelete={setPendingDelete}
              onTogglePin={pins.toggle}
              lastNoteAt={recency}
              pinnedIds={pins.ids}
              groups={groups.groups}
              onMoveToGroup={(target, groupId) => {
                void handleMoveToGroup(target, groupId);
              }}
              onCreateGroup={(target, name) => {
                void handleCreateGroup(target, name);
              }}
              onUnavailable={onUnavailable}
            />
          ) : patient === null ? (
            atHome ? (
              <HomeLauncher patients={ordered} onSelect={selectPatient} />
            ) : null
          ) : view === 'plan' ? (
            <PlanView key={`plan-${patient.id}`} patient={patient} onOpenNote={selectNote} />
          ) : view === 'prep' ? (
            <PrepView key={`prep-${patient.id}`} patient={patient} onOpenNote={selectNote} />
          ) : view === 'brainstorm' ? (
            <BrainstormView key={`brainstorm-${patient.id}`} patient={patient} />
          ) : note === null ? (
            <NoNoteSelected
              patient={patient}
              emptyNotes={notes.state.status === 'ready' && notes.state.data.length === 0}
            />
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

      {previewNote !== null && (
        <Toast
          message={previewNote}
          onDismiss={() => {
            setPreviewNote(null);
          }}
        />
      )}

      {languageOpen && (
        <LanguageDialog
          onClose={() => {
            setLanguageOpen(false);
          }}
        />
      )}

      {/* Settings over the workspace: the page behind is blurred and dimmed, the
          panel is centred (owner preview, 2026-09-26). */}
      {settingsOpen && (
        <Suspense fallback={null}>
          <SettingsModal
            onClose={() => {
              setSettingsOpen(false);
            }}
          />
        </Suspense>
      )}

      {pendingDelete !== null && (
        <ConfirmDialog
          title={t('workspace.deleteTitle', { name: pendingDelete.name })}
          confirmLabel={t('workspace.deleteConfirm', { name: pendingDelete.name })}
          body={
            <>
              <p>{t('workspace.deleteBodyFirst', { name: pendingDelete.name })}</p>
              <p>{t('workspace.deleteBodySecond')}</p>
              <p>
                {t('workspace.deleteBodyThirdLead')} <strong>{t('common.archive')}</strong>{' '}
                {t('workspace.deleteBodyThirdTail')}
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

/**
 * The centred settings panel of the owner's preview: Claude dims and blurs the
 * page behind it rather than replacing it, and puts the sections down the left
 * of the panel with the open one on the right (owner preview, 2026-09-26). So
 * `Dialog` does the work (Escape, a trapped tab order, focus returned to the
 * row that opened it) and the workspace stays mounted underneath.
 */
function SettingsModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { t } = useI18n();
  return (
    <Dialog
      title={t('common.settings')}
      onClose={onClose}
      showTitle={false}
      className="modal card settings-modal"
      testId="settings-modal"
      backdropTestId="settings-backdrop"
    >
      <SettingsModalPanel onClose={onClose} />
    </Dialog>
  );
}

function NoNoteSelected({
  patient,
  emptyNotes,
}: {
  patient: PatientListItem;
  emptyNotes: boolean;
}): React.JSX.Element {
  const { t } = useI18n();
  return (
    <div className="empty-state" data-testid="empty-no-note">
      <DocumentIcon />
      <p className="empty-message">
        {emptyNotes
          ? t('notes.emptyFor', { name: patient.name })
          : t('workspace.noNoteSelected', { name: patient.name })}
      </p>
      <Link to={`/capture/${patient.id}`} className="btn btn-primary">
        <PlusIcon className="icon icon-sm" />
        {emptyNotes ? t('notes.createFirst') : t('notes.createNew')}
      </Link>
    </div>
  );
}
