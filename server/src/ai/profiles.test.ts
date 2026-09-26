import { effectiveModel, PROMOTED_DEFAULT_MODEL } from '@apunta/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { putSettings } from '../db/settings.js';
import { createTestApp, type TestApp } from '../test/harness.js';
import {
  clearLlmProfileCache,
  installedModelTags,
  isLocalModelTag,
  LLM_PROFILES,
  resolveEffectiveModel,
  resolveLlmProfile,
} from './profiles.js';

let harness: TestApp;

function tags(names: string[]): Response {
  return new Response(JSON.stringify({ models: names.map((name) => ({ name })) }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/** A seam that records every URL asked, so "nothing was pulled" is checkable. */
function recordingTags(names: string[], requested: string[]): typeof globalThis.fetch {
  return (async (url: string | URL | Request) => {
    requested.push(String(url));
    return tags(names);
  }) as unknown as typeof globalThis.fetch;
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

  /**
   * The profile table is the one promoted profile, and C-MODEL@1 says it names
   * the same tag the resolver falls back to. If it drifts, `llm_profile` (which
   * the settings screen shows) starts describing a model the app will not run.
   */
  it('points the quick profile at the promoted default', () => {
    expect(LLM_PROFILES.quick?.model).toBe(PROMOTED_DEFAULT_MODEL);
  });

  /**
   * C-MODEL@1's rejection example, at the server: a stored override that is not
   * installed is reported with its own tag and `present: false`, and nothing is
   * pulled to make it true. The old row asserted the opposite — that the server
   * quietly substituted the local tag — which is the silent-different-tag
   * behaviour this contract removes.
   */
  it('resolves an override that is not installed as absent, and pulls nothing', async () => {
    putSettings(harness.db, { llm_model: 'qwen3.6:35b-a3b' });
    const requested: string[] = [];

    const resolved = await resolveEffectiveModel(harness.db, {
      fetchImpl: recordingTags([PROMOTED_DEFAULT_MODEL], requested),
    });

    // The tag reported is the setting's, not a substitution for it.
    expect(resolved).toEqual({
      tag: 'qwen3.6:35b-a3b',
      source: 'override',
      present: false,
    });
    // And the profile-availability list keeps today's behaviour.
    const profile = await resolveLlmProfile(harness.db, {
      fetchImpl: recordingTags([PROMOTED_DEFAULT_MODEL], requested),
    });
    expect(profile.model).toBe('qwen3.6:35b-a3b');
    expect(profile.available).toEqual([]);
    // At least one read, and not one `/api/pull`. Exactly one read is not
    // asserted: the 2 s cache is shared between the two calls, which is
    // today's behaviour and not what this row is about.
    expect(requested.filter((url) => url.endsWith('/api/tags')).length).toBeGreaterThanOrEqual(1);
    expect(requested.filter((url) => url.endsWith('/api/pull'))).toEqual([]);
  });

  it('resolves the promoted default when no override is set', async () => {
    const resolved = await resolveEffectiveModel(harness.db, {
      fetchImpl: async () => tags([PROMOTED_DEFAULT_MODEL]),
    });
    expect(resolved).toEqual({
      tag: PROMOTED_DEFAULT_MODEL,
      source: 'promoted',
      present: true,
    });
  });

  it('treats a blank llm_model as no override', async () => {
    putSettings(harness.db, { llm_model: '   ' });
    const resolved = await resolveEffectiveModel(harness.db, {
      fetchImpl: async () => tags([PROMOTED_DEFAULT_MODEL]),
    });
    expect(resolved.tag).toBe(PROMOTED_DEFAULT_MODEL);
    expect(resolved.source).toBe('promoted');
  });

  /**
   * Updated, not deleted. A cloud-backed tag is still refused at the use site
   * and still never appears in the profile-availability list — but it is now
   * *resolved* as the stored override and reported absent, because the truth
   * is "your setting is in effect and that model is not here", not a different
   * tag the owner never chose.
   */
  it('never selects cloud-backed configured models, and says the one that is not here', async () => {
    putSettings(harness.db, { llm_model: 'qwen3.5:4b-q4_K_M-cloud' });
    const resolved = await resolveEffectiveModel(harness.db, {
      fetchImpl: async () => tags(['qwen3.5:4b-q4_K_M-cloud']),
    });
    expect(resolved.tag).toBe('qwen3.5:4b-q4_K_M-cloud');
    expect(resolved.source).toBe('override');
    // Ollama would list it; the local-model filter is why it is not "present".
    expect(resolved.present).toBe(false);

    const profile = await resolveLlmProfile(harness.db, {
      fetchImpl: async () => tags(['qwen3.5:4b-q4_K_M-cloud']),
    });
    expect(profile.available).toEqual([]);
  });

  it('rejects cloud-backed tags even when Ollama lists them', () => {
    expect(isLocalModelTag('qwen3.5:4b-q4_K_M-cloud')).toBe(false);
    expect(isLocalModelTag('qwen3.5:4b-q4_K_M-cloud-preview')).toBe(false);
    expect(isLocalModelTag('qwen3.5:4b-q4_K_M')).toBe(true);
  });

  /**
   * C-MODEL@1's "one resolver" as the generation path sees it.
   *
   * `configuredModel` used to spell the selection out by hand, which made the
   * server a second copy of the rule that `shared/` owns. It is now the
   * resolver's own answer, and this row is what holds it there: the model the
   * server names is compared against `effectiveModel`'s answer for the same
   * stored value, not against a second hand-written expectation. The promoted
   * case is also pinned to the literal, so the row cannot pass by agreeing
   * with itself.
   *
   * A cloud-backed stored value is included on purpose: it is refused later, at
   * the use site, and substituting a different tag here is the behaviour the
   * contract removes.
   */
  it('names the model the resolver names, whatever the setting holds', async () => {
    const fetchImpl = async (): Promise<Response> => tags([PROMOTED_DEFAULT_MODEL]);

    for (const stored of ['', '   ', 'gemma4:12b-it-qat', 'qwen3.5:4b-q4_K_M-cloud']) {
      putSettings(harness.db, { llm_model: stored });
      const resolved = await resolveLlmProfile(harness.db, { fetchImpl });

      expect(resolved.model, JSON.stringify(stored)).toBe(
        effectiveModel({ override: stored, installed: [PROMOTED_DEFAULT_MODEL] }).tag,
      );
    }

    // And the promoted default is the resolver's own answer, spelled out.
    putSettings(harness.db, { llm_model: '' });
    expect((await resolveLlmProfile(harness.db, { fetchImpl })).model).toBe(PROMOTED_DEFAULT_MODEL);
  });
});

describe('installedModelTags', () => {
  it('answers the tags the runtime reports, and null when it could not be asked', async () => {
    expect(await installedModelTags({ fetchImpl: async () => tags(['a:1', 'b:2']) })).toEqual(['a:1', 'b:2']);
    // The 2 s cache is shared by base URL, so the failure below has to clear it
    // or it would be answered from the read above.
    clearLlmProfileCache();
    expect(
      await installedModelTags({
        fetchImpl: () => Promise.reject(new Error('connection refused')),
      }),
    ).toBeNull();
    clearLlmProfileCache();
    expect(await installedModelTags({ fetchImpl: async () => tags([]) })).toEqual([]);
  });

  it('drops a cloud-backed tag, because a local list never has one', async () => {
    expect(await installedModelTags({ fetchImpl: async () => tags(['a:1', 'a:1-cloud', 'b:2']) })).toEqual([
      'a:1',
      'b:2',
    ]);
  });
});
