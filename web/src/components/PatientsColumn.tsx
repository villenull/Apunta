import type { PatientListItem } from '@apunta/shared';
import { useState } from 'react';
import { Link } from 'react-router';

import type { LoadState } from '../hooks/useLoader.js';
import { initials, noteCountLabel } from '../lib/format.js';
import { MarkIcon, PlusIcon } from './icons.js';

export interface PatientsColumnProps {
  patients: LoadState<PatientListItem[]>;
  activePatientId: string | null;
  onSelect: (patientId: string) => void;
  onRetry: () => void;
}

/** Left column of `prototype/patients.html`: search, add, and the patient list. */
export function PatientsColumn({
  patients,
  activePatientId,
  onSelect,
  onRetry,
}: PatientsColumnProps): React.JSX.Element {
  const [query, setQuery] = useState('');

  return (
    <div className="col col-patients">
      <div className="col-header">
        <div className="row gap-8">
          <MarkIcon className="mark mark-sm" />
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
          onSelect={onSelect}
          onRetry={onRetry}
        />
      </div>

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
  onSelect,
  onRetry,
}: PatientsColumnProps & { query: string }): React.JSX.Element {
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
    return <p className="small col-hint">{needle.length > 0 ? 'No patients match.' : 'No patients yet.'}</p>;
  }

  return (
    <>
      {visible.map((patient) => (
        <button
          key={patient.id}
          type="button"
          className={patient.id === activePatientId ? 'list-item active' : 'list-item'}
          onClick={() => {
            onSelect(patient.id);
          }}
        >
          <div className="avatar">{initials(patient.name)}</div>
          <div>
            <div className="name">{patient.name}</div>
            <div className="sub">{noteCountLabel(patient.note_count)}</div>
          </div>
        </button>
      ))}
    </>
  );
}
