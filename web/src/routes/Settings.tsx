import { useCallback } from 'react';
import { Link } from 'react-router';

import { listFormats } from '../api/index.js';
import { PlusIcon } from '../components/icons.js';
import { Screen } from '../components/TopBar.js';
import { useLoader } from '../hooks/useLoader.js';
import type { FormatDraft } from './formatDraft.js';

/**
 * `prototype/settings.html` — the note formats the practice writes against.
 *
 * "Edit" reuses the onboarding confirm screen as the format editor: it is
 * already the name-plus-sections form, and M6 grows it further.
 */
export function Settings(): React.JSX.Element {
  const loadFormats = useCallback((signal: AbortSignal) => listFormats(signal), []);
  const formats = useLoader(loadFormats);

  const newFormat: FormatDraft = { name: '', sections: [], returnTo: '/settings' };

  return (
    <Screen back={{ to: '/', label: 'Patients' }}>
      <h2 className="lede">Note formats</h2>

      <div className="card card-rows lede" data-testid="format-list">
        {formats.state.status === 'loading' && <p className="small state-note">Loading formats…</p>}
        {formats.state.status === 'error' && (
          <p className="small state-note error-state" role="alert">
            {formats.state.message}{' '}
            <button type="button" className="btn small btn-quick" onClick={formats.reload}>
              Try again
            </button>
          </p>
        )}
        {formats.state.status === 'ready' && formats.state.data.length === 0 && (
          <p className="small state-note">No note formats yet.</p>
        )}
        {formats.state.status === 'ready' &&
          formats.state.data.map((format) => (
            <div className="patient-row" key={format.id}>
              <div>
                <p className="format-name">{format.name}</p>
                <p className="small note-meta">{format.sections.join(', ')}</p>
              </div>
              <Link
                to="/onboarding/preview"
                className="small note-meta"
                state={
                  {
                    name: format.name,
                    sections: format.sections,
                    returnTo: '/settings',
                    formatId: format.id,
                  } satisfies FormatDraft
                }
              >
                Edit
              </Link>
            </div>
          ))}
      </div>

      <Link to="/onboarding/format" state={newFormat} className="btn btn-block">
        <PlusIcon className="icon icon-sm" />
        Add another format
      </Link>
    </Screen>
  );
}
