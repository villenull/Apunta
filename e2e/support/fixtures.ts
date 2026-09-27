import { en, esMX, t, type Locale, type MessageKey } from '@apunta/shared';
import { test as base, expect, type Page } from '@playwright/test';

import { expectNoEnglishUi } from './no-english';

/** The option each project sets: which language its server's app is in. */
export interface AppOptions {
  readonly appLocale: Locale;
}

/** `t()` bound to the project's language — what a language-aware assertion names. */
export type Tr = (key: MessageKey, params?: Parameters<typeof t>[1]) => string;

interface Fixtures {
  consoleErrors: string[];
  /** The project's words for a key, so one spec asserts in either language. */
  tr: Tr;
  /**
   * The project's words for a key as a pattern: the values in `params` rendered
   * as `t()` renders them (so a count still picks its plural form), and every
   * other `{name}` a wildcard, empty included — for a sentence whose remaining
   * values the spec does not control (a size, a path, a limit).
   */
  trRe: (key: MessageKey, params?: Parameters<typeof t>[1]) => RegExp;
  /**
   * `expectNoEnglishUi` in the es-MX project, and nothing in English. Called
   * once a screen has settled, with the screen's name.
   */
  checkScreen: (page: Page, screen: string) => Promise<void>;
  /** The es-MX server's stored language is Spanish before the spec starts. */
  storedLanguage: undefined;
}

/**
 * The base test, plus one rule the packet asks for: a spec fails if the page
 * logged an error or threw. A React app that "works" while shouting into the
 * console is not working — an unhandled rejection or a key warning is exactly
 * the class of bug an e2e run should catch.
 */
export const test = base.extend<Fixtures & AppOptions>({
  appLocale: ['en', { option: true }],
  storedLanguage: [
    async ({ appLocale, request }, use) => {
      // The English project's server does not offer Spanish, so there is
      // nothing to set. The Spanish one starts empty, and a stored language is
      // one PUT; asked for every spec, so a spec that left English behind cannot
      // leave the next one in it.
      if (appLocale === 'es-MX') {
        const response = await request.put('/api/settings', { data: { language: 'es-MX' } });
        expect(response.status(), 'the es-MX server accepted Spanish').toBe(200);
      }
      await use(undefined);
    },
    { auto: true },
  ],
  tr: async ({ appLocale }, use) => {
    await use((key, params) => t(key, params, appLocale));
  },
  trRe: async ({ appLocale }, use) => {
    await use((key, params) => messagePattern(key, appLocale, params));
  },
  checkScreen: async ({ appLocale }, use) => {
    await use(async (page, screen) => {
      if (appLocale === 'es-MX') await expectNoEnglishUi(page, screen);
    });
  },
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('pageerror', (error) => {
        errors.push(`uncaught: ${error.message}`);
      });

      await use(errors);

      expect(errors, 'the page logged console errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/**
 * `key`'s text in `locale` as a pattern, every value the caller leaves out a
 * wildcard (empty included).
 *
 * When the entry has no plural map, or the caller gave its count, the text is
 * rendered by `t()` itself — so the count picks its form and numbers are
 * grouped the locale's way — with a sentinel for each missing value, and each
 * sentinel becomes the wildcard. With the count left open, every plural form
 * is an alternative, the given values written in as they are.
 */
export function messagePattern(
  key: MessageKey,
  locale: Locale,
  params: Parameters<typeof t>[1] = {},
): RegExp {
  const entry = (locale === 'en' ? en : esMX)[key] as {
    text: string;
    plural?: Partial<Record<string, string>>;
    kind?: Record<string, string>;
  };
  const escape = (literal: string): string => literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const counted = Object.entries(entry.kind ?? {}).find(([, kind]) => kind === 'number')?.[0];
  const forms = [entry.text, ...Object.values(entry.plural ?? {})].filter(
    (form): form is string => form !== undefined,
  );

  if (entry.plural !== undefined && counted !== undefined && !(counted in params)) {
    const alternatives = [...new Set(forms)].map((form) =>
      form
        .split(/(\{\w+\})/)
        .map((part) => {
          const name = /^\{(\w+)\}$/.exec(part)?.[1];
          if (name === undefined) return escape(part);
          const given = params[name];
          return given === undefined ? '.*?' : escape(String(given));
        })
        .join(''),
    );
    return new RegExp(alternatives.join('|'));
  }

  const names = [
    ...new Set(forms.flatMap((form) => [...form.matchAll(/\{(\w+)\}/g)].map((match) => match[1]))),
  ];
  const filled: Record<string, string | number> = { ...params };
  const sentinels: string[] = [];
  names.forEach((name, index) => {
    if (name === undefined || name in filled) return;
    if (entry.kind?.[name] === 'number') {
      const value = 987_650 + index;
      filled[name] = value;
      sentinels.push(new Intl.NumberFormat(locale).format(value));
    } else {
      const value = `\u0000${name}\u0000`;
      filled[name] = value;
      sentinels.push(value);
    }
  });
  let source = escape(t(key, filled, locale));
  for (const sentinel of sentinels) source = source.split(escape(sentinel)).join('.*?');
  return new RegExp(source);
}

/** Unique per run, so specs sharing one database never collide on a name. */
export function uniqueName(prefix: string): string {
  return `${prefix} ${String(Date.now())}-${String(Math.floor(Math.random() * 10_000))}`;
}
