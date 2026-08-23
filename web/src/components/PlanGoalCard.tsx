import type { PlanGoal, PlanObjective } from '@apunta/shared';
import { useState } from 'react';

import { formatNoteDate, formatPlanDate } from '../lib/format.js';
import { CheckIcon, CloseIcon, PencilIcon, TrashIcon } from './icons.js';

/**
 * One goal, in whichever of its two lives it is currently in.
 *
 * An accepted goal reads as a clinical document: statement, objectives with
 * their measure, baseline and target, interventions. A **proposed** goal is
 * rendered nothing like it — a tinted card, marked as a suggestion, carrying
 * the quoted note text it was drafted from and three buttons. That difference
 * is the point: a proposal is not part of the plan, and a screen that let the
 * two read alike would be the exact failure this feature is built to avoid.
 *
 * The target value and target date of a suggested objective are deliberately
 * blank, and shown as blanks. A note can say where he started; only she can
 * say where he should get to (`docs/research/m9-plan-requirements-2026-08.md`
 * §3.4).
 */

export interface PlanGoalCardProps {
  goal: PlanGoal;
  /** Historical versions are read-only: they are the record of what was. */
  readOnly: boolean;
  busy: boolean;
  onUpdate: (goal: PlanGoal, patch: Parameters<typeof identity>[0]) => void;
  onDelete: (goal: PlanGoal) => void;
  /** Follow a citation through to the note it came from. */
  onOpenNote: (noteId: string) => void;
}

/** Only here to give the patch parameter above a name TypeScript can read. */
function identity(patch: {
  statement?: string;
  objectives?: PlanObjective[];
  interventions?: string[];
  target_date?: string | null;
  status?: PlanGoal['status'];
}): typeof patch {
  return patch;
}

const BLANK = '—';

export function PlanGoalCard({
  goal,
  readOnly,
  busy,
  onUpdate,
  onDelete,
  onOpenNote,
}: PlanGoalCardProps): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const proposed = goal.status === 'proposed';

  if (editing) {
    return (
      <GoalEditor
        goal={goal}
        onCancel={() => {
          setEditing(false);
        }}
        onSave={(patch) => {
          setEditing(false);
          onUpdate(goal, patch);
        }}
      />
    );
  }

  return (
    <article
      className={proposed ? 'plan-goal is-proposed' : 'plan-goal'}
      data-testid={proposed ? 'proposed-goal' : 'plan-goal'}
    >
      <header className="plan-goal-header">
        <div>
          {proposed && <span className="badge badge-proposed">Suggested — not in the plan yet</span>}
          {!proposed && goal.status !== 'accepted' && <span className="badge">{goal.status}</span>}
          <p className="plan-goal-statement">{goal.statement}</p>
        </div>
        {!readOnly && (
          <div className="row gap-8">
            {proposed && (
              <button
                type="button"
                className="btn small btn-primary btn-compact"
                data-testid="accept-goal"
                disabled={busy}
                onClick={() => {
                  onUpdate(goal, { status: 'accepted' });
                }}
              >
                <CheckIcon className="icon icon-xs" />
                Accept
              </button>
            )}
            <button
              type="button"
              className="btn small btn-compact"
              data-testid="edit-goal"
              disabled={busy}
              onClick={() => {
                setEditing(true);
              }}
            >
              <PencilIcon className="icon icon-xs" />
              Edit
            </button>
            {!proposed && goal.status === 'accepted' && (
              <>
                <button
                  type="button"
                  className="btn small btn-compact"
                  disabled={busy}
                  onClick={() => {
                    onUpdate(goal, { status: 'met' });
                  }}
                >
                  Met
                </button>
                <button
                  type="button"
                  className="btn small btn-compact"
                  disabled={busy}
                  onClick={() => {
                    onUpdate(goal, { status: 'discontinued' });
                  }}
                >
                  Discontinue
                </button>
              </>
            )}
            <button
              type="button"
              className="btn small btn-compact-icon"
              title={proposed ? 'Discard this suggestion' : 'Delete this goal'}
              aria-label={proposed ? 'Discard this suggestion' : 'Delete this goal'}
              data-testid="discard-goal"
              disabled={busy}
              onClick={() => {
                onDelete(goal);
              }}
            >
              <TrashIcon className="icon icon-xs" />
            </button>
          </div>
        )}
      </header>

      {goal.carried_from_goal_id !== null && (
        <p className="small note-meta">Carried forward from the previous version.</p>
      )}

      <dl className="plan-objectives">
        {goal.objectives.length === 0 && <p className="small note-meta">No objectives yet.</p>}
        {goal.objectives.map((objective, index) => (
          <div className="plan-objective" key={`${goal.id}-${String(index)}`}>
            <p>{objective.statement}</p>
            <p className="small note-meta">
              Measure: {objective.measure.trim() === '' ? BLANK : objective.measure} · Baseline:{' '}
              {objective.baseline.trim() === '' ? BLANK : objective.baseline} · Target:{' '}
              {objective.target_value.trim() === '' ? BLANK : objective.target_value} · By:{' '}
              {objective.target_date === null ? BLANK : formatPlanDate(objective.target_date)}
            </p>
          </div>
        ))}
      </dl>

      {goal.interventions.length > 0 && (
        <p className="small plan-interventions">Interventions: {goal.interventions.join('; ')}</p>
      )}

      {goal.evidence.length > 0 && (
        <div className="plan-evidence" data-testid="goal-evidence">
          <p className="small note-meta">Drafted from your notes:</p>
          {goal.evidence.map((evidence, index) => (
            <blockquote key={`${goal.id}-evidence-${String(index)}`}>
              <span>“{evidence.excerpt}”</span>
              <button
                type="button"
                className="link-button small"
                data-testid="evidence-link"
                onClick={() => {
                  onOpenNote(evidence.note_id);
                }}
              >
                {formatNoteDate(evidence.note_date)}
                {evidence.section === null ? '' : ` · ${evidence.section}`}
              </button>
            </blockquote>
          ))}
        </div>
      )}
    </article>
  );
}

interface GoalEditorProps {
  goal: PlanGoal;
  onCancel: () => void;
  onSave: (patch: ReturnType<typeof identity>) => void;
}

/**
 * Editing is ordinary document editing: no model is involved, here or on the
 * server. Accepting a suggestion she has edited saves both in one PATCH.
 */
function GoalEditor({ goal, onCancel, onSave }: GoalEditorProps): React.JSX.Element {
  const [statement, setStatement] = useState(goal.statement);
  const [objectives, setObjectives] = useState<PlanObjective[]>(goal.objectives);
  const [interventions, setInterventions] = useState(goal.interventions.join('\n'));
  const [targetDate, setTargetDate] = useState(goal.target_date ?? '');

  function patchObjective(index: number, patch: Partial<PlanObjective>): void {
    setObjectives((current) =>
      current.map((objective, position) => (position === index ? { ...objective, ...patch } : objective)),
    );
  }

  return (
    <article className="plan-goal is-editing" data-testid="goal-editor">
      <label className="label" htmlFor={`goal-${goal.id}-statement`}>
        Goal
      </label>
      <textarea
        id={`goal-${goal.id}-statement`}
        className="plan-input"
        rows={2}
        value={statement}
        onChange={(event) => {
          setStatement(event.target.value);
        }}
      />

      {objectives.map((objective, index) => (
        <fieldset className="plan-objective-editor" key={`${goal.id}-edit-${String(index)}`}>
          <legend className="small note-meta">Objective {index + 1}</legend>
          <textarea
            className="plan-input"
            aria-label={`Objective ${String(index + 1)}`}
            rows={2}
            value={objective.statement}
            onChange={(event) => {
              patchObjective(index, { statement: event.target.value });
            }}
          />
          <div className="plan-objective-fields">
            <input
              className="plan-input"
              aria-label={`Objective ${String(index + 1)} measure`}
              placeholder="Measure"
              value={objective.measure}
              onChange={(event) => {
                patchObjective(index, { measure: event.target.value });
              }}
            />
            <input
              className="plan-input"
              aria-label={`Objective ${String(index + 1)} baseline`}
              placeholder="Baseline"
              value={objective.baseline}
              onChange={(event) => {
                patchObjective(index, { baseline: event.target.value });
              }}
            />
            <input
              className="plan-input"
              aria-label={`Objective ${String(index + 1)} target`}
              placeholder="Target"
              value={objective.target_value}
              onChange={(event) => {
                patchObjective(index, { target_value: event.target.value });
              }}
            />
            <input
              className="plan-input"
              type="date"
              aria-label={`Objective ${String(index + 1)} target date`}
              value={objective.target_date ?? ''}
              onChange={(event) => {
                patchObjective(index, { target_date: event.target.value === '' ? null : event.target.value });
              }}
            />
          </div>
        </fieldset>
      ))}

      <button
        type="button"
        className="btn small btn-quick"
        onClick={() => {
          setObjectives((current) => [
            ...current,
            {
              statement: '',
              measure: '',
              baseline: '',
              target_value: '',
              target_date: null,
              source: 'clinician_authored',
            },
          ]);
        }}
      >
        Add objective
      </button>

      <label className="label" htmlFor={`goal-${goal.id}-interventions`}>
        Interventions, one per line
      </label>
      <textarea
        id={`goal-${goal.id}-interventions`}
        className="plan-input"
        rows={2}
        value={interventions}
        onChange={(event) => {
          setInterventions(event.target.value);
        }}
      />

      <label className="label" htmlFor={`goal-${goal.id}-target`}>
        Goal target date
      </label>
      <input
        id={`goal-${goal.id}-target`}
        className="plan-input"
        type="date"
        value={targetDate}
        onChange={(event) => {
          setTargetDate(event.target.value);
        }}
      />

      <div className="row gap-8">
        <button
          type="button"
          className="btn small btn-primary btn-compact"
          data-testid="save-goal"
          onClick={() => {
            onSave({
              statement: statement.trim(),
              objectives: objectives
                .filter((objective) => objective.statement.trim() !== '')
                .map((objective) => ({ ...objective, statement: objective.statement.trim() })),
              interventions: interventions
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line !== ''),
              target_date: targetDate === '' ? null : targetDate,
              // Saving an edited suggestion accepts it: she has made it hers.
              ...(goal.status === 'proposed' ? { status: 'accepted' as const } : {}),
            });
          }}
        >
          <CheckIcon className="icon icon-xs" />
          {goal.status === 'proposed' ? 'Save and accept' : 'Save'}
        </button>
        <button type="button" className="btn small btn-compact" onClick={onCancel}>
          <CloseIcon className="icon icon-xs" />
          Cancel
        </button>
      </div>
    </article>
  );
}
