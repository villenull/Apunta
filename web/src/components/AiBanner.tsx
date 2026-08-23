import { useCallback, useState } from 'react';

import { fetchHealth } from '../api/index.js';
import { useLoader } from '../hooks/useLoader.js';

/**
 * "Apunta can't reach the local AI — see Setup" (M3 deliverable 8).
 *
 * A banner rather than a blocker: without the model the app still opens,
 * still lists every patient and note, and still lets her edit and copy —
 * only drafting is unavailable. The full first-run setup wizard is M7, so
 * for now this says what is wrong and gets out of the way.
 *
 * It is dismissible per page load, deliberately not remembered: the state it
 * describes is one a user fixes in a minute by starting Ollama, and a banner
 * that stays dismissed after that would be lying.
 */
export function AiBanner(): React.JSX.Element | null {
  const loadHealth = useCallback((signal: AbortSignal) => fetchHealth(signal), []);
  const health = useLoader(loadHealth);
  const [dismissed, setDismissed] = useState(false);

  // A health call that has not answered, or failed outright, says nothing
  // about the model — and a banner that flashes on every load would be noise.
  if (dismissed || health.state.status !== 'ready') return null;

  const { ollama } = health.state.data;
  if (ollama.reachable && ollama.modelPresent) return null;

  const message = ollama.reachable
    ? `Apunta can't find the AI model${ollama.model === null ? '' : ` (${ollama.model})`} — see Setup`
    : "Apunta can't reach the local AI — see Setup";

  return (
    <div className="ai-banner" role="status" data-testid="ai-banner">
      <p>
        {message}. Everything except drafting a new note still works.{' '}
        <button
          type="button"
          className="btn small btn-quick"
          onClick={health.reload}
          data-testid="ai-banner-retry"
        >
          Check again
        </button>
      </p>
      <button
        type="button"
        className="ai-banner-dismiss"
        aria-label="Dismiss"
        onClick={() => {
          setDismissed(true);
        }}
      >
        ×
      </button>
    </div>
  );
}
