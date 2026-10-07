import type { Locale, Sections } from '@apunta/shared';

import { factTokens, medicationTokens } from './fact-guard.js';

/**
 * Taking out background she never gathered, written up as a negative finding.
 *
 * Eval fixture `09`: "I don't have family history, I don't have prior
 * treatment, I don't have medical, I don't have substance use" — she is saying
 * the client would not discuss it — came back 3/3 as "Patient reported no
 * family history, no prior treatment, no medical conditions, no substance use".
 * That records findings the client never gave. The intake instructions already
 * forbid exactly this ("Never turn missing background into a negative finding
 * about the patient") and the 4B does it anyway, so, as with retractions and
 * the lost risk review, the server decides.
 *
 * The server takes the sentence out and leaves one fixed line in its place,
 * `NOT_GATHERED_NOTE`, so the open item she named stays visible — the
 * instruction's own remedy ("record that she did not gather it"). A drafted
 * sentence goes when it
 * negates a topic she said she does not have, and every negated item in it is
 * such a topic, and she never states that negative herself elsewhere ("no
 * substance issues she reported"). A sentence that also carries a risk word, a
 * number or a medication stays: removing it could take a true fact with it,
 * and a mixed sentence is hers to fix in review.
 *
 * English and Mexican Spanish, each with its own words (`LANGUAGES`); the
 * note's own language picks them.
 */

type Topic = 'family' | 'treatment' | 'medical' | 'substance' | 'childhood' | 'relationship' | 'trauma';

/** A whole-word, accent-aware pattern (JavaScript's `\b` stops at "í"). */
function words(pattern: string, flags = 'i'): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${pattern})(?![\\p{L}\\p{N}_])`, `${flags}u`);
}

interface GatheringLanguage {
  readonly topics: readonly (readonly [Topic, RegExp])[];
  /**
   * Her words for "I did not gather this", followed by what she did not gather,
   * up to the end of the clause: "I don't have anything on childhood or
   * relationships", "no tengo antecedentes familiares".
   */
  readonly notGathered: RegExp;
  readonly negative: RegExp;
  /** A sentence already saying the information is missing is right, not a finding. */
  readonly saysMissing: RegExp;
  readonly risk: RegExp;
  /** Where a list's items are split: commas, semicolons and the language's "and". */
  readonly clauses: RegExp;
  /**
   * What stands where an invented negative was: the open item she named, in
   * words that name no topic. Naming one ("family history was not gathered")
   * reads, on a skim, like the finding it replaces.
   */
  readonly note: string;
}

const LANGUAGES: Readonly<Record<Locale, GatheringLanguage>> = {
  en: {
    topics: [
      ['family', words('family (?:psychiatric |mental health )?history|family psychiatric')],
      [
        'treatment',
        words('(?:prior|previous|past) (?:treatment|therapy|therapists?|counsel\\w*)|treatment history'),
      ],
      ['medical', words('medical|physical health')],
      ['substance', words('substances?|alcohol|drugs?|drinking')],
      ['childhood', words('childhood|developmental')],
      ['relationship', words('relationships?|marital')],
      ['trauma', words('trauma')],
    ],
    notGathered:
      /\bI\s+(?:don['’]t|do\s+not|didn['’]t|did\s+not|haven['’]t|have\s+not)\s+(?:have|get(?:\s+to)?|gather|ask\s+about|cover|know\s+about)\b([^.;,!?]*)/gi,
    negative: words('no|denie[sd]|denies|deny|without|negative for|unremarkable|none|non-contributory'),
    saysMissing: words(
      'not (?:yet )?(?:discussed|obtained|gathered|explored|assessed|covered|ready)|declined|deferred|unknown|unclear|open|to be (?:obtained|gathered|explored|discussed)|did not (?:get|gather|obtain|discuss)',
    ),
    risk: words(
      'suicid\\w*|self[-\\s]?harm\\w*|homicid\\w*|kill\\w*|harm (?:anyone|others|him|her|them)\\w*|SI|HI',
    ),
    clauses: /[,;]|\band\b/i,
    note: 'Background not yet gathered.',
  },
  'es-MX': {
    topics: [
      ['family', words('antecedentes (?:psiqui[áa]tricos )?familiares|historia (?:cl[íi]nica )?familiar')],
      ['treatment', words('(?:tratamientos?|terapias?|terapeutas?) (?:previ[oa]s?|anterior(?:es)?)')],
      ['medical', words('m[ée]dic[oa]s?|salud f[íi]sica')],
      ['substance', words('sustancias?|alcohol|drogas?|consumo')],
      ['childhood', words('infancia|ni[ñn]ez|desarrollo')],
      ['relationship', words('relaci[óo]n(?:es)?|pareja')],
      ['trauma', words('trauma\\w*')],
    ],
    notGathered:
      /(?<![\p{L}])no\s+(?:tengo|tenemos|pregunt[ée]|recab[ée]|obtuve|cubr[íi]|s[ée]\s+nada)\s+(?:nada\s+(?:de|sobre)\s+|sobre\s+|por\s+|de\s+)?([^.;,!?]*)/giu,
    negative: words('no|niega|neg[óo]|sin|ningun[oa]?|nunca|negativ[oa]s?'),
    saysMissing: words(
      'no (?:se )?(?:ha )?(?:abordad[oa]s?|explorad[oa]s?|recabad[oa]s?|obtenid[oa]s?|discutid[oa]s?|evaluad[oa]s?)|pendientes?|no estaba list[oa]|declin\\w*|desconoc\\w*|por (?:recabar|explorar)|a[úu]n no',
    ),
    risk: words(
      'suicid\\w*|autolesi\\w*|homicid\\w*|matarse|quitarse la vida|lastimar\\w*|hacerse da[ñn]o|SI|HI',
    ),
    clauses: /[,;]|(?<![\p{L}])y(?![\p{L}])/iu,
    note: 'Antecedentes aún no recabados.',
  },
};

function topicsIn(text: string, language: GatheringLanguage): Set<Topic> {
  const found = new Set<Topic>();
  for (const [topic, re] of language.topics) if (re.test(text)) found.add(topic);
  return found;
}

/** The topics she says she does not have. */
export function notGatheredTopics(source: string, locale: Locale = 'en'): Set<Topic> {
  const language = LANGUAGES[locale];
  const found = new Set<Topic>();
  for (const match of source.matchAll(language.notGathered)) {
    for (const topic of topicsIn(match[1] ?? '', language)) found.add(topic);
  }
  return found;
}

const SENTENCE = /[^.!?]+[.!?]*/g;

/** The topics this source states a negative about in its own voice, outside any "I don't have". */
function statedNegatives(source: string, language: GatheringLanguage): Set<Topic> {
  const found = new Set<Topic>();
  for (const match of source.matchAll(SENTENCE)) {
    const sentence = match[0].replace(language.notGathered, ' ');
    for (const clause of sentence.split(language.clauses)) {
      if (language.negative.test(clause)) for (const topic of topicsIn(clause, language)) found.add(topic);
    }
  }
  return found;
}

/**
 * Is this drafted sentence a negative finding about background she never
 * gathered, and nothing else? Every clause must be either part of that list
 * ("no family history", "no medical conditions", "and no relevant childhood")
 * or empty; a clause about anything else keeps the sentence.
 */
function isInventedNegative(
  sentence: string,
  ungathered: ReadonlySet<Topic>,
  language: GatheringLanguage,
): boolean {
  if (language.saysMissing.test(sentence) || language.risk.test(sentence)) return false;
  if (factTokens(sentence).size > 0 || medicationTokens(sentence).size > 0) return false;
  let negated = false;
  for (const clause of sentence.split(language.clauses)) {
    if (clause.replace(/[\s.!?]/g, '') === '') continue;
    const topics = topicsIn(clause, language);
    if (topics.size === 0) return false;
    for (const topic of topics) if (!ungathered.has(topic)) return false;
    negated ||= language.negative.test(clause);
  }
  return negated;
}

/** The English line, kept as a named export for its callers and tests. */
export const NOT_GATHERED_NOTE = LANGUAGES.en.note;

/** The line that replaces an invented negative, in the note's language. */
export function notGatheredNote(locale: Locale = 'en'): string {
  return LANGUAGES[locale].note;
}

export interface NotGatheredOutcome {
  readonly sections: Sections;
  /** The drafted sentences taken out, verbatim, in note order. */
  readonly removed: readonly string[];
}

/** The draft with every invented negative about ungathered background replaced by `NOT_GATHERED_NOTE`. */
export function removeInventedNegatives(
  source: string,
  sections: Sections,
  locale: Locale = 'en',
): NotGatheredOutcome {
  const language = LANGUAGES[locale];
  const ungathered = notGatheredTopics(source, locale);
  for (const topic of statedNegatives(source, language)) ungathered.delete(topic);
  if (ungathered.size === 0) return { sections, removed: [] };

  const removed: string[] = [];
  const out: Record<string, string> = {};
  for (const [name, body] of Object.entries(sections)) {
    const kept: string[] = [];
    for (const paragraph of body.split(/\n{2,}/)) {
      const sentences = paragraph.match(SENTENCE) ?? [];
      const keep: string[] = [];
      let marked = false;
      for (const sentence of sentences) {
        if (!isInventedNegative(sentence, ungathered, language)) {
          keep.push(sentence);
          continue;
        }
        removed.push(sentence.trim());
        if (!marked) keep.push(` ${language.note}`);
        marked = true;
      }
      const text = keep.join('').trim();
      if (text !== '' || paragraph.trim() === '') kept.push(text);
    }
    out[name] = kept.join('\n\n').trim();
  }
  return { sections: removed.length === 0 ? sections : out, removed };
}
