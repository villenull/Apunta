import {
  MAX_RETRACTION_GAP_WORDS,
  MAX_WITHDRAWN_WORDS,
  type AppliedRetraction,
  type RetractionCorrection,
} from '@apunta/shared';

/**
 * Applying spoken retractions to a transcript, server-side.
 *
 * The model's part is to quote what she took back (`buildExtractRetractionsPrompt`).
 * This module decides what to believe: a quote is applied only when it is in
 * the transcript verbatim and ends within a few words of a spoken marker.
 * One quote per marker, the nearest wins. What the model lists beyond that —
 * and on live dictations it listed the risk statement, the homework and the
 * aside, all as "withdrawn" — is dropped without effect.
 *
 * The result is the transcript with the retracted words and the marker cut
 * out, tidied just enough to read as sentences. Nothing is ever added: every
 * character of the output is a character of the input, in order.
 */

/**
 * The ways a retraction is said aloud. Deliberately narrow: a miss costs one
 * sentence, a false positive cuts real content out of a note — so the list
 * grows only from her real dictations, never from imagination.
 */
const RETRACTION_MARKER_SOURCE =
  "\\b(?:scratch that|strike that|forget that|never ?mind|actually,? no\\b|no,? wait\\b|wait,? no\\b|that'?s wrong|that was last (?:session|week|time)|start (?:over|again)|let me start again)\\b";

const RETRACTION_MARKER = new RegExp(RETRACTION_MARKER_SOURCE, 'i');

/** Does this source contain a spoken retraction at all? */
export function hasRetraction(source: string): boolean {
  return RETRACTION_MARKER.test(source);
}

export interface RetractionOutcome {
  /** The transcript with every applied retraction cut out. */
  readonly text: string;
  readonly applied: readonly AppliedRetraction[];
}

interface Word {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/** Contiguous markers ("actually no, scratch that, that was last session") act as one. */
interface MarkerGroup {
  readonly start: number;
  readonly end: number;
  readonly firstWord: number;
  readonly lastWord: number;
}

interface Candidate {
  readonly correction: RetractionCorrection;
  readonly from: number;
  readonly to: number;
  readonly gap: number;
}

const WORD = /[A-Za-z0-9]+(?:['’][A-Za-z]+)?/g;

function wordsOf(text: string): Word[] {
  const words: Word[] = [];
  for (const match of text.matchAll(WORD)) {
    words.push({
      text: match[0].toLowerCase().replace('’', "'"),
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return words;
}

/** Every spoken marker in the text, in order. */
export function retractionMarkerMatches(
  text: string,
): Array<{ readonly index: number; readonly text: string }> {
  return [...text.matchAll(new RegExp(RETRACTION_MARKER_SOURCE, 'gi'))].map((match) => ({
    index: match.index,
    text: match[0],
  }));
}

function markerGroups(text: string, words: readonly Word[]): MarkerGroup[] {
  const groups: MarkerGroup[] = [];
  for (const match of retractionMarkerMatches(text)) {
    const start = match.index;
    const end = start + match.text.length;
    const firstWord = words.findIndex((word) => word.start >= start);
    if (firstWord === -1) continue;
    let lastWord = firstWord;
    while (lastWord + 1 < words.length && words[lastWord + 1]!.end <= end) lastWord += 1;
    const previous = groups[groups.length - 1];
    if (previous && firstWord <= previous.lastWord + 1) {
      groups[groups.length - 1] = { start: previous.start, end, firstWord: previous.firstWord, lastWord };
    } else {
      groups.push({ start, end, firstWord, lastWord });
    }
  }
  return groups;
}

/** Every place `quote` occurs in `words`, as [from, to) word ranges. */
function occurrences(words: readonly Word[], quote: readonly string[]): Array<[number, number]> {
  const found: Array<[number, number]> = [];
  if (quote.length === 0) return found;
  for (let from = 0; from + quote.length <= words.length; from += 1) {
    let matches = true;
    for (let offset = 0; offset < quote.length; offset += 1) {
      if (words[from + offset]!.text !== quote[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) found.push([from, from + quote.length]);
  }
  return found;
}

function quoteWords(quote: string): string[] {
  return wordsOf(quote).map((word) => word.text);
}

function overlapsMarker(from: number, to: number, groups: readonly MarkerGroup[]): boolean {
  return groups.some((group) => group.firstWord < to && group.lastWord >= from);
}

/**
 * Apply the model's corrections to the transcript, believing only what the
 * transcript itself bears out.
 */
export function applyRetractions(
  transcript: string,
  corrections: readonly RetractionCorrection[],
): RetractionOutcome {
  const words = wordsOf(transcript);
  const groups = markerGroups(transcript, words);
  if (groups.length === 0 || corrections.length === 0) return { text: transcript, applied: [] };

  // Best candidate per marker group: nearest, then shortest.
  const chosen = new Map<MarkerGroup, Candidate>();
  for (const correction of corrections) {
    const quote = quoteWords(correction.withdrawn);
    if (quote.length === 0 || quote.length > MAX_WITHDRAWN_WORDS) continue;
    for (const [from, to] of occurrences(words, quote)) {
      if (overlapsMarker(from, to, groups)) continue;
      for (const group of groups) {
        const gap = group.firstWord - to;
        if (gap < 0 || gap > MAX_RETRACTION_GAP_WORDS) continue;
        const current = chosen.get(group);
        const better =
          current === undefined ||
          gap < current.gap ||
          (gap === current.gap && to - from < current.to - current.from);
        if (better) chosen.set(group, { correction, from, to, gap });
      }
    }
  }
  if (chosen.size === 0) return { text: transcript, applied: [] };

  const cuts: Array<[number, number]> = [];
  const applied: AppliedRetraction[] = [];
  for (const group of groups) {
    const candidate = chosen.get(group);
    if (!candidate) continue;
    cuts.push([words[candidate.from]!.start, words[candidate.to - 1]!.end]);
    cuts.push([group.start, group.end]);
    applied.push({
      withdrawn: transcript.slice(words[candidate.from]!.start, words[candidate.to - 1]!.end),
      replacement: replacementAfter(transcript, words, group, candidate.correction.replacement),
    });
  }
  cuts.sort((a, b) => a[0] - b[0]);

  return { text: tidy(cutOut(transcript, cuts)), applied };
}

/** The replacement, only if she said it verbatim within a few words after the marker. */
function replacementAfter(
  transcript: string,
  words: readonly Word[],
  group: MarkerGroup,
  replacement: string,
): string {
  const quote = quoteWords(replacement);
  if (quote.length === 0 || quote.length > MAX_WITHDRAWN_WORDS) return '';
  const first = group.lastWord + 1;
  for (const [from, to] of occurrences(words, quote)) {
    if (from >= first && from - first <= MAX_RETRACTION_GAP_WORDS) {
      return transcript.slice(words[from]!.start, words[to - 1]!.end);
    }
  }
  return '';
}

/** A sentinel (private-use, never in a transcript) marks each cut so `tidy` can see where a sentence lost its middle. */
const CUT = '\uE000';

function cutOut(text: string, cuts: readonly (readonly [number, number])[]): string {
  let out = '';
  let cursor = 0;
  for (const [from, to] of cuts) {
    if (from < cursor) continue; // overlapping cut, already removed
    out += text.slice(cursor, from) + CUT;
    cursor = to;
  }
  return out + text.slice(cursor);
}

/**
 * Make what is left read as sentences.
 *
 * A lead-in of up to three words whose sentence was otherwise cut away goes
 * with it, along with the punctuation the cuts left behind, up to the next
 * sentence ("He says he's." → nothing). A lead-in whose sentence carries on
 * after the cut stays ("He says he's, it's more like six."), and a short
 * sentence nothing was cut from is never touched. Then the cut marks come out
 * and doubled punctuation is collapsed.
 */
function tidy(text: string): string {
  const withoutStubs = text.replace(
    /(^|[.!?]\s+)(?:[\w'’]+[,;:]?\s+){0,2}[\w'’]+[,;:]?\s*\uE000(?:\uE000|[\s.,;:!?])*(?=[A-Z0-9]|$)/g,
    '$1',
  );
  return withoutStubs
    .replaceAll(CUT, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/[.,;:!?](?:\s*[.,;:!?])+/g, (run) => {
      const ends = run.replace(/[^.!?]/g, '');
      return ends === '' ? run.trimEnd().slice(-1) : ends.slice(-1);
    })
    .replace(/^[\s.,;:!?]+/, '')
    .replace(/([.!?]\s)[,;:\s]+/g, '$1')
    .replace(
      /(^|[.!?]\s)([a-z])/g,
      (_match, boundary: string, letter: string) => boundary + letter.toUpperCase(),
    )
    .trim();
}

/** The opening of the sentence the server adds under the first-pass message. Stripped from the model's history. */
export const RETRACTION_NOTICE_OPENING = 'Apunta applied the corrections you made as you spoke';

/** For the note's opening chat turn: what was left out, in her own words. */
export function retractionNotice(applied: readonly AppliedRetraction[]): string {
  const items = applied.map((item) =>
    item.replacement === ''
      ? `left out “${item.withdrawn}”`
      : `left out “${item.withdrawn}” in favour of “${item.replacement}”`,
  );
  const list =
    items.length <= 1
      ? (items[0] ?? '')
      : `${items.slice(0, -1).join('; ')}; and ${items[items.length - 1]!}`;
  return `${RETRACTION_NOTICE_OPENING}, before drafting: ${list}.`;
}
