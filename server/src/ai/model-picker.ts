import { execFileSync } from 'node:child_process';
import { platform } from 'node:os';

import { aiError } from './errors.js';

/**
 * Which model to run, and which models must be refused.
 *
 * The tiers are PLAN §2's table, pinned to explicit tags. Never `:latest` and
 * never a bare family name: `gemma4:latest` resolves to E4B, not 12B.
 */

export const LARGE_MODEL = 'qwen3.6:35b-a3b';
/** The default on the target Mac. */
export const DEFAULT_MODEL = 'gemma4:12b-it-qat';
export const SMALL_MODEL = 'qwen3.5:4b-q4_K_M';

const GIB = 1024 ** 3;
/** Metal caps usable GPU memory near 75% of unified RAM, so 24GB needs 36GB. */
const LARGE_TIER_GIB = 36;
const DEFAULT_TIER_GIB = 16;

/**
 * A non-GGUF weight flavour in the tag name.
 *
 * Ollama routes GGUF weights to llama.cpp, where `format` becomes a
 * grammar-constrained sampler, and safetensors/MLX weights to the MLX runner,
 * which **silently ignores `format`** (ollama#16563, still open). Structured
 * output is the load-bearing assumption of the whole pipeline and MLX is the
 * default engine flavour on Apple Silicon, so this would fail with no error on
 * exactly the machine we target.
 *
 * The M3 packet's `/-(mlx|nvfp4)\b/` misses `-mxfp8` and `-bf16`, both of
 * which now ship in the library. This is still only half the guard: a name
 * denylist always lags the naming, so `assertGgufWeights` below checks
 * `details.format` from `GET /api/tags`, which is authoritative.
 */
const NON_GGUF_TAG = /-(mlx|nvfp4|mxfp8|bf16)\b/i;

export function isSupportedModelName(model: string): boolean {
  return !NON_GGUF_TAG.test(model);
}

/** Throws `unsupported_model_tag` for an MLX/safetensors-flavoured tag. */
export function assertSupportedModelName(model: string): void {
  if (!isSupportedModelName(model)) {
    throw aiError('unsupported_model_tag', `model tag "${model}" names a non-GGUF weight format`);
  }
}

/**
 * The authoritative check, run once the model is present.
 *
 * An **allowlist of `"gguf"`**, not a denylist: what `details.format` reads for
 * an MLX model is unverified (`"safetensors"`? `"mlx"`?), and guessing wrong
 * would let the silent-failure case through. `smoke:live` prints the value so
 * that gap closes on the first real run.
 */
export function assertGgufWeights(model: string, weightsFormat: string | null): void {
  if (weightsFormat !== 'gguf') {
    throw aiError(
      'non_gguf_model',
      `model "${model}" reports details.format="${weightsFormat ?? 'unknown'}"`,
    );
  }
}

/**
 * Installed RAM in GiB, or null when it cannot be read.
 *
 * `sysctl -n hw.memsize` on darwin per the packet. Everywhere else falls back
 * to the small model — server logic stays OS-portable, and a Linux CI box is
 * not a machine anyone drafts notes on.
 */
export function machineMemoryGib(): number | null {
  if (platform() !== 'darwin') return null;
  try {
    const raw = execFileSync('sysctl', ['-n', 'hw.memsize'], { encoding: 'utf8', timeout: 2000 }).trim();
    const bytes = Number(raw);
    return Number.isFinite(bytes) && bytes > 0 ? bytes / GIB : null;
  } catch {
    return null;
  }
}

/** PLAN §2's RAM table. Overridden by the `llm_model` setting. */
export function modelForMemory(memoryGib: number | null): string {
  if (memoryGib === null) return SMALL_MODEL;
  if (memoryGib >= LARGE_TIER_GIB) return LARGE_MODEL;
  if (memoryGib >= DEFAULT_TIER_GIB) return DEFAULT_MODEL;
  return SMALL_MODEL;
}

export function defaultModelForMachine(): string {
  return modelForMemory(machineMemoryGib());
}
