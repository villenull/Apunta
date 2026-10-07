import type { Sections } from '@apunta/shared';

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
 * English only, like the gate that feeds it.
 */

type Topic = 'family' | 'treatment' | 'medical' | 'substance' | 'childhood' | 'relationship' | 'trauma';

const TOPICS: readonly (readonly [Topic, RegExp])[] = [
  ['family', /\bfamily (?:psychiatric |mental health )?history\b|\bfamily psychiatric\b/i],
  [
    'treatment',
    /\b(?:(?:prior|previous|past) (?:treatment|therapy|therapists?|counsel\w*)|treatment history)\b/i,
  ],
  ['medical', /\bmedical\b|\bphysical health\b/i],
  ['substance', /\bsubstances?\b|\balcohol\b|\bdrugs?\b|\bdrinking\b/i],
  ['childhood', /\bchildhood\b|\bdevelopmental\b/i],
  ['relationship', /\brelationships?\b|\bmarital\b/i],
  ['trauma', /\btrauma\b/i],
];

function topicsIn(text: string): Set<Topic> {
  const found = new Set<Topic>();
  for (const [topic, re] of TOPICS) if (re.test(text)) found.add(topic);
  return found;
}

/**
 * Her words for "I did not gather this", followed by what she did not gather,
 * up to the end of the clause: "I don't have anything on childhood or
 * relationships", "I didn't get to family history".
 */
const NOT_GATHERED =
  /\bI\s+(?:don['’]t|do\s+not|didn['’]t|did\s+not|haven['’]t|have\s+not)\s+(?:have|get(?:\s+to)?|gather|ask\s+about|cover|know\s+about)\b([^.;,!?]*)/gi;

/** The topics she says she does not have. */
export function notGatheredTopics(source: string): Set<Topic> {
  const found = new Set<Topic>();
  for (const match of source.matchAll(NOT_GATHERED)) {
    for (const topic of topicsIn(match[1] ?? '')) found.add(topic);
  }
  return found;
}

const SENTENCE = /[^.!?]+[.!?]*/g;
const NEGATIVE = /\b(?:no|denie[sd]|denies|deny|without|negative for|unremarkable|none|non-contributory)\b/i;
/** A sentence already saying the information is missing is right, not a finding. */
const SAYS_MISSING =
  /\bnot (?:yet )?(?:discussed|obtained|gathered|explored|assessed|covered|ready)\b|\bdeclined\b|\bdeferred\b|\bunknown\b|\bunclear\b|\bopen\b|\bto be (?:obtained|gathered|explored|discussed)\b|\bdid not (?:get|gather|obtain|discuss)\b/i;
const RISK =
  /\b(?:suicid\w*|self[-\s]?harm\w*|homicid\w*|kill\w*|SI|HI|harm (?:anyone|others|him|her|them)\w*)\b/;

/** The topics this source states a negative about in its own voice, outside any "I don't have". */
function statedNegatives(source: string): Set<Topic> {
  const found = new Set<Topic>();
  for (const match of source.matchAll(SENTENCE)) {
    const sentence = match[0].replace(NOT_GATHERED, ' ');
    for (const clause of sentence.split(/[,;]|\band\b/i)) {
      if (NEGATIVE.test(clause)) for (const topic of topicsIn(clause)) found.add(topic);
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
function isInventedNegative(sentence: string, ungathered: ReadonlySet<Topic>): boolean {
  if (SAYS_MISSING.test(sentence) || RISK.test(sentence) || /\bSI\b|\bHI\b/.test(sentence)) return false;
  if (factTokens(sentence).size > 0 || medicationTokens(sentence).size > 0) return false;
  let negated = false;
  for (const clause of sentence.split(/[,;]|\band\b/i)) {
    if (clause.replace(/[\s.!?]/g, '') === '') continue;
    const topics = topicsIn(clause);
    if (topics.size === 0) return false;
    for (const topic of topics) if (!ungathered.has(topic)) return false;
    negated ||= NEGATIVE.test(clause);
  }
  return negated;
}

/**
 * What stands where an invented negative was: the open item she named, in
 * words that name no topic. Naming one ("family history was not gathered")
 * reads, on a skim, like the finding it replaces.
 */
export const NOT_GATHERED_NOTE = 'Background not yet gathered.';

export interface NotGatheredOutcome {
  readonly sections: Sections;
  /** The drafted sentences taken out, verbatim, in note order. */
  readonly removed: readonly string[];
}

/** The draft with every invented negative about ungathered background replaced by `NOT_GATHERED_NOTE`. */
export function removeInventedNegatives(source: string, sections: Sections): NotGatheredOutcome {
  const ungathered = notGatheredTopics(source);
  for (const topic of statedNegatives(source)) ungathered.delete(topic);
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
        if (!isInventedNegative(sentence, ungathered)) {
          keep.push(sentence);
          continue;
        }
        removed.push(sentence.trim());
        if (!marked) keep.push(` ${NOT_GATHERED_NOTE}`);
        marked = true;
      }
      const text = keep.join('').trim();
      if (text !== '' || paragraph.trim() === '') kept.push(text);
    }
    out[name] = kept.join('\n\n').trim();
  }
  return { sections: removed.length === 0 ? sections : out, removed };
}
