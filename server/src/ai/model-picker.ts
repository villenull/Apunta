import { execFileSync } from 'node:child_process';
import { platform } from 'node:os';

import { isSupportedModelName, PROMOTED_DEFAULT_MODEL } from '@apunta/shared';

import { aiError } from './errors.js';

/**
 * Which model to run, and which models must be refused.
 *
 * The tags and the RAM boundaries live in `shared/src/models.ts`, because the
 * setup scripts carry the same table in bash and a test asserts they agree.
 * What stays here is the part that needs the server: reading this machine's
 * memory, and turning a refusal into an `AiError` the API already knows how to
 * render.
 *
 * Nothing here **selects** anything. C-MODEL@1's `effectiveModel()` does, and
 * the RAM table survives only as the recommendation the setup screens show.
 *
 * Everything M3 imported from this module still resolves from this module.
 */

export {
  DEFAULT_MODEL,
  DEFAULT_TIER_GIB,
  isSupportedModelName,
  LARGE_MODEL,
  LARGE_TIER_GIB,
  PROMOTED_DEFAULT_MODEL,
  recommendedModelForMemory,
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
 * to null — server logic stays OS-portable, and a Linux CI box is not a machine
 * anyone drafts notes on.
 *
 * The reading survives only as the input to `recommendedModelForMemory()`.
 * Nothing selects from it.
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

/**
 * A historical name, kept because `scripts/smoke-live.mjs` imports it
 * dynamically and that script is outside C-MODEL@1's scope. It no longer reads
 * the machine: it returns the promoted default, which is what
 * `OllamaProvider`'s `resolveModel` fallback and the eval CLI's default both
 * want. A second policy would be worse than a stale name.
 */
export function defaultModelForMachine(): string {
  return PROMOTED_DEFAULT_MODEL;
}
