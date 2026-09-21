import type { PatientListItem } from '@apunta/shared';
import { useState } from 'react';
import { Link } from 'react-router';

import type { LoadState } from '../hooks/useLoader.js';
import { initials, noteCountLabel } from '../lib/format.js';
import { MarkIcon, PlusIcon } from './icons.js';

export interface PatientsColumnProps {
  patients: LoadState<PatientListItem[]>;
  activePatientId: string | null;
  /** Whether the list currently includes archived patients. */
  showArchived: boolean;
  onSelect: (patientId: string) => void;
  onRetry: () => void;
  onToggleArchived: (show: boolean) => void;
  onSetArchived: (patient: PatientListItem, archived: boolean) => void;
  /** Save a name — how she clears a "name guessed — check" flag left by the Claude import. */
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
  onSetArchived,
  onRename,
}: PatientsColumnProps & { query: string }): React.JSX.Element {
  const [checking, setChecking] = useState<{ id: string; name: string } | null>(null);

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
    return (
      <p className="small col-hint">
        {needle.length > 0 ? 'No patients match.' : showArchived ? 'No patients yet.' : 'No active patients.'}
      </p>
    );
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
                <div className="name">{patient.name}</div>
                <div className="sub">
                  {noteCountLabel(patient.note_count)}
                  {archived ? ' · archived' : ''}
                </div>
              </div>
            </button>
            {patient.name_guessed === true && checking?.id !== patient.id && (
              <button
                type="button"
                className="btn small btn-quick"
                data-testid={`check-name-${patient.id}`}
                title="The Claude import guessed this name from a conversation title"
                onClick={() => {
                  setChecking({ id: patient.id, name: patient.name });
                }}
              >
                Name guessed — check
              </button>
            )}
            {checking?.id === patient.id && (
              <form
                className="row gap-8"
                onSubmit={(event) => {
                  event.preventDefault();
                  const name = checking.name.trim();
                  if (name === '') return;
                  onRename(patient, name);
                  setChecking(null);
                }}
              >
                <input
                  type="text"
                  value={checking.name}
                  aria-label={`Name for ${patient.name}`}
                  onChange={(event) => {
                    setChecking({ id: patient.id, name: event.target.value });
                  }}
                />
                <button type="submit" className="btn small" data-testid={`save-name-${patient.id}`}>
                  Save name
                </button>
              </form>
            )}
            <button
              type="button"
              className="btn small btn-quick patient-archive-btn"
              data-testid={`archive-${patient.id}`}
              onClick={() => {
                onSetArchived(patient, !archived);
              }}
            >
              {archived ? 'Restore' : 'Archive'}
            </button>
          </div>
        );
      })}
    </>
  );
}
