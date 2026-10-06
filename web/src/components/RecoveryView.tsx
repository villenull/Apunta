import { t as translate, type Locale, type MessageKey, type RecoveryStatus } from '@apunta/shared';
import { useEffect, useState } from 'react';

import {
  errorMessage,
  fetchAppMode,
  fetchRecoveryStatus,
  fetchUpdateStatus,
  reinstallPreviousVersion,
  restoreSafetyCopy,
} from '../api/index.js';
import { CloseConfirm } from './CloseConfirm.js';

/**
 * The screen the server serves when an update did not come up healthy
 * (C-UPD@1 "Recovery startup"). The server is in recovery mode: it holds no
 * database and refuses every write, so this view mounts bare — outside the
 * settings and language providers, which would ask for settings that do not
 * exist here — and takes its language from the browser.
 *
 * Both actions are explicit and nothing runs on load. Restoring replaces the
 * notes with the pre-update safety copy, so it asks once more first.
 */

export function recoveryLocale(languages: readonly string[]): Locale {
  return languages.some((tag) => tag.toLowerCase().startsWith('es')) ? 'es-MX' : 'en';
}

/**
 * Mode discovery uses the universally available quiesce status route. Only a
 * recovery server is asked for recovery details. Unknown mode or unreadable
 * details fail closed, without mounting database-backed workspace providers.
 */
export async function probeRecovery(): Promise<{ readonly status: RecoveryStatus | null } | null> {
  try {
    if ((await fetchAppMode()) !== 'recovery') return null;
    return { status: await fetchRecoveryStatus() };
  } catch {
    return { status: null };
  }
}

type Outcome = 'restored' | 'reinstalling' | null;

export function RecoveryView({
  status,
  locale = recoveryLocale(navigator.languages),
}: {
  /** `null` when the server answered but the details could not be read. */
  readonly status: RecoveryStatus | null;
  readonly locale?: Locale;
}): React.JSX.Element {
  const t = (key: MessageKey, params?: Record<string, string | number>): string =>
    translate(key, params, locale);
  const [confirming, setConfirming] = useState<'restore' | 'reinstall' | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const run = (action: () => Promise<void>, done: Outcome): void => {
    setBusy(true);
    setFailure(null);
    action().then(
      () => {
        setConfirming(null);
        setOutcome(done);
      },
      (error: unknown) => {
        setBusy(false);
        setConfirming(null);
        setFailure(errorMessage(error));
      },
    );
  };

  useEffect(() => {
    if (!busy) return;
    const controller = new AbortController();
    const tick = async (): Promise<void> => {
      try {
        const current = await fetchUpdateStatus(controller.signal);
        if (controller.signal.aborted) return;
        if (current.code === 'install_failed') {
          setBusy(false);
          setOutcome(null);
          setFailure(translate('update.installFailed', undefined, locale));
        } else if (current.state === 'done') {
          window.location.reload();
        }
      } catch {
        // The owned server disappears during restart; no success is inferred.
      }
    };
    const timer = window.setInterval(() => {
      void tick();
    }, 500);
    void tick();
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [busy, locale]);

  const previousAvailable = status?.previousAvailable ?? false;

  return (
    <main className="recovery-view" data-testid="recovery-view" lang={locale}>
      <h1>{t('recovery.title')}</h1>
      <p>{t('recovery.body')}</p>
      {status !== null && (
        <p className="small" data-testid="recovery-details">
          {t('recovery.details', { from: status.fromVersion, to: status.toVersion })}
        </p>
      )}

      {outcome === 'restored' && (
        <p role="status" data-testid="recovery-restored">
          {t('recovery.restored')}
        </p>
      )}
      {outcome === 'reinstalling' && (
        <p role="status" data-testid="recovery-reinstalling">
          {t('recovery.reinstalling')}
        </p>
      )}
      {failure !== null && (
        <p className="form-error" role="alert" data-testid="recovery-failure">
          {t('recovery.failed', { message: failure })}
        </p>
      )}

      <section>
        <p className="small">{t('recovery.restoreHelp')}</p>
        {confirming === 'restore' ? (
          <>
            <button
              type="button"
              className="btn danger"
              disabled={busy}
              onClick={() => {
                run(restoreSafetyCopy, 'restored');
              }}
              data-testid="recovery-restore-confirm"
            >
              {t('recovery.restoreConfirm')}
            </button>{' '}
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => {
                setConfirming(null);
              }}
              data-testid="recovery-restore-cancel"
            >
              {t('recovery.cancel')}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn"
            disabled={busy || status === null || outcome !== null}
            onClick={() => {
              setConfirming('restore');
            }}
            data-testid="recovery-restore"
          >
            {t('recovery.restore')}
          </button>
        )}
      </section>

      <section>
        <p className="small">{t('recovery.reinstallHelp')}</p>
        {!previousAvailable && <p className="small">{t('recovery.reinstallUnavailable')}</p>}
        {confirming === 'reinstall' ? (
          <>
            <button
              type="button"
              className="btn danger"
              disabled={busy}
              onClick={() => {
                run(reinstallPreviousVersion, 'reinstalling');
              }}
              data-testid="recovery-reinstall-confirm"
            >
              {t('recovery.reinstallConfirm')}
            </button>{' '}
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => {
                setConfirming(null);
              }}
              data-testid="recovery-reinstall-cancel"
            >
              {t('recovery.cancel')}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn"
            disabled={busy || !previousAvailable || outcome === 'reinstalling'}
            onClick={() => {
              setConfirming('reinstall');
            }}
            data-testid="recovery-reinstall"
          >
            {t('recovery.reinstall')}
          </button>
        )}
      </section>
      <CloseConfirm t={t} />
    </main>
  );
}
