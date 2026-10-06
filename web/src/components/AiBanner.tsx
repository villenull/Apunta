import { useCallback, useState } from 'react';

import { fetchHealth } from '../api/index.js';
import { useLoader } from '../hooks/useLoader.js';
import { useI18n } from '../lib/i18n.js';

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
 * the banner no longer links anywhere.
 */
export function AiBanner(): React.JSX.Element | null {
  const { t } = useI18n();
  const loadHealth = useCallback((signal: AbortSignal) => fetchHealth(signal), []);
  const health = useLoader(loadHealth);
  const [dismissed, setDismissed] = useState(false);

  // A health call that has not answered, or failed outright, says nothing
  // about the model — and a banner that flashes on every load would be noise.
  if (dismissed || health.state.status !== 'ready') return null;

  const { ollama } = health.state.data;
  if (ollama.reachable && ollama.modelPresent) return null;

  /*
   * The banner's one sentence, keyed at the element it is split by rather than
   * merged into a single string: the retry button is the whole point of the
   * sentence, and deleting it to make it one key would change what the screen
   * does. `{model}` is the stored model name, or empty when the server named
   * none.
   */
  const message = ollama.reachable
    ? t('ai.modelMissing', { model: ollama.model === null ? '' : ` (${ollama.model})` })
    : t('ai.unreachable');

  return (
    <div className="ai-banner" role="status" data-testid="ai-banner">
      <p>
        {message} {t('ai.bannerTail')}{' '}
        <button
          type="button"
          className="btn small btn-quick"
          onClick={health.reload}
          data-testid="ai-banner-retry"
        >
          {t('common.checkAgain')}
        </button>
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
  );
}
