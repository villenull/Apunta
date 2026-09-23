import {
  ACCENT_COLOR_SETTING,
  ANIMATIONS_SETTING,
  DEFAULT_ACCENT_COLOR,
  FONT_SIZE_SETTING,
  FONT_SIZES,
  LLM_PROFILE_SETTING,
  type LlmProfile,
  type Settings as SettingsRecord,
  type FontSize,
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
import { BackupAdvanced, BackupCard, useBackup } from '../components/BackupCard.js';
import { PlusIcon } from '../components/icons.js';
import { Screen } from '../components/TopBar.js';
import { useLoader } from '../hooks/useLoader.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import type { FormatDraft } from './formatDraft.js';

/**
 * `prototype/settings.html`, redesigned (owner, 2026-09-21): only what she
 * uses on the main screen — Appearance, Note formats, Backup, Import — and
 * everything else under one closed **Advanced** disclosure. Controls carry a
 * label and no explanation; a line of text appears only when leaving it out
 * could cost her data (a stale or failed backup, a sync-watched folder, a
 * passphrase that cannot be recovered). The reasons live in the code and in
 * `docs/decisions.md`.
 *
 * "Edit" reuses the onboarding confirm screen as the format editor: it is
 * already the name-plus-sections form, and M6 grows it further.
 */
export function Settings(): React.JSX.Element {
  useDocumentTitle('Settings');
  const loadFormats = useCallback((signal: AbortSignal) => listFormats(signal), []);
  const formats = useLoader(loadFormats);
  const backup = useBackup();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const newFormat: FormatDraft = { name: '', sections: [], returnTo: '/settings' };

  return (
    <Screen back={{ to: '/', label: 'Patients' }}>
      <div className="settings">
        <AppearanceSettings />
        <LlmProfileSettings />

        <section className="card settings-card" data-testid="format-list">
          <h2 className="settings-title">Note formats</h2>
          {formats.state.status === 'loading' && <p className="small state-note">Loading…</p>}
          {formats.state.status === 'error' && (
            <p className="small state-note error-state" role="alert">
              {formats.state.message}{' '}
              <button type="button" className="btn small btn-quick" onClick={formats.reload}>
                Try again
              </button>
            </p>
          )}
          {formats.state.status === 'ready' &&
            formats.state.data.map((format) => (
              <div className="patient-row settings-list-row" key={format.id}>
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
              className="patient-row settings-list-row format-add-row"
              data-testid="add-format"
            >
              <PlusIcon className="icon icon-sm" />
              Add another format
            </Link>
          )}
        </section>

        <BackupCard
          backup={backup}
          onRestore={() => {
            // The archives are under Advanced: open it and go there.
            setAdvancedOpen(true);
            requestAnimationFrame(() => {
              document.getElementById('backup-archives')?.scrollIntoView({ block: 'start' });
            });
          }}
        />

        <section className="card settings-card">
          <Link to="/import" className="settings-link-row" data-testid="settings-import">
            <span className="settings-title">Import from Claude</span>
            <span aria-hidden="true">›</span>
          </Link>
          <Link to="/import/halaxy" className="settings-link-row" data-testid="settings-import-halaxy">
            <span className="settings-title">Import from Halaxy</span>
            <span aria-hidden="true">›</span>
          </Link>
        </section>

        <details
          className="card settings-card settings-advanced"
          data-testid="settings-advanced"
          open={advancedOpen}
          onToggle={(event) => {
            setAdvancedOpen(event.currentTarget.open);
          }}
        >
          <summary className="settings-title">Advanced</summary>
          <div id="backup-archives">
            <BackupAdvanced backup={backup} />
          </div>
          <div className="settings-group">
            <h3 className="settings-subtitle">App</h3>
            <nav className="settings-links">
              <Link to="/setup">Setup</Link>
              <Link to="/about">About</Link>
              <Link to="/licenses">Licences</Link>
            </nav>
          </div>
        </details>
      </div>
    </Screen>
  );
}

function LlmProfileSettings(): React.JSX.Element | null {
  const load = useCallback((signal: AbortSignal) => getSettings(signal), []);
  const settings = useLoader(load);
  const [selected, setSelected] = useState<LlmProfile | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (settings.state.status === 'loading') return <p className="small state-note">Loading AI settings…</p>;
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

  const stored = settings.state.data as SettingsRecord;
  const available = (
    Array.isArray(stored.llm_available_profiles) ? stored.llm_available_profiles : []
  ).filter((profile): profile is LlmProfile => profile === 'quick' || profile === 'thorough');
  if (available.length < 2) return null;
  const effective =
    selected ??
    (stored.llm_effective_profile === 'quick' || stored.llm_effective_profile === 'thorough'
      ? stored.llm_effective_profile
      : (available[0] ?? 'quick'));

  const save = (profile: LlmProfile): void => {
    setSelected(profile);
    setSaved(false);
    void putSettings({ [LLM_PROFILE_SETTING]: profile })
      .then(() => {
        setSaved(true);
        setError(null);
      })
      .catch((thrown: unknown) => setError(errorMessage(thrown)));
  };

  return (
    <section className="card settings-card" data-testid="llm-profile-settings">
      <h2 className="settings-title">Drafting model</h2>
      <div className="settings-profile-options" role="radiogroup" aria-label="Drafting model">
        {(['quick', 'thorough'] as const)
          .filter((profile) => available.includes(profile))
          .map((profile) => (
            <button
              key={profile}
              type="button"
              role="radio"
              aria-checked={effective === profile}
              className={effective === profile ? 'settings-profile is-selected' : 'settings-profile'}
              data-testid={`llm-profile-${profile}`}
              onClick={() => save(profile)}
            >
              <span className="settings-profile-name">{profile === 'quick' ? 'Quick' : 'Thorough'}</span>
              <span className="small settings-profile-help">
                {profile === 'quick' ? 'Faster drafts.' : 'Slower, more careful drafts.'}
              </span>
            </button>
          ))}
      </div>
      {saved && <p className="small state-note">Saved.</p>}
      {error !== null && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
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
  const [accentColor, setAccentColor] = useState<string | null>(null);
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

  const shownAccent = accentColor ?? loaded ?? DEFAULT_ACCENT_COLOR;
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
      className="card settings-card"
      data-testid="appearance-settings"
      onSubmit={(event) => {
        event.preventDefault();
        save({
          [ACCENT_COLOR_SETTING]: shownAccent,
          [FONT_SIZE_SETTING]: shownSize,
          [ANIMATIONS_SETTING]: shownAnimations,
        });
      }}
    >
      <h2 className="settings-title">Appearance</h2>

      <div className="settings-row">
        <label className="settings-label" htmlFor="accent-color">
          Colour
        </label>
        <span className="settings-row-actions">
          <input
            id="accent-color"
            name={ACCENT_COLOR_SETTING}
            type="color"
            value={shownAccent}
            onChange={(event) => {
              setSaved(false);
              setAccentColor(event.target.value);
              applyAccentColor(event.target.value);
            }}
          />
          <button
            type="button"
            className="btn small btn-quick"
            data-testid="reset-accent"
            onClick={() => {
              setSaved(false);
              setAccentColor(DEFAULT_ACCENT_COLOR);
              applyAccentColor(DEFAULT_ACCENT_COLOR);
              save({ [ACCENT_COLOR_SETTING]: DEFAULT_ACCENT_COLOR });
            }}
          >
            Reset
          </button>
        </span>
      </div>

      <div className="settings-row">
        <span className="settings-label" id="font-size-label">
          Font size
        </span>
        <span
          className="settings-row-actions size-options"
          role="radiogroup"
          aria-labelledby="font-size-label"
        >
          {FONT_SIZES.map((size, index) => (
            <button
              key={size}
              type="button"
              role="radio"
              aria-checked={shownSize === size}
              tabIndex={shownSize === size ? 0 : -1}
              className={shownSize === size ? 'btn small btn-quick is-selected' : 'btn small btn-quick'}
              data-testid={`font-size-${size}`}
              onClick={() => {
                setSaved(false);
                setFontSize(size);
                applyFontSize(size);
              }}
              onKeyDown={(event) => {
                const direction =
                  event.key === 'ArrowRight' || event.key === 'ArrowDown'
                    ? 1
                    : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                      ? -1
                      : event.key === 'Home'
                        ? -index
                        : event.key === 'End'
                          ? FONT_SIZES.length - 1 - index
                          : 0;
                if (direction === 0) return;
                event.preventDefault();
                const nextIndex = (index + direction + FONT_SIZES.length) % FONT_SIZES.length;
                const next = FONT_SIZES[nextIndex];
                if (next === undefined) return;
                setSaved(false);
                setFontSize(next);
                applyFontSize(next);
                requestAnimationFrame(() => {
                  document.querySelector<HTMLButtonElement>(`[data-testid="font-size-${next}"]`)?.focus();
                });
              }}
            >
              {FONT_SIZE_LABELS[size]}
            </button>
          ))}
        </span>
      </div>

      <div className="settings-row">
        <label className="settings-label" htmlFor="animations-toggle">
          Animations
        </label>
        <input
          id="animations-toggle"
          type="checkbox"
          role="switch"
          className="settings-switch"
          checked={shownAnimations}
          data-testid="animations-toggle"
          onChange={(event) => {
            setSaved(false);
            setAnimations(event.target.checked);
            applyAnimations(event.target.checked);
          }}
        />
      </div>

      {error !== null && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="settings-actions">
        <button type="submit" className="btn btn-primary small" data-testid="save-appearance">
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>
    </form>
  );
}

const FONT_SIZE_LABELS: Readonly<Record<FontSize, string>> = {
  small: 'Small',
  default: 'Default',
  large: 'Large',
  'extra-large': 'Extra large',
};
