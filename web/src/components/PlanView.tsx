import {
  reviewDueState,
  type PatientListItem,
  type PlanGoal,
  type PlanResponse,
  type TreatmentPlan,
  type UpdatePlanRequest,
} from '@apunta/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  activatePlan,
  createGoal,
  deleteGoal as deleteGoalRequest,
  errorMessage,
  exportPlan,
  getPlan,
  listPlanVersions,
  startPlanVersion,
  suggestGoals,
  updateGoal,
  updatePlan,
} from '../api/index.js';
import { useLoader } from '../hooks/useLoader.js';
import { copyText } from '../lib/clipboard.js';
import { formatDayGap, formatPlanDate } from '../lib/format.js';
import { CheckIcon, CopyIcon, PlusIcon } from './icons.js';
import { PlanDetails } from './PlanDetails.js';
import { PlanGoalCard } from './PlanGoalCard.js';

/**
 * The treatment plan — a per-patient clinical document she owns.
 *
 * The screen is built around one distinction. **Accepted goals are the plan**
 * and read as a document. **Proposed goals are suggestions**, sit apart under
 * their own heading, carry the quoted note text they were drafted from, and
 * are one click from being discarded. Nothing the model produces appears in
 * the document half until she puts it there.
 *
 * What is deliberately absent is as important: nothing here counts sessions
 * since a goal came up, scores coverage, or says a goal is being missed. The
 * owner declined that. The one date-derived line on the screen — a review that
 * has come due — reads no note and connects nothing.
 */

const COPIED_FLASH_MS = 1400;

export interface PlanViewProps {
  patient: PatientListItem;
  /** Follow a citation through to the note it came from. */
  onOpenNote: (noteId: string) => void;
}

export function PlanView({ patient, onOpenNote }: PlanViewProps): React.JSX.Element {
  const patientId = patient.id;
  const [version, setVersion] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  /** What the drafting run is doing, and what it read when it finished. */
  const [drafting, setDrafting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [lookbackNote, setLookbackNote] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    (signal: AbortSignal) => getPlan(patientId, version ?? undefined, signal),
    [patientId, version],
  );
  const plan = useLoader<PlanResponse>(load);

  const loadVersions = useCallback((signal: AbortSignal) => listPlanVersions(patientId, signal), [patientId]);
  const versions = useLoader<TreatmentPlan[]>(loadVersions);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const reload = plan.reload;
  const reloadVersions = versions.reload;
  const updatePlanState = plan.update;

  const run = useCallback(async (action: () => Promise<void>): Promise<void> => {
    setBusy(true);
    try {
      await action();
      setError(null);
    } catch (thrown) {
      setError(errorMessage(thrown));
    } finally {
      setBusy(false);
    }
  }, []);

  if (plan.state.status === 'loading') return <p className="state-note">Loading the plan…</p>;
  if (plan.state.status === 'error') {
    return (
      <p className="form-error" role="alert">
        {plan.state.message}{' '}
        <button type="button" className="btn small btn-quick" onClick={reload}>
          Try again
        </button>
      </p>
    );
  }

  const { plan: current, goals } = plan.state.data;
  const readOnly = current?.status === 'superseded';
  const accepted = goals.filter((goal) => goal.status !== 'proposed');
  const proposed = goals.filter((goal) => goal.status === 'proposed');
  const review = reviewDueState(current?.review_due ?? null);
  const allVersions = versions.state.status === 'ready' ? versions.state.data : [];

  async function draftGoals(): Promise<void> {
    if (drafting) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setDrafting(true);
    setError(null);
    setStatus('Starting…');
    setLookbackNote(null);

    try {
      const done = await suggestGoals(
        patientId,
        {
          onStatus: (event) => {
            setStatus(event.message);
          },
          onGoal: (event) => {
            // Appended as it arrives, into the suggestions half of the screen.
            updatePlanState((currentState) => ({
              ...currentState,
              goals: [...currentState.goals, event.goal],
            }));
          },
        },
        controller.signal,
      );

      const read = done.lookback.notes_read;
      const oldest = done.lookback.oldest_note_date;
      setLookbackNote(
        read === 0
          ? 'There are no notes for this patient yet, so there was nothing to draft from.'
          : `Read ${String(read)} ${read === 1 ? 'note' : 'notes'}${
              oldest === null ? '' : `, back to ${formatPlanDate(oldest.slice(0, 10))}`
            } (limit ${String(done.lookback.cap)}).${
              done.lookback.skipped_note_ids.length > 0
                ? ` ${String(done.lookback.skipped_note_ids.length)} could not be read.`
                : ''
            }`,
      );
      // Goals arrived through the stream; the plan row may be new.
      reload();
      reloadVersions();
    } catch (thrown) {
      if (!controller.signal.aborted) setError(errorMessage(thrown));
    } finally {
      abortRef.current = null;
      setDrafting(false);
      setStatus(null);
    }
  }

  return (
    <div className="plan-view" data-testid="plan-view">
      <header className="note-editor-header row between">
        <div>
          <p className="small note-meta">{patient.name}</p>
          <h2>Treatment plan</h2>
          {current && (
            <p className="small note-meta" data-testid="plan-version">
              Version {current.version} · {current.status}
              {current.effective_from === null
                ? ''
                : ` · effective ${formatPlanDate(current.effective_from)}`}
            </p>
          )}
        </div>
        {current && (
          <div className="row gap-8">
            <button
              type="button"
              className="btn small btn-compact"
              data-testid="copy-plan"
              disabled={busy}
              onClick={() => {
                void run(async () => {
                  await copyText(await exportPlan(current.id));
                  setCopied(true);
                  window.setTimeout(() => {
                    setCopied(false);
                  }, COPIED_FLASH_MS);
                });
              }}
            >
              {copied ? <CheckIcon className="icon icon-xs" /> : <CopyIcon className="icon icon-xs" />}
              {copied ? 'Copied' : 'Copy plan'}
            </button>
            {current.status === 'draft' && (
              <button
                type="button"
                className="btn small btn-primary btn-compact"
                data-testid="activate-plan"
                disabled={busy}
                onClick={() => {
                  void run(async () => {
                    await activatePlan(current.id);
                    reload();
                    reloadVersions();
                  });
                }}
              >
                Put in force
              </button>
            )}
            {current.status === 'active' && (
              <button
                type="button"
                className="btn small btn-compact"
                data-testid="start-review"
                disabled={busy}
                onClick={() => {
                  void run(async () => {
                    await startPlanVersion(patientId, {});
                    setVersion(null);
                    reload();
                    reloadVersions();
                  });
                }}
              >
                Start a review
              </button>
            )}
          </div>
        )}
      </header>

      {error !== null && (
        <p className="form-error" role="alert" data-testid="plan-error">
          {error}
        </p>
      )}

      {/* Date arithmetic on a date she chose. It reads no note. */}
      {review !== null && (
        <p
          className={review.overdue ? 'plan-review-due is-overdue' : 'plan-review-due'}
          data-testid="review-due"
        >
          {review.overdue
            ? `Plan review was due ${formatPlanDate(review.due)} — ${formatDayGap(review.daysUntil)}.`
            : `Plan review due ${formatPlanDate(review.due)} (${formatDayGap(review.daysUntil)}).`}
        </p>
      )}

      {allVersions.length > 1 && (
        <label className="small plan-version-picker">
          Version{' '}
          <select
            data-testid="version-picker"
            value={version === null ? 'current' : String(version)}
            onChange={(event) => {
              setVersion(event.target.value === 'current' ? null : Number(event.target.value));
            }}
          >
            <option value="current">Current</option>
            {allVersions.map((item) => (
              <option key={item.id} value={item.version}>
                Version {item.version} — {item.status}
              </option>
            ))}
          </select>
        </label>
      )}

      {readOnly && (
        <p className="small note-meta" data-testid="read-only-note">
          This version has been superseded. It is kept exactly as it was, and cannot be edited.
        </p>
      )}

      {current === null ? (
        <div className="empty-state" data-testid="empty-no-plan">
          <p className="empty-message">No treatment plan for {patient.name} yet.</p>
          <div className="row gap-8">
            <button
              type="button"
              className="btn btn-primary"
              data-testid="start-plan"
              disabled={busy}
              onClick={() => {
                void run(async () => {
                  await startPlanVersion(patientId, {});
                  reload();
                  reloadVersions();
                });
              }}
            >
              <PlusIcon className="icon icon-sm" />
              Start a plan
            </button>
            <button
              type="button"
              className="btn"
              data-testid="draft-goals"
              disabled={drafting}
              onClick={() => {
                void draftGoals();
              }}
            >
              {drafting ? 'Reading your notes…' : 'Draft goals from recent notes'}
            </button>
          </div>
          {status !== null && (
            <p className="small state-note" data-testid="draft-status">
              {status}
            </p>
          )}
          {lookbackNote !== null && (
            <p className="small note-meta" data-testid="lookback-note">
              {lookbackNote}
            </p>
          )}
        </div>
      ) : (
        <>
          <section className="plan-section">
            <h3>Goals</h3>
            {accepted.length === 0 && (
              <p className="small note-meta" data-testid="no-accepted-goals">
                Nothing in the plan yet. Suggestions below are not part of it until you accept one.
              </p>
            )}
            {accepted.map((goal) => (
              <PlanGoalCard
                key={goal.id}
                goal={goal}
                readOnly={readOnly}
                busy={busy}
                onOpenNote={onOpenNote}
                onUpdate={(target, patch) => {
                  void run(async () => {
                    await updateGoal(target.plan_id, target.id, patch);
                    reload();
                  });
                }}
                onDelete={(target) => {
                  void run(async () => {
                    await deleteGoalRequest(target.plan_id, target.id);
                    reload();
                  });
                }}
              />
            ))}

            {!readOnly && (
              <button
                type="button"
                className="btn small btn-quick"
                data-testid="add-goal"
                disabled={busy}
                onClick={() => {
                  void run(async () => {
                    await createGoal(current.id, { statement: 'New goal' });
                    reload();
                  });
                }}
              >
                <PlusIcon className="icon icon-xs" />
                Add a goal myself
              </button>
            )}
          </section>

          {!readOnly && (
            <section className="plan-section plan-suggestions" data-testid="plan-suggestions">
              <div className="row between">
                <h3>Suggested from your notes</h3>
                <button
                  type="button"
                  className="btn small btn-compact"
                  data-testid="draft-goals"
                  disabled={drafting || busy}
                  onClick={() => {
                    void draftGoals();
                  }}
                >
                  {drafting ? 'Reading your notes…' : 'Draft goals from recent notes'}
                </button>
              </div>
              <p className="small note-meta">
                Suggestions are not part of the plan. Accept, edit or discard each one.
              </p>
              {status !== null && (
                <p className="small state-note" data-testid="draft-status">
                  {status}
                </p>
              )}
              {lookbackNote !== null && (
                <p className="small note-meta" data-testid="lookback-note">
                  {lookbackNote}
                </p>
              )}
              {proposed.length === 0 && status === null && (
                <p className="small note-meta">No suggestions waiting.</p>
              )}
              {proposed.map((goal: PlanGoal) => (
                <PlanGoalCard
                  key={goal.id}
                  goal={goal}
                  readOnly={false}
                  busy={busy}
                  onOpenNote={onOpenNote}
                  onUpdate={(target, patch) => {
                    void run(async () => {
                      await updateGoal(target.plan_id, target.id, patch);
                      reload();
                    });
                  }}
                  onDelete={(target) => {
                    void run(async () => {
                      await deleteGoalRequest(target.plan_id, target.id);
                      reload();
                    });
                  }}
                />
              ))}
            </section>
          )}

          {/*
            Folded away by default. The plan is payer-facing, but the view she
            opens between sessions is the goals — a screen that leads with a
            form of empty compliance fields is the thing M9 warns against.
            A superseded version opens it: that one is the record, not a
            working document.
          */}
          <details className="plan-details-block" data-testid="plan-details-block" open={readOnly}>
            <summary data-testid="toggle-details">
              Plan details <span className="small note-meta">{detailSummary(current)}</span>
            </summary>
            <PlanDetails
              key={current.id}
              plan={current}
              readOnly={readOnly}
              busy={busy}
              onSave={(patch: UpdatePlanRequest) => {
                void run(async () => {
                  await updatePlan(current.id, patch);
                  reload();
                });
              }}
            />
          </details>

          <section className="plan-section plan-attestation" data-testid="plan-attestation">
            <h3>Attestation</h3>
            {current.attested_at === null ? (
              <p className="small note-meta">
                Not yet attested. Putting this version in force records the date, and copies your name and
                credential from Settings onto it.
              </p>
            ) : (
              <>
                <p>{current.attestation_text}</p>
                <p className="small note-meta">
                  {[
                    current.clinician_name,
                    current.clinician_credential,
                    current.clinician_licence === '' ? '' : `Licence ${current.clinician_licence}`,
                    current.clinician_npi === '' ? '' : `NPI ${current.clinician_npi}`,
                  ]
                    .filter((part) => part !== '')
                    .join(' · ')}
                </p>
              </>
            )}
            <p className="small note-meta">
              Attested in Apunta — sign the copy in your records system. Apunta has no login, so a name typed
              here is not a signature.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

/**
 * The one-line version of the plan-level fields, so the folded section still
 * says whether the things a payer asks for are there.
 */
function detailSummary(plan: TreatmentPlan): string {
  const parts = [
    ...plan.diagnoses.map((diagnosis) => diagnosis.code.trim()).filter((code) => code !== ''),
    plan.modality.trim(),
    plan.frequency.trim(),
  ].filter((part) => part !== '');
  return parts.length === 0 ? '— diagnosis, modality and frequency not recorded' : `— ${parts.join(' · ')}`;
}
