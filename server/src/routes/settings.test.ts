import { SettingsSchema, type Settings } from '@apunta/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, type TestApp } from '../test/harness.js';

let harness: TestApp;

beforeEach(async () => {
  harness = await createTestApp();
});

afterEach(async () => {
  await harness.close();
});

describe('GET /api/settings', () => {
  it('starts with only the promoted Quick profile', async () => {
    const response = await harness.app.inject({ method: 'GET', url: '/api/settings' });

    expect(response.statusCode).toBe(200);
    expect(SettingsSchema.parse(response.json())).toEqual({
      llm_available_profiles: ['quick'],
      llm_effective_profile: 'quick',
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
