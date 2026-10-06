import { useState } from 'react';

import { errorMessage, requestUpdateAction, setAutoCheck } from '../api/index.js';
import { useUpdateStatus } from '../hooks/useUpdateStatus.js';
import { useI18n } from '../lib/i18n.js';
import { updateMessage } from './UpdateNotice.js';

/**
 * The Updates card in Settings → About: the automatic-check switch (on by
 * default, kept by the server), a manual check, what the updater last said and
 * the privacy statement. Like the notice, it renders nothing where there is no
 * updater (a browser tab's 404).
 */
export function UpdateSettings(): React.JSX.Element | null {
  const { t } = useI18n();
  const { status, unavailable, refresh } = useUpdateStatus();
  const [autoOverride, setAutoOverride] = useState<boolean | null>(null);
  const [asked, setAsked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (unavailable || status === null) return null;

  const auto = autoOverride ?? status.autoCheck;
  const checking = status.state === 'checking';
  const message = updateMessage(t, status);
  const line = checking
    ? t('update.checking')
    : status.code === 'offline'
      ? t('update.offline')
      : status.code === 'not_configured'
        ? t('update.notConfigured')
        : (message ?? (asked && status.state === 'idle' ? t('update.upToDate') : null));

  return (
    <div className="settings-update" data-testid="update-settings">
      <h3 className="settings-update-title">{t('update.settingsTitle')}</h3>
      <div className="settings-row">
        <label className="settings-label" htmlFor="update-autocheck">
          {t('update.autoCheck')}
        </label>
        <input
          id="update-autocheck"
          type="checkbox"
          role="switch"
          className="settings-switch"
          checked={auto}
          data-testid="update-autocheck"
          onChange={(event) => {
            const next = event.target.checked;
            const before = auto;
            setAutoOverride(next);
            setError(null);
            setAutoCheck(next).then(refresh, (thrown: unknown) => {
              setAutoOverride(before);
              setError(errorMessage(thrown));
            });
          }}
        />
      </div>
      <div className="settings-row">
        <button
          type="button"
          className="btn"
          disabled={checking}
          data-testid="update-check"
          onClick={() => {
            setAsked(true);
            setError(null);
            requestUpdateAction('check').then(refresh, (thrown: unknown) => {
              setError(errorMessage(thrown));
            });
          }}
        >
          {t('update.checkNow')}
        </button>
      </div>
      {line !== null && (
        <p className="small" role="status" data-testid="update-line">
          {line}
        </p>
      )}
      {error !== null && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p className="small" data-testid="update-privacy">
        {t('update.privacy')}
      </p>
    </div>
  );
}
