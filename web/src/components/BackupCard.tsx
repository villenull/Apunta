import { BACKUP_STALE_DAYS, MIN_BACKUP_PASSPHRASE, type BackupFile } from '@apunta/shared';
import { useCallback, useState } from 'react';

import {
  cancelRestore,
  createBackup,
  errorMessage,
  fetchBackupStatus,
  markRestoreVerified,
  restoreBackup,
} from '../api/index.js';
import { useLoader } from '../hooks/useLoader.js';

/**
 * Settings → Back up and restore (M7 deliverable 4).
 *
 * The research ranks "the backup does not exist, or exists and cannot be
 * restored" as the most likely way this practice loses its data — the only
 * item on that list where the harm is certain rather than conditional. Three
 * things follow, and they are what this card is for:
 *
 * - **the last result is always on screen**, including a failure. A backup
 *   that silently did not happen is the failure being defended against, so a
 *   stale timestamp is shown in colour and an error is shown as an error.
 * - **the destination is named and judged.** ~/Desktop and ~/Documents are the
 *   two folders iCloud syncs by default, so the obvious save location uploads
 *   clinical records to Apple.
 * - **restoring is offered, and it is honest about needing a restart.** The
 *   database is held open while the app runs, so the swap happens at the next
 *   start.
 *
 * The copy deliberately does not say "your backup is this file" — the record
 * lives in the system she pastes into. This file is her drafting history
 * (`docs/research/data-at-rest-2026-08.md` §6.3.5).
 */
export function BackupCard(): React.JSX.Element {
  const load = useCallback((signal: AbortSignal) => fetchBackupStatus(signal), []);
  const status = useLoader(load);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [directory, setDirectory] = useState('');
  const [passphrase, setPassphrase] = useState('');

  if (status.state.status === 'loading') {
    return <p className="small state-note">Loading backup status…</p>;
  }
  if (status.state.status === 'error') {
    return (
      <p className="small state-note error-state" role="alert">
        {status.state.message}{' '}
        <button type="button" className="btn small btn-quick" onClick={status.reload}>
          Try again
        </button>
      </p>
    );
  }

  const data = status.state.data;

  function run(action: () => Promise<string>): void {
    setBusy(true);
    setError(null);
    setMessage(null);
    void action().then(
      (note) => {
        setBusy(false);
        setMessage(note);
        status.reload();
      },
      (thrown: unknown) => {
        setBusy(false);
        setError(errorMessage(thrown));
      },
    );
  }

  return (
    <div className="card card-rows lede" data-testid="backup-card">
      <h2 className="lede">Back up and restore</h2>
      <p className="small note-meta">
        Apunta is where you draft. Your finished note lives in the records system you paste it into. What is
        only here — the rough notes, the transcripts, the refine conversations — exists nowhere else, which is
        what these backups are for.
      </p>

      {data.pending_restore && (
        <p className="backup-warning" role="alert" data-testid="backup-pending">
          A restore is waiting. <strong>Quit Apunta and open it again</strong> to finish it. Your current
          notes will be kept beside the restored ones.{' '}
          <button
            type="button"
            className="btn small btn-quick"
            disabled={busy}
            onClick={() => {
              run(async () => {
                await cancelRestore();
                return 'The restore was cancelled. Nothing changed.';
              });
            }}
          >
            Cancel it
          </button>
        </p>
      )}

      <p className={data.stale ? 'backup-stale' : 'small note-meta'} data-testid="backup-last">
        {data.last_backup_at === null
          ? 'No backup has been made yet.'
          : `Last backup ${data.last_backup_at.slice(0, 16).replace('T', ' ')} UTC.`}
        {data.stale && data.last_backup_at !== null
          ? ` That is more than ${String(BACKUP_STALE_DAYS)} days ago.`
          : ''}
      </p>

      {data.last_backup_error !== null && (
        <p className="form-error" role="alert" data-testid="backup-error">
          The last attempt failed: {data.last_backup_error}
        </p>
      )}

      <p className="small note-meta" data-testid="backup-directory">
        Backups go to <span className="setup-fix-steps">{data.directory}</span>
      </p>

      {data.destination.warning !== '' && (
        <p className="backup-warning" data-testid="backup-destination-warning">
          {data.destination.warning}
        </p>
      )}

      <p className="small note-meta">
        That folder is on this Mac, so it survives a mistake in the app but not a lost laptop. A second copy
        on an encrypted external disk is what covers the rest.
      </p>

      <label className="label" htmlFor="backup-directory-input">
        Save to a different folder (full path, optional)
      </label>
      <input
        id="backup-directory-input"
        value={directory}
        placeholder="/Volumes/Backup/Apunta"
        onChange={(event) => {
          setDirectory(event.target.value);
        }}
      />

      <label className="label" htmlFor="backup-passphrase">
        Passphrase for that folder (optional)
      </label>
      <input
        id="backup-passphrase"
        type="password"
        value={passphrase}
        autoComplete="off"
        onChange={(event) => {
          setPassphrase(event.target.value);
        }}
      />
      <p className="small note-meta">
        Only needed for a backup that leaves this Mac. An encrypted disk is the better answer where you have
        one — macOS remembers the key and there is nothing to type. If you set a passphrase here and lose it,
        the backup cannot be opened by anyone, including us. At least {String(MIN_BACKUP_PASSPHRASE)}{' '}
        characters, and put it in your password manager now.
      </p>

      {error !== null && (
        <p className="form-error" role="alert" data-testid="backup-action-error">
          {error}
        </p>
      )}
      {message !== null && (
        <p className="small state-note" role="status" data-testid="backup-action-message">
          {message}
        </p>
      )}

      <button
        type="button"
        className="btn btn-primary btn-block form-actions"
        disabled={busy}
        data-testid="backup-now"
        onClick={() => {
          run(async () => {
            const result = await createBackup({
              ...(directory.trim() === '' ? {} : { directory: directory.trim(), remember: true }),
              ...(passphrase === '' ? {} : { passphrase }),
            });
            setPassphrase('');
            const pruned =
              result.pruned.length === 0 ? '' : ` ${String(result.pruned.length)} older ones were removed.`;
            return `Backed up to ${result.file.filename} — ${formatBytes(result.file.bytes)}, ${String(
              result.manifest.counts['notes'] ?? 0,
            )} notes, checked and intact.${pruned}`;
          });
        }}
      >
        {busy ? 'Working…' : 'Back up now'}
      </button>

      <BackupList
        files={data.backups}
        busy={busy}
        onRestore={(file) => {
          run(async () => {
            const result = await restoreBackup({
              file: file.filename,
              ...(passphrase === '' ? {} : { passphrase }),
            });
            setPassphrase('');
            return `Ready to restore the backup from ${result.manifest.generated_at.slice(
              0,
              10,
            )}. Quit Apunta and open it again to finish. Your current notes will be kept at ${result.safety_copy}.`;
          });
        }}
      />

      <VerifyRestoreNudge
        lastVerified={data.last_verified_restore}
        busy={busy}
        onConfirm={() => {
          run(async () => {
            await markRestoreVerified();
            return 'Noted. Worth doing again in a year.';
          });
        }}
      />

      <RetentionSummary
        counts={data.counts}
        oldest={data.oldest_note_at}
        bytes={data.db_bytes}
        path={data.directory}
      />
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
  if (files.length === 0) {
    return <p className="small note-meta">No archives in that folder yet.</p>;
  }

  return (
    <>
      <h3 className="heading-tight">Archives</h3>
      <ul className="backup-list" data-testid="backup-list">
        {files.map((file) => (
          <li key={file.filename}>
            <span>
              {file.filename}
              <span className="note-meta">
                {' '}
                — {formatBytes(file.bytes)}
                {file.encrypted ? ', encrypted' : ''}
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
              Restore
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * "A backup that has never been restored is a hypothesis" (§5.6).
 *
 * Once, quietly, not a nag: it appears when no restore has ever been checked
 * or the last check is over a year old, and it goes away when she says she
 * tried it.
 */
function VerifyRestoreNudge({
  lastVerified,
  busy,
  onConfirm,
}: {
  lastVerified: string | null;
  busy: boolean;
  onConfirm: () => void;
}): React.JSX.Element | null {
  const yearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
  const recent = lastVerified !== null && Date.parse(lastVerified) > yearAgo;
  if (recent) {
    return (
      <p className="small note-meta" data-testid="backup-verified">
        You last checked a restore actually works on {lastVerified?.slice(0, 10)}.
      </p>
    );
  }

  return (
    <p className="small note-meta" data-testid="backup-verify-nudge">
      Once, on a spare copy, open one of these archives and follow RESTORE.txt inside it. A backup nobody has
      restored is a guess.{' '}
      <button type="button" className="btn small btn-quick" disabled={busy} onClick={onConfirm}>
        I have done this
      </button>
    </p>
  );
}

/**
 * What "keep everything" has grown into (§6.3.1).
 *
 * Numbers on a screen, no prompting and no judgement. Her decision to keep
 * every note stands; this exists so it stays a decision rather than a default
 * nobody has looked at since 2026. Nothing here deletes anything.
 */
function RetentionSummary({
  counts,
  oldest,
  bytes,
  path,
}: {
  counts: Record<string, number>;
  oldest: string | null;
  bytes: number;
  path: string;
}): React.JSX.Element {
  return (
    <>
      <h3 className="heading-tight">What is in here</h3>
      <p className="small note-meta" data-testid="retention-summary">
        {String(counts['notes'] ?? 0)} notes for {String(counts['patients'] ?? 0)} patients
        {oldest === null ? '' : `, going back to ${oldest.slice(0, 10)}`}.{' '}
        {String(counts['transcripts'] ?? 0)} transcripts. {formatBytes(bytes)} on disk.
      </p>
      <p className="small note-meta">
        Nothing here is ever deleted on a timer. Deleting a patient does remove their notes, transcripts and
        chat history — but it cannot reach a backup already written, a Time Machine copy, or the records
        system you pasted into. Backups live in {path}.
      </p>
    </>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
