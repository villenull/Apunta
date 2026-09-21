import {
  ACCENT_COLOR_SETTING,
  ANIMATIONS_SETTING,
  DEFAULT_ACCENT_COLOR,
  FONT_SIZE_SETTING,
  FONT_SIZES,
  type FontSize,
  type Settings as SettingsRecord,
} from '@apunta/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';

import { errorMessage, getSettings, listFormats, putSettings } from '../api/index.js';
import { accentColorOrDefault, applyAccentColor } from '../lib/accent.js';
import {
  animationsEnabled,
  applyAnimations,
  applyAppearance,
  applyFontSize,
  fontSizeOrDefault,
} from '../lib/appearance.js';
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
      {/* Order (owner, 2026-09-21): Appearance, Note formats, Backup, then
          the rest as before. */}
      <AppearanceSettings />

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
        {/* The card's last row, not a button floating between cards. */}
        {formats.state.status === 'ready' && (
          <Link
            to="/onboarding/format"
            state={newFormat}
            className="patient-row format-add-row"
            data-testid="add-format"
          >
            <PlusIcon className="icon icon-sm" />
            Add another format
          </Link>
        )}
      </div>

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
 * Appearance: the accent colour (owner-proxy, 2026-08-30), text size and
 * animations (owner, 2026-09-21).
 *
 * Every control previews as it moves, because a colour or a size described
 * in a form and one on the screen are different things — but a preview is
 * not a choice, so leaving without saving puts the stored look back.
 */
function AppearanceSettings(): React.JSX.Element {
  const load = useCallback((signal: AbortSignal) => getSettings(signal), []);
  const settings = useLoader(load);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState<FontSize | null>(null);
  const [animations, setAnimations] = useState<boolean | null>(null);

  /*
   * The settings actually stored, which is what an abandoned preview must be
   * put back to. It is a ref because the unmount cleanup below reads it long
   * after the render that learned it — and it is written from a dependency
   * on the loaded *value*, never on every render: seeding it from the
   * loader's cached data each time meant a save was immediately forgotten,
   * and leaving the screen reverted the colour she had just chosen.
   */
  const savedRef = useRef<SettingsRecord | null>(null);
  const stored = settings.state.status === 'ready' ? (settings.state.data as SettingsRecord) : null;
  const loaded = stored === null ? null : accentColorOrDefault(stored[ACCENT_COLOR_SETTING]);

  useEffect(() => {
    if (stored !== null && savedRef.current === null) {
      savedRef.current = {
        [ACCENT_COLOR_SETTING]: stored[ACCENT_COLOR_SETTING] ?? null,
        [FONT_SIZE_SETTING]: stored[FONT_SIZE_SETTING] ?? null,
        [ANIMATIONS_SETTING]: stored[ANIMATIONS_SETTING] ?? null,
      };
    }
  }, [stored]);

  // A preview outlives this screen otherwise: she picks a colour, navigates
  // away without saving, and the app keeps wearing a look nothing stored.
  useEffect(() => {
    return () => {
      if (savedRef.current !== null) applyAppearance(savedRef.current);
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

  const shownSize = fontSize ?? fontSizeOrDefault(stored?.[FONT_SIZE_SETTING]);
  const shownAnimations = animations ?? animationsEnabled(stored?.[ANIMATIONS_SETTING]);

  const save = (patch: SettingsRecord): void => {
    void (async () => {
      try {
        await putSettings(patch);
        savedRef.current = { ...(savedRef.current ?? {}), ...patch };
        // Everything else saved is already on screen as its preview; only
        // the reset button saves a colour the picker is not showing.
        if (ACCENT_COLOR_SETTING in patch) applyAccentColor(patch[ACCENT_COLOR_SETTING]);
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
        save({
          [ACCENT_COLOR_SETTING]: String(form.get(ACCENT_COLOR_SETTING) ?? DEFAULT_ACCENT_COLOR),
          [FONT_SIZE_SETTING]: shownSize,
          [ANIMATIONS_SETTING]: shownAnimations,
        });
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
            save({ [ACCENT_COLOR_SETTING]: DEFAULT_ACCENT_COLOR });
          }}
        >
          Reset to the original green
        </button>
      </div>

      <fieldset className="appearance-field">
        <legend className="label">Text size</legend>
        <div className="row gap-8 size-options" role="radiogroup" aria-label="Text size">
          {FONT_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              role="radio"
              aria-checked={shownSize === size}
              className={shownSize === size ? 'btn small btn-quick is-selected' : 'btn small btn-quick'}
              data-testid={`font-size-${size}`}
              onClick={() => {
                setSaved(false);
                setFontSize(size);
                applyFontSize(size);
              }}
            >
              {FONT_SIZE_LABELS[size]}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="appearance-field">
        <legend className="label">Animations</legend>
        <label className="row gap-8 small">
          <input
            type="checkbox"
            checked={shownAnimations}
            data-testid="animations-toggle"
            onChange={(event) => {
              setSaved(false);
              setAnimations(event.target.checked);
              applyAnimations(event.target.checked);
            }}
          />
          <span>Screens and lists move as they appear</span>
        </label>
        <p className="small note-meta">Off by default when your computer is set to reduce motion.</p>
      </fieldset>

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

const FONT_SIZE_LABELS: Readonly<Record<FontSize, string>> = {
  small: 'Small',
  default: 'Default',
  large: 'Large',
  'extra-large': 'Extra large',
};
