import {
  DEFAULT_LOCALE,
  isLanguage,
  LANGUAGE_SETTING,
  SPANISH_AVAILABLE_SETTING,
  t as translate,
  type Locale,
  type MessageKey,
  type Settings,
} from '@apunta/shared';
import { createContext, useContext, useMemo } from 'react';

import { useSettingsContext } from '../components/SettingsProvider.js';

/**
 * `t` with its locale fixed — what a screen calls.
 *
 * The parameter type is read off `t` rather than imported, so the hook's
 * signature cannot drift from the one the catalogue defines while the
 * `MessageKey` it takes comes from the one union every key belongs to.
 */
export type Translate = (key: MessageKey, params?: Parameters<typeof translate>[1]) => string;

export interface I18nContextValue {
  /** The locale the strings are being rendered in right now. */
  readonly locale: Locale;
  readonly t: Translate;
}

function bound(locale: Locale): Translate {
  return (key, params) => translate(key, params, locale);
}

/**
 * English, before anything is known.
 *
 * The default is the one the whole app is written in (D11: every document that
 * exists today is English), so a provider with no settings loaded — or one
 * mounted without `SettingsProvider` at all — says what it has always said
 * rather than nothing.
 */
const ENGLISH: I18nContextValue = { locale: DEFAULT_LOCALE, t: bound(DEFAULT_LOCALE) };

const I18nContext = createContext<I18nContextValue>(ENGLISH);

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

/**
 * Which locale the stored settings actually license.
 *
 * C-LANG@1 rule 1: `es-MX` is a setting the server only accepts when
 * `spanish_available` is true, and `spanish_available` is a property of the
 * build rather than a row a client can write (S2.1's `PUT` drops it). So a
 * stored `es-MX` on a build that does not offer Spanish is honoured as
 * English: the control that would have changed it is hidden, and nothing in
 * the app may paint a locale this build cannot finish.
 */
function resolveLocale(settings: Settings): Locale {
  const stored = settings[LANGUAGE_SETTING];
  if (!isLanguage(stored)) return DEFAULT_LOCALE;
  if (stored === 'es-MX' && settings[SPANISH_AVAILABLE_SETTING] !== true) return DEFAULT_LOCALE;
  return stored;
}

/**
 * The provider a screen reads its language through.
 *
 * It reads the `language` setting through C-SETTINGS@1 — `SettingsProvider`'s
 * own state — and never a second `GET /api/settings`: one stored value, one
 * owner, and a language change is whatever the settings provider says it is,
 * including its optimistic apply and its rollback.
 *
 * It sits *inside* `SettingsProvider` and beside it in the tree. It is not
 * mounted in `web/src/App.tsx` by the card that added it, because no S2 card
 * is licensed to edit that file: **S2.3** owns the mount (the import and the
 * wrapper element around `<AppRoutes />`, no string), and S2.6's `<html lang>`
 * depends on it. Until that amendment lands this provider is reachable only
 * from a test that mounts both itself, which is what `i18n.test.tsx` does.
 */
export function I18nProvider({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const { state } = useSettingsContext();
  const locale = state.status === 'ready' ? resolveLocale(state.data) : DEFAULT_LOCALE;
  // One object per locale, so a settings reload that does not change the
  // language does not re-render every screen that reads a message.
  const value = useMemo<I18nContextValue>(() => ({ locale, t: bound(locale) }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
