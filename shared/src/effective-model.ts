import { PROMOTED_DEFAULT_MODEL } from './models.js';

/**
 * C-MODEL@1: one resolver, and only one.
 *
 * At the base commit five things each decided which model Apunta would run, and
 * they could disagree — on a 16 GiB Linux box the installer pulled
 * `gemma4:12b-it-qat` from the RAM table while the server asked Ollama for
 * `qwen3.5:4b-q4_K_M` from the promoted profile. Nothing was broken loudly:
 * setup reported ready, and the first inference failed. This module is the
 * single answer every one of those five now reads.
 *
 * Two properties are load-bearing:
 *
 *  - **Pure, and it never fetches.** `installed` is handed in. A resolver that
 *    asked the runtime itself would be a different function in every caller,
 *    which is the drift it exists to remove.
 *  - **`installed: null` is a different fact from `installed: []`.** `[]` means
 *    the runtime answered and the tag is not among what it has. `null` means
 *    the runtime could not be asked at all. Only the first may be reported as
 *    "missing"; the second is *unknown*, and a machine that did not answer must
 *    never be told it lacks a model it has.
 */

export interface EffectiveModelInput {
  /**
   * The `llm_model` setting, or the installer's `--model`. Trimmed; blank or
   * absent means no override, because a stored setting can carry whitespace
   * and a blank tag matches no runtime.
   */
  readonly override?: string | null;
  /**
   * The runtime's installed-tag list, or `null` when the runtime could not be
   * asked. `null` and `[]` are different facts and are never conflated.
   */
  readonly installed: readonly string[] | null;
}

/** Why this tag: the owner's setting, or Apunta's promoted default. */
export type EffectiveModelSource = 'override' | 'promoted';

export interface EffectiveModel {
  readonly tag: string;
  readonly source: EffectiveModelSource;
  /** `null` when the runtime could not be asked. Never "not present" for that. */
  readonly present: boolean | null;
}

/**
 * The effective writing model.
 *
 * `tag` and `source` come from the setting and a constant, never from the
 * runtime — so they are the same answer whether Ollama is up, down or
 * half-started, and a consumer switching on `source` needs no unreachable
 * branch. Only `present` carries the runtime's state.
 *
 * The resolver does **not** judge locality or weight format. A non-empty
 * stored override is resolved as `source: 'override'` whatever it names, and
 * `isLocalModelTag` and `assertSupportedModelName` remain the guards at the use
 * site. A cloud name is never in the local installed list, so such an override
 * is reported `present: false` — which is the truth: "your setting is in
 * effect and that model is not here", rather than silently resolving to a
 * different tag the owner never chose.
 */
export function effectiveModel(input: EffectiveModelInput): EffectiveModel {
  const override = input.override?.trim() ?? '';
  const source: EffectiveModelSource = override === '' ? 'promoted' : 'override';
  const tag = source === 'override' ? override : PROMOTED_DEFAULT_MODEL;
  return {
    tag,
    source,
    present: input.installed === null ? null : input.installed.includes(tag),
  };
}
