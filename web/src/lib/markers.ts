import { emptySectionNames, leadingLabel, textToSections, UNCLEAR_MARKER } from '@apunta/shared';

/**
 * The two things in a note body that need to catch the eye, and neither of
 * which may interrupt her.
 *
 * **An empty section is correct output, not a gap.** The owner chose a blank
 * section over a fallback sentence and said plainly that she means to fill it
 * in on the far side (`docs/feedback/2026-08-22-owner-answers.md`, design
 * question 5). So a blank is marked, never fixed, and nothing gates on it.
 *
 * **`[unclear in dictation]` ships with no gate.** She was offered a
 * warn-before-copy variant with the risk of one slipping into a filed record
 * stated, and chose the plain marker (question 11). The way to honour both her
 * choice and the risk is to make the marker impossible to miss on screen —
 * distinctly styled, not merely bracketed prose — and to interrupt her never.
 *
 * The markup is a backdrop layer behind the textarea rather than rich text
 * inside it: the editor has to stay a `<textarea>` so `selectionStart/End`
 * remain available for the highlight-reference (`docs/decisions.md`).
 * Consequently these segments add no characters of their own — anything that
 * changed the text's length would slide the backdrop out of register with the
 * real characters above it.
 *
 * **A leading `Label:` reads bold** (owner, 2026-09-21): `Location: Online`,
 * `Risk review: None`, a format's `Plan:`. Bold glyphs are wider, so the
 * weight cannot change without sliding the layers apart; instead the backdrop
 * draws the label's own glyphs, stroked, directly under the textarea's — the
 * same width, a heavier line. The rule for what counts as a label is
 * `leadingLabel` in `shared/`, which the Claude import also writes to.
 */
export type NoteSegmentKind = 'plain' | 'unclear' | 'empty-section' | 'label';

export interface NoteSegment {
  readonly kind: NoteSegmentKind;
  readonly text: string;
}

/** The sections with nothing under them, in format order. Drives the indicator. */
export function emptySections(text: string, sections: readonly string[]): string[] {
  return emptySectionNames(textToSections(text, sections), sections);
}

/**
 * Split the note body into runs to be drawn plain or highlighted.
 *
 * Concatenating every segment's text reproduces the input exactly — the
 * backdrop and the textarea have to lay out identically, character for
 * character.
 */
export function markNoteText(text: string, sections: readonly string[]): NoteSegment[] {
  const blank = new Set(emptySections(text, sections).map((name) => name.toLowerCase()));
  const headers = new Map(sections.map((name) => [`${name.toLowerCase()}:`, name.toLowerCase()]));

  const segments: NoteSegment[] = [];
  const lines = text.split('\n');

  lines.forEach((line, index) => {
    const header = headers.get(line.trim().toLowerCase());
    if (header !== undefined && blank.has(header)) {
      // A section header with nothing under it: the whole (short) line.
      segments.push({ kind: 'empty-section', text: line });
    } else {
      const found = leadingLabel(line);
      if (found === null) {
        pushUnclear(segments, line);
      } else {
        push(segments, 'plain', found.prefix);
        push(segments, 'label', found.label);
        pushUnclear(segments, line.slice(found.prefix.length + found.label.length));
      }
    }
    if (index < lines.length - 1) push(segments, 'plain', '\n');
  });

  return segments.filter((segment) => segment.text !== '');
}

/** Split one line around every `[unclear in dictation]` in it. */
function pushUnclear(segments: NoteSegment[], line: string): void {
  const needle = UNCLEAR_MARKER.toLowerCase();
  const haystack = line.toLowerCase();

  let cursor = 0;
  for (;;) {
    const found = haystack.indexOf(needle, cursor);
    if (found === -1) break;
    push(segments, 'plain', line.slice(cursor, found));
    // Sliced from the original so her own capitalisation survives.
    push(segments, 'unclear', line.slice(found, found + needle.length));
    cursor = found + needle.length;
  }
  push(segments, 'plain', line.slice(cursor));
}

/** Append, merging into the previous run when the kind is the same. */
function push(segments: NoteSegment[], kind: NoteSegmentKind, text: string): void {
  if (text === '') return;
  const last = segments[segments.length - 1];
  if (last && last.kind === kind) segments[segments.length - 1] = { kind, text: last.text + text };
  else segments.push({ kind, text });
}
