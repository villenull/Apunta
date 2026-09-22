import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  clearLlmProfileCache,
  isLocalModelTag,
  resolveLlmProfile,
} from './profiles.js';
import { putSettings } from '../db/settings.js';
import { createTestApp, type TestApp } from '../test/harness.js';

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
  it('uses a stored profile before the Thorough default', async () => {
    putSettings(harness.db, { llm_profile: 'quick' });
    const resolved = await resolveLlmProfile(harness.db, {
      fetchImpl: async () => tags(['qwen3.5:4b-q4_K_M', 'THOROUGH_MODEL_TBD']),
    });
    expect(resolved.profile).toBe('quick');
  });

  it('defaults to Thorough when both profile models are installed', async () => {
    const resolved = await resolveLlmProfile(harness.db, {
      fetchImpl: async () => tags(['qwen3.5:4b-q4_K_M', 'THOROUGH_MODEL_TBD']),
    });
    expect(resolved.profile).toBe('thorough');
  });

  it('falls back to Quick and hides Thorough when its model is missing', async () => {
    const resolved = await resolveLlmProfile(harness.db, {
      fetchImpl: async () => tags(['qwen3.5:4b-q4_K_M']),
    });
    expect(resolved.profile).toBe('quick');
    expect(resolved.available).toEqual(['quick']);
  });

  it('rejects cloud-backed tags even when Ollama lists them', () => {
    expect(isLocalModelTag('qwen3.5:4b-q4_K_M-cloud')).toBe(false);
    expect(isLocalModelTag('qwen3.5:4b-q4_K_M-cloud-preview')).toBe(false);
    expect(isLocalModelTag('qwen3.5:4b-q4_K_M')).toBe(true);
  });
});
