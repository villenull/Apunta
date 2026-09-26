import {
  ACCENT_COLOR_SETTING,
  ANIMATIONS_SETTING,
  DEFAULT_ACCENT_COLOR,
  FONT_SIZE_SETTING,
  FONT_SIZES,
  LLM_PROFILE_SETTING,
  THEME_SETTING,
  THEMES,
  type LlmProfile,
  type Settings as SettingsRecord,
  type FontSize,
  type Theme,
} from '@apunta/shared';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';

import { errorMessage, listFormats } from '../api/index.js';
import { accentColorOrDefault, applyAccentColor } from '../lib/accent.js';
import {
  animationsEnabled,
  applyAnimations,
  applyFontSize,
  applyTheme,
  fontSizeOrDefault,
  themeOrDefault,
} from '../lib/appearance.js';
import { BackupAdvanced, BackupCard, useBackup } from '../components/BackupCard.js';
import { useSettingsContext } from '../components/SettingsProvider.js';
import {
  CloseIcon,
  DatabaseIcon,
  DocumentIcon,
  DownloadIcon,
  MonitorIcon,
  MoonIcon,
  PlusIcon,
  SlidersIcon,
  SunIcon,
} from '../components/icons.js';
import { Screen } from '../components/TopBar.js';
import { useLoader } from '../hooks/useLoader.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useI18n, type Translate } from '../lib/i18n.js';
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

/**
 * The five sections, in Apunta's order and in the shape the owner's reference
 * gives them (owner, 2026-09-26, after Claude's settings): a tab per section
 * down the left of the modal, that one section on the right, each tab with the
 * icon Claude puts beside it. The standalone `/settings` screen shows the same
 * five in the same order one after another, which is the same thing without the
 * nav — so the two cannot drift.
 */
/**
 * The five sections, in Apunta's order and in the shape the owner's reference
 * gives them (owner, 2026-09-26, after Claude's settings): a tab per section
 * down the left of the modal, that one section on the right, each tab with the
 * icon Claude puts beside it. The standalone `/settings` screen shows the same
 * five in the same order one after another, which is the same thing without the
 * nav — so the two cannot drift.
 *
 * The labels are catalogue keys rather than the English they used to be, which
 * the literal checker could not see: `label` is a `PropertyAssignment`, and
 * `VISIBLE_PROPERTIES` (`check-ui-strings.mjs:77`) is the four visible
 * attributes only. The icon is a node, so it stays with the label.
 */
function sections(t: Translate) {
  return [
    { id: 'appearance', label: t('settings.appearance'), icon: <SunIcon className="icon icon-sm" /> },
    { id: 'format', label: t('settings.format'), icon: <DocumentIcon className="icon icon-sm" /> },
    { id: 'backup', label: t('settings.backup'), icon: <DatabaseIcon className="icon icon-sm" /> },
    { id: 'import', label: t('settings.import'), icon: <DownloadIcon className="icon icon-sm" /> },
    { id: 'advanced', label: t('settings.advanced'), icon: <SlidersIcon className="icon icon-sm" /> },
  ] as const;
}

type SectionId = ReturnType<typeof sections>[number]['id'];

export function Settings(): React.JSX.Element {
  const { t } = useI18n();
  return (
    <Screen back={{ to: '/', label: t('common.patients') }}>
      <SettingsPanel />
    </Screen>
  );
}

/**
 * Everything both hosts of the settings body need: the formats, the backup
 * card, which section is open, and the way to get to the archives from the
 * restore link. One store, so the modal and the screen cannot disagree about
 * what is loaded or what is open.
 */
function useSettingsStore() {
  const loadFormats = useCallback((signal: AbortSignal) => listFormats(signal), []);
  const formats = useLoader(loadFormats);
  const backup = useBackup();
  const [section, setSection] = useState<SectionId>('appearance');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // "Restore an old backup" is answered by the archives, which live under
  // Advanced. On the screen that means opening the disclosure; in the modal it
  // also means changing tab — so the store asks for both and scrolls once the
  // archives are actually on the page.
  const [wantArchives, setWantArchives] = useState(false);
  const goToArchives = useCallback(() => {
    setAdvancedOpen(true);
    setSection('advanced');
    setWantArchives(true);
  }, []);
  useEffect(() => {
    if (!wantArchives) return;
    const archives = document.getElementById('backup-archives');
    // Not on the page yet (the modal is a tab behind): wait for the section
    // change, which is in the dependency list below.
    if (archives === null) return;
    setWantArchives(false);
    archives.scrollIntoView({ block: 'start' });
  }, [wantArchives, section]);

  const newFormat: FormatDraft = { name: '', sections: [], returnTo: '/settings' };

  return { formats, backup, section, setSection, advancedOpen, setAdvancedOpen, goToArchives, newFormat };
}

type SettingsStore = ReturnType<typeof useSettingsStore>;

/**
 * The settings body on its own, without the screen around it: every section,
 * in order, as one scrolling column.
 */
export function SettingsPanel(): React.JSX.Element {
  const { t } = useI18n();
  useDocumentTitle(t('doc.settings'));
  const store = useSettingsStore();

  return <SettingsSections store={store} show={sections(t).map((item) => item.id)} />;
}

/**
 * The same body in Claude's shape (owner, 2026-09-26): the sections down the
 * left as a nav, the open one on the right, and the close control at the top
 * right of the panel. No search field over the nav — Apunta has five sections
 * and none of them is long enough to need one, and a search box that filters
 * two of five rows is worse than no search box.
 */
export function SettingsModalPanel({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { t } = useI18n();
  const store = useSettingsStore();

  return (
    <div className="settings-shell">
      <nav className="settings-nav" aria-label={t('settings.sectionsLabel')}>
        <h2 className="settings-nav-title">{t('doc.settings')}</h2>
        {sections(t).map((item) => (
          <button
            key={item.id}
            type="button"
            className={store.section === item.id ? 'settings-nav-item is-active' : 'settings-nav-item'}
            aria-current={store.section === item.id ? 'page' : undefined}
            data-testid={`settings-tab-${item.id}`}
            onClick={() => {
              store.setSection(item.id);
            }}
          >
            {item.icon}
            <span className="settings-nav-label">{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="settings-pane">
        <div className="settings-pane-bar">
          <button type="button" className="icon-btn" aria-label={t('settings.closeLabel')} onClick={onClose}>
            <CloseIcon className="icon icon-sm" />
          </button>
        </div>
        <div className="settings-pane-body">
          <SettingsSections store={store} show={[store.section]} />
        </div>
      </div>
    </div>
  );
}

/** The sections themselves, in the order asked for. */
function SettingsSections({
  store,
  show,
}: {
  store: SettingsStore;
  show: readonly SectionId[];
}): React.JSX.Element {
  const { t } = useI18n();
  return (
    <div className="settings">
      {show.includes('appearance') && (
        <>
          <AppearanceSettings />
          <LlmProfileSettings />
        </>
      )}
      {show.includes('format') && (
        <section className="card settings-card" data-testid="format-list">
          <h2 className="settings-title">{t('settings.formats')}</h2>
          {store.formats.state.status === 'loading' && (
            <p className="small state-note">{t('common.loading')}</p>
          )}
          {store.formats.state.status === 'error' && (
            <p className="small state-note error-state" role="alert">
              {store.formats.state.message}{' '}
              <button type="button" className="btn small btn-quick" onClick={store.formats.reload}>
                {t('common.tryAgain')}
              </button>
            </p>
          )}
          {store.formats.state.status === 'ready' &&
            store.formats.state.data.map((format) => (
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
                  {t('common.edit')}
                </Link>
              </div>
            ))}
          {/* The card's last row, not a button floating between cards. */}
          {store.formats.state.status === 'ready' && (
            <Link
              to="/onboarding/format"
              state={store.newFormat}
              className="patient-row settings-list-row format-add-row"
              data-testid="add-format"
            >
              <PlusIcon className="icon icon-sm" />
              {t('settings.addFormat')}
            </Link>
          )}
        </section>
      )}
      {show.includes('backup') && (
        <BackupCard
          backup={store.backup}
          onRestore={() => {
            store.goToArchives();
          }}
        />
      )}
      {show.includes('import') && (
        <section className="card settings-card">
          <Link to="/import" className="settings-link-row" data-testid="settings-import">
            <span className="settings-link-label">{t('settings.importClaude')}</span>
            <span aria-hidden="true">›</span>
          </Link>
          <Link to="/import/halaxy" className="settings-link-row" data-testid="settings-import-halaxy">
            <span className="settings-link-label">{t('settings.importHalaxy')}</span>
            <span aria-hidden="true">›</span>
          </Link>
        </section>
      )}
      {show.includes('advanced') && (
        <details
          className="card settings-card settings-advanced"
          data-testid="settings-advanced"
          open={store.advancedOpen}
          onToggle={(event) => {
            store.setAdvancedOpen(event.currentTarget.open);
          }}
        >
          <summary className="settings-title">{t('settings.advanced')}</summary>
          <div id="backup-archives">
            <BackupAdvanced backup={store.backup} />
          </div>
          <div className="settings-group">
            <h3 className="settings-subtitle">{t('settings.app')}</h3>
            <nav className="settings-links">
              <Link to="/setup">{t('common.setup')}</Link>
              <Link to="/about">{t('settings.about')}</Link>
              <Link to="/licenses">{t('doc.licences')}</Link>
            </nav>
          </div>
        </details>
      )}
    </div>
  );
}
function LlmProfileSettings(): React.JSX.Element | null {
  const { t } = useI18n();
  const settings = useSettingsContext();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (settings.state.status === 'loading')
    return <p className="small state-note">{t('settings.loadingAi')}</p>;
  if (settings.state.status === 'error') {
    return (
      <p className="small state-note error-state" role="alert">
        {settings.state.message}{' '}
        <button type="button" className="btn small btn-quick" onClick={settings.reload}>
          {t('common.tryAgain')}
        </button>
      </p>
    );
  }

  const stored = settings.state.data as SettingsRecord;
  const available = (
    Array.isArray(stored.llm_available_profiles) ? stored.llm_available_profiles : []
  ).filter((profile): profile is LlmProfile => profile === 'quick' || profile === 'thorough');
  if (available.length < 2) return null;
  const offered = (['quick', 'thorough'] as const).filter((profile) => available.includes(profile));
  /*
   * Her own choice first, then what the server says it will use. The choice is
   * a stored setting, so it is read from the provider like every other one —
   * which is also what makes the click below show at once instead of waiting
   * for a round trip (C-SETTINGS@1).
   */
  const chosen = stored[LLM_PROFILE_SETTING];
  const effective = offered.includes(chosen as LlmProfile)
    ? (chosen as LlmProfile)
    : offered.includes(stored.llm_effective_profile as LlmProfile)
      ? (stored.llm_effective_profile as LlmProfile)
      : (offered[0] ?? 'quick');

  const save = (profile: LlmProfile): void => {
    setSaved(false);
    void settings.update({ [LLM_PROFILE_SETTING]: profile }).then(
      () => {
        setSaved(true);
        setError(null);
      },
      (thrown: unknown) => {
        setSaved(false);
        setError(errorMessage(thrown));
      },
    );
  };

  return (
    <section className="card settings-card" data-testid="llm-profile-settings">
      <h2 className="settings-title">{t('settings.draftingModel')}</h2>
      <div className="settings-profile-options" role="radiogroup" aria-label={t('settings.draftingModel')}>
        {offered.map((profile, index) => (
          <button
            key={profile}
            type="button"
            role="radio"
            aria-checked={effective === profile}
            // One tab stop, on the selected option, like the theme and text
            // size groups: Tab lands where the choice already is.
            tabIndex={effective === profile ? 0 : -1}
            className={effective === profile ? 'settings-profile is-selected' : 'settings-profile'}
            data-testid={`llm-profile-${profile}`}
            onClick={() => {
              save(profile);
            }}
            onKeyDown={(event) => {
              const next = rovingTarget(event, index, offered.length);
              if (next === undefined) return;
              event.preventDefault();
              const nextProfile = offered[next];
              if (nextProfile === undefined) return;
              save(nextProfile);
              requestAnimationFrame(() => {
                document
                  .querySelector<HTMLButtonElement>(`[data-testid="llm-profile-${nextProfile}"]`)
                  ?.focus();
              });
            }}
          >
            <span className="settings-profile-name">
              {profile === 'quick' ? t('settings.quick') : t('settings.thorough')}
            </span>
            <span className="small settings-profile-help">
              {profile === 'quick' ? t('settings.quickHelp') : t('settings.thoroughHelp')}
            </span>
          </button>
        ))}
      </div>
      {saved && <p className="small state-note">{t('settings.savedDot')}</p>}
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
 * Every control saves as it moves, so what she sees is what is stored —
 * there is no unsaved preview left to put back on leaving. What each row
 * *shows* is the provider's own value, never a copy of it: leaving the screen
 * and coming back must not find a card that disagrees with the page it was
 * painted from (C-SETTINGS@1).
 */
function AppearanceSettings(): React.JSX.Element {
  const { t } = useI18n();
  const settings = useSettingsContext();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (settings.state.status === 'loading') return <p className="small state-note">{t('settings.loading')}</p>;
  if (settings.state.status === 'error') {
    return (
      <p className="small state-note error-state" role="alert">
        {settings.state.message}{' '}
        <button type="button" className="btn small btn-quick" onClick={settings.reload}>
          {t('common.tryAgain')}
        </button>
      </p>
    );
  }

  const stored = settings.state.data as SettingsRecord;
  const shownAccent = accentColorOrDefault(stored[ACCENT_COLOR_SETTING]);
  const shownSize = fontSizeOrDefault(stored[FONT_SIZE_SETTING]);
  const shownAnimations = animationsEnabled(stored[ANIMATIONS_SETTING]);
  const shownTheme = themeOrDefault(stored[THEME_SETTING]);
  const save = (patch: SettingsRecord): void => {
    void settings.update(patch).then(
      () => {
        setSaved(true);
        setError(null);
      },
      (thrown: unknown) => {
        setSaved(false);
        setError(errorMessage(thrown));
      },
    );
  };

  return (
    <section className="card settings-card" data-testid="appearance-settings">
      <div className="settings-card-header">
        <h2 className="settings-title">{t('settings.appearance')}</h2>
        {saved && (
          <span className="settings-saved" data-testid="appearance-saved">
            {t('note.saveSaved')}
          </span>
        )}
      </div>

      <div className="settings-row">
        <label className="settings-label" htmlFor="accent-color">
          {t('settings.colour')}
        </label>
        <span className="settings-row-actions">
          <input
            id="accent-color"
            name={ACCENT_COLOR_SETTING}
            type="color"
            value={shownAccent}
            onChange={(event) => {
              const next = event.target.value;
              applyAccentColor(next);
              save({ [ACCENT_COLOR_SETTING]: next });
            }}
          />
          <button
            type="button"
            className="btn small btn-quick"
            data-testid="reset-accent"
            onClick={() => {
              applyAccentColor(DEFAULT_ACCENT_COLOR);
              save({ [ACCENT_COLOR_SETTING]: DEFAULT_ACCENT_COLOR });
            }}
          >
            {t('settings.reset')}
          </button>
        </span>
      </div>

      <div className="settings-row">
        <span className="settings-label" id="theme-label">
          {t('settings.theme')}
        </span>
        <ThemeSwitcher
          value={shownTheme}
          onChoose={(option) => {
            applyTheme(option);
            save({ [THEME_SETTING]: option });
          }}
        />
      </div>

      <div className="settings-row">
        <span className="settings-label" id="font-size-label">
          {t('settings.fontSize')}
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
                applyFontSize(size);
                save({ [FONT_SIZE_SETTING]: size });
              }}
              onKeyDown={(event) => {
                const next = rovingTarget(event, index, FONT_SIZES.length);
                if (next === undefined) return;
                event.preventDefault();
                const nextSize = FONT_SIZES[next];
                if (nextSize === undefined) return;
                applyFontSize(nextSize);
                save({ [FONT_SIZE_SETTING]: nextSize });
                requestAnimationFrame(() => {
                  document.querySelector<HTMLButtonElement>(`[data-testid="font-size-${nextSize}"]`)?.focus();
                });
              }}
            >
              {fontSizeLabels(t)[size]}
            </button>
          ))}
        </span>
      </div>

      <div className="settings-row">
        <label className="settings-label" htmlFor="animations-toggle">
          {t('settings.animations')}
        </label>
        <input
          id="animations-toggle"
          type="checkbox"
          role="switch"
          className="settings-switch"
          checked={shownAnimations}
          data-testid="animations-toggle"
          onChange={(event) => {
            const next = event.target.checked;
            applyAnimations(next);
            save({ [ANIMATIONS_SETTING]: next });
          }}
        />
      </div>

      {error !== null && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/**
 * The four text sizes and the three themes, by the stored value.
 *
 * Both were module-level records of English. The stored value is data and is
 * never translated (Fixed decision 4), so each is a key of its own.
 */
function fontSizeLabels(t: Translate): Readonly<Record<FontSize, string>> {
  return {
    small: t('settings.sizeSmall'),
    default: t('settings.sizeDefault'),
    large: t('settings.sizeLarge'),
    'extra-large': t('settings.sizeExtraLarge'),
  };
}

function themeLabels(t: Translate): Readonly<Record<Theme, string>> {
  return {
    system: t('settings.themeSystem'),
    light: t('settings.themeLight'),
    dark: t('settings.themeDark'),
  };
}

/** One glyph per theme, in the order `THEMES` gives: monitor, sun, moon. */
const THEME_ICONS: Readonly<Record<Theme, React.JSX.Element>> = {
  system: <MonitorIcon className="icon icon-sm" />,
  light: <SunIcon className="icon icon-sm" />,
  dark: <MoonIcon className="icon icon-sm" />,
};

/**
 * Theme as a segmented pill of three icons (owner, 2026-09-26, after Claude's
 * own switcher): the pictures are enough on their own, and a row of three text
 * buttons is wider than the control is tall. Each is still a `radio` in a
 * `radiogroup` under the row's own label, and the label — plus the tooltip on
 * each segment — is what says which is which, so the group is not three
 * unlabelled pictures.
 */
function ThemeSwitcher({
  value,
  onChoose,
}: {
  value: Theme;
  onChoose: (theme: Theme) => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const labels = themeLabels(t);
  return (
    <span className="theme-switch" role="radiogroup" aria-labelledby="theme-label">
      {THEMES.map((option, index) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          aria-label={labels[option]}
          title={labels[option]}
          tabIndex={value === option ? 0 : -1}
          className={value === option ? 'theme-switch-btn is-selected' : 'theme-switch-btn'}
          data-testid={`theme-${option}`}
          onClick={() => {
            onChoose(option);
          }}
          onKeyDown={(event) => {
            const next = rovingTarget(event, index, THEMES.length);
            if (next === undefined) return;
            event.preventDefault();
            const option = THEMES[next];
            if (option === undefined) return;
            onChoose(option);
            requestAnimationFrame(() => {
              document.querySelector<HTMLButtonElement>(`[data-testid="theme-${option}"]`)?.focus();
            });
          }}
        >
          {THEME_ICONS[option]}
        </button>
      ))}
    </span>
  );
}

/**
 * Which option an arrow key moves to, or `undefined` when the key is not one of
 * them. A radiogroup has one tab stop, so the arrows are the only way to reach
 * the other segments from the keyboard.
 */
function rovingTarget(event: React.KeyboardEvent, index: number, length: number): number | undefined {
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') return (index + 1) % length;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') return (index - 1 + length) % length;
  if (event.key === 'Home') return 0;
  if (event.key === 'End') return length - 1;
  return undefined;
}
