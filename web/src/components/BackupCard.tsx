import { instantToLocalDay, type BackupFile, type BackupStatusResponse } from '@apunta/shared';
import { useCallback, useId, useRef, useState } from 'react';

import {
  cancelRestore,
  createBackup,
  errorMessage,
  fetchBackupStatus,
  listBackupFolders,
  restoreBackup,
  setBackupLocation,
} from '../api/index.js';
import { useLoader, type LoadState } from '../hooks/useLoader.js';
import { useI18n, useReportWork, type Translate } from '../lib/i18n.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { Dialog } from './Dialog.js';

function relativeTime(t: Translate, iso: string, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return t('backup.justNow');
  if (minutes < 60) return t('backup.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('backup.hoursAgo', { count: hours });
  const days = Math.floor(hours / 24);
  return days === 1 ? t('backup.yesterday') : t('backup.daysAgo', { count: days });
}

export interface BackupControls {
  readonly status: LoadState<BackupStatusResponse>;
  readonly reload: () => void;
  readonly busy: boolean;
  readonly error: string | null;
  readonly run: (action: () => Promise<void>) => Promise<boolean>;
}

export function useBackup(): BackupControls {
  const load = useCallback((signal: AbortSignal) => fetchBackupStatus(signal), []);
  const status = useLoader(load);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  useReportWork(busy);
  const [error, setError] = useState<string | null>(null);
  const reload = status.reload;
  const run = useCallback(
    async (action: () => Promise<void>): Promise<boolean> => {
      if (running.current) return false;
      running.current = true;
      setBusy(true);
      setError(null);
      try {
        await action();
        reload();
        return true;
      } catch (thrown) {
        setError(errorMessage(thrown));
        return false;
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    [reload],
  );
  return { status: status.state, reload, busy, error, run };
}

/** Only the summary and destination live on the page; choices live in dialogs. */
export function BackupSection({ backup }: { backup: BackupControls }): React.JSX.Element {
  const { t } = useI18n();
  const [pending, setPending] = useState<'backup' | 'restore' | null>(null);
  const [choosingFolder, setChoosingFolder] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const data = backup.status.status === 'ready' ? backup.status.data : null;
  return (
    <section className="card settings-card" data-testid="backup-card">
      <h2 className="settings-title">{t('backup.title')}</h2>
      <p className="small note-meta backup-explanation">{t('backup.explain')}</p>
      {backup.status.status === 'loading' && <p className="small state-note">{t('common.loading')}</p>}
      {backup.status.status === 'error' && (
        <p className="form-error" role="alert">
          {backup.status.message}{' '}
          <button type="button" className="btn small" onClick={backup.reload}>
            {t('common.tryAgain')}
          </button>
        </p>
      )}
      {data !== null && (
        <>
          <div className="backup-summary-row" data-testid="backup-actions">
            <p data-testid="backup-last">
              {t('backup.lastAt', {
                when:
                  data.last_backup_at === null ? t('backup.noneYet') : relativeTime(t, data.last_backup_at),
              })}
            </p>
            <div className="settings-row-actions">
              <button
                type="button"
                className="btn small btn-primary"
                disabled={backup.busy}
                data-testid="backup-now"
                onClick={() => setPending('backup')}
              >
                {backup.busy ? t('backup.working') : t('backup.now')}
              </button>
              <button
                type="button"
                className="btn small"
                disabled={backup.busy || (data.backups.length === 0 && !data.pending_restore)}
                data-testid="backup-restore"
                onClick={() => setPending('restore')}
              >
                {t('backup.restore')}
              </button>
            </div>
          </div>
          <div className="settings-field backup-location">
            <span className="label">{t('backup.locationLabel')}</span>
            <button
              type="button"
              className="btn backup-location-path"
              data-testid="backup-directory"
              disabled={backup.busy}
              onClick={() => setChoosingFolder(true)}
            >
              {data.directory}
            </button>
          </div>
        </>
      )}
      {backup.error !== null && (
        <p className="form-error" role="alert" data-testid="backup-action-error">
          {backup.error}
        </p>
      )}
      {pending === 'backup' && (
        <ConfirmDialog
          title={t('backup.confirmTitle')}
          body={<p>{t('backup.confirmBackupBody')}</p>}
          confirmLabel={t('backup.now')}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            setPending(null);
            void backup.run(async () => {
              await createBackup();
            });
          }}
        />
      )}
      {pending === 'restore' && data !== null && (
        <RestoreDialog
          backup={backup}
          data={data}
          onCancel={() => setPending(null)}
          onConfirm={(file, passphrase) => {
            setPending(null);
            void backup.run(async () => {
              const result = await restoreBackup({ file, ...(passphrase === '' ? {} : { passphrase }) });
              setRestoreMessage(
                t('backup.restoreReady', {
                  day: instantToLocalDay(result.manifest.generated_at),
                  path: result.safety_copy,
                }),
              );
            });
          }}
        />
      )}
      {choosingFolder && <FolderPicker backup={backup} onClose={() => setChoosingFolder(false)} />}
      {restoreMessage !== null && (
        <Dialog
          title={t('backup.restore')}
          testId="backup-restore-result"
          onClose={() => setRestoreMessage(null)}
        >
          <p role="status">{restoreMessage}</p>
          <button type="button" className="btn" onClick={() => setRestoreMessage(null)}>
            {t('common.dismiss')}
          </button>
        </Dialog>
      )}
    </section>
  );
}

function FolderPicker({
  backup,
  onClose,
}: {
  backup: BackupControls;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const [path, setPath] = useState<string>();
  const load = useCallback((signal: AbortSignal) => listBackupFolders(path, signal), [path]);
  const listing = useLoader(load);
  const data =
    listing.state.status === 'ready' && (path === undefined || listing.state.data.path === path)
      ? listing.state.data
      : null;
  return (
    <Dialog title={t('backup.chooseFolder')} onClose={onClose} testId="backup-folder-picker">
      {listing.state.status === 'loading' && <p>{t('common.loading')}</p>}
      {listing.state.status === 'error' && (
        <p className="form-error" role="alert">
          {listing.state.message}{' '}
          <button
            className="btn small"
            type="button"
            onClick={() => {
              setPath(undefined);
              listing.reload();
            }}
          >
            {t('common.tryAgain')}
          </button>
        </p>
      )}
      {data !== null && (
        <>
          <p className="settings-path" data-testid="backup-picker-path">
            {data.path}
          </p>
          <button
            type="button"
            className="btn small"
            disabled={data.parent === null || backup.busy}
            onClick={() => {
              if (data.parent !== null) setPath(data.parent);
            }}
          >
            {t('backup.folderUp')}
          </button>
          <ul className="backup-folder-list">
            {data.directories.map((folder) => (
              <li key={folder.path}>
                <button
                  type="button"
                  className="btn backup-folder-entry"
                  disabled={backup.busy}
                  onClick={() => setPath(folder.path)}
                >
                  {folder.name}
                </button>
              </li>
            ))}
          </ul>
          {!data.writable && <p className="form-error">{t('backup.folderNotWritable')}</p>}
        </>
      )}
      {backup.error !== null && (
        <p className="form-error" role="alert">
          {backup.error}
        </p>
      )}
      <div className="modal-actions">
        <button type="button" className="btn" disabled={backup.busy} onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          data-testid="backup-use-folder"
          disabled={backup.busy || data === null || !data.writable}
          onClick={() => {
            if (data !== null)
              void backup
                .run(async () => {
                  await setBackupLocation(data.path);
                })
                .then((saved) => {
                  if (saved) onClose();
                });
          }}
        >
          {t('backup.useFolder')}
        </button>
      </div>
    </Dialog>
  );
}

function RestoreDialog({
  backup,
  data,
  onCancel,
  onConfirm,
}: {
  backup: BackupControls;
  data: BackupStatusResponse;
  onCancel: () => void;
  onConfirm: (file: string, passphrase: string) => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const selectId = useId();
  const passphraseId = useId();
  const [file, setFile] = useState(
    () =>
      data.backups.reduce<BackupFile | undefined>(
        (latest, candidate) =>
          latest === undefined || Date.parse(candidate.created_at) > Date.parse(latest.created_at)
            ? candidate
            : latest,
        undefined,
      )?.path ?? '',
  );
  const [passphrase, setPassphrase] = useState('');
  const encrypted = data.backups.find((candidate) => candidate.path === file)?.encrypted === true;
  return (
    <ConfirmDialog
      title={t('backup.confirmTitle')}
      confirmLabel={t('backup.restore')}
      onCancel={onCancel}
      confirmDisabled={file === '' || backup.busy}
      onConfirm={() => {
        if (file !== '') onConfirm(file, passphrase);
      }}
      body={
        <>
          <p>{t('backup.confirmRestoreBody')}</p>
          {data.pending_restore && (
            <p>
              {t('backup.restoreWaiting')}{' '}
              <button
                type="button"
                className="btn small"
                disabled={backup.busy}
                onClick={() => {
                  void backup
                    .run(async () => {
                      await cancelRestore();
                    })
                    .then((saved) => {
                      if (saved) onCancel();
                    });
                }}
              >
                {t('backup.cancelPending')}
              </button>
            </p>
          )}
          <div className="settings-field">
            <label className="label" htmlFor={selectId}>
              {t('backup.archiveLabel')}
            </label>
            <select
              id={selectId}
              data-testid="backup-restore-file"
              value={file}
              disabled={backup.busy}
              onChange={(event) => {
                setFile(event.target.value);
                setPassphrase('');
              }}
            >
              {data.backups.map((candidate) => (
                <option key={candidate.path} value={candidate.path}>
                  {candidate.filename}
                </option>
              ))}
            </select>
          </div>
          {encrypted && (
            <div className="settings-field">
              <label className="label" htmlFor={passphraseId}>
                {t('backup.passphrase')}
              </label>
              <input
                id={passphraseId}
                type="password"
                autoComplete="off"
                value={passphrase}
                data-testid="backup-restore-passphrase"
                disabled={backup.busy}
                onChange={(event) => setPassphrase(event.target.value)}
              />
              <p className="small note-meta">{t('backup.passphraseHint')}</p>
            </div>
          )}
        </>
      }
    />
  );
}
