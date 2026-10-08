import type { PlannedStep, SetupStatusResponse, SetupStepId } from '@apunta/shared';
import { useEffect, useRef, useState } from 'react';

import { errorMessage, requestSetupAction } from '../api/index.js';
import { useSetupStatus } from '../hooks/useSetupStatus.js';
import { useI18n, type Translate } from '../lib/i18n.js';
import { Dialog } from './Dialog.js';

/**
 * First-run setup: what Apunta still needs, how big it is, where it comes
 * from, and nothing downloaded until she presses the button (CLAUDE.md hard
 * rule 1's installer exception, condition a).
 *
 * The window only reads and asks. The shell runs the installer, the server
 * mirrors what it prints, and this polls the mirror; every sentence here is
 * worded from the step ids, the byte counts and the failure code, so the
 * installer's own English never reaches a Spanish screen.
 */
export interface AiSetupDialogProps {
  readonly onClose: () => void;
  /** Setup finished: the caller re-reads health so the notice can go. */
  readonly onReady: () => void;
}

const SOURCE_KEY: Record<SetupStepId, 'setup.sourceSpeech' | 'setup.sourceWriting'> = {
  speech_model: 'setup.sourceSpeech',
  preview_model: 'setup.sourceSpeech',
  writing_model: 'setup.sourceWriting',
};

export function AiSetupDialog({ onClose, onReady }: AiSetupDialogProps): React.JSX.Element {
  const { t, locale } = useI18n();
  const { status, refresh } = useSetupStatus(true);
  const [error, setError] = useState<string | null>(null);
  const planned = useRef(false);
  const announced = useRef(false);

  // A fresh plan each time the window opens, unless a download is under way:
  // what is already on disk may have changed since the last one.
  useEffect(() => {
    if (status === null || planned.current) return;
    planned.current = true;
    if (status.state === 'running' || status.state === 'cancelling' || status.state === 'planning') return;
    void requestSetupAction('plan').then(refresh, (thrown: unknown) => {
      setError(errorMessage(thrown));
    });
  }, [status, refresh]);

  useEffect(() => {
    if (status?.state === 'done' && !announced.current) {
      announced.current = true;
      onReady();
    }
  }, [status, onReady]);

  const act = (action: 'run' | 'cancel'): void => {
    setError(null);
    void requestSetupAction(action).then(refresh, (thrown: unknown) => {
      setError(errorMessage(thrown));
    });
  };

  const size = (bytes: number): string => formatBytes(bytes, locale);
  const plan = status?.plan;
  const state = status?.state ?? 'idle';
  const ready = state === 'done' || (state === 'planned' && plan?.ready === true);
  const busy = state === 'running' || state === 'cancelling';
  const noRoom = plan !== undefined && !plan.disk.ok && !busy && !ready;

  return (
    <Dialog
      title={t('setup.title')}
      onClose={onClose}
      className="modal card setup-modal"
      testId="ai-setup-dialog"
      backdropTestId="ai-setup-backdrop"
    >
      <div className="small note-meta modal-body">
        <p>{t('setup.intro')}</p>
        {plan === undefined ? (
          <p data-testid="ai-setup-checking">{t('setup.checking')}</p>
        ) : (
          <ul className="setup-steps" data-testid="ai-setup-steps">
            {visibleSteps(plan.steps).map((step) => (
              <li key={step.id} className="setup-step" data-testid={`ai-setup-step-${step.id}`}>
                <span className="setup-step-name">
                  {step.id === 'writing_model'
                    ? t('setup.stepWriting', { model: plan.model.tag })
                    : step.id === 'preview_model'
                      ? t('setup.stepPreview')
                      : t('setup.stepSpeech')}
                </span>
                <span className="setup-step-detail">
                  {stepDetail(step, status, t, size)}
                  {step.needed && stepStatus(status, step.id) === 'pending' && (
                    <>
                      {' · '}
                      {t(SOURCE_KEY[step.id])}
                    </>
                  )}
                </span>
                {status?.progress?.id === step.id && status.progress.percent !== null && (
                  <progress
                    className="setup-progress"
                    max={100}
                    value={status.progress.percent}
                    aria-label={t('setup.progressLabel')}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        {plan !== undefined && !ready && !noRoom && state !== 'failed' && <p>{t('setup.privacy')}</p>}
        {noRoom && (
          <p role="alert" data-testid="ai-setup-no-room">
            {t('setup.noRoom', { size: size(plan.disk.shortfallBytes) })}
          </p>
        )}
        {state === 'failed' && status?.failure !== undefined && (
          <p role="alert" data-testid="ai-setup-failed">
            {t(`setup.failed.${status.failure.code}`)}
          </p>
        )}
        {ready && (
          <p role="status" data-testid="ai-setup-ready">
            {t('setup.ready')}
          </p>
        )}
        {error !== null && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="modal-actions">
        {ready ? (
          <button type="button" className="btn btn-primary" onClick={onClose} data-testid="ai-setup-close">
            {t('setup.done')}
          </button>
        ) : (
          <>
            <button type="button" className="btn" onClick={onClose} data-testid="ai-setup-later">
              {busy ? t('setup.hide') : t('setup.later')}
            </button>
            {busy ? (
              <button
                type="button"
                className="btn"
                disabled={state === 'cancelling'}
                onClick={() => {
                  act('cancel');
                }}
                data-testid="ai-setup-stop"
              >
                {t('setup.stop')}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                disabled={plan === undefined || noRoom || state === 'planning'}
                onClick={() => {
                  act('run');
                }}
                data-testid="ai-setup-start"
              >
                {state === 'failed'
                  ? t('setup.retry')
                  : t('setup.start', { size: size(plan?.disk.requiredBytes ?? 0) })}
              </button>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}

/**
 * The speech model and the live preview's model are one file today (English
 * dictation), so the plan marks the preview "not needed" while the speech model
 * is still to come. Listing it as installed would be untrue, so it is shown
 * only when it is a download of its own.
 */
function visibleSteps(steps: readonly PlannedStep[]): PlannedStep[] {
  return steps.filter((step) => step.id !== 'preview_model' || step.needed);
}

function stepStatus(status: SetupStatusResponse | null, id: SetupStepId): string {
  return status?.steps.find((step) => step.id === id)?.status ?? 'pending';
}

function stepDetail(
  step: PlannedStep,
  status: SetupStatusResponse | null,
  t: Translate,
  size: (bytes: number) => string,
): string {
  if (!step.needed) return t('setup.installed');
  const current = stepStatus(status, step.id);
  if (current === 'finished' || current === 'skipped') return t('setup.installed');
  if (current === 'verifying') return t('setup.verifying');
  const progress = status?.progress;
  if (current === 'started' && progress?.id === step.id) {
    return progress.totalBytes === null
      ? t('setup.downloading')
      : t('setup.progress', { done: size(progress.completedBytes), total: size(progress.totalBytes) });
  }
  if (current === 'started') return t('setup.downloading');
  return t('setup.size', { size: size(step.approxBytes) });
}

/** Decimal units, as the operating system's own file sizes are shown. */
export function formatBytes(bytes: number, locale: string): string {
  const units = ['B', 'KB', 'MB', 'GB'] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const digits = unit >= 2 && value < 100 ? 1 : 0;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value)} ${units[unit] ?? 'B'}`;
}
