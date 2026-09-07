/**
 * Spell-checking a note in the tab: which words to look at, which to leave
 * alone, and how a correction goes back into the text.
 *
 * The rules are deliberately plain. A note is full of words no dictionary
 * knows — the patient's name, a medication, an acronym — and a checker that
 * flags all of them teaches her to ignore it. So: acronyms and words with a
 * capital inside them are never checked, the patient's name and her own
 * vocabulary and dictionary additions are always accepted, and everything
 * else is asked of the dictionary once, as typed and once lowercased.
 */

/** The dictionary behind the check; `web/src/lib/speller.ts` provides the real one. */
export interface Speller {
  correct(word: string): boolean;
  suggest(word: string): string[];
}

export interface Misspelling {
  /** Character offsets into the text, [start, end). */
  readonly start: number;
  readonly end: number;
  readonly word: string;
}

/** A word: letters, with apostrophes inside ("client's", "he’s"). */
const WORD = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;

/** Words the checker never looks at: acronyms, and casing that says "a name, a brand". */
export function worthChecking(word: string): boolean {
  if (word.length < 2) return false;
  if (word === word.toUpperCase()) return false;
  if (/[a-z][A-Z]/.test(word)) return false;
  return true;
}

function plainWord(word: string): string {
  return word.replace(/’/g, "'");
}

export function findMisspellings(text: string, speller: Speller, allow: ReadonlySet<string>): Misspelling[] {
  const found: Misspelling[] = [];
  for (const match of text.matchAll(WORD)) {
    const word = match[0];
    if (!worthChecking(word)) continue;
    const plain = plainWord(word);
    if (allow.has(plain.toLowerCase())) continue;
    if (speller.correct(plain) || speller.correct(plain.toLowerCase())) continue;
    found.push({ start: match.index, end: match.index + word.length, word });
  }
  return found;
}

/** The misspelling under a caret, if any — the caret may sit at either edge of the word. */
export function misspellingAt(misspellings: readonly Misspelling[], index: number): Misspelling | null {
  return misspellings.find((entry) => entry.start <= index && index <= entry.end) ?? null;
}

export function replaceRange(text: string, start: number, end: number, replacement: string): string {
  return text.slice(0, start) + replacement + text.slice(end);
}

/**
 * Up to `limit` suggestions, cased as she typed the word.
 *
 * The typos people actually make are one slip: two letters swapped ("teh",
 * "recieved"), one dropped ("leter"), one wrong ("definately"), one extra.
 * `nspell`'s own suggester ranks those poorly — for "teh" it offers "ten",
 * "eh" and "meh" and never "the" — so every one-slip neighbour the dictionary
 * knows is tried first, swaps and drops before substitutions and insertions,
 * and nspell's list fills in behind.
 */
export function suggestionsFor(speller: Speller, word: string, limit = 5): string[] {
  const plain = plainWord(word);
  const capitalised = /^[A-Z][a-z]/.test(plain) || plain.length === 1;
  const lower = plain.toLowerCase();
  const seen = new Set<string>([lower]);
  const out: string[] = [];
  const offer = (candidate: string): boolean => {
    const key = candidate.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    out.push(capitalised ? candidate.charAt(0).toUpperCase() + candidate.slice(1) : candidate);
    return out.length === limit;
  };
  const neighbours = oneSlipAway(lower)
    .filter((slip) => speller.correct(slip.word))
    .map((slip) => ({ word: slip.word, score: likeness(lower, slip.word) + (slip.swap ? SWAP_BONUS : 0) }))
    .sort((a, b) => b.score - a.score);
  for (const candidate of neighbours) {
    if (offer(candidate.word)) return out;
  }
  for (const raw of speller.suggest(plain)) {
    if (offer(raw)) return out;
  }
  return out;
}

/** Two letters swapped is the commonest slip of all, and "teh"→"ten" must not beat "the". */
const SWAP_BONUS = 3;

/**
 * How much a candidate looks like what she typed: the letters she got right
 * at the start count double, the ones at the end once, and a candidate of
 * another length loses a point per letter — so "leter" prefers "letter"
 * over "leer", and "thier" prefers "their" over "tier".
 */
function likeness(typed: string, candidate: string): number {
  let prefix = 0;
  while (prefix < typed.length && prefix < candidate.length && typed[prefix] === candidate[prefix])
    prefix += 1;
  let suffix = 0;
  while (
    suffix < typed.length - prefix &&
    suffix < candidate.length - prefix &&
    typed[typed.length - 1 - suffix] === candidate[candidate.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  return prefix * 2 + suffix - Math.abs(typed.length - candidate.length);
}

const LETTERS = "abcdefghijklmnopqrstuvwxyz'";

interface Slip {
  readonly word: string;
  readonly swap: boolean;
}

/** Every string one edit from `word`. */
function oneSlipAway(word: string): Slip[] {
  const slips: Slip[] = [];
  for (let index = 0; index < word.length; index += 1) {
    if (index + 1 < word.length && word[index] !== word[index + 1]) {
      slips.push({
        word: word.slice(0, index) + word[index + 1] + word[index] + word.slice(index + 2),
        swap: true,
      });
    }
    slips.push({ word: word.slice(0, index) + word.slice(index + 1), swap: false });
    for (const letter of LETTERS) {
      if (letter !== word[index])
        slips.push({ word: word.slice(0, index) + letter + word.slice(index + 1), swap: false });
      slips.push({ word: word.slice(0, index) + letter + word.slice(index), swap: false });
    }
  }
  for (const letter of LETTERS) slips.push({ word: word + letter, swap: false });
  return slips;
}

/**
 * Words to accept, lowercased, from any number of lists. A vocabulary term
 * like "Dr Jane Smith" contributes each of its words, because that is how
 * they appear in a note.
 */
export function allowedWords(...lists: readonly (readonly string[])[]): Set<string> {
  const words = new Set<string>();
  for (const list of lists) {
    for (const entry of list) {
      for (const match of entry.matchAll(WORD)) words.add(plainWord(match[0]).toLowerCase());
    }
  }
  return words;
}
