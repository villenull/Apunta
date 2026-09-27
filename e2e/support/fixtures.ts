import { t, type Locale, type MessageKey } from '@apunta/shared';
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

/** Unique per run, so specs sharing one database never collide on a name. */
export function uniqueName(prefix: string): string {
  return `${prefix} ${String(Date.now())}-${String(Math.floor(Math.random() * 10_000))}`;
}
