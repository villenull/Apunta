import { useMemo } from 'react';

import { emptySections, markNoteText } from '../lib/markers.js';
import { AutoGrowTextarea } from './AutoGrowTextarea.js';

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
  ref,
}: NoteBodyProps): React.JSX.Element {
  const segments = useMemo(() => markNoteText(value, sections), [value, sections]);
  const blanks = useMemo(() => emptySections(value, sections), [value, sections]);

  return (
    <div className="note-editor-body">
      {blanks.length > 0 && (
        <p className="empty-sections-note" data-testid="empty-sections">
          Nothing recorded in {joinNames(blanks)} — add or leave blank.
        </p>
      )}

      <div
        className={['note-editable-wrap', refined ? 'is-refined' : '', refining ? 'is-refining' : '']
          .filter(Boolean)
          .join(' ')}
        data-testid={refining ? 'note-updating' : undefined}
      >
        <div className="note-editable note-highlights" aria-hidden="true" data-testid="note-highlights">
          {/* Keyed by position: the runs are a pure function of the text, and
              every one of them changes when it does. */}
          {segments.map((segment, index) =>
            segment.kind === 'plain' ? (
              <span key={index}>{segment.text}</span>
            ) : (
              <mark key={index} className={`marker marker-${segment.kind}`}>
                {segment.text}
              </mark>
            ),
          )}
          {/* A sentinel: a text node ending in a newline has it collapsed at
              the end of a block, which would leave the backdrop a line short
              for a note that ends in one. */}
          {'\n'}
        </div>

        <AutoGrowTextarea
          ref={ref}
          className={readOnly ? 'note-editable is-published' : 'note-editable'}
          data-testid="note-body"
          aria-label="Note body"
          spellCheck
          value={value}
          readOnly={readOnly}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          onBlur={onBlur}
          onSelect={(event) => {
            const element = event.currentTarget;
            onSelect(element.value.slice(element.selectionStart, element.selectionEnd).trim());
          }}
        />
      </div>
    </div>
  );
}

/** "Objective", "Objective and Plan", "Objective, Assessment and Plan". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${String(names.at(-1))}`;
}
