import { describe, expect, it } from 'vitest';

import { effectiveModel } from './effective-model.js';
import {
  DEFAULT_MODEL,
  LARGE_MODEL,
  LARGE_TIER_GIB,
  DEFAULT_TIER_GIB,
  PROMOTED_DEFAULT_MODEL,
  recommendedModelForMemory,
  SMALL_MODEL,
} from './models.js';

/**
 * C-MODEL@1: one resolver, and the RAM table stops selecting.
 *
 * These rows are the contract itself. Everything else in the card — the
 * installer's plan, the server's resolution, health, the eval default — is a
 * caller of what is asserted here, so a change to the table below is a change
 * to what every one of them reports.
 */

/** The promoted tag is the value the small tier already had, so the two agree. */
const INSTALLED = [PROMOTED_DEFAULT_MODEL, DEFAULT_MODEL, LARGE_MODEL];

describe('effectiveModel', () => {
  it('resolves the promoted default when there is no override', () => {
    expect(effectiveModel({ installed: INSTALLED })).toEqual({
      tag: PROMOTED_DEFAULT_MODEL,
      source: 'promoted',
      present: true,
    });
  });

  it('resolves a non-empty override to that tag', () => {
    expect(effectiveModel({ override: 'gemma4:12b-it-qat', installed: INSTALLED })).toMatchObject({
      tag: 'gemma4:12b-it-qat',
      source: 'override',
    });
  });

  it('trims the override, because a stored setting can carry whitespace', () => {
    expect(effectiveModel({ override: '  qwen3.6:35b-a3b  ', installed: INSTALLED })).toMatchObject({
      tag: 'qwen3.6:35b-a3b',
      source: 'override',
    });
  });

  /**
   * A blank setting is not an override. Resolving it to the empty string would
   * produce a `tag` no runtime has, and health would then report a model
   * missing that nobody asked for.
   */
  it('treats a blank or whitespace-only override as no override', () => {
    for (const override of ['', '   ', '\t\n', null]) {
      expect(effectiveModel({ override, installed: INSTALLED })).toEqual({
        tag: PROMOTED_DEFAULT_MODEL,
        source: 'promoted',
        present: true,
      });
    }
    // Absent is the same fact, and is expressed by omitting the key rather
    // than by passing `undefined`.
    expect(effectiveModel({ installed: INSTALLED })).toEqual({
      tag: PROMOTED_DEFAULT_MODEL,
      source: 'promoted',
      present: true,
    });
  });

  it('reports an override that is not installed as present: false, and never pulls', () => {
    const resolved = effectiveModel({ override: 'qwen3.6:35b-a3b', installed: [DEFAULT_MODEL] });
    expect(resolved).toEqual({
      tag: 'qwen3.6:35b-a3b',
      source: 'override',
      present: false,
    });
  });

  /**
   * A cloud tag is a perfectly valid `llm_model` value for the resolver to
   * report. Judging locality is not its job — `isLocalModelTag` is the guard
   * at the use site. All the resolver can say is that a cloud name is never in
   * the local installed list, and that is the truth health should show.
   */
  it('resolves a cloud override as an override, and reports it missing', () => {
    expect(effectiveModel({ override: 'qwen3.5:4b-q4_K_M-cloud', installed: INSTALLED })).toEqual({
      tag: 'qwen3.5:4b-q4_K_M-cloud',
      source: 'override',
      present: false,
    });
  });

  /**
   * The three `present` cases, and the difference between two of them is the
   * whole point of the third argument being nullable.
   */
  it('distinguishes an empty installed list from an unreachable runtime', () => {
    const installed = [DEFAULT_MODEL];
    expect(effectiveModel({ override: LARGE_MODEL, installed }).present).toBe(false);
    expect(effectiveModel({ override: LARGE_MODEL, installed: [] }).present).toBe(false);
    // A machine that did not answer is *unknown*, not "missing". Reporting
    // `false` here would tell the owner her model is gone every time Ollama
    // happens to be restarting.
    expect(effectiveModel({ override: LARGE_MODEL, installed: null }).present).toBeNull();
  });

  it('keeps tag and source from the setting, whatever the runtime said', () => {
    // `source` is never a third value. The unreachable case is carried by
    // `present: null` alone, so a consumer that switches on `source` needs no
    // unreachable branch of its own.
    for (const installed of [null, [], INSTALLED]) {
      const resolved = effectiveModel({ override: 'gemma4:12b-it-qat', installed });
      expect(resolved.tag).toBe('gemma4:12b-it-qat');
      expect(resolved.source).toBe('override');
    }
  });
});

describe('recommendedModelForMemory', () => {
  /**
   * PLAN §2's table, unchanged. The function is now a recommendation — "this
   * machine could also run X" — so its answers stay, but nothing selects from
   * them any more.
   */
  it('keeps its four answers, and is a recommendation rather than a selection', () => {
    expect(recommendedModelForMemory(null)).toBe(SMALL_MODEL);
    expect(recommendedModelForMemory(8)).toBe(SMALL_MODEL);
    expect(recommendedModelForMemory(16)).toBe(DEFAULT_MODEL);
    expect(recommendedModelForMemory(36)).toBe(LARGE_MODEL);
  });

  it('keeps the 36 GB boundary, which is physics rather than preference', () => {
    expect(recommendedModelForMemory(LARGE_TIER_GIB - 1)).toBe(DEFAULT_MODEL);
    expect(recommendedModelForMemory(DEFAULT_TIER_GIB - 1)).toBe(SMALL_MODEL);
  });

  /**
   * The recommendation cannot leak into a selection, whatever the machine has:
   * none of the four inputs changes the effective model. On 16 and 36 GiB the
   * two answers differ, which is the visible half of the change; on 8 GiB and
   * on an unreadable memory they coincide, because the promoted tag happens to
   * be the small tier's value.
   */
  it('resolves to the promoted default on every one of those inputs', () => {
    for (const memoryGib of [null, 8, 16, 36]) {
      const recommendation = recommendedModelForMemory(memoryGib);
      const resolved = effectiveModel({ installed: INSTALLED });
      expect(resolved.tag).toBe(PROMOTED_DEFAULT_MODEL);
      // The recommendation is still a real tag, and it still runs.
      expect(INSTALLED).toContain(recommendation);
    }
    // The two machines that would previously have been given a different model
    // are the ones where the recommendation and the answer part company.
    expect(recommendedModelForMemory(16)).not.toBe(PROMOTED_DEFAULT_MODEL);
    expect(recommendedModelForMemory(36)).not.toBe(PROMOTED_DEFAULT_MODEL);
  });
});

describe('PROMOTED_DEFAULT_MODEL', () => {
  /**
   * `installer/src/catalog.ts` keys `WRITING_MODELS` by tag string, so if the
   * promoted tag stopped being the small tier's value the first-run window
   * would lose the only entry whose licence has been read.
   */
  it('is the small tier’s value, so the catalog already resolves it', () => {
    expect(PROMOTED_DEFAULT_MODEL).toBe(SMALL_MODEL);
  });

  it('is not the middle tier, which keeps its own recommendation meaning', () => {
    expect(PROMOTED_DEFAULT_MODEL).not.toBe(DEFAULT_MODEL);
    expect(DEFAULT_MODEL).toBe('gemma4:12b-it-qat');
  });
});
