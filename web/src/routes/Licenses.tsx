import { useCallback } from 'react';

import { fetchLicenses } from '../api/index.js';
import { Screen } from '../components/TopBar.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useLoader } from '../hooks/useLoader.js';

/**
 * The licences of everything Apunta ships (M8 deliverable 6).
 *
 * Apunta bundles other people's programs — the AI runtime, the transcriber,
 * Node itself — and every one of those licences requires its notice to travel
 * with the software. A file in the developer's repository has not travelled
 * anywhere, so the app carries a copy and shows it here, linked from About
 * beside the privacy statement.
 *
 * Rendered as plain text rather than parsed as Markdown: it is licence text
 * verbatim, and a renderer would be one more thing deciding what to do with
 * the characters in it.
 */
export function Licenses(): React.JSX.Element {
  useDocumentTitle('Licences');
  const load = useCallback((signal: AbortSignal) => fetchLicenses(signal), []);
  const licenses = useLoader(load);

  return (
    <Screen back={{ to: '/about', label: 'About' }}>
      <h2 className="lede">What Apunta is built from</h2>

      <div className="card card-rows lede">
        <p className="small note-meta">
          Apunta includes programs written by other people, and their licences ask that this notice travels
          with the app. Nothing here needs anything from you — it is here because it should be.
        </p>
      </div>

      {licenses.state.status === 'loading' && <p className="small note-meta lede">Loading…</p>}

      {licenses.state.status === 'error' && (
        <p className="form-error lede" role="alert">
          {licenses.state.message}
        </p>
      )}

      {licenses.state.status === 'ready' && (
        <pre className="licenses-text lede" data-testid="licenses-text">
          {licenses.state.data}
        </pre>
      )}
    </Screen>
  );
}
