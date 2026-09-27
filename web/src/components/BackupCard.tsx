import {
  BACKUP_STALE_DAYS,
  instantToLocalDay,
  type BackupFile,
  type BackupStatusResponse,
} from '@apunta/shared';
import { useCallback, useState } from 'react';

import {
  cancelRestore,
  createBackup,
  errorMessage,
  fetchBackupStatus,
  markRestoreVerified,
  restoreBackup,
} from '../api/index.js';
import { useLoader, type LoadState } from '../hooks/useLoader.js';
import { useI18n, useReportWork, type Translate } from '../lib/i18n.js';

/**
 * Settings → Backup (M7 deliverable 4), in two parts since the Settings
 * redesign (owner, 2026-09-21): a one-line card on the main screen, and the
 * details under Advanced.
 *
 * The research ranks "the backup does not exist, or exists and cannot be
 * restored" as the most likely way this practice loses its data, so what
 * stays on the main screen is exactly what guards against that: when the
 * last backup ran, a warning when it is stale or failed, a warning when the
 * folder syncs to a cloud, a waiting restore, and Back up now / Restore.
 * Everything else — the folder, the passphrase, the archives, the verify
 * nudge, the size of what is kept — is one click away under Advanced.
 *
 * The daily automatic backup is the server's and is untouched by any of this.
 */

/** Which half of the screen an action came from, so its result shows there. */
type Origin = 'card' | 'advanced';

/**
 * How long ago a backup ran, as a catalogue key.
 *
 * The oracle `formatRelativeTime` (`web/src/lib/format.ts:119-128`) returns
 * whole English phrases — `just now`, `5 minutes ago`, `yesterday` — and that
 * module is read-only for this card, so the card computes the same five shapes
 * here and lets `Intl.PluralRules` choose the form in the active locale
 * (Fixed decision 3). The arithmetic and the thresholds are the oracle's,
 * unchanged.
 */
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
  readonly error: { readonly origin: Origin; readonly text: string } | null;
  readonly message: { readonly origin: Origin; readonly text: string } | null;
  readonly directory: string;
  readonly setDirectory: (value: string) => void;
  readonly passphrase: string;
  readonly setPassphrase: (value: string) => void;
  readonly run: (origin: Origin, action: () => Promise<string>) => void;
}

/** The backup state both halves share. */
export function useBackup(): BackupControls {
  const load = useCallback((signal: AbortSignal) => fetchBackupStatus(signal), []);
  const status = useLoader(load);
  const [busy, setBusy] = useState(false);
  // A backup or restore in flight holds the Language control (C-LANG@1 rule 6).
  useReportWork(busy);
  const [error, setError] = useState<BackupControls['error']>(null);
  const [message, setMessage] = useState<BackupControls['message']>(null);
  const [directory, setDirectory] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const reload = status.reload;

  const run = useCallback(
    (origin: Origin, action: () => Promise<string>): void => {
      setBusy(true);
      setError(null);
      setMessage(null);
      void action().then(
        (text) => {
          setBusy(false);
          setMessage({ origin, text });
          reload();
        },
        (thrown: unknown) => {
          setBusy(false);
          setError({ origin, text: errorMessage(thrown) });
        },
      );
    },
    [reload],
  );

  return {
    status: status.state,
    reload,
    busy,
    error,
    message,
    directory,
    setDirectory,
    passphrase,
    setPassphrase,
    run,
  };
}

function backUp(backup: BackupControls, origin: Origin, toFolder: boolean, t: Translate): void {
  backup.run(origin, async () => {
    const directory = backup.directory.trim();
    const result = await createBackup({
      ...(toFolder && directory !== '' ? { directory, remember: true } : {}),
      ...(backup.passphrase === '' ? {} : { passphrase: backup.passphrase }),
    });
    backup.setPassphrase('');
    const pruned =
      result.pruned.length === 0 ? '' : ` ${t('backup.pruned', { count: String(result.pruned.length) })}`;
    return (
      t('backup.done', {
        notes: String(result.manifest.counts['notes'] ?? 0),
        bytes: formatBytes(result.file.bytes),
      }) + pruned
    );
  });
}

function Outcome({ backup, origin }: { backup: BackupControls; origin: Origin }): React.JSX.Element {
  return (
    <>
      {backup.error?.origin === origin && (
        <p className="form-error" role="alert" data-testid="backup-action-error">
          {backup.error.text}
        </p>
      )}
      {backup.message?.origin === origin && (
        <p className="small state-note" role="status" data-testid="backup-action-message">
          {backup.message.text}
        </p>
      )}
    </>
  );
}

/** The main-screen card: one line, and a warning only when something is wrong. */
export function BackupCard({
  backup,
  onRestore,
}: {
  backup: BackupControls;
  /** Restoring picks an archive, and the archives live under Advanced. */
  onRestore: () => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const { status } = backup;

  return (
    <section className="card settings-card" data-testid="backup-card">
      <h2 className="settings-title">{t('backup.title')}</h2>
      {status.status === 'loading' && <p className="small state-note">{t('common.loading')}</p>}
      {status.status === 'error' && (
        <p className="small state-note error-state" role="alert">
          {status.message}{' '}
          <button type="button" className="btn small btn-quick" onClick={backup.reload}>
            {t('common.tryAgain')}
          </button>
        </p>
      )}
      {status.status === 'ready' && (
        <>
          <div className="settings-row">
            <span className={status.data.stale ? 'backup-stale' : undefined} data-testid="backup-last">
              {status.data.last_backup_at === null
                ? t('backup.noneYet')
                : t('backup.lastAt', { when: relativeTime(t, status.data.last_backup_at) })}
            </span>
            <span className="settings-row-actions">
              <button
                type="button"
                className="btn small btn-primary"
                disabled={backup.busy}
                data-testid="backup-now"
                onClick={() => {
                  backUp(backup, 'card', false, t);
                }}
              >
                {backup.busy ? t('backup.working') : t('backup.now')}
              </button>
              <button type="button" className="btn small" data-testid="backup-restore" onClick={onRestore}>
                {t('backup.restore')}
              </button>
            </span>
          </div>

          {status.data.stale && status.data.last_backup_at !== null && (
            <p className="backup-warning" role="alert" data-testid="backup-stale">
              {t('backup.stale', { days: BACKUP_STALE_DAYS })}
            </p>
          )}
          {status.data.last_backup_error !== null && (
            <p className="form-error" role="alert" data-testid="backup-error">
              {t('backup.failed', { detail: status.data.last_backup_error })}
            </p>
          )}
          {status.data.destination.warning !== '' && (
            <p className="backup-warning" data-testid="backup-destination-warning">
              {status.data.destination.warning}
            </p>
          )}
          {status.data.pending_restore && (
            <p className="backup-warning" role="alert" data-testid="backup-pending">
              {t('backup.restoreWaiting')}{' '}
              <button
                type="button"
                className="btn small btn-quick"
                disabled={backup.busy}
                onClick={() => {
                  backup.run('card', async () => {
                    await cancelRestore();
                    return t('backup.restoreCancelled');
                  });
                }}
              >
                {t('backup.cancelPending')}
              </button>
            </p>
          )}
          <Outcome backup={backup} origin="card" />
        </>
      )}
    </section>
  );
}

/** Advanced → Backup: the folder, the passphrase, the archives, the numbers. */
export function BackupAdvanced({ backup }: { backup: BackupControls }): React.JSX.Element | null {
  const { t } = useI18n();
  if (backup.status.status !== 'ready') return null;
  const data = backup.status.data;

  return (
    <div className="settings-group" data-testid="backup-advanced">
      <h3 className="settings-subtitle">{t('backup.title')}</h3>

      <div className="settings-field">
        <span className="label">{t('backup.folder')}</span>
        <span className="settings-path" data-testid="backup-directory">
          {data.directory}
        </span>
      </div>
      {data.destination.risk === 'data-dir' && (
        <p className="small note-meta" data-testid="backup-same-disk">
          {t('backup.sameDisk')}
        </p>
      )}

      <div className="settings-field">
        <label className="label" htmlFor="backup-directory-input">
          {t('backup.changeFolder')}
        </label>
        <input
          id="backup-directory-input"
          value={backup.directory}
          placeholder={t('backup.folderPlaceholder')}
          onChange={(event) => {
            backup.setDirectory(event.target.value);
          }}
        />
      </div>

      <div className="settings-field">
        <label className="label" htmlFor="backup-passphrase">
          {t('backup.passphrase')}
        </label>
        <input
          id="backup-passphrase"
          type="password"
          value={backup.passphrase}
          autoComplete="off"
          onChange={(event) => {
            backup.setPassphrase(event.target.value);
          }}
        />
        {backup.passphrase !== '' && (
          <p className="small backup-stale" data-testid="backup-passphrase-warning">
            {t('backup.passphraseWarning')}
          </p>
        )}
      </div>

      <div className="settings-actions">
        <button
          type="button"
          className="btn small"
          disabled={backup.busy}
          data-testid="backup-to-folder"
          onClick={() => {
            backUp(backup, 'advanced', true, t);
          }}
        >
          {t('backup.backUp')}
        </button>
      </div>

      <BackupList
        files={data.backups}
        busy={backup.busy}
        onRestore={(file) => {
          backup.run('advanced', async () => {
            const result = await restoreBackup({
              file: file.filename,
              ...(backup.passphrase === '' ? {} : { passphrase: backup.passphrase }),
            });
            backup.setPassphrase('');
            return t('backup.restoreReady', {
              day: instantToLocalDay(result.manifest.generated_at),
              path: result.safety_copy,
            });
          });
        }}
      />
      <Outcome backup={backup} origin="advanced" />

      <VerifyRestore
        lastVerified={data.last_verified_restore}
        busy={backup.busy}
        onConfirm={() => {
          backup.run('advanced', async () => {
            await markRestoreVerified();
            return t('backup.noted');
          });
        }}
      />

      {/*
        One key with four counts, plus the conditional range as a fifth. The
        counts are `String(…)` exactly as the card wrote them, so `847` is
        `847` and a count of 1,000 is not regrouped.
      */}
      <p className="small note-meta" data-testid="retention-summary">
        {t('backup.stored', {
          notes: String(data.counts['notes'] ?? 0),
          patients: String(data.counts['patients'] ?? 0),
          range:
            data.oldest_note_at === null
              ? ''
              : t('backup.storedRange', { day: instantToLocalDay(data.oldest_note_at) }),
          transcripts: String(data.counts['transcripts'] ?? 0),
          bytes: formatBytes(data.db_bytes),
        })}
      </p>
    </div>
  );
}

function BackupList({
  files,
  busy,
  onRestore,
}: {
  files: readonly BackupFile[];
  busy: boolean;
  onRestore: (file: BackupFile) => void;
}): React.JSX.Element {
  const { t } = useI18n();
  if (files.length === 0) {
    /*
     * The empty state still has to teach the way in (day-one rehearsal,
     * 2026-08-30): restoring is offered per archive in the folder, and a
     * backup that arrived on a memory stick is invisible until it is moved
     * there. One sentence, because without it she is stuck.
     */
    return (
      <p className="small note-meta" data-testid="backup-empty">
        {t('backup.noArchives')}
      </p>
    );
  }

  return (
    <ul className="backup-list" data-testid="backup-list">
      {files.map((file) => (
        <li key={file.filename}>
          <span>
            {file.filename}
            <span className="note-meta">
              {' '}
              · {formatBytes(file.bytes)}
              {file.encrypted ? t('backup.encrypted') : ''}
            </span>
          </span>
          <button
            type="button"
            className="btn small btn-quick"
            disabled={busy}
            onClick={() => {
              onRestore(file);
            }}
          >
            {t('backup.restore')}
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * "A backup that has never been restored is a hypothesis" (§5.6). Once a
 * year at most, and gone when she says she has tried one.
 */
function VerifyRestore({
  lastVerified,
  busy,
  onConfirm,
}: {
  lastVerified: string | null;
  busy: boolean;
  onConfirm: () => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const yearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
  if (lastVerified !== null && Date.parse(lastVerified) > yearAgo) {
    // The day is `instantToLocalDay`'s raw `YYYY-MM-DD`, which is what the
    // screen shows today, so it is a stored value and a `text` parameter rather
    // than a `dateOnly` one (Fixed decision 3 and 4).
    return (
      <p className="small note-meta" data-testid="backup-verified">
        {t('backup.tested', { day: instantToLocalDay(lastVerified) })}
      </p>
    );
  }
  return (
    <p className="small note-meta" data-testid="backup-verify-nudge">
      {t('backup.neverTested')}{' '}
      <button type="button" className="btn small btn-quick" disabled={busy} onClick={onConfirm}>
        {t('backup.markTested')}
      </button>
    </p>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
