import { describe, expect, it } from 'vitest';

import { AiError } from './errors.js';
import {
  assertGgufWeights,
  assertSupportedModelName,
  defaultModelForMachine,
  DEFAULT_MODEL,
  isSupportedModelName,
  LARGE_MODEL,
  machineMemoryGib,
  PROMOTED_DEFAULT_MODEL,
  recommendedModelForMemory,
  SMALL_MODEL,
} from './model-picker.js';

/**
 * `modelForMemory` was renamed, not removed. It is a recommendation now — the
 * setup screen's "this machine could also run X" — and the rows below are the
 * ones that prove it can no longer select anything.
 */
describe('recommendedModelForMemory', () => {
  it('follows PLAN §2’s table', () => {
    expect(recommendedModelForMemory(48)).toBe(LARGE_MODEL);
    expect(recommendedModelForMemory(36)).toBe(LARGE_MODEL);
    expect(recommendedModelForMemory(32)).toBe(DEFAULT_MODEL);
    expect(recommendedModelForMemory(16)).toBe(DEFAULT_MODEL);
    expect(recommendedModelForMemory(8)).toBe(SMALL_MODEL);
  });

  /**
   * The boundary is 36GB, not 32: Metal caps usable GPU memory near 75% of
   * unified RAM, so a 24GB model leaves no headroom on a 32GB Mac.
   */
  it('keeps a 32GB Mac off the large tier', () => {
    expect(recommendedModelForMemory(35.9)).toBe(DEFAULT_MODEL);
  });

  it('falls back to the small model where RAM cannot be read', () => {
    expect(recommendedModelForMemory(null)).toBe(SMALL_MODEL);
  });

  it('pins explicit tags — never `:latest`, never a bare family name', () => {
    for (const model of [LARGE_MODEL, DEFAULT_MODEL, SMALL_MODEL, PROMOTED_DEFAULT_MODEL]) {
      expect(model).toContain(':');
      expect(model).not.toContain(':latest');
    }
  });
});

describe('defaultModelForMachine', () => {
  /**
   * The name is historical: `scripts/smoke-live.mjs` imports it dynamically and
   * that script is outside this card's scope. What it returns is the contract
   * — the promoted default, whatever the machine has.
   *
   * On this platform `machineMemoryGib()` is null, so a reading-based selector
   * would return `SMALL_MODEL`. The promoted tag happens to be that value too,
   * which is exactly why the assertion below is about the composition, not
   * about the value: `defaultModelForMachine()` must not be a function of the
   * memory reading at all.
   */
  it('returns the promoted default, and does not consult the memory reading', () => {
    expect(defaultModelForMachine()).toBe(PROMOTED_DEFAULT_MODEL);
    // The machine reading survives only as the recommendation's input.
    const recommendation = recommendedModelForMemory(machineMemoryGib());
    expect(recommendation).toBe(SMALL_MODEL);
    // Reading it again cannot move the answer.
    expect(defaultModelForMachine()).toBe(PROMOTED_DEFAULT_MODEL);
  });
});

describe('isSupportedModelName', () => {
  it('accepts the tiers', () => {
    for (const model of [LARGE_MODEL, DEFAULT_MODEL, SMALL_MODEL]) {
      expect(isSupportedModelName(model)).toBe(true);
    }
  });

  /**
   * The packet's `/-(mlx|nvfp4)\b/` misses two flavours that now ship in the
   * library, and every one of them routes to an engine that ignores `format`.
   */
  it('rejects every non-GGUF weight flavour, not only -mlx', () => {
    for (const model of [
      'qwen3.8:27b-mlx',
      'qwen3.6:35b-a3b-nvfp4',
      'qwen3.6:35b-a3b-coding-mxfp8',
      'gemma4:12b-bf16',
    ]) {
      expect(isSupportedModelName(model), model).toBe(false);
      expect(() => {
        assertSupportedModelName(model);
      }).toThrow(AiError);
    }
  });

  it('does not reject a tag that merely contains the letters', () => {
    expect(isSupportedModelName('mlx-community-notes:8b')).toBe(true);
  });
});

describe('assertGgufWeights', () => {
  /** An allowlist, because what `details.format` reads for MLX is unverified. */
  it('accepts gguf and refuses anything else, including unknown', () => {
    expect(() => {
      assertGgufWeights(DEFAULT_MODEL, 'gguf');
    }).not.toThrow();
    for (const format of ['safetensors', 'mlx', '', null]) {
      expect(() => {
        assertGgufWeights(DEFAULT_MODEL, format);
      }).toThrow(AiError);
    }
  });
});
