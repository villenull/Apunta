import type { PlanGoal, PlanObjective } from '@apunta/shared';
import { useState } from 'react';

import { useI18n, type Translate } from '../lib/i18n.js';
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

/** What an edit or an accept sends. The same shape `PATCH .../goals/:id` takes. */
export interface GoalPatch {
  statement?: string;
  objectives?: PlanObjective[];
  interventions?: string[];
  target_date?: string | null;
  status?: PlanGoal['status'];
}

export interface PlanGoalCardProps {
  goal: PlanGoal;
  /** Historical versions are read-only: they are the record of what was. */
  readOnly: boolean;
  busy: boolean;
  onUpdate: (goal: PlanGoal, patch: GoalPatch) => void;
  onDelete: (goal: PlanGoal) => void;
  /** Follow a citation through to the note it came from. */
  onOpenNote: (noteId: string) => void;
}

/**
 * The em dash a blank field reads as, `PlanGoalCard.tsx:43`.
 *
 * A separator, not a string: it renders as it is in every language, so it is
 * not a catalogue key and never a parameter either (Fixed decision 2).
 */
const BLANK = '—';

export function PlanGoalCard({
  goal,
  readOnly,
  busy,
  onUpdate,
  onDelete,
  onOpenNote,
}: PlanGoalCardProps): React.JSX.Element {
  const { t } = useI18n();
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
          {proposed && <span className="badge badge-proposed">{t('plan.suggestedBadge')}</span>}
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
                {t('plan.accept')}
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
              {t('common.edit')}
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
                  {t('plan.met')}
                </button>
                <button
                  type="button"
                  className="btn small btn-compact"
                  disabled={busy}
                  onClick={() => {
                    onUpdate(goal, { status: 'discontinued' });
                  }}
                >
                  {t('plan.discontinue')}
                </button>
              </>
            )}
            <button
              type="button"
              className="btn small btn-compact-icon"
              title={proposed ? t('plan.discardSuggestion') : t('plan.deleteGoal')}
              aria-label={proposed ? t('plan.discardSuggestion') : t('plan.deleteGoal')}
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

      {goal.carried_from_goal_id !== null && <p className="small note-meta">{t('plan.carriedForward')}</p>}

      <dl className="plan-objectives">
        {goal.objectives.length === 0 && <p className="small note-meta">{t('plan.noObjectives')}</p>}
        {goal.objectives.map((objective, index) => (
          <div className="plan-objective" key={`${goal.id}-${String(index)}`}>
            <p>{objective.statement}</p>
            {/*
              One key for the whole meta line, in the two forms the screen
              already branches on: the stored `measure`, `baseline` and
              `target_value` are data, and the target date reaches `t()` as a
              `YYYY-MM-DD` under `dateOnly` rather than as the `en-US` string
              `formatPlanDate` prints (Fixed decision 3).
            */}
            <p className="small note-meta">
              {objective.target_date === null
                ? t('plan.objectiveMeta', {
                    measure: objective.measure.trim() === '' ? BLANK : objective.measure,
                    baseline: objective.baseline.trim() === '' ? BLANK : objective.baseline,
                    target: objective.target_value.trim() === '' ? BLANK : objective.target_value,
                  })
                : t('plan.objectiveMetaDated', {
                    measure: objective.measure.trim() === '' ? BLANK : objective.measure,
                    baseline: objective.baseline.trim() === '' ? BLANK : objective.baseline,
                    target: objective.target_value.trim() === '' ? BLANK : objective.target_value,
                    day: objective.target_date,
                  })}
            </p>
          </div>
        ))}
      </dl>

      {goal.interventions.length > 0 && (
        <p className="small plan-interventions">
          {t('plan.interventions', { list: goal.interventions.join('; ') })}
        </p>
      )}

      {goal.evidence.length > 0 && (
        <div className="plan-evidence" data-testid="goal-evidence">
          <p className="small note-meta">{t('plan.draftedFrom')}</p>
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
                {noteDay(t, evidence.note_date)}
                {evidence.section === null ? '' : t('plan.evidenceSection', { section: evidence.section })}
              </button>
            </blockquote>
          ))}
        </div>
      )}
    </article>
  );
}

/**
 * The date an evidence quotation came from, through the catalogue.
 *
 * `formatNoteDate` returned a whole English sentence — `Today` or `en-US`'s
 * `Aug 8, 2026` — so the component asks the catalogue for one of two keys and
 * hands `t()` the ISO timestamp, which it formats in the active locale
 * (Fixed decision 3). `web/src/lib/format.ts` stays the oracle and keeps the
 * helper; S2.3's `NoteView.tsx` carries the same two-key shape.
 */
function noteDay(t: Translate, iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const today =
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  return today ? t('notes.today') : t('notes.date', { day: iso });
}

interface GoalEditorProps {
  goal: PlanGoal;
  onCancel: () => void;
  onSave: (patch: GoalPatch) => void;
}

/**
 * Editing is ordinary document editing: no model is involved, here or on the
 * server. Accepting a suggestion she has edited saves both in one PATCH.
 */
function GoalEditor({ goal, onCancel, onSave }: GoalEditorProps): React.JSX.Element {
  const { t } = useI18n();
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
        {t('plan.goalLabel')}
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
          <legend className="small note-meta">{t('plan.objectiveLabel', { n: String(index + 1) })}</legend>
          <textarea
            className="plan-input"
            aria-label={t('plan.objectiveLabel', { n: String(index + 1) })}
            rows={2}
            value={objective.statement}
            onChange={(event) => {
              patchObjective(index, { statement: event.target.value });
            }}
          />
          <div className="plan-objective-fields">
            <input
              className="plan-input"
              aria-label={t('plan.objectiveMeasureLabel', { n: String(index + 1) })}
              placeholder={t('plan.measure')}
              value={objective.measure}
              onChange={(event) => {
                patchObjective(index, { measure: event.target.value });
              }}
            />
            <input
              className="plan-input"
              aria-label={t('plan.objectiveBaselineLabel', { n: String(index + 1) })}
              placeholder={t('plan.baseline')}
              value={objective.baseline}
              onChange={(event) => {
                patchObjective(index, { baseline: event.target.value });
              }}
            />
            <input
              className="plan-input"
              aria-label={t('plan.objectiveTargetLabel', { n: String(index + 1) })}
              placeholder={t('plan.target')}
              value={objective.target_value}
              onChange={(event) => {
                patchObjective(index, { target_value: event.target.value });
              }}
            />
            <input
              className="plan-input"
              type="date"
              aria-label={t('plan.objectiveTargetDateLabel', { n: String(index + 1) })}
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
        {t('plan.addObjective')}
      </button>

      <label className="label" htmlFor={`goal-${goal.id}-interventions`}>
        {t('plan.interventionsLabel')}
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
        {t('plan.goalTargetDate')}
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
          {goal.status === 'proposed' ? t('plan.saveAndAccept') : t('common.save')}
        </button>
        <button type="button" className="btn small btn-compact" onClick={onCancel}>
          <CloseIcon className="icon icon-xs" />
          {t('common.cancel')}
        </button>
      </div>
    </article>
  );
}
