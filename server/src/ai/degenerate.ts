/**
 * Repetition-loop detection.
 *
 * ollama#15502 (open, no maintainer response) reports a repetition loop during
 * grammar-constrained JSON generation whose trigger conditions are exactly our
 * schema's shape: `format` set, free-text string fields, grammar constraint.
 * 60–100% failure across 39 trials on `gemma4:31b`; the 12B build the target
 * Mac runs was never tested. The reported output looks like
 * `"amber own own own own own…"` repeated until the token budget ran out.
 *
 * A `JSON.parse` will not catch it — if the grammar manages to close the
 * object, the result is *valid* JSON full of garbage. So every section body is
 * checked before anything is persisted, and a hit takes the retry path.
 */

/** A token repeated at least this many times in a row is not prose. */
const MAX_CONSECUTIVE_REPEATS = 8;
/** Below this many tokens, repetition is normal English ("that that"). */
const MIN_TOKENS_FOR_RATIO = 40;
/** One token taking more than this share of a long body is a loop. */
const MAX_TOKEN_SHARE = 0.3;

export interface DegenerateFinding {
  readonly token: string;
  readonly reason: 'consecutive' | 'share';
  readonly count: number;
}

/**
 * Null when the body reads like prose, otherwise what was wrong with it.
 *
 * Two independent checks, because the loop shows up in both shapes: a long run
 * of one token, and — when the run is broken up — one token dominating the
 * body's total mass.
 */
export function findDegeneration(body: string): DegenerateFinding | null {
  const tokens = body.toLowerCase().match(/[\p{L}\p{N}']+/gu);
  if (!tokens || tokens.length === 0) return null;

  let run = 1;
  for (let index = 1; index < tokens.length; index += 1) {
    run = tokens[index] === tokens[index - 1] ? run + 1 : 1;
    if (run >= MAX_CONSECUTIVE_REPEATS) {
      return { token: tokens[index] as string, reason: 'consecutive', count: run };
    }
  }

  if (tokens.length < MIN_TOKENS_FOR_RATIO) return null;

  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  for (const [token, count] of counts) {
    if (count / tokens.length > MAX_TOKEN_SHARE) {
      return { token, reason: 'share', count };
    }
  }
  return null;
}

/** The first degenerate body in a sections object, or null. */
export function findDegenerateSection(
  sections: Readonly<Record<string, string>>,
): { section: string; finding: DegenerateFinding } | null {
  for (const [section, body] of Object.entries(sections)) {
    const finding = findDegeneration(body);
    if (finding) return { section, finding };
  }
  return null;
}
