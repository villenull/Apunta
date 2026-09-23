/**
 * The pair filter: does a candidate (input → reply) pair add anything the
 * input does not support?
 *
 * This is the eval scorer's own checks, applied to a pair rather than to a
 * scored fixture. `server/src/eval/score.ts` decides whether a *generated*
 * note fabricated, using a hand-written fixture: a banned string (F1), a
 * gating conclusion marker (F6), or a novel diagnosis/risk term against the
 * corpus lexicon (F7). A pair filter has no fixture, so it keeps the two
 * checks that need only the pair — the clinical lexicon and the conclusion
 * markers — and adds the one thing a fixture's `mustNotContain` list encodes
 * for the corpus: **a number, or a name, that is not in the input.**
 *
 * Two uses, one implementation:
 *
 * - `synth/check-dataset.ts` runs it over the synthetic corpus, where it must
 *   drop nothing: a target rendered from the same facts as its input cannot
 *   introduce a term. A non-zero drop count there is a generator bug.
 * - `pipeline/build-pairs.ts` runs it over a consented export, where the
 *   target is Claude's last reply. That is the case it exists for: a reply
 *   that invents a diagnosis, upgrades a description into a condition, or
 *   carries a figure she never gave would otherwise be trained into the model
 *   as *correct*.
 *
 * The lexicons and marker lists are imported, never re-typed: a filter that
 * drifted from the scorer would let through exactly what the eval gates on.
 */

import { loadLexicon, stem } from '../../../server/src/eval/lexicon.js';
import { collapse, f6Core, normalise } from '../../../server/src/eval/patterns.js';
import { sourceForLexicon } from '../../../server/src/eval/score.js';

/** Term categories whose novelty in a note is a fabrication, not a wording choice. */
const GATING_CATEGORIES: Record<string, true> = { diagnosis: true, risk: true, medication: true };

/** Number words the corpus's own trap fixtures turn on ("three years" → "five"). */
const NUMBER_WORDS = [
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'twice',
  'once',
  'thrice',
];

export interface PairVerdict {
  /** Novel diagnosis, risk or medication terms the input does not carry. */
  readonly novelTerms: readonly { readonly term: string; readonly category: string }[];
  /** Core conclusion markers ("consistent with", "indicates", …) in the reply. */
  readonly conclusionMarkers: readonly string[];
  /** Figures in the reply that the input does not contain. */
  readonly novelFigures: readonly string[];
  /** Capitalised words mid-sentence that the input does not contain. Reported, not gating. */
  readonly novelNames: readonly string[];
  readonly keep: boolean;
  readonly reasons: readonly string[];
}

function figureTokens(text: string): string[] {
  const digits = text.match(/\b\d+(?:[.,]\d+)?\b/g) ?? [];
  const words =
    text
      .toLowerCase()
      .match(/\b[a-z]+\b/g)
      ?.filter((word) => NUMBER_WORDS.includes(word)) ?? [];
  return [...digits, ...words];
}

function midSentenceCapitals(text: string): string[] {
  const names: string[] = [];
  for (const sentence of collapse(text).split(/(?<=[.!?])\s+/)) {
    const words = sentence.match(/\b[A-Z][a-z]{2,}\b/g) ?? [];
    // The first word of a sentence is capitalised by grammar, not by being a name.
    const [, ...rest] = sentence.split(/\s+/);
    for (const word of words) {
      if (rest.some((token) => token.startsWith(word))) names.push(word);
    }
  }
  return [...new Set(names)];
}

/**
 * Every check over one pair. `input` is what the therapist gave (her typed
 * notes or her dictation); `reply` is what is being proposed as the target.
 */
export function reviewPair(input: string, reply: string): PairVerdict {
  const lexiconSource = sourceForLexicon(input);
  const note = collapse(reply);
  const stemmedNote = stem(note);
  const stemmedSource = stem(lexiconSource);

  // Exactly the scorer's F7 test (server/src/eval/score.ts): stemmed body,
  // stemmed source, then a second look at the unstemmed source so a plural
  // cannot be called novel against a source that plainly carries the word.
  const novelTerms = loadLexicon()
    .filter((term) => GATING_CATEGORIES[term.category] === true)
    .filter(
      (term) =>
        term.pattern.test(stemmedNote) &&
        !term.pattern.test(stemmedSource) &&
        !new RegExp(`\\b${term.term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(
          lexiconSource,
        ),
    )
    .map((term) => ({ term: term.term, category: term.category }));

  const markerPattern = f6Core();
  const conclusionMarkers: string[] = [];
  for (let match = markerPattern.exec(note); match !== null; match = markerPattern.exec(note)) {
    // The scorer exempts a marker the clinician herself used; so does this.
    if (normalise(lexiconSource).includes(match[0].toLowerCase())) continue;
    conclusionMarkers.push(match[0]);
  }

  const sourceFigures = new Set(figureTokens(input).map((figure) => figure.toLowerCase()));
  const novelFigures = [
    ...new Set(figureTokens(note).filter((figure) => !sourceFigures.has(figure.toLowerCase()))),
  ];

  const sourceWords = new Set(
    collapse(input)
      .toLowerCase()
      .match(/\b[a-z']+\b/g) ?? [],
  );
  const novelNames = midSentenceCapitals(note).filter(
    (name) => !sourceWords.has(name.toLowerCase()) && !normalise(lexiconSource).includes(name.toLowerCase()),
  );

  const reasons: string[] = [];
  if (novelTerms.length > 0) reasons.push('novel clinical term');
  if (conclusionMarkers.length > 0) reasons.push('conclusion marker');
  if (novelFigures.length > 0) reasons.push('novel figure');

  return {
    novelTerms,
    conclusionMarkers,
    novelFigures,
    novelNames,
    keep: reasons.length === 0,
    reasons,
  };
}
