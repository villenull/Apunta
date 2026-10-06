import type { UpdateStatusResponse } from '@apunta/shared';
import { useEffect, useState } from 'react';

import { errorMessage, requestUpdateAction } from '../api/index.js';
import { useUpdateStatus } from '../hooks/useUpdateStatus.js';
import { useI18n, type Translate } from '../lib/i18n.js';

/**
 * What the updater is doing, in words: the one sentence for a state, or `null`
 * when the state says nothing the owner needs (an idle app, a silent offline
 * check, the native-close codes, which have their own dialog).
 *
 * Failure codes are the shell's (C-UPD@1's table); the server relays them and
 * this is the only place they become sentences.
 */
export function updateMessage(t: Translate, status: UpdateStatusResponse): string | null {
  const version = status.version ?? '';
  switch (status.state) {
    case 'idle':
      return status.code === 'rejected' ? t('update.rejected') : null;
    case 'checking':
      return null;
    case 'available':
      return status.code === 'install_failed'
        ? t('update.installFailed')
        : t('update.available', { version });
    case 'downloading':
      return t('update.downloading', { version });
    case 'verified':
      if (status.code === 'quiesce_refused') return t('update.quiesceRefused');
      if (status.code === 'snapshot_failed') return t('update.snapshotFailed');
      if (status.code === 'install_failed') return t('update.installFailed');
      return t('update.verified', { version });
    case 'quiescing':
    case 'snapshotting':
      return t('update.preparing');
    case 'installing':
      return t('update.installing');
    case 'relaunching':
      return t('update.relaunching');
    case 'health_check':
      return t('update.healthCheck');
    case 'done':
      return t('update.done', { version });
  }
}

/**
 * The notice (C-UPD@1): a strip across the workspace while an update is
 * available or underway. It reads the shell's state through the server and
 * renders nothing at all where there is no updater — a browser tab answers
 * 404 — and while the state has nothing to say.
 *
 * It only asks; the shell decides. Buttons post the action and the next poll
 * shows what the shell did with it.
 */
export function UpdateNotice(): React.JSX.Element | null {
  const { t } = useI18n();
  const { status, unavailable, refresh } = useUpdateStatus();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  // A new state is a new notice: a dismissal belongs to the thing dismissed.
  const key = status === null ? null : `${status.state}:${status.version ?? ''}:${status.code ?? ''}`;
  useEffect(() => {
    setFailure(null);
  }, [key]);

  if (unavailable || status === null) return null;
  const message = updateMessage(t, status);
  if (message === null || key === dismissedKey) return null;

  const act = (action: 'download' | 'install'): void => {
    setBusy(true);
    setFailure(null);
    requestUpdateAction(action).then(
      () => {
        setBusy(false);
        refresh();
      },
      (error: unknown) => {
        setBusy(false);
        setFailure(errorMessage(error));
      },
    );
  };

  const canDownload = status.state === 'available' && status.code !== 'install_failed';
  const canInstall = status.state === 'verified';
  // A finished outcome can be put away; anything that still offers or runs an action stays.
  const dismissible = status.state === 'done' || status.state === 'idle';

  return (
    <div className="update-notice" role="status" data-testid="update-notice" data-state={status.state}>
      <p>
        {message}
        {failure !== null && (
          <>
            {' '}
            <span className="form-error" role="alert">
              {failure}
            </span>
          </>
        )}
      </p>
      {canDownload && (
        <button
          type="button"
          className="btn small"
          disabled={busy}
          onClick={() => {
            act('download');
          }}
          data-testid="update-download"
        >
          {t('update.download')}
        </button>
      )}
      {canInstall && (
        <button
          type="button"
          className="btn small"
          disabled={busy}
          onClick={() => {
            act('install');
          }}
          data-testid="update-install"
        >
          {t('update.install')}
        </button>
      )}
      {dismissible && (
        <button
          type="button"
          className="ai-banner-dismiss"
          aria-label={t('update.dismiss')}
          onClick={() => {
            setDismissedKey(key);
          }}
          data-testid="update-dismiss"
        >
          ×
        </button>
      )}
    </div>
  );
}
