import type { PatientListItem } from '@apunta/shared';
import { useState } from 'react';
import { Link } from 'react-router';

import type { LoadState } from '../hooks/useLoader.js';
import { initials, noteCountLabel } from '../lib/format.js';
import { MarkIcon, PlusIcon } from './icons.js';
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
}: PatientsColumnProps): React.JSX.Element {
  const [query, setQuery] = useState('');

  const archivedCount =
    patients.status === 'ready' ? patients.data.filter((patient) => patient.archived_at !== null).length : 0;

  return (
    <div className="col col-patients">
      {/*
        The app's identity lives here, top-left: the mark and the lowercase
        "Apunta" wordmark (owner-proxy: capitalized, 2026-08-30), with "Patients"
        kept beneath as a small label so the list still names itself. The
        prototype put only the column title here; this is part of the same
        sanctioned brand-and-motion pass.
      */}
      <div className="col-header col-header-brand">
        <div className="brand-block">
          <div className="row gap-8">
            <MarkIcon className="mark mark-sm" />
            <span className="brand">Apunta</span>
          </div>
          <h3>Patients</h3>
        </div>
        <Link to="/patients/new" className="icon-btn" title="Add patient" aria-label="Add patient">
          <PlusIcon className="icon-plus" />
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
              <div>
                <div className="name" title={patient.name}>
                  {patient.name}
                </div>
                <div className="sub">
                  {noteCountLabel(patient.note_count)}
                  {archived ? ' · archived' : ''}
                </div>
              </div>
            </button>
            {/* Hover actions, like the prototype's list: renaming is for a name
                the Claude import misspelt or guessed (owner, 2026-09-21). */}
            {renaming?.id !== patient.id && (
              <div className="patient-entry-actions">
                <button
                  type="button"
                  className="btn small btn-quick"
                  data-testid={`rename-${patient.id}`}
                  onClick={() => {
                    setRenaming({ id: patient.id, name: patient.name });
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="btn small btn-quick"
                  data-testid={`archive-${patient.id}`}
                  onClick={() => {
                    onSetArchived(patient, !archived);
                  }}
                >
                  {archived ? 'Restore' : 'Archive'}
                </button>
              </div>
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
