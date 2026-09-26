/**
 * The RAM → model tier table, and the tag shapes that must be refused.
 *
 * This lives in `shared/` for one reason: the tier table is the *informational*
 * recommendation the setup screens show, and a second copy of the boundaries
 * would drift, and the drift would be invisible: everything still runs, on the
 * wrong model.
 *
 * What the machine's memory no longer does is **select**. C-MODEL@1 moved that
 * decision to one resolver, `effectiveModel()` in `./effective-model.ts`, whose
 * answer comes from the `llm_model` setting and a constant. The table below is
 * still here because "this machine could also run X" is a real sentence worth
 * showing, and because `scripts/setup-macos.sh` and `scripts/preflight-macos.sh`
 * carry the same boundaries in bash and a test asserts the two agree.
 *
 * Everything here is pure and browser-safe. The parts that read the machine
 * (`sysctl -n hw.memsize`) and the parts that throw `AiError` stay in the
 * server, which is what keeps `shared/` importable from `web/`.
 */

export const LARGE_MODEL = 'qwen3.6:35b-a3b';
/**
 * The middle tier. **Not** what the owner's Mac runs: that is an 8 GB M2, which
 * lands on `SMALL_MODEL` and will keep doing so — the machine is not being
 * replaced. Metal caps usable GPU memory near 75% of unified RAM, so a 12B at
 * Q4 (~7 GB) does not fit in ~6 GB usable and the tier boundary is physics
 * rather than preference.
 */
export const DEFAULT_MODEL = 'gemma4:12b-it-qat';
export const SMALL_MODEL = 'qwen3.5:4b-q4_K_M';

/**
 * The one writing model Apunta promotes, and the answer whenever there is no
 * `llm_model` override. C-MODEL@1: installer, server, health, preflight and
 * eval all resolve to this, so a clean install's first inference needs no pull
 * beyond the one the installer already made.
 *
 * Its value is `SMALL_MODEL`'s, which is why `installer/src/catalog.ts`'s
 * `WRITING_MODELS` already resolves it and why no bash script needed a new
 * literal. `DEFAULT_MODEL` is deliberately **not** redefined to this: it is
 * still the middle tier of the recommendation, and is no longer the default.
 */
export const PROMOTED_DEFAULT_MODEL = 'qwen3.5:4b-q4_K_M';

/** Metal caps usable GPU memory near 75% of unified RAM, so 24GB needs 36GB. */
export const LARGE_TIER_GIB = 36;
export const DEFAULT_TIER_GIB = 16;

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
 * denylist always lags the naming, so the server also checks `details.format`
 * from `GET /api/tags`, which is authoritative.
 */
const NON_GGUF_TAG = /-(mlx|nvfp4|mxfp8|bf16)\b/i;

export function isSupportedModelName(model: string): boolean {
  return !NON_GGUF_TAG.test(model);
}

/**
 * PLAN §2's RAM table, as a **recommendation**: "this machine could also run
 * X". It no longer selects anything — C-MODEL@1 made the resolver in
 * `./effective-model.ts` the only thing that chooses a tag — and it is renamed
 * so that no call site can read as a selection.
 *
 * `LARGE_TIER_GIB` and `DEFAULT_TIER_GIB` keep meaning exactly what they meant.
 */
export function recommendedModelForMemory(memoryGib: number | null): string {
  if (memoryGib === null) return SMALL_MODEL;
  if (memoryGib >= LARGE_TIER_GIB) return LARGE_MODEL;
  if (memoryGib >= DEFAULT_TIER_GIB) return DEFAULT_MODEL;
  return SMALL_MODEL;
}
