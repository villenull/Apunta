import type { ClientParticipation, Diagnosis, TreatmentPlan, UpdatePlanRequest } from '@apunta/shared';
import { useState } from 'react';

import { formatPlanDate } from '../lib/format.js';
import { TrashIcon } from './icons.js';

/**
 * The plan-level fields — everything an auditor looks for that is not a goal.
 *
 * All of it is typed by her, the diagnosis above all: it anchors medical
 * necessity, and a code from a model is billing-consequential invention. There
 * is no "suggest a diagnosis" button here because there is no such call in the
 * app (`docs/decisions.md`, 2026-08-23).
 */

export interface PlanDetailsProps {
  plan: TreatmentPlan;
  readOnly: boolean;
  busy: boolean;
  onSave: (patch: UpdatePlanRequest) => void;
}

const PARTICIPATION_LABELS: Record<ClientParticipation, string> = {
  not_recorded: 'Not recorded',
  reviewed_with_client: 'Reviewed with client',
  declined: 'Client declined to sign',
  signed_elsewhere: 'Signed copy in my records system',
};

export function PlanDetails({ plan, readOnly, busy, onSave }: PlanDetailsProps): React.JSX.Element {
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>(plan.diagnoses);
  const [presenting, setPresenting] = useState(plan.presenting_problem);
  const [strengths, setStrengths] = useState(plan.strengths);
  const [modality, setModality] = useState(plan.modality);
  const [frequency, setFrequency] = useState(plan.frequency);
  const [discharge, setDischarge] = useState(plan.discharge_criteria);
  const [interval, setInterval] = useState(String(plan.review_interval_days));
  const [participation, setParticipation] = useState<ClientParticipation>(plan.client_participation);
  const [participationOn, setParticipationOn] = useState(plan.client_participation_on ?? '');
  const [participationNote, setParticipationNote] = useState(plan.client_participation_note);

  if (readOnly) {
    return (
      <section className="plan-details" data-testid="plan-details">
        <Read label="Diagnoses" value={diagnoses.map(describe).join('; ')} />
        <Read label="Presenting problem" value={plan.presenting_problem} />
        <Read label="Strengths" value={plan.strengths} />
        <Read label="Service modality" value={plan.modality} />
        <Read label="Service frequency" value={plan.frequency} />
        <Read label="Discharge criteria" value={plan.discharge_criteria} />
        <Read label="Review interval" value={`Every ${String(plan.review_interval_days)} days`} />
        <Read
          label="Client participation"
          value={[
            PARTICIPATION_LABELS[plan.client_participation],
            plan.client_participation_on === null ? '' : formatPlanDate(plan.client_participation_on),
            plan.client_participation_note,
          ]
            .filter((part) => part !== '')
            .join(' · ')}
        />
      </section>
    );
  }

  return (
    <section className="plan-details" data-testid="plan-details">
      <p className="label">Diagnoses</p>
      {diagnoses.length === 0 && (
        <p className="small note-meta">
          None recorded. Goals are expected to trace to a diagnosis, and it is yours to enter.
        </p>
      )}
      {diagnoses.map((diagnosis, index) => (
        <div className="plan-diagnosis" key={`diagnosis-${String(index)}`}>
          <input
            className="plan-input"
            aria-label={`Diagnosis ${String(index + 1)} code`}
            placeholder="Code"
            value={diagnosis.code}
            onChange={(event) => {
              patch(index, { code: event.target.value });
            }}
          />
          <select
            className="plan-input"
            aria-label={`Diagnosis ${String(index + 1)} system`}
            value={diagnosis.system}
            onChange={(event) => {
              patch(index, { system: event.target.value as Diagnosis['system'] });
            }}
          >
            <option value="icd-10-cm">ICD-10-CM</option>
            <option value="dsm-5-tr">DSM-5-TR</option>
          </select>
          <input
            className="plan-input"
            aria-label={`Diagnosis ${String(index + 1)} description`}
            placeholder="Description"
            value={diagnosis.description}
            onChange={(event) => {
              patch(index, { description: event.target.value });
            }}
          />
          <label className="small">
            <input
              type="checkbox"
              checked={diagnosis.primary}
              onChange={(event) => {
                patch(index, { primary: event.target.checked });
              }}
            />{' '}
            Primary
          </label>
          <button
            type="button"
            className="btn small btn-compact-icon"
            aria-label={`Remove diagnosis ${String(index + 1)}`}
            onClick={() => {
              setDiagnoses((current) => current.filter((_, position) => position !== index));
            }}
          >
            <TrashIcon className="icon icon-xs" />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn small btn-quick"
        data-testid="add-diagnosis"
        onClick={() => {
          setDiagnoses((current) => [
            ...current,
            { code: '', system: 'icd-10-cm', description: '', primary: current.length === 0 },
          ]);
        }}
      >
        Add diagnosis
      </button>

      <Field label="Presenting problem" value={presenting} onChange={setPresenting} multiline />
      <Field label="Strengths" value={strengths} onChange={setStrengths} multiline />
      <Field label="Service modality" value={modality} onChange={setModality} />
      <Field label="Service frequency" value={frequency} onChange={setFrequency} />
      <Field label="Discharge criteria" value={discharge} onChange={setDischarge} multiline />
      <Field label="Review interval (days)" value={interval} onChange={setInterval} />

      <label className="label" htmlFor="plan-participation">
        Client participation
      </label>
      <select
        id="plan-participation"
        className="plan-input"
        value={participation}
        onChange={(event) => {
          setParticipation(event.target.value as ClientParticipation);
        }}
      >
        {Object.entries(PARTICIPATION_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <div className="plan-objective-fields">
        <input
          className="plan-input"
          type="date"
          aria-label="Client participation date"
          value={participationOn}
          onChange={(event) => {
            setParticipationOn(event.target.value);
          }}
        />
        <input
          className="plan-input"
          aria-label="Client participation note"
          placeholder="Reason, if it could not be signed"
          value={participationNote}
          onChange={(event) => {
            setParticipationNote(event.target.value);
          }}
        />
      </div>

      <button
        type="button"
        className="btn btn-primary"
        data-testid="save-plan-details"
        disabled={busy}
        onClick={() => {
          const days = Number(interval);
          onSave({
            diagnoses,
            presenting_problem: presenting,
            strengths,
            modality,
            frequency,
            discharge_criteria: discharge,
            ...(Number.isInteger(days) && days > 0 ? { review_interval_days: days } : {}),
            client_participation: participation,
            client_participation_on: participationOn === '' ? null : participationOn,
            client_participation_note: participationNote,
          });
        }}
      >
        Save plan details
      </button>
    </section>
  );

  function patch(index: number, change: Partial<Diagnosis>): void {
    setDiagnoses((current) =>
      current.map((diagnosis, position) => (position === index ? { ...diagnosis, ...change } : diagnosis)),
    );
  }
}

function describe(diagnosis: Diagnosis): string {
  const system = diagnosis.system === 'icd-10-cm' ? 'ICD-10-CM' : 'DSM-5-TR';
  return [diagnosis.code, `(${system})`, diagnosis.description]
    .filter((part) => part.trim() !== '')
    .join(' ');
}

function Read({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="plan-read-field">
      <p className="label">{label}</p>
      <p className={value.trim() === '' ? 'small note-meta' : ''}>
        {value.trim() === '' ? 'Not recorded' : value}
      </p>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}

function Field({ label, value, onChange, multiline = false }: FieldProps): React.JSX.Element {
  const id = `plan-field-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  return (
    <>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          className="plan-input"
          rows={2}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      ) : (
        <input
          id={id}
          className="plan-input"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      )}
    </>
  );
}
