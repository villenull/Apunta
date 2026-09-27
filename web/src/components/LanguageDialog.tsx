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
 * Claude writes it twice. The one place they would be identical is English, and
 * there the second line is dropped rather than printed twice.
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
      <div className="add-patient-head">
        <h2 className="heading-tight">{t('language.choose')}</h2>
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

      <ul className="language-grid" data-testid="language-grid">
        {offered.map((language) => {
          const here = language === chosen;
          return (
            <li key={language}>
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
                {here && <CheckIcon className="icon icon-sm language-option-check" />}
                <span className="language-option-endonym">{t(`language.${language}.endonym`)}</span>
                {t(`language.${language}.english`) !== t(`language.${language}.endonym`) && (
                  <span className="language-option-english">{t(`language.${language}.english`)}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {working && (
        <p className="small settings-row-note" role="status" data-testid="language-busy">
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
