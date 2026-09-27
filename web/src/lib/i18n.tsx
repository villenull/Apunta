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
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';

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
 * It sits *inside* `SettingsProvider`, above the router (`web/src/App.tsx`,
 * S2.3's mount), and it keeps `<html lang>` in step with the locale (S2.6).
 */
export function I18nProvider({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const { state } = useSettingsContext();
  const locale = state.status === 'ready' ? resolveLocale(state.data) : DEFAULT_LOCALE;
  // One object per locale, so a settings reload that does not change the
  // language does not re-render every screen that reads a message.
  const value = useMemo<I18nContextValue>(() => ({ locale, t: bound(locale) }), [locale]);
  // The document says which language it is in, so a screen reader reads
  // Spanish as Spanish and the browser's own spell check and hyphenation
  // follow the switch without a reload.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/*
 * Work in flight, for the Language control (C-LANG@1 rule 6).
 *
 * A job captures its locale when it starts, so a language change that landed
 * under a running job would leave the screen in one language and the job's
 * output in the other. The control is therefore disabled while anything is
 * running, and this is how it knows: each component that starts a job — a
 * recording, a transcription, a draft, a refine, a plan, a briefing, a
 * brainstorm, an import, a backup or restore — or a save reports it here while
 * it is in flight. The server's 409 `language_change_blocked` is the same rule
 * for a request that never saw this control.
 *
 * A counter, not a list: the control's question is only "is anything
 * running", and naming the job would put a sentence on screen that goes stale
 * the day a job is added.
 */
let workInFlight = 0;
const workListeners = new Set<() => void>();

function notifyWork(): void {
  for (const listener of workListeners) listener();
}

function subscribeWork(listener: () => void): () => void {
  workListeners.add(listener);
  return () => {
    workListeners.delete(listener);
  };
}

/**
 * Count one piece of work as running until the returned function is called.
 * The release is idempotent, so a `finally` that may run twice cannot drive
 * the count below what is really in flight.
 */
export function beginWork(): () => void {
  workInFlight += 1;
  notifyWork();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    workInFlight -= 1;
    notifyWork();
  };
}

/** Whether any job or save is in flight anywhere in the app. */
export function useWorkInFlight(): boolean {
  return useSyncExternalStore(
    subscribeWork,
    () => workInFlight > 0,
    () => false,
  );
}

/**
 * Report work while `active` is true: counted from the render it turns on to
 * the render it turns off, or to unmount — so a screen that is left mid-job
 * never leaves the control disabled behind it.
 */
export function useReportWork(active: boolean): void {
  useEffect(() => (active ? beginWork() : undefined), [active]);
}
