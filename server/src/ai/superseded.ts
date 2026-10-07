import type { Locale, RetractionCorrection, Sections } from '@apunta/shared';

import { factTokens } from './fact-guard.js';

/**
 * Taking a corrected figure out of a draft that kept it beside the correction.
 *
 * Eval fixture `10`: the client said "three years", then revised it to five,
 * and the therapist dictated "so: five years, her revised number". The draft
 * read "five years, though she initially stated three years before correcting
 * herself". The owner's call (2026-10-07): only the revised figure belongs in
 * the note.
 *
 * As with spoken retractions, the model only quotes: each corrected pair, the
 * old figure and the new one, verbatim. The server believes a pair only when
 * both quotes are in her notes word for word, the old one first, with a
 * correction cue between them or just after ("her revised number", "digo",
 * "más bien"). In the draft it then removes only a **clause** that states the
 * old figure, and only from a sentence that also states the new one, so the
 * corrected fact is never lost. A draft that kept only the old figure is left
 * as it is and reported (`stale`), because rewriting her sentence around a new
 * figure is not something the server can do without writing prose.
 *
 * Gated on a cue in her notes, so a source without one costs no model call.
 */

/** Words that say a figure was corrected, in her notes. */
const CUES: Readonly<Record<Locale, RegExp>> = {
  en: /\b(?:correct(?:ed|ing|ion)|revis(?:ed|ion)|actually|rather|i mean|no wait|more like|changed (?:it|that) to)\b/i,
  'es-MX':
    /(?<![\p{L}])(?:digo|o sea|m[áa]s bien|mejor dicho|corrigi[óo]|se corrigi[óo]|en realidad|perd[óo]n|rectific\p{L}*)(?![\p{L}])/iu,
};

/** Does her source carry a correction cue at all? */
export function hasCorrectionCue(source: string, locale: Locale = 'en'): boolean {
  return CUES[locale].test(source);
}

/** How far after the new figure a cue may still name the correction ("…five years, her revised number"). */
const CUE_AFTER = 60;

const WORD = /[\p{L}\p{N}]+(?:['’]\p{L}+)?/gu;

interface Span {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

function wordsOf(text: string): Span[] {
  return [...text.matchAll(WORD)].map((match) => ({
    text: match[0].toLowerCase().replace('’', "'"),
    start: match.index,
    end: match.index + match[0].length,
  }));
}

/** Where a quote's words occur, in order, as character spans. */
function occurrences(haystack: readonly Span[], quote: string): Array<[number, number]> {
  const wanted = wordsOf(quote).map((word) => word.text);
  const found: Array<[number, number]> = [];
  if (wanted.length === 0) return found;
  for (let from = 0; from + wanted.length <= haystack.length; from += 1) {
    if (wanted.every((word, offset) => haystack[from + offset]!.text === word)) {
      found.push([haystack[from]!.start, haystack[from + wanted.length - 1]!.end]);
    }
  }
  return found;
}

/** A pair the server believes, with what identifies each figure in a draft. */
export interface Supersession {
  readonly withdrawn: string;
  readonly replacement: string;
}

/**
 * The pairs her notes bear out. The old figure must carry a number, a day or a
 * month, or be at least two words: a single common word is too easy to find in
 * a sentence that never meant it.
 */
export function verifiedSupersessions(
  source: string,
  corrections: readonly RetractionCorrection[],
  locale: Locale = 'en',
): Supersession[] {
  const words = wordsOf(source);
  const kept: Supersession[] = [];
  for (const { withdrawn, replacement } of corrections) {
    if (withdrawn.trim() === '' || replacement.trim() === '') continue;
    if (factTokens(withdrawn).size === 0 && wordsOf(withdrawn).length < 2) continue;
    const backed = occurrences(words, withdrawn).some(([from, to]) =>
      occurrences(words, replacement).some(([start, end]) => {
        if (start < to) return false;
        const between = source.slice(from, Math.min(source.length, end + CUE_AFTER));
        return CUES[locale].test(between);
      }),
    );
    if (backed && !kept.some((pair) => pair.withdrawn === withdrawn)) kept.push({ withdrawn, replacement });
  }
  return kept;
}

/** Does `text` state this figure? Its words in order, or for a number its tokens. */
function states(text: string, figure: string): boolean {
  if (occurrences(wordsOf(text), figure).length > 0) return true;
  const tokens = [...factTokens(figure).keys()];
  if (tokens.length === 0) return false;
  const here = factTokens(text);
  return tokens.every((token) => here.has(token));
}

/** Where a sentence divides into clauses: a comma, a semicolon or a dash. */
const CLAUSE = /(?=[,;—–]\s)/u;

export interface SupersededOutcome {
  readonly sections: Sections;
  /** Clauses taken out, verbatim. */
  readonly removed: readonly string[];
  /** Old figures still standing alone in the draft, for her to fix. */
  readonly stale: readonly string[];
}

/** The draft with every clause that restates a corrected figure taken out. */
export function removeSuperseded(sections: Sections, pairs: readonly Supersession[]): SupersededOutcome {
  const removed: string[] = [];
  const stale = new Set<string>();
  if (pairs.length === 0) return { sections, removed, stale: [] };
  const out: Record<string, string> = {};
  for (const [name, body] of Object.entries(sections)) {
    const sentences = body.match(/[^.!?]+[.!?]*\s*/g) ?? [];
    let next = '';
    for (const sentence of sentences) {
      let current = sentence;
      for (const { withdrawn, replacement } of pairs) {
        if (!states(current, withdrawn)) continue;
        if (!states(current, replacement)) {
          stale.add(withdrawn);
          continue;
        }
        const clauses = current.split(CLAUSE);
        const index = clauses.findIndex(
          (clause, at) => at > 0 && states(clause, withdrawn) && !states(clause, replacement),
        );
        if (index === -1) continue;
        removed.push(clauses[index]!.replace(/^[,;—–]\s*/u, '').trim());
        const ending = /[.!?]\s*$/u.exec(clauses[index]!)?.[0] ?? '';
        clauses.splice(index, 1);
        current = clauses.join('');
        if (ending !== '' && !/[.!?]\s*$/u.test(current)) current = `${current.trimEnd()}${ending}`;
      }
      next += current;
    }
    out[name] = next.trim() === body.trim() ? body : next.trimEnd();
  }
  return { sections: removed.length === 0 ? sections : out, removed, stale: [...stale] };
}
