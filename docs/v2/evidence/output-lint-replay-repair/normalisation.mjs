// The normalisation rules the output-lint replay checker applies, in one place,
// together with the *previous* order of the same four rules so this control can
// demonstrate that the order is load-bearing rather than cosmetic.
//
// Four rules, three tolerated shapes:
//   1. `(12.345ms)` — a node test reporter timing. Wall-clock; cannot match.
//   2. `ℹ duration_ms N` — the reporter's own summary line, same reason.
//   3. `tooling-guard.test.mjs:<line>` — the repaired file carries exactly one
//      added line (the `node:util` import at line 23), so every stack frame
//      below it shifts by exactly +1. Only the number is replaced; the line's
//      content is still compared.
//   4. `…/tooling-guard.test.mjs` — the "before" side runs from a scratch copy
//      under build/, so its path necessarily differs from the repaired file's.
//
// Nothing else is normalised. See the limits section of README.md.

/** The order replay-check.mjs uses after this repair: the line rule BEFORE the path rule. */
export const NORMALISED = [
  [/\(\d+(\.\d+)?ms\)/g, '(TIME)', 'reporter timings'],
  [/^ℹ duration_ms .*$/gm, 'ℹ duration_ms TIME', 'reporter duration line'],
  [/tooling-guard\.test\.mjs:\d+/g, 'tooling-guard.test.mjs:N', 'import+1 line shift'],
  [/[^ \n]*tooling-guard\.test\.mjs/g, '<TESTFILE>', "the test file's own path"],
];

/**
 * The order committed before this repair: the path rule before the line rule.
 * The path rule's `[^ \n]*` prefix is greedy and swallows the `.mjs` literal,
 * so the line rule then has nothing left to match and the +1 shift survives
 * into the comparison. Kept here only as the negative control for that claim.
 */
const PATH_FIRST = [NORMALISED[0], NORMALISED[1], NORMALISED[3], NORMALISED[2]];

const apply = (text, rules) => rules.reduce((acc, [re, to]) => acc.replace(re, to), text);

export const normalise = (text) => apply(text, NORMALISED);
export const normalisePathFirst = (text) => apply(text, PATH_FIRST);

/** Names of the rules that actually changed something in this text. */
export const rulesFired = (text) =>
  NORMALISED.filter(([re]) => new RegExp(re.source, re.flags).test(text)).map(([, , name]) => name);

/**
 * Everything the four rules above are permitted to consume, and the spelling
 * each replaces it with. This is not "any line containing a permitted shape": it
 * is the exact text each rule rewrites, so a line can be tested for confinement
 * rather than for a suggestive substring.
 */
const ERASED =
  /\(\d+(?:\.\d+)?ms\)|\(TIME\)|^\u2139 duration_ms .*$|<TESTFILE>(?::N)?|[^ \n]*tooling-guard\.test\.mjs(?::\d+|:N)?/g;

const withoutPermittedSpans = (text) => text.replace(ERASED, '');

/**
 * Lines these rules changed by something other than a permitted span — that is,
 * substantive output the normalisation would have absorbed. Every rule above is
 * intra-line or line-anchored, so judging one line at a time is equivalent to
 * judging the whole stream.
 *
 * Deleting the permitted spans from both sides and comparing the remainders is
 * strictly stronger than asking whether a line merely contains a permitted
 * shape, and it is what catches an over-broad rule: a rule that rewrote a digit
 * in the middle of a verdict would change a line whose erasable spans are
 * identical on both sides, and the remainder would no longer match.
 */
export const auditOutside = (rules, text) => {
  const apply = (line) => rules.reduce((acc, [re, to]) => acc.replace(re, to), line);
  return text.split('\n').filter((line) => {
    const after = apply(line);
    return after !== line && withoutPermittedSpans(line) !== withoutPermittedSpans(after);
  });
};

/** `auditOutside` for the four rules this control and the checker apply. */
export const outsidePermitted = (text) => auditOutside(NORMALISED, text);

/** The first differing line of two texts, for a report line. */
export const firstDifference = (a, b) => {
  const left = a.split('\n');
  const right = b.split('\n');
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    if (left[i] !== right[i]) return `line ${i + 1}: ${JSON.stringify(left[i])} != ${JSON.stringify(right[i])}`;
  }
  return 'none';
};