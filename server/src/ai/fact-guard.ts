import type { Sections } from '@apunta/shared';

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
 * disappearing to nowhere. "Fact" is deliberately narrow — the classes a
 * regex can find with high precision and that are clinically load-bearing
 * when lost: **numbers** (digits, number words, "six and a half"), **months**
 * and **weekdays**. Not negations, not names, not medication — those need a
 * reader, and a lock that guesses blocks edits she asked for.
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
 * two weeks" into "fortnightly", which reads as a loss. Her review before
 * publishing is still the last line, as it was before.
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
 */
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

  // "six and a half" — one fact, not "6" and a stray word.
  const tail = words.slice(index + consumed, index + consumed + 3).map(bare);
  if (tail[0] === 'and' && tail[1] === 'a' && tail[2] === 'half') {
    return { token: `${String(value)}.5`, consumed: consumed + 3 };
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
  if (REMOVAL_REQUEST.test(message)) return { sections: { ...updated }, dropped: [] };

  const survives = new Set<string>();
  for (const text of Object.values(updated)) for (const token of factTokens(text).keys()) survives.add(token);
  const named = new Set(factTokens(message).keys());

  const sections: Record<string, string> = { ...updated };
  const dropped: DroppedFact[] = [];

  for (const [name, before] of Object.entries(previous)) {
    // A section the model left out of its answer is a section it emptied.
    const revised = updated[name] ?? '';
    if (revised === before) continue;

    for (const [token, phrase] of factTokens(before)) {
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
  return `Apunta held back part of this revision. ${parts.join(' ')} To take something out, say so and name it.`;
}
