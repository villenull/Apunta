import { useCallback, useState } from 'react';
import { Link } from 'react-router';

import { fetchBackupStatus, fetchHealth } from '../api/index.js';
import { CheckIcon, CloseIcon } from '../components/icons.js';
import { Screen } from '../components/TopBar.js';
import { useLoader } from '../hooks/useLoader.js';
import { copyText } from '../lib/clipboard.js';
import {
  FULLY_LOCAL,
  SETUP_SCRIPT_COMMAND,
  hasBlockingProblem,
  isFullyLocal,
  setupChecks,
  type CheckState,
  type SetupCheck,
} from '../lib/setup.js';

/**
 * `/setup` — what is missing, and the exact thing to run (M7 deliverable 2).
 *
 * The M3 banner links here. There is no ffmpeg row: M5 records 16 kHz WAV in
 * the browser and `whisper-cli` decodes it, so a machine without ffmpeg is a
 * machine that works.
 *
 * The screen refuses to print "You're fully local — nothing leaves this Mac"
 * until every row is green, and FileVault is one of the rows. That sentence is
 * a promise about the disk, not about the network, and it is false while the
 * disk is unencrypted or while backups are being written into a folder iCloud
 * syncs (`docs/research/data-at-rest-2026-08.md` §9).
 */
export function Setup(): React.JSX.Element {
  const loadHealth = useCallback((signal: AbortSignal) => fetchHealth(signal), []);
  const health = useLoader(loadHealth);

  // The backup destination is part of the promise, but a failure to read it
  // must not stop the checklist rendering — it is the smaller half.
  const loadBackup = useCallback((signal: AbortSignal) => fetchBackupStatus(signal).catch(() => null), []);
  const backup = useLoader(loadBackup);

  function recheck(): void {
    health.reload();
    backup.reload();
  }

  return (
    <Screen back={{ to: '/', label: 'Patients' }}>
      <h2 className="lede">Setup</h2>
      <p className="small note-meta lede">
        Apunta runs entirely on this Mac. These are the pieces it needs, and what to do about any that are
        missing.
      </p>

      {health.state.status === 'loading' && <p className="small state-note">Checking…</p>}

      {health.state.status === 'error' && (
        <p className="small state-note error-state" role="alert" data-testid="setup-error">
          {health.state.message}{' '}
          <button type="button" className="btn small btn-quick" onClick={recheck}>
            Check again
          </button>
        </p>
      )}

      {health.state.status === 'ready' && (
        <SetupBody
          checks={setupChecks(health.state.data, backup.state.status === 'ready' ? backup.state.data : null)}
          onRecheck={recheck}
        />
      )}
    </Screen>
  );
}

function SetupBody({
  checks,
  onRecheck,
}: {
  checks: SetupCheck[];
  onRecheck: () => void;
}): React.JSX.Element {
  const ready = isFullyLocal(checks);

  return (
    <>
      {ready && (
        <p className="card lede setup-verdict is-ready" data-testid="setup-ready">
          {FULLY_LOCAL}
        </p>
      )}

      <ul className="card card-rows lede setup-list" data-testid="setup-checklist">
        {checks.map((check) => (
          <SetupRow key={check.id} check={check} />
        ))}
      </ul>

      <button type="button" className="btn btn-block" onClick={onRecheck} data-testid="setup-recheck">
        Check again
      </button>

      {hasBlockingProblem(checks) && (
        <div className="card card-rows lede">
          <h3 className="heading-tight">Or do all of it at once</h3>
          <p className="small note-meta">
            From a Terminal window in the Apunta folder. It installs what is missing, downloads the models,
            and is safe to run again as many times as you like.
          </p>
          <CommandLine command={SETUP_SCRIPT_COMMAND} testId="setup-script-command" />
        </div>
      )}

      <p className="small note-meta lede">
        Backing up is a separate question, and the one most worth getting right —{' '}
        <Link to="/settings">Settings</Link> has it.
      </p>
    </>
  );
}

function SetupRow({ check }: { check: SetupCheck }): React.JSX.Element {
  return (
    <li className={`setup-row is-${check.state}`} data-testid={`setup-row-${check.id}`}>
      <div className="setup-row-head">
        <StateMark state={check.state} />
        <div className="grow">
          <p className="setup-row-label">{check.label}</p>
          <p className="small note-meta" data-testid={`setup-detail-${check.id}`}>
            {check.detail}
          </p>
        </div>
      </div>

      {check.note !== undefined && <p className="small note-meta setup-row-note">{check.note}</p>}

      {check.fix !== undefined && check.state !== 'ok' && check.state !== 'skipped' && (
        <>
          {check.fixIsCommand === true ? (
            <CommandLine command={check.fix} testId={`setup-fix-${check.id}`} />
          ) : (
            <p className="setup-fix-steps" data-testid={`setup-fix-${check.id}`}>
              {check.fix}
            </p>
          )}
        </>
      )}
    </li>
  );
}

const STATE_LABEL: Record<CheckState, string> = {
  ok: 'Ready',
  missing: 'Missing',
  warn: 'Not finished',
  unknown: 'Could not check',
  skipped: 'Not checked',
};

function StateMark({ state }: { state: CheckState }): React.JSX.Element {
  return (
    <span className={`setup-mark is-${state}`} aria-label={STATE_LABEL[state]} title={STATE_LABEL[state]}>
      {state === 'ok' ? (
        <CheckIcon className="icon icon-sm" />
      ) : state === 'missing' ? (
        <CloseIcon className="icon icon-sm" />
      ) : (
        <span aria-hidden="true">·</span>
      )}
    </span>
  );
}

/** A command she is meant to paste, with the copy button beside it. */
function CommandLine({ command, testId }: { command: string; testId: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false);

  return (
    <div className="setup-command">
      <code data-testid={testId}>{command}</code>
      <button
        type="button"
        className="btn small btn-quick"
        onClick={() => {
          void copyText(command).then(() => {
            setCopied(true);
          });
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
