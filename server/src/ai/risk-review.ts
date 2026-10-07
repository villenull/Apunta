import {
  sectionRole,
  type JsonSchemaObject,
  type Locale,
  type SectionRoleId,
  type Sections,
} from '@apunta/shared';
import { z } from 'zod';

/**
 * Putting a dropped risk review back into a draft, server-side.
 *
 * Measured (`docs/eval-reports/2026-09-23-model-quality-round.md`): on a
 * four-section intake the 4B drafted a risk review she carried out into no
 * section at all — fixture `19` with no risk content anywhere, `10` with the
 * passive ideation kept and the denial of a plan gone — 3/3 runs each, through
 * a user-turn reminder that told it not to. A prompt cannot reach that, so,
 * as with spoken retractions (`retractions.ts`), the server decides.
 *
 * Only after a draft that carries no risk content at all, from a source that
 * shows a review, the model is asked one narrow question: quote each place she
 * reports the review. The server puts **her own sentences** back — each quote
 * found word for word in the source and widened to the whole sentences it sits
 * in — quoted and labelled as dictated, in the risk section if the format has
 * one and otherwise the section a review belongs in by role. Nothing the model
 * writes reaches the note. An earlier version kept model-written sentences
 * behind lexical checks; three review rounds each found a way for a denial and
 * a finding to swap places, so the owner chose her words over prose
 * (`docs/eval-reports/2026-10-06-risk-review-repair.md`). A partial review in
 * the draft is left alone; this is for the review that vanished.
 *
 * English and Mexican Spanish, each with its own words for the gate, the
 * dimensions and the labels (`LANGUAGES`); the note's own language picks them.
 */

/**
 * The three things a risk review is about. A sentence carries a dimension when
 * it names it; SI and HI only in capitals, because "si" and "hi" are words
 * (and "sí" is "yes").
 */
type RiskDimension = 'suicide' | 'self_harm' | 'others';

/**
 * A whole-word pattern that also works on accented words. JavaScript's `\b`
 * only knows ASCII letters, so "aquí" would have no boundary after the "í".
 */
function words(pattern: string, flags = 'i'): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${pattern})(?![\\p{L}\\p{N}_])`, `${flags}u`);
}

interface RiskLanguage {
  /** A review she carried out: a risk word and a review verb, anywhere in the source. */
  readonly term: RegExp;
  readonly verb: RegExp;
  readonly dimensions: readonly (readonly [RiskDimension, RegExp])[];
  /**
   * A bare "injury" is self-harm only inside a review the model quoted: "she
   * said no when I asked whether the hand-washing had ever gone to the point
   * of injury". In a draft it is far more often a sprained ankle, and counting
   * it there would excuse a draft that lost its review.
   */
  readonly quotedInjury: RegExp;
  /**
   * A sentence with no risk in it joins the review only when the same quote
   * runs on into it from a risk sentence and it answers that sentence: "I did
   * ask about self-harm and suicide directly. He said no to both." A quote that
   * drifts on into "She mentioned she cried at her sister's wedding" does not
   * take that sentence with it.
   */
  readonly answer: RegExp;
  /** The label in the format's risk section, and in any other section. */
  readonly labels: { readonly inRisk: string; readonly elsewhere: string };
  /** What a section says when it says nothing. */
  readonly empty: RegExp;
}

const PERSON_SELF = '(?:him|her|them|my|your|one)sel(?:f|ves)';

const LANGUAGES: Readonly<Record<Locale, RiskLanguage>> = {
  en: {
    term: /\b(?:self[-\s]?harm|suicid\w*|homicid\w*|hurt(?:ing)?|risk|safety plan|SI|HI)\b/i,
    verb: /\b(?:denie[sd]|denies|asked|no (?:thoughts|history|plan|intent)|said no)\b/i,
    dimensions: [
      [
        'suicide',
        words(
          `suicid\\w*|kill(?:ing)?\\s+${PERSON_SELF}|end(?:ing)?\\s+(?:it all|(?:his|her|their|my)\\s+(?:own\\s+)?life)|not (?:waking|wake) up|not want(?:ing)? to be (?:here|alive|around)|want(?:s|ed)? to die|better off dead`,
        ),
      ],
      ['suicide', words('SI', '')],
      [
        'self_harm',
        words(
          `self[-\\s]?harm\\w*|self[-\\s]?injur\\w*|(?:hurt(?:ing)?|harm(?:ing)?|cut(?:ting)?)\\s+${PERSON_SELF}`,
        ),
      ],
      [
        'others',
        words(
          'homicid\\w*|(?:hurt|harm)(?:ing)?\\s+(?:anyone|anybody|someone|somebody|others|other people)|hit (?:anyone|anybody|someone|somebody)|violen\\w*',
        ),
      ],
      ['others', words('HI', '')],
    ],
    quotedInjury: words('injur(?:y|ies|ed|ing)'),
    answer: words('no|yes|den(?:y|ies|ied)|none|never|neither|nothing'),
    labels: { inRisk: 'As dictated', elsewhere: 'Risk review, as dictated' },
    empty: /^(?:none|n\/a|nil|not discussed)?\.?$/i,
  },
  'es-MX': {
    term: words(
      'suicid\\w*|autolesi\\w*|lastimar\\w*|hacerse da[ñn]o|quitarse la vida|matarse|homicid\\w*|riesgo|ideaci[óo]n|plan de seguridad|SI|HI',
    ),
    verb: words(
      'neg[óo]|niega|negaron|negando|pregunt[éeó]|le pregunt\\w*|dijo que no|refiere que no|no hay|sin (?:ideaci[óo]n|plan|intenci[óo]n)|ningun[oa]?|nunca',
    ),
    dimensions: [
      [
        'suicide',
        words(
          'suicid\\w*|quitarse la vida|matarse|morirse|no despertar(?:se)?|ya no (?:quiere|quer[íi]a|quisiera) (?:vivir|estar aqu[íi]|despertar)|deseos? de (?:morir|muerte)|mejor muert[oa]',
        ),
      ],
      ['suicide', words('SI', '')],
      [
        'self_harm',
        words(
          'autolesi\\w*|lastimarse|hacerse da[ñn]o|cortarse|herirse|da[ñn]arse|lastimar(?:se)? a s[íi] mism[oa]',
        ),
      ],
      [
        'others',
        words(
          'homicid\\w*|lastimar a (?:alguien|otros|otras personas|nadie)|hacer(?:le)? da[ñn]o a (?:alguien|otros|otras personas|nadie)|violen\\w*|agredir\\w*',
        ),
      ],
      ['others', words('HI', '')],
    ],
    quotedInjury: words('lesi[óo]n(?:es)?|herida(?:s)?'),
    answer: words('no|s[íi]|neg[óo]|niega|nunca|ningun[oa]|nada|tampoco|ninguno de los dos'),
    labels: { inRisk: 'Según lo dictado', elsewhere: 'Revisión de riesgo, según lo dictado' },
    empty: /^(?:ninguno|ninguna|nada|no aplica|n\/a|no se abord[óo])?\.?$/iu,
  },
};

/** Does this source show a risk review? The same gate the drafting reminder uses. */
export function hasRiskReview(source: string, locale: Locale = 'en'): boolean {
  const language = LANGUAGES[locale];
  return language.term.test(source) && language.verb.test(source);
}

function dimensionsOf(text: string, locale: Locale, quoted = false): Set<RiskDimension> {
  const language = LANGUAGES[locale];
  const found = new Set<RiskDimension>();
  for (const [dimension, re] of language.dimensions) if (re.test(text)) found.add(dimension);
  if (quoted && language.quotedInjury.test(text)) found.add('self_harm');
  return found;
}

/** Does the drafted note say anything at all about risk? */
export function draftCarriesRisk(sections: Sections, locale: Locale = 'en'): boolean {
  return Object.values(sections).some((body) => dimensionsOf(body, locale).size > 0);
}

/**
 * Did the draft lose a review the source shows? The source must name a risk
 * dimension too, not only pass the reminder's broader gate: "her back hurt, I
 * asked about work" passes that gate, and is not worth a model call.
 */
export function riskReviewLost(source: string, sections: Sections, locale: Locale = 'en'): boolean {
  return (
    hasRiskReview(source, locale) &&
    dimensionsOf(source, locale).size > 0 &&
    !draftCarriesRisk(sections, locale)
  );
}

/** The places the model says she reports the review, quoted. */
export const RiskQuotesSchema = z.object({
  quotes: z.array(z.string()).max(20),
});

/** Ollama's `format` for the quoting call. Never shown to the model; the prompt restates it. */
export function riskQuotesJsonSchema(): JsonSchemaObject {
  return {
    type: 'object',
    properties: { quotes: { type: 'array', items: { type: 'string' }, maxItems: 20 } },
    required: ['quotes'],
    additionalProperties: false,
  };
}

/** At most this many of her sentences go into a note; a review is a few lines. */
export const MAX_RISK_SENTENCES = 6;

interface Span {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/** A word in either language: accented letters are letters ("decisión"). */
const WORD = /[\p{L}\p{N}]+(?:['’]\p{L}+)?/gu;

function wordsOf(text: string): Span[] {
  return [...text.matchAll(WORD)].map((match) => ({
    text: match[0].toLowerCase().replace('’', "'"),
    start: match.index,
    end: match.index + match[0].length,
  }));
}

/**
 * Where one of her sentences ends. Punctuation ends one only before a space and
 * the next word, or the end of the text, so "11.30pm" stays whole, and never
 * after a title, "a.m."/"p.m.", "e.g." or an initial: "She told Dr. Jones she
 * has thoughts of killing herself but would never act on it" is one sentence. A
 * line break ends one only as a blank line, or before a list marker or a heading
 * ("Plan:"); a soft wrap stays together, whether the next line starts "but has
 * no current plan" or "I confirmed she has no plan". Getting this wrong cuts a qualifying
 * clause off a risk statement, so it errs toward longer sentences.
 */
const SENTENCE_END =
  /(?<!\b(?:Dr|Dra|Mr|Mrs|Ms|Mx|St|Prof|Sr|Sra|Srta|Jr|Lic|Psic|Ing|Ud|Uds|vs|etc|approx|aprox|[ap]\.m|e\.g|i\.e|\p{Lu}))[.!?]+["'”’)»]*(?=\s+["'“‘(«¿¡]?\p{L}|\s*$)|\n[ \t]*\n|\n(?=[ \t]*(?:\p{Lu}[\p{L} ]{0,24}:|[-*•]|\d+[.)]))/gu;

/** Her sentences, with where each sits in the source. */
function sentencesOf(source: string): Span[] {
  const cuts = [0];
  for (const match of source.matchAll(SENTENCE_END)) {
    cuts.push(match[0].startsWith('\n') ? match.index : match.index + match[0].length);
  }
  cuts.push(source.length);
  const sentences: Span[] = [];
  for (let index = 0; index + 1 < cuts.length; index += 1) {
    const raw = source.slice(cuts[index], cuts[index + 1]);
    const text = raw.trim();
    if (text === '') continue;
    const start = cuts[index]! + raw.indexOf(text);
    sentences.push({ text, start, end: start + text.length });
  }
  return sentences;
}

/** Where `quote` sits in the source, as character offsets, matching words alone. */
function locate(sourceWords: readonly Span[], quote: string): Array<[number, number]> {
  const wanted = wordsOf(quote).map((word) => word.text);
  const found: Array<[number, number]> = [];
  if (wanted.length === 0) return found;
  for (let from = 0; from + wanted.length <= sourceWords.length; from += 1) {
    if (wanted.every((word, offset) => sourceWords[from + offset]!.text === word)) {
      found.push([sourceWords[from]!.start, sourceWords[from + wanted.length - 1]!.end]);
    }
  }
  return found;
}

/**
 * Her own sentences that carry the review, in the order she said them.
 *
 * The model only points. A quote counts only where its words occur in the
 * source in order, and it is always widened to the whole sentence or sentences
 * it sits in: a fragment cut from the middle can be word-for-word and still say
 * the opposite ("she has thoughts of killing herself" out of "she denied she
 * has thoughts of killing herself"). Of the sentences a quote covers, those
 * that name a risk are kept, and a risk-free one only when it answers the risk
 * sentence before it (the language's `answer`). Nothing the server returns is
 * anything but her text.
 */
export function riskSentencesFromQuotes(
  source: string,
  quotes: readonly string[],
  locale: Locale = 'en',
): string[] {
  const language = LANGUAGES[locale];
  const sourceWords = wordsOf(source);
  const sentences = sentencesOf(source);
  const chosen = new Set<number>();
  for (const quote of quotes) {
    for (const [from, to] of locate(sourceWords, quote)) {
      const covering = sentences
        .map((sentence, index) => ({ sentence, index }))
        .filter(({ sentence }) => sentence.start < to && sentence.end > from);
      // Only this quote's own run: a second quote that happens to land on the
      // next sentence does not make that sentence an answer.
      let previousKept = false;
      for (const { sentence, index } of covering) {
        previousKept =
          dimensionsOf(sentence.text, locale, true).size > 0 ||
          (previousKept && language.answer.test(sentence.text));
        if (previousKept) chosen.add(index);
      }
    }
  }
  return [...chosen]
    .sort((a, b) => a - b)
    .slice(0, MAX_RISK_SENTENCES)
    .map((index) => sentences[index]!.text.replace(/\s+/g, ' '));
}

/** Where a review goes when the format has no section for it, best first. */
const HOME_ROLES: readonly SectionRoleId[] = [
  'risk',
  'presenting_problem',
  'subjective',
  'presentation',
  'discussion',
  'history',
];

/** Roles a review must never be filed under: conclusions and forward plans. */
const NEVER_HOME: ReadonlySet<SectionRoleId> = new Set([
  'formulation',
  'assessment',
  'plan',
  'actions',
  'next_session',
]);

/** The section the review goes in. */
export function riskHomeSection(sections: readonly string[]): string | undefined {
  for (const role of HOME_ROLES) {
    const found = sections.find((section) => sectionRole(section) === role);
    if (found !== undefined) return found;
  }
  return sections.find((section) => !NEVER_HOME.has(sectionRole(section))) ?? sections[0];
}

/**
 * The draft with her sentences added, quoted and labelled as hers: the whole
 * body of an empty or "None." section, or a new paragraph after what is there.
 * In a section that is not the risk section the label names the review.
 */
export function withRiskReview(
  sections: Sections,
  order: readonly string[],
  sentences: readonly string[],
  locale: Locale = 'en',
): Sections {
  const home = riskHomeSection(order);
  if (home === undefined || sentences.length === 0) return sections;
  const language = LANGUAGES[locale];
  const label = sectionRole(home) === 'risk' ? language.labels.inRisk : language.labels.elsewhere;
  const review = `${label}: "${sentences.join(' ')}"`;
  const current = (sections[home] ?? '').trim();
  const body = language.empty.test(current) ? review : `${current}\n\n${review}`;
  return { ...sections, [home]: body };
}
