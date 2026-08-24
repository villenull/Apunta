/**
 * The RAM → model tier table, and the tag shapes that must be refused.
 *
 * This lives in `shared/` for one reason: three things now pick a model from
 * the machine's memory — the server (`server/src/ai/model-picker.ts`), M7's
 * `scripts/setup-macos.sh`, and M8's first-run window
 * (`installer/src/plan.ts`). The script asserts against this table in a test;
 * the other two import it. A second copy of the boundaries would drift, and
 * the drift would be invisible: everything still runs, on the wrong model.
 *
 * Everything here is pure and browser-safe. The parts that read the machine
 * (`sysctl -n hw.memsize`) and the parts that throw `AiError` stay in the
 * server, which is what keeps `shared/` importable from `web/`.
 */

export const LARGE_MODEL = 'qwen3.6:35b-a3b';
/** The default on the target Mac. */
export const DEFAULT_MODEL = 'gemma4:12b-it-qat';
export const SMALL_MODEL = 'qwen3.5:4b-q4_K_M';

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

/** PLAN §2's RAM table. Overridden by the `llm_model` setting. */
export function modelForMemory(memoryGib: number | null): string {
  if (memoryGib === null) return SMALL_MODEL;
  if (memoryGib >= LARGE_TIER_GIB) return LARGE_MODEL;
  if (memoryGib >= DEFAULT_TIER_GIB) return DEFAULT_MODEL;
  return SMALL_MODEL;
}
