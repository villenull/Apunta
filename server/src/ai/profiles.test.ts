import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { putSettings } from '../db/settings.js';
import { createTestApp, type TestApp } from '../test/harness.js';
import { clearLlmProfileCache, isLocalModelTag, resolveLlmProfile } from './profiles.js';

let harness: TestApp;

function tags(names: string[]): Response {
  return new Response(JSON.stringify({ models: names.map((name) => ({ name })) }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(async () => {
  clearLlmProfileCache();
  harness = await createTestApp();
});

afterEach(async () => {
  await harness.close();
  clearLlmProfileCache();
});

describe('resolveLlmProfile', () => {
  it('preserves the pre-existing llm_model setting', async () => {
    putSettings(harness.db, { llm_model: 'gemma4:12b' });
    const resolved = await resolveLlmProfile(harness.db, {
      fetchImpl: async () => tags(['gemma4:12b']),
    });
    expect(resolved.profile).toBe('quick');
    expect(resolved.model).toBe('gemma4:12b');
    expect(resolved.available).toEqual(['quick']);
  });

  it('hides Quick when its configured model is missing', async () => {
    const resolved = await resolveLlmProfile(harness.db, {
      fetchImpl: async () => tags([]),
    });
    expect(resolved.profile).toBe('quick');
    expect(resolved.available).toEqual([]);
  });

  it('never selects cloud-backed configured models', async () => {
    putSettings(harness.db, { llm_model: 'qwen3.5:4b-q4_K_M-cloud' });
    const resolved = await resolveLlmProfile(harness.db, {
      fetchImpl: async () => tags(['qwen3.5:4b-q4_K_M-cloud']),
    });
    expect(resolved.model).toBe('qwen3.5:4b-q4_K_M');
    expect(resolved.available).toEqual([]);
  });

  it('rejects cloud-backed tags even when Ollama lists them', () => {
    expect(isLocalModelTag('qwen3.5:4b-q4_K_M-cloud')).toBe(false);
    expect(isLocalModelTag('qwen3.5:4b-q4_K_M-cloud-preview')).toBe(false);
    expect(isLocalModelTag('qwen3.5:4b-q4_K_M')).toBe(true);
  });
});
