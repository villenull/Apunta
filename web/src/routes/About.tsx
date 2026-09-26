import { useCallback } from 'react';
import { Link } from 'react-router';

import { fetchHealth } from '../api/index.js';
import { Screen } from '../components/TopBar.js';
import { useLoader } from '../hooks/useLoader.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useI18n } from '../lib/i18n.js';

/**
 * About and privacy: the local-only guarantee in plain language, and the two
 * places it stops. The copy deliberately says "this computer" because Apunta
 * runs on more than one operating system.
 */
export function About(): React.JSX.Element {
  const { t } = useI18n();
  useDocumentTitle(t('doc.about'));
  const load = useCallback((signal: AbortSignal) => fetchHealth(signal), []);
  const health = useLoader(load);
  const data = health.state.status === 'ready' ? health.state.data : null;

  return (
    <Screen back={{ to: '/', label: t('common.patients') }}>
      <h2 className="lede">{t('about.title')}</h2>

      <div className="card card-rows lede">
        <h3 className="heading-tight">{t('about.localOnlyHeading')}</h3>
        <p className="small note-meta">{t('about.localOnlyBody')}</p>
        <p className="small note-meta">{t('about.modelsLocalBody')}</p>
        <p className="small note-meta">{t('about.noTelemetryBody')}</p>
      </div>

      <div className="card card-rows lede">
        <h3 className="heading-tight">{t('about.whereHeading')}</h3>
        <p className="small note-meta">{data === null ? t('about.dbPathLoading') : t('about.dbPath')}</p>
        {data !== null && (
          <p className="setup-fix-steps" data-testid="about-db-path">
            {data.db.path}
          </p>
        )}
        <p className="small note-meta">
          {t('about.recordsBody')} <Link to="/settings">{t('common.settings')}</Link>{' '}
          {t('about.recordsBackupTail')}
        </p>
      </div>

      <div className="card card-rows lede">
        <h3 className="heading-tight">{t('about.threatsHeading')}</h3>
        {/*
          The two sentences below are each split by a `<strong>` the screen needs,
          so they are two keys rather than one with the emphasis deleted. The
          space JSX put between the element and the text is a `{' '}` here, and
          the English reads exactly as it did.
        */}
        <p className="small note-meta">
          <strong>{t('about.threatPerson')}</strong> {t('about.threatPersonBody')}
        </p>
        <p className="small note-meta">
          <strong>{t('about.threatStolen')}</strong> {t('about.threatStolenBody')}
        </p>
        {data !== null && <FileVaultLine state={data.fileVault.state} detail={data.fileVault.detail} />}
      </div>

      <div className="card card-rows lede">
        <h3 className="heading-tight">{t('about.aiHeading')}</h3>
        <p className="small note-meta">{t('about.aiBody')}</p>
        <p className="small note-meta">{t('about.aiUnclearBody')}</p>
      </div>

      <div className="card card-rows lede">
        <h3 className="heading-tight">{t('about.builtFromHeading')}</h3>
        <p className="small note-meta">
          {t('about.builtFromBody')} <Link to="/licenses">{t('about.licensesLink')}</Link>.
        </p>
        <p className="small note-meta">{t('about.modelsSeparateBody')}</p>
      </div>

      <p className="small note-meta lede">
        {t('about.missingPieces')} <Link to="/setup">{t('common.setup')}</Link>.
      </p>
    </Screen>
  );
}

/**
 * The four states the operating system can report about disk encryption.
 *
 * The prefix and the bold verdict are one key each and the tail is one per
 * state, because the `<strong>` in the middle is what the screen needs and the
 * checker cannot see either half of the sentence around it (Fixed decision 5).
 * `{detail}` is the server's own explanation, passed as data.
 */
function FileVaultLine({ state, detail }: { state: string; detail: string }): React.JSX.Element {
  const { t } = useI18n();
  if (state === 'not_applicable') {
    return (
      <p className="small note-meta" data-testid="about-filevault">
        {t('about.diskEncryption')} <strong>{t('about.diskNotChecked')}</strong>{' '}
        {t('about.diskTailOs', { detail })}
      </p>
    );
  }
  if (state === 'on') {
    return (
      <p className="small note-meta" data-testid="about-filevault">
        {t('about.diskEncryption')} <strong>{t('about.diskReady')}</strong>
        {t('about.diskTailDetail', { detail })}
      </p>
    );
  }
  if (state === 'off' || state === 'deferred') {
    return (
      <p className="form-error" role="alert" data-testid="about-filevault">
        {t('about.diskEncryption')} <strong>{t('about.diskNotReady')}</strong>
        {t('about.diskTailOff')}
      </p>
    );
  }
  return (
    <p className="small note-meta" data-testid="about-filevault">
      {t('about.diskEncryption')} <strong>{t('about.diskNotChecked')}</strong>
      {t('about.diskTailUnknown', { detail })}
    </p>
  );
}
