import {
  DEFAULT_LANGUAGE,
  LANGUAGE_SETTING,
  SPANISH_AVAILABLE_SETTING,
  UpdateSettingsRequestSchema,
  isLanguage,
  type Language,
  type Settings,
} from '@apunta/shared';
import type { Database } from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

import type { AppConfig } from '../config.js';
import { getSetting, putSettings } from '../db/settings.js';
import { settingsWithLlmProfiles } from '../ai/profiles.js';
import { HttpError, badRequest, languageUnavailable } from '../http/errors.js';
import { anyActive } from '../jobs/registry.js';
import { parseBody } from '../http/validate.js';

/**
 * The switch that offers Spanish at all (D12), read at request time exactly as
 * `routes/health.ts` reads `APUNTA_TEST_RUN_ID`: a variable, not an `AppConfig`
 * field, so nothing in the config loader, the test harness or the production
 * boot path has to learn that Spanish exists.
 */
const DEV_SPANISH_ENV = 'APUNTA_DEV_SPANISH';

/** The one locale a build can be asked for and refuse. */
const HELD_LOCALE = 'es-MX';

function spanishAvailable(): boolean {
  return process.env[DEV_SPANISH_ENV] === '1';
}

/**
 * The stored language, or English when there is no row.
 *
 * Synthesised rather than stored on first read so a client never has to tell
 * "unset" from English: `PUT { language: 'en' }` is a choice, and until she
 * makes one the table holds nothing at all.
 */
function storedLanguage(db: Database): Language {
  const value = getSetting<unknown>(db, LANGUAGE_SETTING);
  return isLanguage(value) ? value : DEFAULT_LANGUAGE;
}

async function responseFor(db: Database, options: { baseUrl?: string; fakeAi?: boolean }): Promise<Settings> {
  const settings = await settingsWithLlmProfiles(db, options);
  settings[LANGUAGE_SETTING] = storedLanguage(db);
  // Never stored: a build that holds Spanish says so in every response, and a
  // client cannot turn the offer on by writing a row.
  settings[SPANISH_AVAILABLE_SETTING] = spanishAvailable();
  return settings;
}

export function registerSettingsRoutes(app: FastifyInstance, db: Database, config?: AppConfig): void {
  const profileOptions: { baseUrl?: string; fakeAi?: boolean } = {};
  if (config?.ollamaUrl !== undefined) profileOptions.baseUrl = config.ollamaUrl;
  if (config?.fakeAi !== undefined) profileOptions.fakeAi = config.fakeAi;
  app.get('/api/settings', async (): Promise<Settings> => responseFor(db, profileOptions));

  /**
   * A merge, not a replace: a client that only knows about the vocabulary list
   * must not wipe the model choice by PUTting what it happens to hold.
   *
   * Two of the keys in a response are not settings. `spanish_available` is
   * dropped here rather than written, because a row the build invented would
   * outlive the build that made the offer; and `language` is checked against
   * the offer, so a request that asks for Spanish on a build that does not
   * offer it is refused with the code the client branches on rather than
   * silently stored. A language change while a job is running is refused too,
   * with a 409 `language_change_blocked`: the web control is already disabled
   * then, and this holds for a stale tab, a second tab or a direct call.
   */
  app.put('/api/settings', async (request): Promise<Settings> => {
    const patch = parseBody(UpdateSettingsRequestSchema, request.body);
    const writable: Settings = {};
    for (const [key, value] of Object.entries(patch)) {
      if (key === SPANISH_AVAILABLE_SETTING) continue;
      if (key === LANGUAGE_SETTING) {
        if (!isLanguage(value)) {
          throw badRequest('errors.bad_request.settings_bad_language', {}, { language: value });
        }
        if (value === HELD_LOCALE && !spanishAvailable()) {
          throw languageUnavailable();
        }
        // C-LANG@1 rule 6, the server's half: a job captured its locale when it
        // began, and a change landing under it would leave the job and the
        // screen in different languages. Only a *change* is refused — writing
        // back the language already stored is not one, and a second tab that
        // re-saves its settings must not fail for it.
        if (value !== storedLanguage(db) && anyActive()) {
          throw new HttpError(409, 'language_change_blocked', 'settings.languageChangeBlocked');
        }
      }
      writable[key] = value;
    }
    putSettings(db, writable);
    return responseFor(db, profileOptions);
  });
}
