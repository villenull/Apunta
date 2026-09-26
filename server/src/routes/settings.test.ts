import { SettingsSchema, t, type Settings } from '@apunta/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, type TestApp } from '../test/harness.js';

let harness: TestApp;

beforeEach(async () => {
  harness = await createTestApp();
});

afterEach(async () => {
  await harness.close();
});

/** The stored rows, read straight from the table rather than the response. */
function storedRows(): Record<string, string> {
  const rows = harness.db.prepare('SELECT key, value FROM settings ORDER BY key').all() as {
    key: string;
    value: string;
  }[];
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

describe('GET /api/settings', () => {
  it('starts with only the promoted Quick profile', async () => {
    const response = await harness.app.inject({ method: 'GET', url: '/api/settings' });

    expect(response.statusCode).toBe(200);
    // Exhaustive over the whole response, and the two C-LANG@1 rule 1 keys are
    // the only difference from before: `language` is synthesised as English and
    // `spanish_available` as false, because this build offers no Spanish.
    expect(SettingsSchema.parse(response.json())).toEqual({
      llm_available_profiles: ['quick'],
      llm_effective_profile: 'quick',
      language: 'en',
      spanish_available: false,
    });
  });
});

describe('PUT /api/settings', () => {
  it('merges rather than replaces, and preserves value types', async () => {
    await harness.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { llm_model: 'gemma4:12b', keep_audio: false },
    });

    const second = await harness.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { stt_vocabulary: ['sertraline', 'CBT'] },
    });

    expect(second.statusCode).toBe(200);
    expect(second.json<Settings>()).toEqual({
      llm_model: 'gemma4:12b',
      keep_audio: false,
      stt_vocabulary: ['sertraline', 'CBT'],
      llm_available_profiles: ['quick'],
      llm_effective_profile: 'quick',
      language: 'en',
      spanish_available: false,
    });

    const reread = await harness.app.inject({ method: 'GET', url: '/api/settings' });
    expect(reread.json<Settings>().keep_audio).toBe(false);
  });

  it('overwrites a key that is sent again', async () => {
    await harness.app.inject({ method: 'PUT', url: '/api/settings', payload: { llm_model: 'first' } });
    const response = await harness.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { llm_model: 'second' },
    });

    expect(response.json<Settings>()).toEqual({
      llm_model: 'second',
      llm_available_profiles: ['quick'],
      llm_effective_profile: 'quick',
      language: 'en',
      spanish_available: false,
    });
  });

  it('400s keys that are not lower_snake_case identifiers', async () => {
    for (const payload of [{ 'Not A Key': 1 }, { '': 1 }, { '1bad': true }]) {
      const response = await harness.app.inject({ method: 'PUT', url: '/api/settings', payload });
      expect(response.statusCode).toBe(400);
    }
  });

  it('400s a body that is not an object', async () => {
    const response = await harness.app.inject({ method: 'PUT', url: '/api/settings', payload: ['nope'] });

    expect(response.statusCode).toBe(400);
  });
});

/**
 * C-LANG@1 rule 1. The switch that offers Spanish at all is read from the
 * environment at request time, so every case here starts from "not set" and
 * puts the environment back exactly as it found it — deleting the variable when
 * it was absent, so no later case in this file can inherit it.
 */
const DEV_SPANISH = 'APUNTA_DEV_SPANISH';

describe('C-LANG@1 rule 1 — the language', () => {
  let previous: string | undefined;

  beforeEach(() => {
    previous = process.env[DEV_SPANISH];
    delete process.env[DEV_SPANISH];
  });

  afterEach(() => {
    if (previous === undefined) delete process.env[DEV_SPANISH];
    else process.env[DEV_SPANISH] = previous;
  });

  it('answers English with no language row at all on a fresh install', async () => {
    const response = await harness.app.inject({ method: 'GET', url: '/api/settings' });

    expect(response.statusCode).toBe(200);
    expect(SettingsSchema.parse(response.json())).toEqual({
      llm_available_profiles: ['quick'],
      llm_effective_profile: 'quick',
      language: 'en',
      spanish_available: false,
    });
    // Synthesised, not defaulted into the table: nothing is written until she
    // actually chooses Español.
    expect(storedRows()).toEqual({});
  });

  it('refuses es-MX with language_unavailable, and writes nothing, when Spanish is not offered', async () => {
    const response = await harness.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { language: 'es-MX' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'language_unavailable',
      message:
        'Español is not available in this build of Apunta. Choose English, or install the Spanish edition.',
    });
    expect(storedRows()).toEqual({});

    // Still English, and still offering nothing beyond it.
    const reread = await harness.app.inject({ method: 'GET', url: '/api/settings' });
    expect(reread.json<Settings>()).toMatchObject({ language: 'en', spanish_available: false });
  });

  it('stores es-MX when the build offers it, and reads the row back as es-MX', async () => {
    process.env[DEV_SPANISH] = '1';

    const offered = await harness.app.inject({ method: 'GET', url: '/api/settings' });
    expect(offered.json<Settings>()).toMatchObject({ language: 'en', spanish_available: true });

    const response = await harness.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { language: 'es-MX' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<Settings>()).toEqual({
      llm_available_profiles: ['quick'],
      llm_effective_profile: 'quick',
      language: 'es-MX',
      spanish_available: true,
    });
    // The column holds JSON, so the row reads back as the string with its quotes.
    expect(storedRows()).toEqual({ language: '"es-MX"' });

    // And switching back to English is a choice like any other.
    const back = await harness.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { language: 'en' },
    });
    expect(back.statusCode).toBe(200);
    expect(back.json<Settings>()).toMatchObject({ language: 'en' });
    expect(storedRows()).toEqual({ language: '"en"' });
  });

  it('400s a language that is neither of the two, whether or not Spanish is offered', async () => {
    process.env[DEV_SPANISH] = '1';

    const response = await harness.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { language: 'de' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'bad_request',
      message: t('errors.bad_request.settings_bad_language', {}, 'en'),
      details: { language: 'de' },
    });
    // The bytes the wire carried before the sentence moved into the catalogue.
    expect(t('errors.bad_request.settings_bad_language', {}, 'en')).toBe('Language must be "en" or "es-MX".');
    expect(storedRows()).toEqual({});
  });

  /**
   * The same request, in the language of the setting, with the wire unchanged.
   *
   * C-LANG@1 rule 3: a request that is not a job and not a refine is answered
   * in the stored `language`, and the server is what renders it — `error` is
   * still the code a client branches on and `message` is still a finished
   * string, so `web/src/api/client.ts` needs nothing.
   */
  it('renders the same 400 in Spanish once the setting is es-MX, with the code unchanged', async () => {
    process.env[DEV_SPANISH] = '1';
    const spanish = await harness.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { language: 'es-MX' },
    });
    expect(spanish.statusCode).toBe(200);

    const response = await harness.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { language: 'de' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'bad_request',
      message: t('errors.bad_request.settings_bad_language', {}, 'es-MX'),
      details: { language: 'de' },
    });
    expect(t('errors.bad_request.settings_bad_language', {}, 'es-MX')).toBe(
      'El idioma debe ser "en" o "es-MX".',
    );

    // And back in English it is today's English again, byte for byte.
    const back = await harness.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { language: 'en' },
    });
    expect(back.statusCode).toBe(200);
    const again = await harness.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { language: 'de' },
    });
    expect(again.json()).toEqual({
      error: 'bad_request',
      message: 'Language must be "en" or "es-MX".',
      details: { language: 'de' },
    });
  });

  it('never stores spanish_available, whatever a client sends', async () => {
    const response = await harness.app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { language: 'en', spanish_available: true },
    });

    expect(response.statusCode).toBe(200);
    // The offer is a property of the build, not of the request: the row the
    // client tried to write is dropped, and the answer reports this build.
    expect(response.json<Settings>()).toMatchObject({ spanish_available: false });
    expect(storedRows()).toEqual({ language: '"en"' });
  });
});
