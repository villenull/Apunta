import {
  BACKUP_STALE_DAYS,
  instantToLocalDay,
  type BackupFile,
  type BackupStatusResponse,
} from '@apunta/shared';
import { useCallback, useId, useState } from 'react';

import {
  cancelRestore,
  createBackup,
  errorMessage,
  fetchBackupStatus,
  markRestoreVerified,
  restoreBackup,
} from '../api/index.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { useLoader, type LoadState } from '../hooks/useLoader.js';
import { useI18n, useReportWork, type Translate } from '../lib/i18n.js';

/**
 * Settings → Backup (M7 deliverable 4), one page since the Settings redesign
 * (owner, 2026-10-05).
 *
 * The research ranks "the backup does not exist, or exists and cannot be
 * restored" as the most likely way this practice loses its data, so the three
 * controls that guard against it — Back up now, Change backup location and
 * Restore — are a row of their own, and what a backup is worth and where it
 * goes sits under them: when the last one ran, the folder, the archives in it,
 * the year-ago question about whether a restore has ever been tried, and the
 * size of what is kept.
 *
 * Two of the three row buttons write or replace data, so each asks first:
 * a backup that runs is minutes of work and a restore replaces what is here.
 * Cancelling asks nothing and changes nothing.
 *
 * There is no passphrase for a new backup. The research prefers the container
 * to the file — an encrypted disk the OS unlocks — to encrypting the archive in
 * the app, and a passphrase typed into a settings field is one that gets lost,
 * and a lost passphrase is a backup nobody can open. Archives encrypted before
 * this page changed can still be restored: the passphrase field is in the
 * restore dialog, where the only person who needs it is the one restoring.
 *
 * The daily automatic backup is the server's and is untouched by any of this.
 */

/**
 * How long ago a backup ran, as a catalogue key.
 *
 * The oracle `formatRelativeTime` (`web/src/lib/format.ts:119-128`) returns
 * whole English phrases — `just now`, `5 minutes ago`, `yesterday` — and that
 * module is read-only for this page, so the page computes the same five shapes
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
  readonly error: string | null;
  readonly message: string | null;
  readonly directory: string;
  readonly setDirectory: (value: string) => void;
  readonly run: (action: () => Promise<string>) => void;
}

/** The backup state the page is built on. */
export function useBackup(): BackupControls {
  const load = useCallback((signal: AbortSignal) => fetchBackupStatus(signal), []);
  const status = useLoader(load);
  const [busy, setBusy] = useState(false);
  // A backup or restore in flight holds the Language control (C-LANG@1 rule 6).
  useReportWork(busy);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [directory, setDirectory] = useState('');
  const reload = status.reload;

  const run = useCallback(
    (action: () => Promise<string>): void => {
      setBusy(true);
      setError(null);
      setMessage(null);
      void action().then(
        (text) => {
          setBusy(false);
          setMessage(text);
          reload();
        },
        (thrown: unknown) => {
          setBusy(false);
          setError(errorMessage(thrown));
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
    run,
  };
}

/**
 * What is waiting to happen once she has been asked about it. `backup` writes a
 * new archive; `restore` brings the named one back.
 */
type Pending = { readonly kind: 'backup' } | { readonly kind: 'restore'; readonly file: string };

function backUp(backup: BackupControls, toFolder: boolean, t: Translate): void {
  backup.run(async () => {
    const directory = backup.directory.trim();
    const result = await createBackup(toFolder && directory !== '' ? { directory, remember: true } : {});
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

/** Settings → Backup, the whole page. */
export function BackupSection({ backup }: { backup: BackupControls }): React.JSX.Element {
  const { t } = useI18n();
  const { status } = backup;
  const [pending, setPending] = useState<Pending | null>(null);
  const [editingLocation, setEditingLocation] = useState(false);

  const data = status.status === 'ready' ? status.data : null;

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
      {data !== null && (
        <>
          <div className="settings-row-actions" data-testid="backup-actions">
            <button
              type="button"
              className="btn small btn-primary"
              disabled={backup.busy}
              data-testid="backup-now"
              onClick={() => {
                setPending({ kind: 'backup' });
              }}
            >
              {backup.busy ? t('backup.working') : t('backup.now')}
            </button>
            <button
              type="button"
              className="btn small"
              disabled={backup.busy}
              data-testid="backup-change-location"
              onClick={() => {
                // Prefill from what is actually saved, so she edits the current
                // destination rather than a blank field — and so cancelling and
                // reopening puts the saved one back, not the half-typed one.
                backup.setDirectory(data.directory);
                setEditingLocation((open) => !open);
              }}
            >
              {t('backup.changeLocation')}
            </button>
            <button
              type="button"
              className="btn small"
              disabled={backup.busy || data.backups.length === 0}
              data-testid="backup-restore"
              onClick={() => {
                setPending({ kind: 'restore', file: newest(data.backups)?.filename ?? '' });
              }}
            >
              {t('backup.restore')}
            </button>
          </div>

          {editingLocation && (
            <LocationEditor
              backup={backup}
              onDone={() => {
                setEditingLocation(false);
              }}
            />
          )}

          <div className="settings-field">
            <p className={data.stale ? 'backup-stale' : undefined} data-testid="backup-last">
              {data.last_backup_at === null
                ? t('backup.noneYet')
                : t('backup.lastAt', { when: relativeTime(t, data.last_backup_at) })}
            </p>
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

          {data.stale && data.last_backup_at !== null && (
            <p className="backup-warning" role="alert" data-testid="backup-stale">
              {t('backup.stale', { days: BACKUP_STALE_DAYS })}
            </p>
          )}
          {data.last_backup_error !== null && (
            <p className="form-error" role="alert" data-testid="backup-error">
              {t('backup.failed', { detail: data.last_backup_error })}
            </p>
          )}
          {data.destination.warning !== '' && (
            <p className="backup-warning" data-testid="backup-destination-warning">
              {data.destination.warning}
            </p>
          )}
          {data.pending_restore && (
            <p className="backup-warning" role="alert" data-testid="backup-pending">
              {t('backup.restoreWaiting')}{' '}
              <button
                type="button"
                className="btn small btn-quick"
                disabled={backup.busy}
                onClick={() => {
                  backup.run(async () => {
                    await cancelRestore();
                    return t('backup.restoreCancelled');
                  });
                }}
              >
                {t('backup.cancelPending')}
              </button>
            </p>
          )}

          <BackupList
            files={data.backups}
            busy={backup.busy}
            onRestore={(file) => {
              setPending({ kind: 'restore', file: file.filename });
            }}
          />

          <VerifyRestore
            lastVerified={data.last_verified_restore}
            busy={backup.busy}
            onConfirm={() => {
              backup.run(async () => {
                await markRestoreVerified();
                return t('backup.noted');
              });
            }}
          />

          {/*
            One key with four counts, plus the conditional range as a fifth. The
            counts are `String(…)` exactly as the page always wrote them, so
            `847` is `847` and a count of 1,000 is not regrouped.
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

          {backup.error !== null && (
            <p className="form-error" role="alert" data-testid="backup-action-error">
              {backup.error}
            </p>
          )}
          {backup.message !== null && (
            <p className="small state-note" role="status" data-testid="backup-action-message">
              {backup.message}
            </p>
          )}
        </>
      )}

      {pending?.kind === 'backup' && (
        <ConfirmDialog
          title={t('backup.confirmTitle')}
          body={<p>{t('backup.confirmBackupBody')}</p>}
          confirmLabel={t('backup.now')}
          onCancel={() => {
            setPending(null);
          }}
          onConfirm={() => {
            setPending(null);
            backUp(backup, false, t);
          }}
        />
      )}
      {pending?.kind === 'restore' && data !== null && (
        <RestoreDialog
          backup={backup}
          files={data.backups}
          pending={pending}
          onCancel={() => {
            setPending(null);
          }}
          onConfirm={(file, passphrase) => {
            setPending(null);
            backup.run(async () => {
              const result = await restoreBackup({
                file,
                ...(passphrase === '' ? {} : { passphrase }),
              });
              return t('backup.restoreReady', {
                day: instantToLocalDay(result.manifest.generated_at),
                path: result.safety_copy,
              });
            });
          }}
        />
      )}
    </section>
  );
}

/** The newest archive in the folder, which is what a bare Restore would mean. */
function newest(files: readonly BackupFile[]): BackupFile | undefined {
  return files.reduce<BackupFile | undefined>(
    (latest, file) =>
      latest === undefined || Date.parse(file.created_at) > Date.parse(latest.created_at) ? file : latest,
    undefined,
  );
}

/**
 * The folder editor. There is no separate "set the destination" call: the
 * directory becomes the remembered destination by being backed up to and
 * remembered, which is what `createBackup({ directory, remember: true })` has
 * always done — so this is the same path as before, asked for first.
 */
function LocationEditor({
  backup,
  onDone,
}: {
  backup: BackupControls;
  onDone: () => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const inputId = useId();
  return (
    <div className="settings-field" data-testid="backup-location-editor">
      <label className="label" htmlFor={inputId}>
        {t('backup.changeFolder')}
      </label>
      <input
        id={inputId}
        value={backup.directory}
        placeholder={t('backup.folderPlaceholder')}
        onChange={(event) => {
          backup.setDirectory(event.target.value);
        }}
      />
      <div className="settings-actions">
        <button type="button" className="btn small" disabled={backup.busy} onClick={onDone}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className="btn small btn-primary"
          disabled={backup.busy || backup.directory.trim() === ''}
          data-testid="backup-save-location"
          onClick={() => {
            onDone();
            backUp(backup, true, t);
          }}
        >
          {t('backup.saveFolder')}
        </button>
      </div>
    </div>
  );
}

/**
 * "Are you sure?" before anything is replaced, and — because a restore has to
 * name the archive it is about to bring back, and an archive encrypted before
 * the passphrase field left this page cannot be opened without one — the two
 * things that restore needs, asked for here rather than before it.
 */
function RestoreDialog({
  backup,
  files,
  pending,
  onCancel,
  onConfirm,
}: {
  backup: BackupControls;
  files: readonly BackupFile[];
  pending: Extract<Pending, { kind: 'restore' }>;
  onCancel: () => void;
  onConfirm: (file: string, passphrase: string) => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const selectId = useId();
  const passphraseId = useId();
  // Seeded from what was asked for, so opening it from the row's Restore and
  // opening it from one archive in the list land on that archive.
  const [file, setFile] = useState(pending.file);
  const [passphrase, setPassphrase] = useState('');

  return (
    <ConfirmDialog
      title={t('backup.confirmTitle')}
      confirmLabel={t('backup.restore')}
      onCancel={onCancel}
      onConfirm={() => {
        onConfirm(file, passphrase);
      }}
      body={
        <>
          <p>{t('backup.confirmRestoreBody')}</p>
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
              }}
            >
              {files.map((candidate) => (
                <option key={candidate.filename} value={candidate.filename}>
                  {`${candidate.filename} · ${formatBytes(candidate.bytes)}`}
                </option>
              ))}
            </select>
          </div>
          <div className="settings-field">
            <label className="label" htmlFor={passphraseId}>
              {t('backup.passphrase')}
            </label>
            <input
              id={passphraseId}
              type="password"
              autoComplete="off"
              data-testid="backup-restore-passphrase"
              disabled={backup.busy}
              onChange={(event) => {
                setPassphrase(event.target.value);
              }}
            />
            <p className="small note-meta" data-testid="backup-passphrase-hint">
              {t('backup.passphraseHint')}
            </p>
          </div>
        </>
      }
    />
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
