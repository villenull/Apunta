import type { ClientParticipation, Diagnosis, TreatmentPlan, UpdatePlanRequest } from '@apunta/shared';
import { useState } from 'react';

import { useI18n, type Translate } from '../lib/i18n.js';
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

/**
 * The four participation states, by the stored enum.
 *
 * The value is data and is never translated (Fixed decision 4): each state is
 * a key of its own, and `common.notRecorded` is the one both the read-only view
 * and the default option already used.
 */
function participationLabels(t: Translate): Record<ClientParticipation, string> {
  return {
    not_recorded: t('common.notRecorded'),
    reviewed_with_client: t('plan.participationReviewed'),
    declined: t('plan.participationDeclined'),
    signed_elsewhere: t('plan.participationSignedElsewhere'),
  };
}

export function PlanDetails({ plan, readOnly, busy, onSave }: PlanDetailsProps): React.JSX.Element {
  const { t } = useI18n();
  const labels = participationLabels(t);
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
        <Read label={t('plan.diagnoses')} value={diagnoses.map(describe).join('; ')} />
        <Read label={t('plan.presentingProblem')} value={plan.presenting_problem} />
        <Read label={t('plan.strengths')} value={plan.strengths} />
        <Read label={t('plan.modality')} value={plan.modality} />
        <Read label={t('plan.frequency')} value={plan.frequency} />
        <Read label={t('plan.dischargeCriteria')} value={plan.discharge_criteria} />
        <Read
          label={t('plan.reviewInterval')}
          value={t('plan.everyDays', { days: String(plan.review_interval_days) })}
        />
        <Read
          label={t('plan.clientParticipation')}
          value={[
            labels[plan.client_participation],
            plan.client_participation_on === null
              ? ''
              : t('notes.date', { day: plan.client_participation_on }),
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
      <p className="label">{t('plan.diagnoses')}</p>
      {diagnoses.length === 0 && <p className="small note-meta">{t('plan.diagnosesNone')}</p>}
      {diagnoses.map((diagnosis, index) => (
        <div className="plan-diagnosis" key={`diagnosis-${String(index)}`}>
          <input
            className="plan-input"
            aria-label={t('plan.diagnosisCodeLabel', { n: String(index + 1) })}
            placeholder={t('plan.diagnosisCode')}
            value={diagnosis.code}
            onChange={(event) => {
              patch(index, { code: event.target.value });
            }}
          />
          <select
            className="plan-input"
            aria-label={t('plan.diagnosisSystemLabel', { n: String(index + 1) })}
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
            aria-label={t('plan.diagnosisDescriptionLabel', { n: String(index + 1) })}
            placeholder={t('plan.diagnosisDescription')}
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
            {t('plan.diagnosisPrimary')}
          </label>
          <button
            type="button"
            className="btn small btn-compact-icon"
            aria-label={t('plan.removeDiagnosis', { n: String(index + 1) })}
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
        {t('plan.addDiagnosis')}
      </button>

      <Field label={t('plan.presentingProblem')} value={presenting} onChange={setPresenting} multiline />
      <Field label={t('plan.strengths')} value={strengths} onChange={setStrengths} multiline />
      <Field label={t('plan.modality')} value={modality} onChange={setModality} />
      <Field label={t('plan.frequency')} value={frequency} onChange={setFrequency} />
      <Field label={t('plan.dischargeCriteria')} value={discharge} onChange={setDischarge} multiline />
      <Field label={t('plan.reviewIntervalDays')} value={interval} onChange={setInterval} />

      <label className="label" htmlFor="plan-participation">
        {t('plan.clientParticipation')}
      </label>
      <select
        id="plan-participation"
        className="plan-input"
        value={participation}
        onChange={(event) => {
          setParticipation(event.target.value as ClientParticipation);
        }}
      >
        {Object.entries(labels).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <div className="plan-objective-fields">
        <input
          className="plan-input"
          type="date"
          aria-label={t('plan.participationDate')}
          value={participationOn}
          onChange={(event) => {
            setParticipationOn(event.target.value);
          }}
        />
        <input
          className="plan-input"
          aria-label={t('plan.participationNote')}
          placeholder={t('plan.participationNotePlaceholder')}
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
        {t('plan.saveDetails')}
      </button>
    </section>
  );

  function patch(index: number, change: Partial<Diagnosis>): void {
    setDiagnoses((current) =>
      current.map((diagnosis, position) => (position === index ? { ...diagnosis, ...change } : diagnosis)),
    );
  }
}

/** The stored code, its system and the description she typed — all data. */
function describe(diagnosis: Diagnosis): string {
  const system = diagnosis.system === 'icd-10-cm' ? 'ICD-10-CM' : 'DSM-5-TR';
  return [diagnosis.code, `(${system})`, diagnosis.description]
    .filter((part) => part.trim() !== '')
    .join(' ');
}

function Read({ label, value }: { label: string; value: string }): React.JSX.Element {
  const { t } = useI18n();
  return (
    <div className="plan-read-field">
      <p className="label">{label}</p>
      <p className={value.trim() === '' ? 'small note-meta' : ''}>
        {value.trim() === '' ? t('common.notRecorded') : value}
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
