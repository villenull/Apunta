import { closeSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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
 * The **appearance row** lock: one cross-process lock file, taken by name, for
 * the window that writes `theme` and reads it back.
 *
 * Why a lock and not a restore. `theme` is one global row (`GET`/`PUT
 * /api/settings`), and the suite runs `fullyParallel` against one server and
 * one data folder, so a spec that writes it and a spec that reads it back can
 * be in flight at the same moment. The repo already owns two answers to that,
 * and both are here or one step away: `storedLanguage` above, which puts the one
 * stored setting back before the next spec, and `tests/brand.spec.ts`'s
 * serial describe, whose `beforeAll` reads the row and whose `afterAll` puts it
 * back. Neither reaches this case, because the writers are in **three different
 * files** (`settings-appearance.spec.ts`, `workspace.spec.ts` and
 * `brand.spec.ts`): Playwright's `serial` mode orders tests within one file or
 * block and cannot stop another worker entering the same row at the same
 * moment, and a test-scoped fixture cannot reach a hook.
 *
 * Why a **file** and not a promise chain. Every test runs in its own worker
 * *process*, and with `fullyParallel` the tests that must serialise are
 * routinely in three or four processes at once — so a module-level mutex here
 * would coordinate nothing, and the only thing a suite-wide mutex would buy is
 * `workers: 1` with extra steps. `mkdirSync`/`openSync(path, 'wx')` either
 * creates the file or fails with `EEXIST`; there is no read-then-write window
 * to lose.
 *
 * **The shape, and what it costs.** One key, one path, under `APUNTA_DATA_DIR`
 * — this run's sandbox data folder, so the blast radius is this Playwright run
 * and never anything else, exactly as `brand.spec.ts:61-63` claims for the data
 * directory. Taken by **every** writer and asserter of the row, in a test or in
 * a hook, and by nothing else in the suite; never as an `{ auto: true }`
 * fixture, which every test in the suite would then take. Held for the
 * write-to-last-read-back window and released in a `finally`, so a test that
 * throws cannot deadlock the rest of the run. The wait is bounded at 20 s on a
 * short poll, deliberately below Playwright's 30 s default test timeout, so a
 * queue longer than the budget ends with **this** message — naming the elapsed
 * wait, the deadline and the worker holding the file — instead of an
 * indistinguishable `Test timeout of 30000ms exceeded`. The queue is bounded by
 * the worker count and not by the repeat count: Playwright runs at most `W`
 * tests at once, so at most `W − 1` wait and the worst wait is `(W − 1) × H`
 * for the longest hold `H`.
 */
const APPEARANCE_LOCK = 'appearance.lock';
const APPEARANCE_LOCK_DEADLINE_MS = 20_000;
const APPEARANCE_LOCK_POLL_MS = 50;

/** This process's own hold, so a nested acquire fails at once and not in 20 s. */
let heldSince: number | undefined;

/** `APUNTA_DATA_DIR` is the sandbox run's data folder, never a default. */
function appearanceLockPath(): string {
  const dataDir = process.env['APUNTA_DATA_DIR'];
  if (dataDir === undefined || dataDir === '') {
    throw new Error(
      `the appearance lock is ${APPEARANCE_LOCK} under APUNTA_DATA_DIR, and APUNTA_DATA_DIR is unset: run the suite through scripts/v2/sandbox.mjs, which points it at this run's sandbox folder`,
    );
  }
  return join(dataDir, APPEARANCE_LOCK);
}

/** Who holds the file, for the message a waiter leaves behind. */
function holderOf(path: string): string {
  let pid: string;
  try {
    pid = readFileSync(path, 'utf8').trim();
  } catch {
    return 'a worker whose pid could not be read';
  }
  return pid === '' ? 'a worker that recorded no pid' : `pid ${pid}`;
}

/**
 * Take the appearance lock, waiting up to 20 s. Call it once around one window
 * and pair it with `releaseAppearanceLock()` in a `finally`:
 *
 * ```ts
 * await acquireAppearanceLock();
 * try {
 *   await request.put('/api/settings', { data: { theme: 'dark' } });
 *   // … every assertion that reads that row back
 * } finally {
 *   releaseAppearanceLock();
 * }
 * ```
 *
 * It is **not re-entrant and never nested**: no caller takes it while it, or
 * its describe's hook, already holds it. A hook's hold and that describe's own
 * tests' holds are separate holds, which is why `brand.spec.ts`'s `beforeAll`
 * and `afterAll` each take a short one of their own instead of one across the
 * describe.
 */
export async function acquireAppearanceLock(): Promise<void> {
  if (heldSince !== undefined) {
    throw new Error(
      `this worker (pid ${String(process.pid)}) already holds the appearance lock (${APPEARANCE_LOCK}), held for ${String(Date.now() - heldSince)}ms: it is not re-entrant and never nested, so a hook's hold and its own tests' holds are separate holds around their own windows`,
    );
  }
  const path = appearanceLockPath();
  const startedAt = Date.now();
  for (;;) {
    try {
      const descriptor = openSync(path, 'wx');
      try {
        // The holder's pid, written at once: a waiter that reaches the
        // deadline has to be able to name who is holding the file, and an
        // empty file would have nothing to report.
        writeFileSync(descriptor, `${String(process.pid)}\n`);
      } finally {
        closeSync(descriptor);
      }
      heldSince = Date.now();
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const waited = Date.now() - startedAt;
      if (waited >= APPEARANCE_LOCK_DEADLINE_MS) {
        throw new Error(
          `the appearance lock (${path}) was still held by ${holderOf(path)} after ${String(waited)}ms, past its ${String(APPEARANCE_LOCK_DEADLINE_MS)}ms deadline. Only the specs that write or read the theme row take it, so a hold this long is one of them inside its window — or a killed worker left the file behind, in which case delete it in the sandbox run folder and re-run, never in the tree`,
          { cause: error },
        );
      }
      await new Promise((done) => {
        setTimeout(done, APPEARANCE_LOCK_POLL_MS);
      });
    }
  }
}

/**
 * Release the hold this process took. Removes the file it created; only the
 * holder ever calls it, and it sits after the window's own assertions, never
 * before them.
 */
export function releaseAppearanceLock(): void {
  const path = appearanceLockPath();
  const held = heldSince;
  heldSince = undefined;
  rmSync(path, { force: true });
  // `console.warn`, not `console.log`: the repo's eslint allows only warn/error.
  // The duration is the hold's own `H`, which V1 measures against its cap.
  if (held !== undefined) {
    console.warn(`appearance-lock: held ${String(Date.now() - held)}ms by pid ${String(process.pid)}`);
  }
}

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
