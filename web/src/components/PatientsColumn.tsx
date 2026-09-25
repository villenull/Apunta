import type { PatientListItem } from '@apunta/shared';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';

import type { LoadState } from '../hooks/useLoader.js';
import { initials, noteCountLabel } from '../lib/format.js';
import { MoreIcon, PlusIcon } from './icons.js';
import { SpellLayer } from './SpellLayer.js';

export interface PatientsColumnProps {
  patients: LoadState<PatientListItem[]>;
  activePatientId: string | null;
  /** Whether the list currently includes archived patients. */
  showArchived: boolean;
  onSelect: (patientId: string) => void;
  onRetry: () => void;
  onToggleArchived: (show: boolean) => void;
  onSetArchived: (patient: PatientListItem, archived: boolean) => void;
  /**
   * Save a new name. Imported names may be misspelt; saving also clears the
   * import's `name_guessed` flag, which the list no longer shows.
   */
  onRename: (patient: PatientListItem, name: string) => void;
  /** Ask to delete the patient; the workspace confirms before anything goes. */
  onDelete: (patient: PatientListItem) => void;
}

/** Left column of `prototype/patients.html`: search, add, and the patient list. */
export function PatientsColumn({
  patients,
  activePatientId,
  showArchived,
  onSelect,
  onRetry,
  onToggleArchived,
  onSetArchived,
  onRename,
  onDelete,
}: PatientsColumnProps): React.JSX.Element {
  const [query, setQuery] = useState('');

  const archivedCount =
    patients.status === 'ready' ? patients.data.filter((patient) => patient.archived_at !== null).length : 0;

  return (
    <div className="col col-patients">
      {/*
        The app's identity lives here, top-left: the wordmark alone. The owner
        dropped the mark and the "Patients" label (2026-09-24) — the list names
        itself — and adding a patient is the "New" row at the top of the list.
        The wordmark goes home: no patient, the welcome search.
      */}
      <div className="col-header col-header-brand">
        <Link to="/" className="brand brand-link" data-testid="home-link">
          Apunta
        </Link>
      </div>

      <div className="col-search">
        <input
          type="text"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          placeholder="Search patients"
          data-testid="patient-search"
          aria-label="Search patients"
        />
      </div>

      <div className="col-body" data-testid="patient-list">
        <Link to="/patients/new" className="list-item new-patient-item" data-testid="new-patient">
          <div className="avatar">
            <PlusIcon className="icon-plus" />
          </div>
          <div className="patient-list-copy">
            <div className="name">New</div>
          </div>
        </Link>
        <PatientList
          patients={patients}
          query={query}
          activePatientId={activePatientId}
          showArchived={showArchived}
          onSelect={onSelect}
          onRetry={onRetry}
          onClearSearch={() => {
            setQuery('');
          }}
          onToggleArchived={onToggleArchived}
          onSetArchived={onSetArchived}
          onRename={onRename}
          onDelete={onDelete}
        />
      </div>

      {/*
        Archiving hides a patient from the working list. It deletes nothing —
        the notes stay, the plan stays, and the retention default is unchanged
        (`docs/research/data-at-rest-2026-08.md` §6.1). The toggle is here
        rather than in Settings because this is the list it changes.
      */}
      <label className="col-archived-toggle small">
        <input
          type="checkbox"
          checked={showArchived}
          data-testid="show-archived"
          onChange={(event) => {
            onToggleArchived(event.target.checked);
          }}
        />
        <span>
          Show archived
          {showArchived && archivedCount > 0 ? ` (${String(archivedCount)})` : ''}
        </span>
      </label>

      <div className="col-footer">
        <Link to="/settings" className="small">
          Note formats &amp; settings
        </Link>
      </div>
    </div>
  );
}

function PatientList({
  patients,
  query,
  activePatientId,
  showArchived,
  onSelect,
  onRetry,
  onClearSearch,
  onSetArchived,
  onRename,
  onDelete,
}: PatientsColumnProps & { query: string; onClearSearch: () => void }): React.JSX.Element {
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  if (patients.status === 'loading') return <p className="small state-note">Loading patients…</p>;

  if (patients.status === 'error') {
    return (
      <p className="small state-note error-state">
        {patients.message}{' '}
        <button type="button" className="btn small btn-quick" onClick={onRetry}>
          Try again
        </button>
      </p>
    );
  }

  const needle = query.trim().toLowerCase();
  const visible = patients.data.filter((patient) => patient.name.toLowerCase().includes(needle));

  if (visible.length === 0) {
    if (needle.length > 0) {
      return (
        <div className="empty-column-state">
          <p className="small col-hint">No patients match “{query.trim()}”.</p>
          <button type="button" className="btn btn-compact btn-quick" onClick={onClearSearch}>
            Clear search
          </button>
        </div>
      );
    }
    if (patients.data.length === 0) {
      return (
        <div className="empty-column-state">
          <p className="small col-hint">Add your first patient to get started.</p>
          <Link to="/patients/new" className="btn btn-primary btn-compact">
            <PlusIcon className="icon icon-sm" />
            Add your first patient
          </Link>
        </div>
      );
    }
    return <p className="small col-hint">{showArchived ? 'No patients yet.' : 'No active patients.'}</p>;
  }

  return (
    <>
      {visible.map((patient) => {
        const archived = patient.archived_at !== null;
        return (
          <div
            key={patient.id}
            className={archived ? 'patient-entry is-archived' : 'patient-entry'}
            data-testid={`patient-entry-${patient.id}`}
          >
            <button
              type="button"
              className={patient.id === activePatientId ? 'list-item active' : 'list-item'}
              onClick={() => {
                onSelect(patient.id);
              }}
            >
              <div className="avatar">{initials(patient.name)}</div>
              <div className="patient-list-copy">
                <div className="name" title={patient.name}>
                  {patient.name}
                </div>
                <div className="sub">
                  {noteCountLabel(patient.note_count)}
                  {archived ? ' · archived' : ''}
                </div>
              </div>
            </button>
            {/* One small "⋯" instead of a row of buttons: the column is narrow
                (owner, 2026-09-24), and three buttons on hover squeezed the
                name to nothing. Its slot stays in the row while hidden so the
                selection target never moves under the pointer. */}
            {renaming?.id !== patient.id && (
              <PatientMenu
                patient={patient}
                archived={archived}
                onRename={() => {
                  setRenaming({ id: patient.id, name: patient.name });
                }}
                onSetArchived={() => {
                  onSetArchived(patient, !archived);
                }}
                onDelete={() => {
                  onDelete(patient);
                }}
              />
            )}
            {renaming?.id === patient.id && (
              <form
                className="row gap-8 patient-rename"
                onSubmit={(event) => {
                  event.preventDefault();
                  const name = renaming.name.trim();
                  if (name === '') return;
                  if (name !== patient.name || patient.name_guessed === true) onRename(patient, name);
                  setRenaming(null);
                }}
              >
                <SpellLayer
                  as="input"
                  type="text"
                  value={renaming.name}
                  allowWords={[patient.name]}
                  aria-label={`Name for ${patient.name}`}
                  autoFocus
                  onChange={(name) => {
                    setRenaming({ id: patient.id, name });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setRenaming(null);
                  }}
                />
                <button type="submit" className="btn small" data-testid={`save-name-${patient.id}`}>
                  Save
                </button>
              </form>
            )}
          </div>
        );
      })}
    </>
  );
}

interface PatientMenuProps {
  patient: PatientListItem;
  archived: boolean;
  onRename: () => void;
  onSetArchived: () => void;
  onDelete: () => void;
}

function PatientMenu({
  patient,
  archived,
  onRename,
  onSetArchived,
  onDelete,
}: PatientMenuProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event: PointerEvent): void {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function choose(action: () => void): () => void {
    return () => {
      setOpen(false);
      action();
    };
  }

  return (
    <div ref={ref} className={open ? 'patient-entry-actions is-open' : 'patient-entry-actions'}>
      <button
        type="button"
        className="icon-btn patient-menu-btn"
        aria-label={`Tools for ${patient.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid={`patient-menu-${patient.id}`}
        onClick={() => {
          setOpen((was) => !was);
        }}
      >
        <MoreIcon className="icon icon-sm" />
      </button>
      {open && (
        <div className="patient-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="patient-menu-item"
            data-testid={`rename-${patient.id}`}
            onClick={choose(onRename)}
          >
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            className="patient-menu-item"
            data-testid={`archive-${patient.id}`}
            onClick={choose(onSetArchived)}
          >
            {archived ? 'Restore' : 'Archive'}
          </button>
          <button
            type="button"
            role="menuitem"
            className="patient-menu-item is-danger"
            aria-label={`Delete ${patient.name}`}
            onClick={choose(onDelete)}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
