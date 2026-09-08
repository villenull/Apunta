import { textToSections, type Sections } from '@apunta/shared';

/**
 * The deliberately small, deterministic refine shortcut.
 *
 * This is a parser, not a language model.  It accepts only the documented
 * form `Move "exact text" from Source to Target` (an optional `the` and
 * `section` are accepted around either section name).  Every other request
 * remains on the ordinary refine path.  Keeping the accepted language narrow
 * is important: a fast path that guesses what the owner meant is worse than
 * paying for a normal refine call.
 */

export type MoveOnlyRejectReason =
  | 'syntax'
  | 'empty_phrase'
  | 'phrase_whitespace'
  | 'unknown_source'
  | 'unknown_target'
  | 'same_section'
  | 'missing_source'
  | 'duplicate_source'
  | 'duplicate_target'
  | 'already_in_target'
  | 'phrase_not_exactly_once';

export interface MoveOnlyFastPathMatch {
  readonly matched: true;
  /** The source section's canonical format name. */
  readonly source: string;
  /** The target section's canonical format name. */
  readonly target: string;
  /** The exact, case-sensitive quoted text copied into the target. */
  readonly phrase: string;
  /** The note with only the move applied. */
  readonly content: string;
  /** Parsed sections, used by the existing server-side guards. */
  readonly sections: Sections;
}

export interface MoveOnlyFastPathFallback {
  readonly matched: false;
  readonly reason: MoveOnlyRejectReason;
}

export type MoveOnlyFastPathResult = MoveOnlyFastPathMatch | MoveOnlyFastPathFallback;

interface SectionSpan {
  readonly name: string;
  readonly headerStart: number;
  readonly bodyStart: number;
  readonly bodyEnd: number;
}

interface ParsedMove {
  readonly phrase: string;
  readonly source: string;
  readonly target: string;
}

/**
 * Try the move-only grammar and apply it without generating or reserialising
 * the note.  The returned content preserves every byte outside the removed
 * source span and the appended target span.
 */
export function tryMoveOnlyRefine(
  message: string,
  noteText: string,
  validSections: readonly string[],
): MoveOnlyFastPathResult {
  const sectionNames = canonicalSections(validSections);
  if (sectionNames === null) return { matched: false, reason: 'syntax' };

  const parsed = parseMove(message);
  if (parsed === null) return { matched: false, reason: 'syntax' };
  if (parsed.phrase === '') return { matched: false, reason: 'empty_phrase' };
  if (parsed.phrase !== parsed.phrase.trim()) return { matched: false, reason: 'phrase_whitespace' };

  const source = sectionNames.get(parsed.source.toLowerCase());
  if (source === undefined) return { matched: false, reason: 'unknown_source' };
  const target = sectionNames.get(parsed.target.toLowerCase());
  if (target === undefined) return { matched: false, reason: 'unknown_target' };
  if (source.toLowerCase() === target.toLowerCase()) return { matched: false, reason: 'same_section' };

  const spans = findSectionSpans(noteText, sectionNames);
  const sourceSpans = spans.filter((span) => span.name.toLowerCase() === source.toLowerCase());
  const targetSpans = spans.filter((span) => span.name.toLowerCase() === target.toLowerCase());
  if (sourceSpans.length === 0) return { matched: false, reason: 'missing_source' };
  if (sourceSpans.length !== 1) return { matched: false, reason: 'duplicate_source' };
  if (targetSpans.length !== 1) return { matched: false, reason: 'duplicate_target' };

  const sourceSpan = sourceSpans[0] as SectionSpan;
  const targetSpan = targetSpans[0] as SectionSpan;
  const sourceBody = noteText.slice(sourceSpan.bodyStart, sourceSpan.bodyEnd);
  const targetBody = noteText.slice(targetSpan.bodyStart, targetSpan.bodyEnd);
  const sourceHits = exactPhraseSpans(sourceBody, parsed.phrase);
  if (sourceHits.length !== 1) return { matched: false, reason: 'phrase_not_exactly_once' };
  if (containsPhrase(targetBody, parsed.phrase)) return { matched: false, reason: 'already_in_target' };

  const sourceHit = sourceHits[0] as number;
  const without = removePhrase(sourceBody, sourceHit, parsed.phrase.length);
  const withMove = appendPhrase(targetBody, parsed.phrase);
  const edits = [
    { start: sourceSpan.bodyStart, end: sourceSpan.bodyEnd, replacement: without },
    { start: targetSpan.bodyStart, end: targetSpan.bodyEnd, replacement: withMove },
  ].sort((left, right) => right.start - left.start);

  let content = noteText;
  for (const edit of edits)
    content = `${content.slice(0, edit.start)}${edit.replacement}${content.slice(edit.end)}`;

  return {
    matched: true,
    source,
    target,
    phrase: parsed.phrase,
    content,
    sections: textToSections(content, validSections),
  };
}

function canonicalSections(validSections: readonly string[]): Map<string, string> | null {
  const names = new Map<string, string>();
  for (const name of validSections) {
    const key = name.trim().toLowerCase();
    if (key === '' || names.has(key)) return null;
    names.set(key, name);
  }
  return names;
}

function parseMove(message: string): ParsedMove | null {
  // Straight and typographic quotes are both explicit quoting; embedded quote
  // characters and newlines are intentionally not part of this grammar.
  const match = /^\s*move\s+(?:"([^"\r\n]+)"|“([^”\r\n]+)”)\s+from\s+(.+?)\s+to\s+(.+?)\s*\.?\s*$/i.exec(
    message,
  );
  if (match === null) return null;

  const phrase = match[1] ?? match[2] ?? '';
  const source = cleanSectionName(match[3] ?? '');
  const target = cleanSectionName(match[4] ?? '');
  if (source === '' || target === '') return null;

  // The caller resolves names against the format and reports unknown
  // source/target separately for diagnostics and tests; no input text is ever
  // logged by the route.
  if (source.includes('?') || target.includes('?')) return null;
  return { phrase, source, target };
}

function cleanSectionName(value: string): string {
  return value
    .trim()
    .replace(/\.$/, '')
    .trim()
    .replace(/^the\s+/i, '')
    .replace(/\s+sections?$/i, '')
    .trim();
}

function findSectionSpans(noteText: string, sections: ReadonlyMap<string, string>): SectionSpan[] {
  const found: Array<{ name: string; headerStart: number; bodyStart: number }> = [];
  let lineStart = 0;
  for (const line of noteText.split('\n')) {
    const colon = line.indexOf(':');
    if (colon > 0) {
      const name = sections.get(line.slice(0, colon).trim().toLowerCase());
      if (name !== undefined) found.push({ name, headerStart: lineStart, bodyStart: lineStart + colon + 1 });
    }
    lineStart += line.length + 1;
  }

  return found.map((entry, index) => ({
    ...entry,
    bodyEnd: found[index + 1]?.headerStart ?? noteText.length,
  }));
}

/** Return exact phrase starts, including overlapping occurrences. */
function exactPhraseSpans(haystack: string, needle: string): number[] {
  const hits: number[] = [];
  for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + 1)) {
    if (wordBoundary(haystack, at, needle.length)) hits.push(at);
  }
  return hits;
}

function containsPhrase(haystack: string, needle: string): boolean {
  return exactPhraseSpans(haystack.toLocaleLowerCase(), needle.toLocaleLowerCase()).length > 0;
}

function wordBoundary(text: string, start: number, length: number): boolean {
  const word = /[\p{L}\p{N}_]/u;
  const before = start > 0 ? text[start - 1] : undefined;
  const after = start + length < text.length ? text[start + length] : undefined;
  const first = text[start];
  const last = text[start + length - 1];
  return (
    !(first !== undefined && word.test(first) && before !== undefined && word.test(before)) &&
    !(last !== undefined && word.test(last) && after !== undefined && word.test(after))
  );
}

function removePhrase(body: string, start: number, length: number): string {
  let before = body.slice(0, start);
  let after = body.slice(start + length);
  if (/\s$/.test(before) && /^\s/.test(after)) before = before.slice(0, -1);
  else if (before === '' && /^\s/.test(after)) after = after.slice(1);
  else if (after === '' && /\s$/.test(before)) before = before.slice(0, -1);
  return before + after;
}

function appendPhrase(body: string, phrase: string): string {
  const trailing = /\s*$/.exec(body)?.[0] ?? '';
  const core = trailing === '' ? body : body.slice(0, -trailing.length);
  return `${core} ${phrase}${trailing}`;
}
