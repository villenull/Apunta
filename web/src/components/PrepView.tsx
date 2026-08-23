import type { BriefLine, PatientListItem, PrepBriefEvent, SessionBrief } from '@apunta/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { errorMessage, getPlan, listBriefings, prepareBriefing, saveBriefing } from '../api/index.js';
import { useLoader } from '../hooks/useLoader.js';
import { formatNoteDate, formatPlanDate } from '../lib/format.js';
import { CheckIcon } from './icons.js';

/**
 * Session preparation: the plan on one side, the recent notes on the other.
 *
 * **Presenting the two side by side is the feature.** Nothing here relates one
 * to the other — no coverage, no "this goal has not come up in four sessions",
 * no ranking. That is the thing the owner turned down, and it is absent from
 * the server too: the call that writes the briefing is never shown the plan.
 *
 * A reading view rather than an editor. It is ephemeral by default: nothing is
 * stored unless she presses Keep. Every line carries the note it came from and
 * clicks through to it, and the screen says how far back it read.
 */

export interface PrepViewProps {
  patient: PatientListItem;
  onOpenNote: (noteId: string) => void;
}

export function PrepView({ patient, onOpenNote }: PrepViewProps): React.JSX.Element {
  const patientId = patient.id;

  const [lines, setLines] = useState<BriefLine[]>([]);
  const [brief, setBrief] = useState<PrepBriefEvent | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [saved, setSaved] = useState<SessionBrief | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);

  const loadPlan = useCallback((signal: AbortSignal) => getPlan(patientId, undefined, signal), [patientId]);
  const plan = useLoader(loadPlan);

  const loadKept = useCallback((signal: AbortSignal) => listBriefings(patientId, signal), [patientId]);
  const kept = useLoader(loadKept);
  const reloadKept = kept.reload;

  const prepare = useCallback(async (): Promise<void> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setRunning(true);
    setError(null);
    setSaved(null);
    setBrief(null);
    setLines([]);
    setStatus('Starting…');

    try {
      const result = await prepareBriefing(
        patientId,
        {
          onStatus: (event) => {
            setStatus(event.message);
          },
          onLine: (event) => {
            setLines((current) => [...current, event.line]);
          },
        },
        controller.signal,
      );
      setBrief(result);
      setLines(result.content.lines);
    } catch (thrown) {
      if (!controller.signal.aborted) setError(errorMessage(thrown));
    } finally {
      if (!controller.signal.aborted) {
        setRunning(false);
        setStatus(null);
      }
      abortRef.current = null;
    }
  }, [patientId]);

  // Opening the view is the request: it streams straight in. Switching patient
  // or closing the tab stops the model rather than leaving it writing into a
  // stream nobody is reading.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void prepare();
  }, [prepare]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const planGoals =
    plan.state.status === 'ready'
      ? plan.state.data.goals.filter((goal) => goal.status === 'accepted' || goal.status === 'met')
      : [];
  const lookback = brief?.content.lookback ?? null;

  return (
    <div className="prep-view" data-testid="prep-view">
      <header className="note-editor-header row between">
        <div>
          <p className="small note-meta">{patient.name}</p>
          <h2>Before this session</h2>
        </div>
        <div className="row gap-8">
          <button
            type="button"
            className="btn small btn-compact"
            data-testid="prep-again"
            disabled={running}
            onClick={() => {
              void prepare();
            }}
          >
            {running ? 'Reading…' : 'Prepare again'}
          </button>
          <button
            type="button"
            className="btn small btn-primary btn-compact"
            data-testid="keep-brief"
            disabled={brief === null || saved !== null || running}
            onClick={() => {
              if (brief === null) return;
              void (async () => {
                try {
                  setSaved(await saveBriefing(patientId, brief));
                  setError(null);
                  reloadKept();
                } catch (thrown) {
                  setError(errorMessage(thrown));
                }
              })();
            }}
          >
            {saved === null ? 'Keep' : <CheckIcon className="icon icon-xs" />}
            {saved === null ? '' : 'Kept'}
          </button>
        </div>
      </header>

      {error !== null && (
        <p className="form-error" role="alert" data-testid="prep-error">
          {error}
        </p>
      )}

      <div className="prep-split">
        <section className="prep-column" data-testid="prep-plan">
          <h3>The plan</h3>
          {plan.state.status === 'loading' && <p className="small state-note">Loading the plan…</p>}
          {plan.state.status === 'ready' && planGoals.length === 0 && (
            <p className="small note-meta">No goals in the plan yet.</p>
          )}
          {planGoals.map((goal) => (
            <article className="prep-goal" key={goal.id}>
              <p>{goal.statement}</p>
              {goal.objectives.map((objective, index) => (
                <p className="small note-meta" key={`${goal.id}-${String(index)}`}>
                  {objective.statement}
                  {objective.target_date === null ? '' : ` — by ${formatPlanDate(objective.target_date)}`}
                </p>
              ))}
            </article>
          ))}
          {plan.state.status === 'ready' && plan.state.data.plan?.review_due != null && (
            <p className="small note-meta">Review due {formatPlanDate(plan.state.data.plan.review_due)}.</p>
          )}
        </section>

        <section className="prep-column" data-testid="prep-brief">
          <h3>Since you last saw them</h3>
          {status !== null && (
            <p className="small state-note" data-testid="prep-status">
              {status}
            </p>
          )}

          {lines.length === 0 && !running && (
            <p className="small note-meta" data-testid="prep-empty">
              Nothing to read yet — there are no notes for this patient.
            </p>
          )}

          {lines.map((line, index) => (
            <p className="prep-line" data-testid="prep-line" key={`${line.note_id}-${String(index)}`}>
              <button
                type="button"
                className="link-button small"
                data-testid="prep-citation"
                onClick={() => {
                  onOpenNote(line.note_id);
                }}
              >
                {formatNoteDate(line.note_date)}
              </button>{' '}
              {line.text}
            </p>
          ))}

          {lookback !== null && (
            <p className="small note-meta" data-testid="prep-lookback">
              {lookback.notes_read === 0
                ? 'Read no notes.'
                : `Read the last ${String(lookback.notes_read)} ${
                    lookback.notes_read === 1 ? 'note' : 'notes'
                  }${
                    lookback.oldest_note_date === null
                      ? ''
                      : `, back to ${formatPlanDate(lookback.oldest_note_date.slice(0, 10))}`
                  } (limit ${String(lookback.cap)}).`}
              {lookback.skipped_note_ids.length > 0
                ? ` ${String(lookback.skipped_note_ids.length)} could not be read.`
                : ''}
            </p>
          )}

          <p className="small note-meta">
            This briefing is not saved unless you keep it.
            {kept.state.status === 'ready' && kept.state.data.length > 0
              ? ` ${String(kept.state.data.length)} kept for ${patient.name}.`
              : ''}
          </p>
        </section>
      </div>
    </div>
  );
}
