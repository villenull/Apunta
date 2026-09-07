import { useMemo, useRef } from 'react';

import { useSpelling } from '../hooks/useSpelling.js';
import { emptySections, markNoteText } from '../lib/markers.js';
import { AutoGrowTextarea } from './AutoGrowTextarea.js';
import { spelledRuns, useSpellingMenu } from './SpellMarks.js';

export interface NoteBodyProps {
  value: string;
  /** The note's format sections, in order. Empty when the format failed to load. */
  sections: readonly string[];
  readOnly: boolean;
  /** True for a moment after the chat rewrote the note, to signal the change. */
  refined: boolean;
  /** A refine request is in flight: the note breathes to say it may change. */
  refining: boolean;
  onChange: (value: string) => void;
  onBlur: () => void;
  /** Selection changed: the workspace turns it into a highlight chip. */
  onSelect: (selected: string) => void;
  /** Words this note may contain that no dictionary knows — the patient's name. */
  allowWords?: readonly string[] | undefined;
  ref?: React.Ref<HTMLTextAreaElement> | undefined;
}

/**
 * The note body: a textarea over a backdrop that highlights the two things
 * worth catching her eye, and an indicator naming any empty section.
 *
 * Neither one blocks anything. The practice owner's blanks are deliberate and
 * she declined a copy-time warning about unclear markers with the slip-through
 * risk stated (`docs/feedback/2026-08-22-owner-answers.md`, questions 5 and
 * 11), so both are visible-not-blocking by design: nothing here gates copy or
 * publish, and nothing interrupts her.
 *
 * The highlights are a separate layer because the editor has to stay a
 * `<textarea>` for `selectionStart/End`. The two layers share their
 * typography through `.note-editable` and the textarea is transparent, so the
 * backdrop's marks sit behind the real characters like a marker pen.
 *
 * Spelling is drawn on the same layer (2026-09-07): a wavy line under a word
 * the bundled dictionary does not know, and a click on it for suggestions.
 * The browser's own checker is off here — `shared/src/spelling.ts` says why.
 */
export function NoteBody({
  value,
  sections,
  readOnly,
  refined,
  refining,
  onChange,
  onBlur,
  onSelect,
  allowWords = [],
  ref,
}: NoteBodyProps): React.JSX.Element {
  const segments = useMemo(() => markNoteText(value, sections), [value, sections]);
  const blanks = useMemo(() => emptySections(value, sections), [value, sections]);

  /** Where each run starts in the text, for the spelling marks. */
  const offsets = useMemo(() => {
    const starts: number[] = [];
    let at = 0;
    for (const segment of segments) {
      starts.push(at);
      at += segment.text.length;
    }
    return starts;
  }, [segments]);

  const wrap = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const spelling = useSpelling(value, allowWords);
  const { open: openSpelling, menu: spellingMenu } = useSpellingMenu(
    value,
    onChange,
    spelling,
    wrap,
    textarea,
  );

  return (
    <div className="note-editor-body">
      {blanks.length > 0 && (
        <p className="empty-sections-note" data-testid="empty-sections">
          Nothing recorded in {joinNames(blanks)} — add or leave blank.
        </p>
      )}

      <div
        ref={wrap}
        className={['note-editable-wrap', refined ? 'is-refined' : '', refining ? 'is-refining' : '']
          .filter(Boolean)
          .join(' ')}
        data-testid={refining ? 'note-updating' : undefined}
      >
        <div className="note-editable note-highlights" aria-hidden="true" data-testid="note-highlights">
          {/* Keyed by position: the runs are a pure function of the text, and
              every one of them changes when it does. Each run carries its own
              spelling marks, so the two layers stay in register. */}
          {segments.map((segment, index) => {
            const offset = offsets[index] ?? 0;
            const runs = spelledRuns(segment.text, offset, spelling.misspellings, String(index));
            return segment.kind === 'plain' ? (
              <span key={index}>{runs}</span>
            ) : (
              <mark key={index} className={`marker marker-${segment.kind}`}>
                {runs}
              </mark>
            );
          })}
          {/* A sentinel: a text node ending in a newline has it collapsed at
              the end of a block, which would leave the backdrop a line short
              for a note that ends in one. */}
          {'\n'}
        </div>

        <AutoGrowTextarea
          ref={(node) => {
            textarea.current = node;
            if (typeof ref === 'function') ref(node);
            else if (ref) ref.current = node;
          }}
          className={readOnly ? 'note-editable is-published' : 'note-editable'}
          data-testid="note-body"
          aria-label="Note body"
          spellCheck={false}
          value={value}
          readOnly={readOnly}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          onClick={readOnly ? undefined : openSpelling}
          onContextMenu={readOnly ? undefined : openSpelling}
          onBlur={onBlur}
          onSelect={(event) => {
            const element = event.currentTarget;
            onSelect(element.value.slice(element.selectionStart, element.selectionEnd).trim());
          }}
        />
        {spellingMenu}
      </div>
    </div>
  );
}

/** "Objective", "Objective and Plan", "Objective, Assessment and Plan". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${String(names.at(-1))}`;
}
