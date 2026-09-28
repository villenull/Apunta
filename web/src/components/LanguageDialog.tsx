import { LANGUAGES, SPANISH_AVAILABLE_SETTING, LANGUAGE_SETTING, type Language } from '@apunta/shared';
import { useState } from 'react';

import { errorMessage } from '../api/index.js';
import { useI18n, useWorkInFlight } from '../lib/i18n.js';
import { useSettingsContext } from './SettingsProvider.js';
import { Dialog } from './Dialog.js';
import { CheckIcon, CloseIcon } from './icons.js';

/**
 * Choosing the language, as a small window over the workspace rather than a
 * settings row: every word in the app changes, and doing that from the middle of
 * a form is disorienting (owner, 2026-09-27, after Claude's language panel).
 *
 * Each option is the language's **own** name for itself with the region, and
 * under it the name in English — so someone who has landed here in Spanish can
 * still find their language from the English line, which is the whole reason
 * Claude writes it twice. **Every cell has both lines**, English included, as
 * Claude's does: dropping the repeat made the English cell a line shorter than
 * the Spanish one (owner, 2026-09-27).
 *
 * **Only the languages this build offers.** Spanish is a property of the build,
 * not of the settings row (C-LANG@1, and hard rule: Spanish is never enabled in
 * a release), so a build without it shows one option rather than a disabled one.
 * That gate is the same one the Settings row reads, deliberately: two places
 * deciding it separately is how a language appears in a release.
 */
export interface LanguageDialogProps {
  onClose: () => void;
}

export function LanguageDialog({ onClose }: LanguageDialogProps): React.JSX.Element {
  const { t } = useI18n();
  const settings = useSettingsContext();
  const working = useWorkInFlight();
  const [error, setError] = useState<string | null>(null);

  if (settings.state.status !== 'ready') return <></>;

  const stored = settings.state.data as Record<string, unknown>;
  const chosen: Language =
    stored[LANGUAGE_SETTING] === 'es-MX' || stored[LANGUAGE_SETTING] === 'en'
      ? (stored[LANGUAGE_SETTING] as Language)
      : 'en';
  const offered = stored[SPANISH_AVAILABLE_SETTING] === true ? LANGUAGES : (['en'] as const);

  function choose(language: Language): void {
    if (working || language === chosen) return;
    setError(null);
    void settings.update({ [LANGUAGE_SETTING]: language }).catch((thrown: unknown) => {
      setError(errorMessage(thrown));
    });
  }

  return (
    <Dialog
      title={t('language.choose')}
      onClose={onClose}
      showTitle={false}
      className="modal card language-modal"
      testId="language-dialog"
      backdropTestId="language-backdrop"
    >
      <div className="language-head">
        <h2 className="language-title">{t('language.choose')}</h2>
        <button
          type="button"
          className="icon-btn"
          aria-label={t('language.close')}
          data-testid="language-close"
          onClick={onClose}
        >
          <CloseIcon className="icon icon-sm" />
        </button>
      </div>

      {/*
       * A radio group named for the window, and pointed at the busy reason while
       * work is in flight — the same wiring the Settings row had, now that this
       * is the one place the language is chosen (owner, 2026-09-28).
       */}
      <ul
        className="language-grid"
        data-testid="language-grid"
        role="radiogroup"
        aria-label={t('language.choose')}
        aria-describedby={working ? 'language-busy' : undefined}
      >
        {offered.map((language) => {
          const here = language === chosen;
          return (
            <li key={language} role="none">
              <button
                type="button"
                role="radio"
                lang={language}
                aria-checked={here}
                className={here ? 'language-option is-current' : 'language-option'}
                data-testid={`language-option-${language}`}
                disabled={working}
                onClick={() => {
                  choose(language);
                }}
              >
                <span className="language-option-endonym">
                  <span className="language-option-name">{t(`language.${language}.endonym`)}</span>
                  {here && <CheckIcon className="icon icon-sm language-option-check" />}
                </span>
                <span className="language-option-english">{t(`language.${language}.english`)}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {working && (
        <p className="small settings-row-note" id="language-busy" role="status" data-testid="language-busy">
          {t('settings.languageChangeBlocked')}
        </p>
      )}
      {error !== null && (
        <p className="form-error" role="alert" data-testid="language-error">
          {error}
        </p>
      )}
    </Dialog>
  );
}
