import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchHealth } from '../api/index.js';
import { useLoader } from '../hooks/useLoader.js';
import { useSetupStatus } from '../hooks/useSetupStatus.js';
import { useI18n } from '../lib/i18n.js';
import { AiSetupDialog } from './AiSetupDialog.js';

/**
 * "Apunta can't reach the local AI" (M3 deliverable 8).
 *
 * A banner rather than a blocker: without the model the app still opens,
 * still lists every patient and note, and still lets her edit and copy —
 * only drafting is unavailable. It says what is wrong and gets out of the way.
 *
 * It is dismissible per page load, deliberately not remembered: the state it
 * describes is one a user fixes in a minute by starting Ollama, and a banner
 * that stays dismissed after that would be lying.
 *
 * Owner decision 2026-10-05: the Setup, About and Licenses screens are gone, so
 * the banner no longer links anywhere — except to first-run setup, in the
 * desktop app, when a model is missing (2026-10-08). There it opens setup by
 * itself once per launch, and offers it again from the banner.
 */
export function AiBanner(): React.JSX.Element | null {
  const { t } = useI18n();
  const loadHealth = useCallback((signal: AbortSignal) => fetchHealth(signal), []);
  const health = useLoader(loadHealth);
  const [dismissed, setDismissed] = useState(false);
  // One read, no polling: it only answers "is there a shell that can set up?".
  const setup = useSetupStatus(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const autoOpened = useRef(false);

  const data = health.state.status === 'ready' ? health.state.data : null;
  /*
   * What first-run setup can fix: the writing model missing from a runtime that
   * answers, or the speech model missing. Fake mode has neither and needs
   * neither.
   */
  const needsSetup =
    data !== null &&
    !data.fakeAi &&
    ((data.ollama.reachable && !data.ollama.modelPresent) || !data.whisper.modelPresent);
  const canSetUp = setup.status !== null;

  // The first launch of the desktop app: open setup once, by itself. Nothing is
  // downloaded until she presses its button.
  useEffect(() => {
    if (needsSetup && canSetUp && !autoOpened.current) {
      autoOpened.current = true;
      setSetupOpen(true);
    }
  }, [needsSetup, canSetUp]);

  const dialog = setupOpen ? (
    <AiSetupDialog
      onClose={() => {
        setSetupOpen(false);
        health.reload();
      }}
      onReady={health.reload}
    />
  ) : null;

  // A health call that has not answered, or failed outright, says nothing
  // about the model — and a banner that flashes on every load would be noise.
  if (data === null) return dialog;
  const { ollama, whisper } = data;
  const healthy = ollama.reachable && ollama.modelPresent && (data.fakeAi || whisper.modelPresent);
  if (dismissed || healthy) return dialog;

  /*
   * The banner's one sentence, keyed at the element it is split by rather than
   * merged into a single string: the retry button is the whole point of the
   * sentence, and deleting it to make it one key would change what the screen
   * does. `{model}` is the stored model name, or empty when the server named
   * none.
   */
  const message =
    needsSetup && canSetUp
      ? t('ai.setupNeeded')
      : !ollama.reachable
        ? t('ai.unreachable')
        : !ollama.modelPresent
          ? t('ai.modelMissing', { model: ollama.model === null ? '' : ` (${ollama.model})` })
          : t('ai.speechModelMissing');

  return (
    <>
      <div className="ai-banner" role="status" data-testid="ai-banner">
        <p>
          {message} {t('ai.bannerTail')}{' '}
          {needsSetup && canSetUp ? (
            <button
              type="button"
              className="btn small btn-primary"
              onClick={() => {
                setSetupOpen(true);
              }}
              data-testid="ai-banner-setup"
            >
              {t('ai.setUp')}
            </button>
          ) : (
            <button
              type="button"
              className="btn small btn-quick"
              onClick={health.reload}
              data-testid="ai-banner-retry"
            >
              {t('common.checkAgain')}
            </button>
          )}
        </p>
        <button
          type="button"
          className="ai-banner-dismiss"
          aria-label={t('common.dismiss')}
          onClick={() => {
            setDismissed(true);
          }}
        >
          ×
        </button>
      </div>
      {dialog}
    </>
  );
}
