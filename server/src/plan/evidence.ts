/**
 * Checking that a quoted excerpt is really in the note it claims to come from.
 *
 * A proposed goal is offered with the note date and the quoted words it was
 * drafted from, and a proposal with no citable evidence is not offered at all.
 * That promise is only worth something if the quote is checked: a model asked
 * to copy a passage will sometimes tidy it, and a tidied quote in a directive
 * document is a fabrication with a citation attached.
 *
 * The match is literal in substance but tolerant of whitespace — a model that
 * turns a line break into a space has still quoted the note, while one that
 * changes a word has not. Offsets map back to the original text so the excerpt
 * the therapist reads is the note's own characters, not the model's.
 */

interface Normalised {
  readonly text: string;
  /** `offsets[i]` is where `text[i]` sits in the original. */
  readonly offsets: readonly number[];
}

/** Collapse runs of whitespace to one space, remembering where everything was. */
function normalise(source: string): Normalised {
  let text = '';
  const offsets: number[] = [];
  let inWhitespace = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] as string;
    if (/\s/.test(character)) {
      inWhitespace = true;
      continue;
    }
    if (inWhitespace && text !== '') {
      text += ' ';
      offsets.push(index);
    }
    inWhitespace = false;
    text += character;
    offsets.push(index);
  }

  return { text, offsets };
}

export interface ExcerptMatch {
  /** The note's own characters, taken from the original text. */
  readonly text: string;
  /** Where it starts in the note, for working out which section it is in. */
  readonly start: number;
}

/** The excerpt as the note actually writes it, or null if the note does not. */
export function findExcerpt(noteText: string, excerpt: string): ExcerptMatch | null {
  const trimmed = excerpt.trim();
  if (trimmed === '') return null;

  const haystack = normalise(noteText);
  const needle = normalise(trimmed);
  if (needle.text === '') return null;

  const at = haystack.text.indexOf(needle.text);
  if (at === -1) return null;

  const start = haystack.offsets[at] ?? 0;
  const lastIndex = at + needle.text.length - 1;
  const end = (haystack.offsets[lastIndex] ?? start) + 1;
  return { text: noteText.slice(start, end), start };
}

/**
 * Which section an offset falls in, worked out from the note's own text.
 *
 * Derived rather than claimed: asking the model which section it quoted from
 * would be one more thing it could get wrong, and the note already says.
 */
export function sectionAtOffset(
  noteText: string,
  sections: readonly string[],
  offset: number,
): string | null {
  const byLowerName = new Map(sections.map((name) => [name.toLowerCase(), name]));
  let current: string | null = null;
  let position = 0;

  for (const line of noteText.split('\n')) {
    if (position > offset) break;
    const colon = line.indexOf(':');
    if (colon > 0) {
      const name = byLowerName.get(line.slice(0, colon).trim().toLowerCase());
      if (name !== undefined) current = name;
    }
    position += line.length + 1;
  }

  return current;
}
