import {
  ANIMATIONS_SETTING,
  FONT_FAMILIES,
  FONT_FAMILY_SETTING,
  FONT_SIZE_SETTING,
  FONT_SIZES,
  isFontFamily,
  LLM_PROFILE_SETTING,
  THEME_SETTING,
  THEMES,
  type FontFamily,
  type LlmProfile,
  type Settings as SettingsRecord,
  type FontSize,
  type Theme,
} from '@apunta/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { deleteFormat, errorMessage, listFormats } from '../api/index.js';
import {
  animationsEnabled,
  fontFamilyOrDefault,
  applyAnimations,
  applyFontFamily,
  applyFontSize,
  applyTheme,
  fontSizeOrDefault,
  themeOrDefault,
} from '../lib/appearance.js';
import { BackupSection, useBackup } from '../components/BackupCard.js';
import { BrandMark } from '../components/BrandMark.js';
import { useSettingsContext } from '../components/SettingsProvider.js';
import {
  BackIcon,
  CloseIcon,
  DatabaseIcon,
  DocumentIcon,
  HelpIcon,
  MonitorIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
} from '../components/icons.js';
import { useLoader } from '../hooks/useLoader.js';
import { useI18n, type Translate } from '../lib/i18n.js';
import type { FormatDraft } from './formatDraft.js';
import { FormatDraftEditor, type FormatDraftEditorHandle } from './FormatDraftEditor.js';
import { FormatEditor } from './FormatEditor.js';
import type { SettingsCloseRef } from './settingsClose.js';

/**
 * The repository: the one link that leaves the app (owner, 2026-10-05,
 * docs/decisions.md). She clicks it and her browser opens it in a new tab; the
 * app itself never requests it, so the egress rule is not crossed.
 */
// eslint-disable-next-line no-restricted-syntax -- user-clicked link, allow-listed in scripts/check-no-external-urls.mjs
const REPOSITORY_URL = 'https://github.com/villenull/Apunta';

/**
 * The one word in the About line that is a link. It is a proper noun in both
 * languages, so it is spelled the same here as it is in the catalogue, and the
 * line is split on this exact string (`aboutLine`) to put the anchor around
 * it and nothing else.
 */
const GITHUB_LABEL = 'Github';

/**
 * `prototype/settings.html`, redesigned (owner, 2026-09-21): Appearance, Note
 * formats, Backup and About — the four things she opens Settings for, and
 * nothing else. Advanced is gone (owner, 2026-10-05): everything that was in
 * it is either essential or a page she never came back to. The backup folder,
 * passphrase, archives and restore-verification nudge moved to the Backup tab,
 * where the card that guards her data already is; the one row that leaves the
 * app became the About pane. Controls carry a label and no explanation; a line
 * of text appears only when leaving it out could cost her data (a stale or
 * failed backup, a sync-watched folder, a passphrase that cannot be
 * recovered). The reasons live in the code and in `docs/decisions.md`.
 *
 * Every section is edited inside the modal (owner, 2026-10-05): including
 * the format editor, which is the same component the first-run flow asks its
 * questions with. Nothing in Settings navigates away any more.
 */

/**
 * The four sections, in Apunta's order and in the shape the owner's reference
 * gives them (owner, 2026-09-26, after Claude's settings): a tab per section
 * down the left of the modal, that one section on the right, each tab with the
 * icon Claude puts beside it.
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
    { id: 'about', label: t('settings.about'), icon: <HelpIcon className="icon icon-sm" /> },
  ] as const;
}

type SectionId = ReturnType<typeof sections>[number]['id'];

/**
 * Everything the settings body needs: the formats, the backup section, which
 * section is open, what the Format pane is showing, and whether the format in
 * the editor is on the server.
 */
function useSettingsStore(initialSection: SectionId = 'appearance') {
  const loadFormats = useCallback((signal: AbortSignal) => listFormats(signal), []);
  const formats = useLoader(loadFormats);
  const backup = useBackup();
  const [section, setSection] = useState<SectionId>(initialSection);
  const [formatView, setFormatView] = useState<FormatView>(FORMAT_LIST);
  /**
   * "Saved" beside the back arrow means one thing only: the format in the
   * editor is on the server. It is set from the editor's own answer and never
   * from the click that started the save, and it is cleared the moment she
   * types again — a status that survives the edit that made it untrue is worse
   * than no status (owner, 2026-10-05).
   */
  const [formatSaved, setFormatSaved] = useState(false);
  /**
   * The editor writes as she types, and the pane does not get to decide when
   * it has: every way out of the editor asks it first, and moves on only when
   * it says the server holds what is on screen (`FormatDraftEditorHandle`).
   */
  const editor = useRef<FormatDraftEditorHandle>(null);
  /**
   * Whether the format on screen is one the server already has. Only then is
   * there an edit worth writing: a format still being drafted has nothing on
   * the server to fall behind, and its own Save button is the answer, so the
   * create flow is left exactly as it was.
   */
  const hasSavedFormat = useCallback(
    () => formatView.kind === 'draft' && formatView.draft.formatId !== undefined,
    [formatView],
  );
  /**
   * Ask the editor to write what is on screen and report whether it did.
   * `false` means the editor is still mounted and is already saying why, so
   * nothing here repeats it — the caller stays exactly where it is.
   */
  const flushEditor = useCallback(async (): Promise<boolean> => {
    if (!hasSavedFormat()) return true;
    return (await editor.current?.flush()) ?? true;
  }, [hasSavedFormat]);
  /**
   * The nav picks the section, and the section is all it picks: the format
   * editor is a sub-view of the Format pane, so leaving that pane leaves the
   * sub-view too, and the back control goes with it (owner, 2026-10-05).
   *
   * It does not get to leave with an edit unwritten, though: the editor is
   * asked first and the switch happens on its answer, so switching sections
   * mid-edit cannot drop what she typed (owner, 2026-10-05).
   */
  const goToSection = useCallback(
    async (next: SectionId): Promise<void> => {
      if (!(await flushEditor())) return;
      setSection(next);
      setFormatView(FORMAT_LIST);
      setFormatSaved(false);
    },
    [flushEditor],
  );

  /**
   * Leaving the format editor: back to the list, and the list is re-read
   * because a standard format saved itself behind the editor.
   *
   * The re-read is the last step, not the first: it runs only once the editor
   * says the server holds what is on screen, so the name in the list is the
   * name she last typed rather than the one she started from (owner,
   * 2026-10-05).
   */
  function backToFormatList(): void {
    setFormatView(FORMAT_LIST);
    setFormatSaved(false);
    formats.reload();
  }

  /**
   * The back arrow, the nav and the close control all want the same thing: out
   * of the editor, with the screen written first. One place decides it, so no
   * way out can quietly skip the write.
   */
  const leaveEditor = useCallback(async (): Promise<void> => {
    if (!(await flushEditor())) return;
    backToFormatList();
  }, [flushEditor, formats]);

  /**
   * The pane's own close button. Like Escape on the dialog that holds it, it
   * goes through the editor first — and on a refusal it stays open with the
   * editor saying why, rather than closing over the edit.
   */
  const closeThroughEditor = useCallback(
    (onClose: () => void): (() => void) => {
      return () => {
        void flushEditor().then((may) => {
          if (may) onClose();
        });
      };
    },
    [flushEditor],
  );

  return {
    formats,
    backup,
    section,
    goToSection,
    formatView,
    editor,
    flushEditor,
    setFormatView,
    setFormatSaved,
    formatSaved,
    backToFormatList,
    leaveEditor,
    closeThroughEditor,
  };
}

type SettingsStore = ReturnType<typeof useSettingsStore>;

/**
 * What the Format pane is showing: her formats, the "how do I add one"
 * question, or the editor for the draft that question produced.
 */
type FormatView =
  | { readonly kind: 'list' }
  | { readonly kind: 'choose' }
  | { readonly kind: 'draft'; readonly draft: FormatDraft };

const FORMAT_LIST: FormatView = { kind: 'list' };

/**
 * The settings body in Claude's shape (owner, 2026-09-26): the sections down
 * the left as a nav, the open one on the right, and the close control at the
 * top right of the panel. No search field over the nav — Apunta has four
 * sections and none of them is long enough to need one, and a search box that
 * filters two of four rows is worse than no search box.
 *
 * `initialSection` is for the first-run restore door, which opens Settings on
 * the one section the person who clicked it came for.
 */
export function SettingsModalPanel({
  onClose,
  initialSection,
  closeRef,
}: {
  onClose: () => void;
  initialSection?: SectionId;
  /**
   * How a host modal asks before it unmounts this panel. Optional: a host that
   * has no other way out (a route, a test) closes on the button alone.
   */
  closeRef?: SettingsCloseRef;
}): React.JSX.Element {
  const { t } = useI18n();
  const store = useSettingsStore(initialSection);
  const editingFormat = store.formatView.kind !== 'list';
  const close = store.closeThroughEditor(onClose);

  // The panel's answer to "may I go?", kept fresh so Escape asked a moment ago
  // is answered by the editor as it is now, and withdrawn when the panel does.
  useEffect(() => {
    if (closeRef === undefined) return;
    closeRef.current = { close: store.flushEditor };
    return () => {
      closeRef.current = null;
    };
  }, [closeRef, store.flushEditor]);
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
              void store.goToSection(item.id);
            }}
          >
            {item.icon}
            <span className="settings-nav-label">{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="settings-pane">
        <div className="settings-pane-bar">
          {/* Editing a format replaces the pane's content, so the pane needs a
              way back before it closes the modal (owner, 2026-10-05). */}
          {editingFormat && (
            <>
              {/* "Saved" only once the server has the format, and it goes away
                  the moment she edits again — the status has to mean the thing
                  it says (owner, 2026-10-05). */}
              {store.formatSaved && (
                <span className="small settings-pane-saved" data-testid="settings-format-saved">
                  {t('common.saved')}
                </span>
              )}
              <button
                type="button"
                className="icon-btn"
                data-testid="settings-pane-back"
                aria-label={t('common.back')}
                onClick={() => {
                  void store.leaveEditor();
                }}
              >
                <BackIcon className="icon icon-sm" />
              </button>
            </>
          )}
          {/* Same contract as the pane's back arrow and as the dialog's Escape:
              nothing closes over an edit the server has not taken. */}
          <button
            type="button"
            className="icon-btn"
            aria-label={t('settings.closeLabel')}
            onClick={() => {
              void close();
            }}
          >
            <CloseIcon className="icon icon-sm" />
          </button>
        </div>
        <div className="settings-pane-body">
          <SettingsSections store={store} />
        </div>
      </div>
    </div>
  );
}

/** The one section the modal has open, in Apunta's order. */
function SettingsSections({ store }: { store: SettingsStore }): React.JSX.Element {
  const { t } = useI18n();
  return (
    <div className="settings">
      {store.section === 'appearance' && (
        <>
          <AppearanceSettings />
          <LlmProfileSettings />
        </>
      )}
      {store.section === 'format' && <FormatSection store={store} />}
      {store.section === 'backup' && <BackupSection backup={store.backup} />}
      {store.section === 'about' && <AboutSection t={t} />}
    </div>
  );
}

/**
 * About: the mark, the version, and the one link that leaves the app (owner,
 * 2026-10-05). Advanced held three pages she opened once and never came back
 * to — Setup, About and Licenses — and the code for all three was more than
 * this is. The repository says the same three things and stays true when they
 * change, so the link goes where the app's name is rather than on a row of
 * its own.
 *
 * Only the word "Github" is the link. A sentence whose whole line underlines
 * and turns teal reads as a button to a page she has not chosen yet, and the
 * line also carries the version, which is not a link to anything.
 */
function AboutSection({ t }: { t: Translate }): React.JSX.Element {
  return (
    <section className="card settings-card settings-about" data-testid="settings-about">
      <BrandMark className="settings-about-mark" />
      <p className="settings-about-line" data-testid="settings-about-line">
        {aboutLine(t)}
      </p>
    </section>
  );
}

/**
 * The About line with "Github" as the link and everything around it as text.
 *
 * The sentence is one catalogue entry with a `{github}` placeholder, because
 * the two languages do not put the word in the same place — "More about us on
 * Github" is not "Más sobre nosotros en Github" in the same order, and asking a
 * translator to hand back a sentence in two halves would be worse. So the
 * line is rendered with the word filled in, and then split on it: the piece
 * before and the piece after stay text and the word itself becomes the link.
 * `t` returns a string, so this is the only way to get a node inside a
 * sentence without cutting it into fragments.
 */
function aboutLine(t: Translate): React.JSX.Element {
  const [before, after] = t('settings.aboutLine', { github: GITHUB_LABEL }).split(GITHUB_LABEL);
  return (
    <>
      {before}
      <a
        className="settings-about-link"
        href={REPOSITORY_URL}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="settings-about-github"
      >
        {GITHUB_LABEL}
      </a>
      {after}
    </>
  );
}

/**
 * Format: her formats, and the editor in the same pane. The editor is the
 * onboarding one — adding a format asks exactly the question first run asks,
 * and editing one is the same name-and-sections form — with this host deciding
 * that "saved" means "back to the list", not "back to wherever the first-run
 * flow would have gone".
 *
 * Editing a format has no Save button and no Cancel: it saves as she types and
 * the back arrow is the only way out (owner, 2026-10-05). That is exactly why
 * the pane bar has to be able to say "Saved" — with nothing to press, the
 * status beside the arrow is the only place the answer can live, and it must
 * only appear once the server has the format.
 */
function FormatSection({ store }: { store: SettingsStore }): React.JSX.Element {
  const { t } = useI18n();
  const view = store.formatView;
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);

  /**
   * Delete goes through the same list she is looking at: the row disappears
   * because the list was read again, never because the pane forgot it. A
   * refusal — a format a note still points at, or the server being down —
   * leaves the row exactly where it was and says why, because a row that
   * vanishes with no word is the one outcome she could not recover from.
   */
  function remove(id: string): void {
    setDeletingId(id);
    setDeleteError(null);
    setDeleted(false);
    void deleteFormat(id).then(
      () => {
        setDeletingId(null);
        setDeleted(true);
        store.formats.reload();
      },
      (thrown: unknown) => {
        setDeletingId(null);
        setDeleteError(errorMessage(thrown));
      },
    );
  }

  if (view.kind === 'choose') {
    return (
      <>
        <h2 className="settings-title">{t('format.addTitle')}</h2>
        <p className="muted lede">{t('format.addLede')}</p>
        <FormatEditor
          // She already has a format here, most likely this one, so nothing
          // is preselected.
          initialChoice={null}
          onPreview={(draft) => {
            store.setFormatView({ kind: 'draft', draft });
          }}
          onSavedStateChange={store.setFormatSaved}
          onSaved={store.backToFormatList}
        />
      </>
    );
  }

  if (view.kind === 'draft') {
    return (
      <FormatDraftEditor
        ref={store.editor}
        draft={view.draft}
        onSavedStateChange={store.setFormatSaved}
        onSaved={store.backToFormatList}
        onCancel={store.backToFormatList}
      />
    );
  }

  return (
    <section className="card settings-card" data-testid="format-list">
      <h2 className="settings-title">{t('settings.formats')}</h2>
      {deleted && (
        <p className="small state-note" role="status" data-testid="format-deleted">
          {t('common.deleted')}
        </p>
      )}
      {deleteError !== null && (
        <p className="form-error" role="alert" data-testid="format-delete-error">
          {deleteError}
        </p>
      )}
      {store.formats.state.status === 'loading' && <p className="small state-note">{t('common.loading')}</p>}
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
            <span className="settings-list-actions">
              <button
                type="button"
                className="small settings-row-action"
                data-testid="edit-format"
                onClick={() => {
                  store.setFormatView({
                    kind: 'draft',
                    draft: {
                      name: format.name,
                      sections: format.sections,
                      formatId: format.id,
                      source: format.source,
                    },
                  });
                }}
              >
                {t('common.edit')}
              </button>
              {/* Right of Edit and no further away than that: the two act on
                  the same row, and a destructive action that needs a hunt to
                  find is not the one she asked for (owner, 2026-10-05). */}
              <button
                type="button"
                className="small settings-row-action-danger"
                data-testid="delete-format"
                disabled={deletingId !== null}
                onClick={() => {
                  remove(format.id);
                }}
              >
                {t('settings.deleteFormat')}
              </button>
            </span>
          </div>
        ))}
      {/* The card's last row, not a button floating between cards. */}
      {store.formats.state.status === 'ready' && (
        <button
          type="button"
          className="patient-row settings-list-row format-add-row"
          data-testid="add-format"
          onClick={() => {
            store.setFormatView({ kind: 'choose' });
          }}
        >
          <PlusIcon className="icon icon-sm" />
          {t('settings.addFormat')}
        </button>
      )}
    </section>
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
  const shownSize = fontSizeOrDefault(stored[FONT_SIZE_SETTING]);
  const shownAnimations = animationsEnabled(stored[ANIMATIONS_SETTING]);
  const shownTheme = themeOrDefault(stored[THEME_SETTING]);
  const shownFamily = fontFamilyOrDefault(stored[FONT_FAMILY_SETTING]);
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

      {/*
       * The typeface, as a dropdown like Claude's "Chat font" (owner,
       * 2026-09-28). It applies to the whole app; the wordmark is outlines, not
       * type, and keeps its own face.
       */}
      <div className="settings-row">
        <label className="settings-label" htmlFor="font-family">
          {t('settings.font')}
        </label>
        <select
          id="font-family"
          className="settings-select"
          value={shownFamily}
          data-testid="font-family"
          onChange={(event) => {
            const next = event.target.value;
            if (!isFontFamily(next)) return;
            applyFontFamily(next);
            save({ [FONT_FAMILY_SETTING]: next });
          }}
        >
          {FONT_FAMILIES.map((family) => (
            <option key={family} value={family}>
              {fontFamilyLabels(t)[family]}
            </option>
          ))}
        </select>
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
/** The typefaces, by the stored value; the bundled one is named for what it is. */
function fontFamilyLabels(t: Translate): Readonly<Record<FontFamily, string>> {
  return {
    inter: t('settings.fontInter'),
    system: t('settings.fontSystem'),
    serif: t('settings.fontSerif'),
  };
}

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
