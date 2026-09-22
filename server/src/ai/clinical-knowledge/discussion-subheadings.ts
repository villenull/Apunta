import { isLabelText } from '@apunta/shared';

/**
 * Discussion subheadings, as the model writes them, checked by the server.
 *
 * The owner decided (2026-09-22) that the drafting model, not the server,
 * decides whether a session had genuinely distinct topics: when it did, the
 * model divides Discussion under short subheadings named from what was
 * discussed; when it did not, Discussion is one block of prose. This module
 * replaces the old deterministic grouper, which filed sentences under a fixed
 * list of generic titles and almost never fired on real output.
 *
 * The model is trusted with the split and nothing else. A subheading is
 * model-written text, so the server holds it to the note's own rules:
 *
 * - **Her form.** One heading per line, with its first letter capitalised,
 *   ending in a colon (`Sleep:`). That is the shape the note editor already
 *   shows bold (`leadingLabel` in `shared/`), and it copies into a records
 *   system as a plain line. A model that writes `### Sleep` or `**Sleep:**` is
 *   rewritten into it.
 * - **Her words.** Every content word of a heading must occur in the source
 *   (her typed notes and the transcript, retractions removed). A heading that
 *   names a category she never said — "Daily routines and functioning" — is
 *   not a topic of this session, so it is not kept.
 * - **Distinct topics only.** Fewer than two subsections is no division at
 *   all: a lone subheading is dropped.
 *
 * When any heading fails, every heading goes and the Discussion is returned as
 * prose: the model's sentences are never touched, only the heading lines it
 * added. A line only counts as a heading when it could be one — short, and
 * without a sentence's punctuation — so a sentence the model prefixed with
 * `#` is prose and survives; a body with no heading lines comes back byte for
 * byte as it was.
 */

/** Longest subheading kept, in words. The prompt asks for one to four words. */
export const MAX_SUBHEADING_WORDS = 4;

export type SubheadingOutcome =
  /** No heading lines in the body; returned unchanged. */
  | 'none'
  /** Two or more subsections, each under a checked heading. */
  | 'kept'
  /** Only one subsection had a heading: prose. */
  | 'single'
  /** A heading was not her form (too long, punctuation, a section's name): prose. */
  | 'invalid'
  /** A heading named something the source does not contain: prose. */
  | 'ungrounded';

export interface TidiedDiscussion {
  readonly body: string;
  /** Headings in the returned body; empty unless `outcome` is `kept`. */
  readonly headings: readonly string[];
  readonly outcome: SubheadingOutcome;
}

export interface TidyOptions {
  /** What the headings must be grounded in: her notes and the transcript. */
  readonly source: string;
  /** The format's section names; a subheading may not wear one (it would split the note). */
  readonly sectionNames: readonly string[];
}

interface HeadingLine {
  /** The heading as written, decorations and colon removed. */
  readonly title: string;
  /** Text after an inline bold heading (`**sleep:** John said…`), if any. */
  readonly rest: string;
}

const MARKDOWN_HEADING = /^#{1,6}\s+(.+?)\s*$/;
const BOLD_HEADING = /^(\*\*|__)(.+?)\1\s*(:?)\s*(.*)$/;
const PLAIN_HEADING = /^(.+):$/;
const LIST_ITEM = /^\s*(?:[-•*]|\d+[.)])\s+/;

function stripColon(text: string): string {
  return text.trim().replace(/\s*:$/, '').trim();
}

/**
 * True when a decorated line could be a heading at all: no sentence
 * punctuation, and no more words than the guidance allows a subheading.
 *
 * Deliberately looser than `isLabelText`, which the final check also applies:
 * a short generic label the model invented ("Daily routines and functioning")
 * must still be recognised here and then dropped there. A line that reads as a
 * sentence, or runs on past a heading's length, is prose no matter what the
 * model prefixed it with — recognising it would delete her words on the way
 * out.
 */
function isHeadingShaped(text: string): boolean {
  const words = wordsOf(text);
  return !/[.!?;]/.test(text) && words.length > 0 && words.length <= MAX_SUBHEADING_WORDS;
}

/**
 * A plain `words:` line counts only when it is short and not the lead-in to a
 * list ("She named three things:" followed by bullets stays prose). A
 * title-cased inline label may carry its first sentence on the same line, but
 * an ordinary sentence such as `Dana reports: …` remains prose so stripping
 * it would cut her words.
 */
const INLINE_PROSE_WORDS: Record<string, true> = {
  am: true,
  are: true,
  asked: true,
  described: true,
  did: true,
  does: true,
  explained: true,
  felt: true,
  had: true,
  has: true,
  is: true,
  mentioned: true,
  noted: true,
  reported: true,
  reports: true,
  said: true,
  says: true,
  stated: true,
  states: true,
  was: true,
  were: true,
};

function isInlineLabelTitle(title: string): boolean {
  if (title === title.toLowerCase()) return true;
  const words = title.toLowerCase().split(/\s+/);
  return INLINE_PROSE_WORDS[words.at(-1) ?? ''] !== true;
}

function headingOn(line: string, next: string | undefined): HeadingLine | null {
  const trimmed = line.trim();
  if (trimmed === '') return null;

  const markdown = MARKDOWN_HEADING.exec(trimmed);
  if (markdown) {
    const raw = (markdown[1] ?? '').trim();
    // Keep prose accidentally placed after a Markdown heading. Dropping it
    // would violate the note contract even when the heading itself is later
    // rejected as ungrounded.
    const inline = /^(.+?):\s+(.+)$/.exec(raw);
    if (
      inline &&
      isLabelText((inline[1] ?? '').trim()) &&
      wordsOf(inline[1] ?? '').length <= MAX_SUBHEADING_WORDS
    ) {
      return { title: stripColon(inline[1] ?? ''), rest: (inline[2] ?? '').trim() };
    }
    // `### She described the argument with her partner.` is a sentence the
    // model decorated, not a heading. Recognising it would drop the whole line
    // once the checks below reject the title, and no sentence of hers may
    // disappear.
    if (!isHeadingShaped(raw)) return null;
    return { title: stripColon(raw), rest: '' };
  }
  const bold = BOLD_HEADING.exec(trimmed);
  if (bold) {
    const inner = bold[2] ?? '';
    const rest = (bold[4] ?? '').trim();
    const hasColon = bold[3] === ':' || /:\s*$/.test(inner);
    if (rest === '' || hasColon) return { title: stripColon(inner), rest };
    return null;
  }

  const plain = PLAIN_HEADING.exec(trimmed);
  if (plain) {
    const title = (plain[1] ?? '').trim();
    if (isLabelText(title) && wordsOf(title).length <= MAX_SUBHEADING_WORDS) {
      if (next !== undefined && LIST_ITEM.test(next)) return null;
      return { title, rest: '' };
    }
  }

  // Small models sometimes put the first sentence on the same line as a
  // plain label (`sleep: She slept better.`), despite the output contract's
  // request for a label-only line. Attribution lead-ins such as
  // `John reports: ...` remain prose so tidying never cuts her words.
  const inline = /^(.+?):\s+(.+)$/.exec(trimmed);
  if (inline) {
    const title = (inline[1] ?? '').trim();
    const rest = (inline[2] ?? '').trim();
    if (
      title !== '' &&
      isInlineLabelTitle(title) &&
      isLabelText(title) &&
      wordsOf(title).length <= MAX_SUBHEADING_WORDS &&
      rest !== ''
    ) {
      return { title, rest };
    }
  }
  return null;
}

function wordsOf(text: string): string[] {
  return text.split(/\s+/).filter((word) => word !== '');
}

/** Words that add grammar but no topic; a heading still needs one content word. */
const STOPWORDS = new Set([
  'a',
  'about',
  'after',
  'and',
  'around',
  'as',
  'at',
  'between',
  'by',
  'for',
  'from',
  'her',
  'his',
  'in',
  'into',
  'its',
  'of',
  'on',
  'or',
  'our',
  's',
  'the',
  'their',
  'them',
  'this',
  'to',
  'with',
]);

function tokens(text: string): string[] {
  return (
    text
      .toLowerCase()
      .normalize('NFKC')
      .match(/\p{L}+|\p{N}+/gu) ?? []
  ).filter((word) => word !== '');
}

/** A crude stem: enough that "moving" finds "move" and "arguments" finds "argument". */
function stem(word: string): string {
  return word.replace(/(?:ing|ed|es|s|e)$/, '');
}

function commonPrefix(left: string, right: string): number {
  let index = 0;
  while (index < left.length && index < right.length && left[index] === right[index]) index += 1;
  return index;
}

function groundedWord(word: string, source: readonly string[], stems: ReadonlySet<string>): boolean {
  if (stems.has(stem(word))) return true;
  return source.some((candidate) => {
    const shorter = Math.min(word.length, candidate.length);
    if (shorter < 4) return candidate === word;
    return commonPrefix(word, candidate) >= Math.max(4, shorter - 3);
  });
}

/** True when every content word of `title` occurs in the source, allowing for inflection. */
export function headingIsGrounded(title: string, source: string): boolean {
  const sourceTokens = [...new Set(tokens(source))];
  const stems = new Set(sourceTokens.map(stem));
  const contentWords = tokens(title).filter((word) => !STOPWORDS.has(word));
  return contentWords.length > 0 && contentWords.every((word) => groundedWord(word, sourceTokens, stems));
}

/**
 * Capitalise the first letter and preserve the rest of the model's label.
 * Grounding is case-insensitive, but the owner wants labels such as
 * "Sleep:" and "Work stress:" rather than all-lowercase headings.
 */
function capitaliseHeading(title: string): string {
  const normalised = title.replace(/\s+/g, ' ').trim();
  return normalised.replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase('en-US'));
}

interface Block {
  readonly title: string | null;
  readonly lines: string[];
}

function blockText(block: Block): string {
  return block.lines.join('\n').trim();
}

/**
 * Join subsections whose headings are gone into one block. Single paragraphs
 * run on as one paragraph; anything with its own line structure (a list, two
 * paragraphs) keeps a blank line between, so no line of hers is merged away.
 */
function asProse(blocks: readonly Block[]): string {
  const texts = blocks.map(blockText).filter((text) => text !== '');
  const simple = texts.every((text) => !text.includes('\n'));
  return texts.join(simple ? ' ' : '\n\n');
}

/**
 * Check and normalise the subheadings the model wrote in a Discussion body.
 * See the module comment for the rules; `outcome` says which applied, and is
 * safe to log (it carries no note text).
 */
export function tidyDiscussionSubheadings(body: string, options: TidyOptions): TidiedDiscussion {
  const lines = body.split(/\r?\n/);
  const blocks: Block[] = [{ title: null, lines: [] }];
  let sawHeading = false;

  lines.forEach((line, index) => {
    const heading = headingOn(
      line,
      lines.slice(index + 1).find((next) => next.trim() !== ''),
    );
    if (heading === null) {
      blocks[blocks.length - 1]?.lines.push(line);
      return;
    }
    sawHeading = true;
    blocks.push({ title: heading.title, lines: heading.rest === '' ? [] : [heading.rest] });
  });

  if (!sawHeading) return { body, headings: [], outcome: 'none' };

  const [preamble, ...titled] = blocks as [Block, ...Block[]];
  // A heading with nothing under it organises nothing.
  const sections = titled.filter((block) => blockText(block) !== '');
  const prose = (outcome: SubheadingOutcome): TidiedDiscussion => ({
    body: asProse([preamble, ...sections]),
    headings: [],
    outcome,
  });

  const reserved = new Set(options.sectionNames.map((name) => name.trim().toLowerCase()));
  const titles = sections.map((block) => (block.title ?? '').replace(/\s+/g, ' ').trim());
  const valid = titles.every(
    (title) =>
      title !== '' &&
      isLabelText(title) &&
      wordsOf(title).length <= MAX_SUBHEADING_WORDS &&
      !reserved.has(title.toLowerCase()),
  );
  if (!valid) return prose('invalid');
  if (!titles.every((title) => headingIsGrounded(title, options.source))) return prose('ungrounded');

  const headings = titles.map((title) => capitaliseHeading(title));
  const topicKeys = headings.map((heading) =>
    tokens(heading)
      .filter((word) => !STOPWORDS.has(word))
      .map(stem)
      .sort()
      .join('|'),
  );
  if (new Set(topicKeys).size !== topicKeys.length) return prose('invalid');
  if (new Set(headings.map((heading) => heading.toLowerCase())).size !== headings.length) {
    return prose('invalid');
  }
  if (sections.length < 2) return prose('single');

  const lead = blockText(preamble);
  const rendered = sections.map((block, index) => `${headings[index] ?? ''}:\n${blockText(block)}`);
  return {
    body: [...(lead === '' ? [] : [lead]), ...rendered].join('\n\n'),
    headings,
    outcome: 'kept',
  };
}
