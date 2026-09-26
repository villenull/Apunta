import { useCallback, useState } from 'react';
import { Link } from 'react-router';

import { fetchBackupStatus, fetchHealth } from '../api/index.js';
import { CheckIcon, CloseIcon } from '../components/icons.js';
import { Screen } from '../components/TopBar.js';
import { useLoader } from '../hooks/useLoader.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { copyText } from '../lib/clipboard.js';
import { useI18n, type Translate } from '../lib/i18n.js';
import {
  FULLY_LOCAL,
  SETUP_SCRIPT_COMMAND,
  hasBlockingProblem,
  setupChecks,
  type CheckState,
  type SetupCheck,
  type SetupPlatform,
} from '../lib/setup.js';

/**
 * `/setup` — what is missing, and the exact thing to run (M7 deliverable 2).
 *
 * The M3 banner links here. There is no ffmpeg row: M5 records 16 kHz WAV in
 * the browser and `whisper-cli` decodes it, so a machine without ffmpeg is a
 * machine that works.
 *
 * The screen separates the network-locality statement from disk encryption:
 * the former is a property of Apunta's runtime, while the latter is reported
 * only when the operating system can verify it.
 */

export function Setup(): React.JSX.Element {
  const { t } = useI18n();
  useDocumentTitle(t('doc.setup'));
  const loadHealth = useCallback((signal: AbortSignal) => fetchHealth(signal), []);
  const health = useLoader(loadHealth);

  // The backup destination is part of the promise, but a failure to read it
  // must not stop the checklist rendering — it is the smaller half.
  const loadBackup = useCallback((signal: AbortSignal) => fetchBackupStatus(signal).catch(() => null), []);
  const backup = useLoader(loadBackup);
  const platform: SetupPlatform =
    typeof navigator !== 'undefined' && /Macintosh|Mac OS X/i.test(navigator.userAgent) ? 'mac' : 'other';

  function recheck(): void {
    health.reload();
    backup.reload();
  }

  return (
    <Screen back={{ to: '/', label: t('common.patients') }}>
      <h2 className="lede">{t('setup.title')}</h2>
      <p className="small note-meta lede">{t('setup.lede')}</p>

      {health.state.status === 'loading' && <p className="small state-note">{t('setup.checking')}</p>}

      {health.state.status === 'error' && (
        <p className="small state-note error-state" role="alert" data-testid="setup-error">
          {health.state.message}{' '}
          <button type="button" className="btn small btn-quick" onClick={recheck}>
            {t('common.checkAgain')}
          </button>
        </p>
      )}

      {health.state.status === 'ready' && (
        <SetupBody
          checks={setupChecks(
            health.state.data,
            backup.state.status === 'ready' ? backup.state.data : null,
            platform,
          )}
          bundled={health.state.data.bundled}
          platform={platform}
          onRecheck={recheck}
          t={t}
        />
      )}
    </Screen>
  );
}
function SetupBody({
  checks,
  bundled,
  platform,
  onRecheck,
  t,
}: {
  checks: SetupCheck[];
  /** Inside Apunta.app there is no Terminal to run the script in, so the card that offers it stays away. */
  bundled: boolean;
  platform: SetupPlatform;
  onRecheck: () => void;
  t: Translate;
}): React.JSX.Element {
  return (
    <>
      <p className="card lede setup-verdict is-ready" data-testid="setup-local">
        {FULLY_LOCAL}
      </p>

      <ul className="card card-rows lede setup-list" data-testid="setup-checklist">
        {checks.map((check) => (
          <SetupRow key={check.id} check={check} t={t} />
        ))}
      </ul>

      <button type="button" className="btn btn-block" onClick={onRecheck} data-testid="setup-recheck">
        {t('common.checkAgain')}
      </button>

      {hasBlockingProblem(checks) && !bundled && platform === 'mac' && (
        <div className="card card-rows lede">
          <h3 className="heading-tight">{t('setup.allAtOnce')}</h3>
          <p className="small note-meta">{t('setup.terminalHelp')}</p>
          <CommandLine command={SETUP_SCRIPT_COMMAND} testId="setup-script-command" />
        </div>
      )}

      <p className="small note-meta lede">
        {t('setup.backingUpLead')} <Link to="/settings">{t('common.settings')}</Link> has it.
      </p>
    </>
  );
}
function SetupRow({ check, t }: { check: SetupCheck; t: Translate }): React.JSX.Element {
  return (
    <li className={`setup-row is-${check.state}`} data-testid={`setup-row-${check.id}`}>
      <div className="setup-row-head">
        <StateMark state={check.state} t={t} />
        <div className="grow">
          <p className="setup-row-label">
            {check.label} <span className="setup-row-state">{stateLabel(t, check.state)}</span>
          </p>
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

/**
 * The five check states, by the value `web/src/lib/setup.ts` reports.
 *
 * The state itself is data and is never translated (Fixed decision 4): each is
 * a key of its own, and `warn`, `unknown` and `skipped` are the same English
 * string today and so share one key.
 */
function stateLabel(t: Translate, state: CheckState): string {
  if (state === 'ok') return t('setup.stateOk');
  if (state === 'missing') return t('setup.stateMissing');
  return t('setup.stateUnknown');
}
function StateMark({ state, t }: { state: CheckState; t: Translate }): React.JSX.Element {
  return (
    <span className={`setup-mark is-${state}`} aria-label={stateLabel(t, state)} title={stateLabel(t, state)}>
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
  const { t } = useI18n();
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
        {copied ? t('common.copied') : t('common.copy')}
      </button>
    </div>
  );
}
