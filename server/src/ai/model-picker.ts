import { execFileSync } from 'node:child_process';
import { platform } from 'node:os';

import { isSupportedModelName, modelForMemory } from '@apunta/shared';

import { aiError } from './errors.js';

/**
 * Which model to run, and which models must be refused.
 *
 * The tiers themselves — the tags and the RAM boundaries — moved to
 * `shared/src/models.ts` in M8, because the first-run installer picks a model
 * from the same table and a second copy would drift. What stays here is the
 * part that needs the server: reading this machine's memory, and turning a
 * refusal into an `AiError` the API already knows how to render.
 *
 * Everything M3 imported from this module still resolves from this module.
 */

export {
  DEFAULT_MODEL,
  DEFAULT_TIER_GIB,
  isSupportedModelName,
  LARGE_MODEL,
  LARGE_TIER_GIB,
  modelForMemory,
  SMALL_MODEL,
} from '@apunta/shared';

const GIB = 1024 ** 3;

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

export function defaultModelForMachine(): string {
  return modelForMemory(machineMemoryGib());
}
