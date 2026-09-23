import type { Sections } from '@apunta/shared';

import { positiveRiskTokens, riskTokens } from './clinical-phrases.js';

/**
 * The refine path's third lock: a revision may not quietly drop a fact.
 *
 * Found by the refine harness on 2026-09-01 (`e2e/fixtures/refine/README.md`).
 * Asked to shorten a section, the model removed "up from four in June" — a
 * clinical fact — and explained that the detail "was not present in your
 * original dictation". It was in the note it was editing. The refine call
 * never shows a dictation, only the note, so the model treats the note as a
 * claim it cannot verify, prunes what it cannot source, and reports the
 * deletion as a correction. Three prompt attempts failed and the third made
 * two other scenarios worse. So, like the published lock and the boilerplate
 * lock, this is enforced where it cannot be talked out of.
 *
 * The check is a diff, in the opposite direction from the boilerplate lock's:
 * that one stops stock phrases appearing from nowhere; this one stops facts
 * disappearing to nowhere. Two kinds of fact are protected, both by the same
 * survives/named/removal machinery:
 *
 *   - **Countable and calendar facts** — the original class, and still the
 *     bulk of it: **numbers** (digits, number words, "six and a half"),
 *     **months** and **weekdays**. See `factTokens`.
 *   - **Non-numeric load-bearing facts** — added 2026-09-07 for the classes
 *     a shortening most dangerously silences: **explicit risk negations**
 *     ("denied SI", "no safety concerns"), **medications** (a curated psych
 *     formulary plus anything sitting beside a dose), and **names** the note
 *     leans on (titled — "Dr. Alvarez" — and relationship-anchored — "her son
 *     Michael"). See `protectedFactTokens`. Kept narrow on purpose: bare
 *     capitalised words are *not* treated as names, because at that breadth a
 *     lock guesses and blocks edits she asked for.
 *
 * Two things make it a lock and not a nuisance:
 *
 * - It is note-wide. A token has to vanish from the *whole* revision to
 *   count, so moving a sentence between sections passes, and so does
 *   rewriting "four" as "4" or "June" as "Jun", because both sides are
 *   normalised before comparing.
 * - Her message is the way through. A fact she names in her request may go
 *   ("the four in June is out of date"), and a request that asks to remove
 *   something in so many words switches the lock off for that turn — she is
 *   editing, and the lock exists for the turns where she is not. A
 *   highlighted passage is *not* a way through: pointing at a sentence and
 *   saying "shorter" is not permission to lose what it says.
 *
 * Known misses, accepted for precision: a number that also appears elsewhere
 * in the note (set semantics, not counts); "one", excluded because it is a
 * pronoun far more often than a quantity; and a shortening that turns "every
 * two weeks" into "fortnightly", which reads as a loss. For the non-numeric
 * classes: a medication outside the curated list and never written beside a
 * dose; a bare first name mid-sentence (usually the patient, who recurs and is
 * not the thing a shortening drops); and a brand-name rewritten to its generic
 * where no alias is mapped. Her review before publishing is still the last
 * line, as it was before.
 */

/** Number words that are almost always quantities. "one" is left out on purpose. */
const NUMBER_WORDS: Readonly<Record<string, number>> = {
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
  twice: 2,
  thrice: 3,
};

const MONTHS: Readonly<Record<string, number>> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  // "may" the month only when capitalised; see `calendarToken`.
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

const WEEKDAYS: Readonly<Record<string, number>> = {
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sunday: 7,
  // "sat" and "sun" are ordinary words; only the capitalised abbreviation counts.
};

/**
 * Her request asks, in so many words, to take something out. The lock stands
 * down for the turn: she is doing the removing, and it exists for the turns
 * where the model does it on its own.
 *
 * Exported since 2026-09-23 because the request-scope check
 * (`refine-request.ts`) has to read the same signal: a request that removes is
 * a request whose section may shrink, and the two must never disagree about
 * what "remove" means.
 */
export function removalRequested(message: string): boolean {
  return REMOVAL_REQUEST.test(message);
}

const REMOVAL_REQUEST =
  /\b(?:remove|delete|drop|omit|erase|scrap|strike|get rid of|take (?:that |this |it |them )?out|leave (?:that |this |it |them )?out)\b/i;

/** The words around a token, for the notice — a pointer she can find in the note. */
const PHRASE_WORDS = 6;

/**
 * Every fact token in the text, mapped to the phrase it was found in.
 *
 * Tokens are normalised so paraphrase is not loss: number words become
 * digits, "twenty-five" and "twenty five" become 25, "six and a half"
 * becomes 6.5, months and weekdays become `m6` and `d2`. Leading zeros go,
 * so 08 and 8 agree. List markers ("1." at the start of a line) are not
 * facts and are stripped first.
 */
export function factTokens(text: string): Map<string, string> {
  // Hyphens between letters are spaces here, so "six-and-a-half" and
  // "twenty-five" read the same as their spaced forms — a clinical-register
  // rewrite hyphenates freely, and that is not a change of fact.
  const words = text
    .replace(/^\s*(?:\d+[.)]|[-*•])\s+/gm, '')
    .replace(/(?<=[a-z])-(?=[a-z])/gi, ' ')
    .split(/\s+/)
    .filter((word) => word !== '');
  const found = new Map<string, string>();

  const phraseAt = (index: number): string => {
    const taken: string[] = [];
    for (const word of words.slice(index, index + PHRASE_WORDS)) {
      taken.push(word);
      if (/[,.;:!?]$/.test(word)) break;
    }
    return taken.join(' ').replace(/[,.;:!?]+$/, '');
  };
  const add = (token: string, index: number): void => {
    if (!found.has(token)) found.set(token, phraseAt(index));
  };

  let index = 0;
  while (index < words.length) {
    const word = words[index] as string;

    // Digits, with a decimal part kept so 6.5 is one fact. Dates, times,
    // ratios and dosages all fall out as their digit groups.
    for (const run of word.match(/\d+(?:\.\d+)?/g) ?? []) add(run.replace(/^0+(?=\d)/, ''), index);

    const calendar = calendarToken(word);
    if (calendar !== null) add(calendar, index);

    const quantity = numberWordsAt(words, index);
    if (quantity !== null) {
      add(quantity.token, index);
      index += quantity.consumed;
      continue;
    }
    index += 1;
  }

  return found;
}

function bare(word: string): string {
  return word.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, '');
}

/**
 * The non-numeric facts a shortening most dangerously silences: risk
 * negations, medications, and load-bearing names. Returned in the same
 * token→phrase shape as `factTokens` so the drop lock's survives/named/removal
 * machinery covers them without change. Kept separate from `factTokens` — that
 * export has an exact numeric/calendar contract its callers rely on — and
 * merged only inside the guard, via `allFactTokens`.
 */
export function protectedFactTokens(text: string): Map<string, string> {
  const found = new Map<string, string>();
  const add = (token: string, phrase: string): void => {
    if (!found.has(token)) found.set(token, phrase);
  };
  // Risk negations, tagged by the risk they address so paraphrase is not loss.
  for (const [token, phrase] of riskTokens(text)) add(token, phrase);
  for (const [token, phrase] of positiveRiskTokens(text)) add(token, phrase);
  for (const [token, phrase] of medicationTokens(text)) add(token, phrase);
  for (const [token, phrase] of nameTokens(text)) add(token, phrase);
  return found;
}

/**
 * A curated psychiatric formulary — the generics a therapy practice references
 * most, with the common brand names mapped onto their generic so "Zoloft" and
 * "sertraline" are one fact. Deliberately not exhaustive: a medication outside
 * the list is still caught when it sits beside a dose (see `medicationTokens`).
 */
const MEDICATION_ALIASES: Readonly<Record<string, string>> = {
  zoloft: 'sertraline',
  prozac: 'fluoxetine',
  lexapro: 'escitalopram',
  celexa: 'citalopram',
  paxil: 'paroxetine',
  luvox: 'fluvoxamine',
  effexor: 'venlafaxine',
  cymbalta: 'duloxetine',
  pristiq: 'desvenlafaxine',
  wellbutrin: 'bupropion',
  remeron: 'mirtazapine',
  lamictal: 'lamotrigine',
  depakote: 'valproate',
  tegretol: 'carbamazepine',
  seroquel: 'quetiapine',
  abilify: 'aripiprazole',
  risperdal: 'risperidone',
  zyprexa: 'olanzapine',
  ativan: 'lorazepam',
  klonopin: 'clonazepam',
  xanax: 'alprazolam',
  valium: 'diazepam',
  buspar: 'buspirone',
  vistaril: 'hydroxyzine',
  ambien: 'zolpidem',
  ritalin: 'methylphenidate',
  concerta: 'methylphenidate',
  vyvanse: 'lisdexamfetamine',
  strattera: 'atomoxetine',
  adderall: 'amphetamine',
};

const MEDICATION_GENERICS: readonly string[] = [
  'sertraline',
  'fluoxetine',
  'escitalopram',
  'citalopram',
  'paroxetine',
  'fluvoxamine',
  'venlafaxine',
  'duloxetine',
  'desvenlafaxine',
  'bupropion',
  'mirtazapine',
  'trazodone',
  'lithium',
  'lamotrigine',
  'valproate',
  'valproic',
  'carbamazepine',
  'quetiapine',
  'aripiprazole',
  'risperidone',
  'olanzapine',
  'lorazepam',
  'clonazepam',
  'alprazolam',
  'diazepam',
  'buspirone',
  'hydroxyzine',
  'zolpidem',
  'methylphenidate',
  'lisdexamfetamine',
  'atomoxetine',
  'amphetamine',
  'naltrexone',
  'prazosin',
  'propranolol',
  'gabapentin',
  'pregabalin',
  'clonidine',
  'guanfacine',
  'amitriptyline',
  'nortriptyline',
  'doxepin',
  'vortioxetine',
  'vilazodone',
  'brexpiprazole',
  'cariprazine',
  'lurasidone',
  'ziprasidone',
  'asenapine',
  'topiramate',
  'oxcarbazepine',
  'levetiracetam',
  'metformin',
  'levothyroxine',
  'amlodipine',
  'losartan',
  'atorvastatin',
  'omeprazole',
  'pantoprazole',
  'ibuprofen',
  'acetaminophen',
  'aspirin',
];

const MEDICATIONS = new Set<string>([...MEDICATION_GENERICS, ...Object.keys(MEDICATION_ALIASES)]);

/** A word carrying a dose unit tells us its neighbour is a medication, not prose. */
const DOSED_MEDICATION = /\b([A-Za-z][A-Za-z'-]{3,})\s+\d+(?:\.\d+)?\s*(?:mg|mcg|µg|g|ml|units?|iu)\b/gi;

/** Words that can sit before a dose without being the drug's name. */
const NOT_A_DRUG_NAME = new Set([
  'about',
  'approx',
  'approximately',
  'around',
  'taking',
  'takes',
  'took',
  'started',
  'start',
  'increased',
  'decreased',
  'reduced',
  'raised',
  'given',
  'dose',
  'dosage',
  'daily',
  'nightly',
  'total',
  'another',
  'with',
  'plus',
  'from',
  'patient',
  'client',
  'reports',
  'reported',
  'has',
  'had',
  'is',
  'was',
  'over',
  'under',
  'still',
  'now',
  'sleep',
  'sleeping',
  'walk',
  'walking',
  'running',
  'working',
  'reading',
  'writing',
  'feeling',
  'eating',
  'drinking',
  'morning',
  'evening',
  'weekly',
  'session',
  'sessions',
  'therapy',
  'treatment',
  'anxiety',
  'depression',
  'pain',
]);

/**
 * Medications named in a text, keyed `med:<generic>` so a brand and its generic
 * are the same fact. Two sources: the curated formulary, and any word sitting
 * immediately before a dose.
 */
export function medicationTokens(text: string): Map<string, string> {
  const found = new Map<string, string>();
  const add = (name: string, phrase: string): void => {
    const key = `med:${name}`;
    if (!found.has(key)) found.set(key, phrase);
  };

  for (const word of text.split(/\s+/)) {
    const w = bare(word);
    if (MEDICATIONS.has(w)) add(MEDICATION_ALIASES[w] ?? w, word.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, ''));
  }

  for (const match of text.matchAll(DOSED_MEDICATION)) {
    const name = (match[1] as string).toLowerCase();
    const known = bare(name);
    if (NOT_A_DRUG_NAME.has(known)) continue;
    add(MEDICATION_ALIASES[known] ?? known, match[0].trim());
  }

  return found;
}

/**
 * Names a note leans on — kept deliberately high-precision. A titled name
 * ("Dr. Alvarez") or one anchored to a relationship ("her son Michael")
 * counts; a bare capitalised word does not, because at that breadth the lock
 * would guess and revert edits she asked for. The token is the given name,
 * lowercased, so a title added or dropped is not itself a loss.
 *
 * The relationship patterns are case-insensitive so "Her Son Michael" matches
 * as well as "her son Michael" — which is exactly why the capture is checked
 * for a capital letter in `nameTokens` rather than by the pattern: with the
 * `i` flag, `[A-Z]` matches any letter, and "her manager has been giving her
 * more responsibility" became the name `has`. Found on 2026-09-23: that false
 * name made the fact lock hold back a shortening the owner had asked for, and
 * the notice under the reply read "the change would have lost \"manager
 * has\"".
 */
const TITLED_NAME = /\b(?:Dr|Mr|Mrs|Ms|Miss|Prof|Sr|Sra|Srta|Dra|Fr|Rev)\.?\s+([A-Z][a-zà-ÿ]+)\b/g;
const RELATED_NAME =
  /\b(?:son|daughter|wife|husband|partner|spouse|mother|father|mom|mum|dad|brother|sister|boss|manager|supervisor|therapist|psychiatrist|counsell?or|physician|doctor|friend|colleague|co-?worker|boyfriend|girlfriend|fianc[ée]e?|neighbou?r|roommate|landlord)(?:'s)?[,:]?\s+(?:named\s+)?([A-Z][a-zà-ÿ]+)\b/gi;
const SPANISH_RELATED_NAME =
  /\b(?:su|el|la)\s+(?:hijo|hija|esposo|esposa|pareja|madre|padre|hermano|hermana|terapeuta|médic[oa]|amig[oa])(?:'s)?[,:]?\s+(?:llamad[oa]\s+)?([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)\b/g;

/** A name is a capitalised word; the `i`-flagged patterns above cannot say so themselves. */
const CAPITALISED = /^[A-ZÀ-Þ]/;

export function nameTokens(text: string): Map<string, string> {
  const found = new Map<string, string>();
  const add = (given: string, phrase: string): void => {
    if (!CAPITALISED.test(given)) return;
    const key = `name:${given.toLowerCase()}`;
    if (!found.has(key)) found.set(key, phrase.trim());
  };
  for (const match of text.matchAll(TITLED_NAME)) add(match[1] as string, match[0]);
  for (const match of text.matchAll(RELATED_NAME)) add(match[1] as string, match[0]);
  for (const match of text.matchAll(SPANISH_RELATED_NAME)) add(match[1] as string, match[0]);
  return found;
}

/**
 * Every fact token in a text — countable and calendar (`factTokens`) plus the
 * non-numeric load-bearing classes (`protectedFactTokens`). The numeric layer
 * wins a key collision, keeping its phrasing in the notice.
 */
export function allFactTokens(text: string): Map<string, string> {
  const found = factTokens(text);
  for (const [token, phrase] of protectedFactTokens(text)) if (!found.has(token)) found.set(token, phrase);
  return found;
}

function calendarToken(word: string): string | null {
  const stripped = word.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');
  const lower = stripped.toLowerCase();
  if (stripped === 'May') return 'm5';
  if (stripped === 'Sat') return 'd6';
  if (stripped === 'Sun') return 'd7';
  const month = MONTHS[lower];
  if (month !== undefined) return `m${String(month)}`;
  const day = WEEKDAYS[lower];
  if (day !== undefined) return `d${String(day)}`;
  return null;
}

/**
 * A quantity written in words starting at `index`: "four", "twenty-five",
 * "twenty five", "six and a half". Returns the digit token and how many words
 * it used, or null when the word is not a number word.
 */
function numberWordsAt(words: readonly string[], index: number): { token: string; consumed: number } | null {
  const first = NUMBER_WORDS[bare(words[index] as string)];
  if (first === undefined) return null;
  let value = first;
  let consumed = 1;

  const isTens = (n: number): boolean => n >= 20 && n <= 90 && n % 10 === 0;
  const unitOf = (part: string): number | null => {
    if (part === 'one') return 1;
    const unit = NUMBER_WORDS[part];
    return unit !== undefined && unit < 10 ? unit : null;
  };

  // "twenty five" — and "twenty-five", whose hyphen became a space above.
  if (isTens(first)) {
    const unit = unitOf(bare(words[index + 1] ?? ''));
    if (unit !== null) {
      value += unit;
      consumed = 2;
    }
  }

  // "six and a half", "six and one-half", "six point five" — one fact each,
  // not "6" and a stray word. The clinical register reaches for the second.
  const tail = words.slice(index + consumed, index + consumed + 3).map(bare);
  if (tail[0] === 'and' && (tail[1] === 'a' || tail[1] === 'one') && tail[2] === 'half') {
    return { token: `${String(value)}.5`, consumed: consumed + 3 };
  }
  const decimal = tail[0] === 'point' && tail[1] !== undefined ? NUMBER_WORDS[tail[1]] : undefined;
  if (decimal !== undefined && decimal < 10) {
    return { token: `${String(value)}.${String(decimal)}`, consumed: consumed + 2 };
  }
  return { token: String(value), consumed };
}

export interface DroppedFact {
  /** The section that was kept as it was. */
  readonly section: string;
  /** Where the first lost fact sat in the previous text — note content, shown only in her own thread. */
  readonly phrase: string;
}

export interface FactGuardResult {
  /** The revision with any section that lost a fact reverted to its previous text. */
  readonly sections: Sections;
  readonly dropped: readonly DroppedFact[];
}

/**
 * Keep any changed section whose facts do not all survive somewhere in the
 * revised note, unless her message names them or asks for a removal.
 */
export function guardDroppedFacts(previous: Sections, updated: Sections, message: string): FactGuardResult {
  if (removalRequested(message)) return { sections: { ...updated }, dropped: [] };

  const survives = new Set<string>();
  for (const text of Object.values(updated))
    for (const token of allFactTokens(text).keys()) survives.add(token);
  const named = new Set(allFactTokens(message).keys());

  const sections: Record<string, string> = { ...updated };
  const dropped: DroppedFact[] = [];

  for (const [name, before] of Object.entries(previous)) {
    // A section the model left out of its answer is a section it emptied.
    const revised = updated[name] ?? '';
    if (revised === before) continue;

    for (const [token, phrase] of allFactTokens(before)) {
      if (survives.has(token) || named.has(token)) continue;
      sections[name] = before;
      dropped.push({ section: name, phrase });
      break;
    }
  }

  return { sections, dropped };
}

/**
 * The server's own sentence in the chat, after the model's reply — which may
 * be explaining the deletion as a correction. Distinct from the boilerplate
 * lock's opening words so the harness can count the two apart.
 */
export function factNotice(dropped: readonly DroppedFact[]): string {
  const parts = dropped.map(
    (d) =>
      `${d.section} was kept as it was: the change would have lost "${d.phrase}", and nothing in your message asked to remove it.`,
  );
  return `${FACT_NOTICE_OPENING} ${parts.join(' ')} To take something out, say so and name it.`;
}

/** The notice's first sentence — what the thread is stripped of before the model sees it again. */
export const FACT_NOTICE_OPENING = 'Apunta held back part of this revision.';
