import { ACCENT_COLOR_SETTING, DEFAULT_ACCENT_COLOR, type Settings as SettingsRecord } from '@apunta/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';

import { errorMessage, getSettings, listFormats, putSettings } from '../api/index.js';
import { accentColorOrDefault, applyAccentColor } from '../lib/accent.js';
import { BackupCard } from '../components/BackupCard.js';
import { PlusIcon } from '../components/icons.js';
import { Screen } from '../components/TopBar.js';
import { useLoader } from '../hooks/useLoader.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import type { FormatDraft } from './formatDraft.js';

/**
 * `prototype/settings.html` — the note formats the practice writes against.
 *
 * "Edit" reuses the onboarding confirm screen as the format editor: it is
 * already the name-plus-sections form, and M6 grows it further.
 */
export function Settings(): React.JSX.Element {
  useDocumentTitle('Settings');
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
                    source: format.source,
                    instructions: format.instructions,
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

      <AppearanceSettings />
      <BackupCard />

      <div className="card card-rows lede">
        <h3 className="heading-tight">Import from Claude</h3>
        <p className="small note-meta">
          If you have talked sessions through with Claude, its data export can become patients and notes here
          — each one shown to you first, and only your own words imported.
        </p>
        <Link to="/import" className="btn" data-testid="settings-import">
          Import from Claude
        </Link>
      </div>

      <p className="small note-meta lede">
        <Link to="/setup">Setup</Link> lists what Apunta needs on this Mac. <Link to="/about">About</Link>{' '}
        says what it does with your notes, and what it does not protect you from.
      </p>
    </Screen>
  );
}

/**
 * The accent colour (owner-proxy, 2026-08-30).
 *
 * The picker previews as it moves, because a colour described in a form and
 * a colour on the screen are different things — but a preview is not a
 * choice, so leaving without saving puts the stored accent back.
 */
function AppearanceSettings(): React.JSX.Element {
  const load = useCallback((signal: AbortSignal) => getSettings(signal), []);
  const settings = useLoader(load);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * The colour actually stored, which is what an abandoned preview must be
   * put back to. It is a ref because the unmount cleanup below reads it long
   * after the render that learned it — and it is written from a dependency
   * on the loaded *value*, never on every render: seeding it from the
   * loader's cached data each time meant a save was immediately forgotten,
   * and leaving the screen reverted the colour she had just chosen.
   */
  const savedRef = useRef<string | null>(null);
  const loaded =
    settings.state.status === 'ready'
      ? accentColorOrDefault((settings.state.data as SettingsRecord)[ACCENT_COLOR_SETTING])
      : null;

  useEffect(() => {
    if (loaded !== null && savedRef.current === null) savedRef.current = loaded;
  }, [loaded]);

  // A preview outlives this screen otherwise: she picks a colour, navigates
  // away without saving, and the app keeps wearing a colour nothing stored.
  useEffect(() => {
    return () => {
      applyAccentColor(savedRef.current);
    };
  }, []);

  if (settings.state.status === 'loading') return <p className="small state-note">Loading settings…</p>;
  if (settings.state.status === 'error') {
    return (
      <p className="small state-note error-state" role="alert">
        {settings.state.message}{' '}
        <button type="button" className="btn small btn-quick" onClick={settings.reload}>
          Try again
        </button>
      </p>
    );
  }

  const save = (value: string): void => {
    void (async () => {
      try {
        await putSettings({ [ACCENT_COLOR_SETTING]: value });
        savedRef.current = value;
        applyAccentColor(value);
        setSaved(true);
        setError(null);
      } catch (thrown) {
        setError(errorMessage(thrown));
      }
    })();
  };

  return (
    <form
      className="card card-rows lede"
      data-testid="appearance-settings"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        save(String(form.get(ACCENT_COLOR_SETTING) ?? DEFAULT_ACCENT_COLOR));
      }}
    >
      <h2 className="lede">Appearance</h2>

      <label className="label" htmlFor="accent-color">
        Accent colour
      </label>
      <p className="small note-meta">
        Used for buttons, the selected patient and note, and anything the app is asking you to look at.
      </p>
      <div className="row gap-12 accent-row">
        <input
          id="accent-color"
          name={ACCENT_COLOR_SETTING}
          type="color"
          defaultValue={loaded ?? DEFAULT_ACCENT_COLOR}
          onChange={(event) => {
            setSaved(false);
            applyAccentColor(event.target.value);
          }}
        />
        <button
          type="button"
          className="btn small btn-quick"
          data-testid="reset-accent"
          onClick={() => {
            save(DEFAULT_ACCENT_COLOR);
          }}
        >
          Reset to the original green
        </button>
      </div>

      {error !== null && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary btn-block form-actions" data-testid="save-appearance">
        {saved ? 'Saved' : 'Save appearance'}
      </button>
    </form>
  );
}
