import { useCallback, useMemo, useRef } from 'react';

import type { Misspelling } from '../lib/spelling.js';
import { emptySections, markNoteText } from '../lib/markers.js';
import { SpellLayer } from './SpellLayer.js';
import { SpelledSegment } from './SpellMarks.js';

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
  const backdropCache = useRef<{
    readonly misspellings: readonly Misspelling[];
    readonly segments: readonly { readonly kind: string; readonly text: string }[];
    readonly offsets: readonly number[];
    readonly nodes: React.ReactNode[];
  } | null>(null);
  const renderBackdrop = useCallback(
    (misspellings: readonly Misspelling[]) => {
      const previous = backdropCache.current;
      const canReuse = previous !== null && previous.misspellings === misspellings;
      const offsets: number[] = [];
      let offset = 0;
      let firstChanged = 0;
      if (canReuse && previous !== null) {
        while (firstChanged < segments.length) {
          const segment = segments[firstChanged];
          if (!segment) break;
          offsets.push(offset);
          const old = previous.segments[firstChanged];
          if (
            old === undefined ||
            old.kind !== segment.kind ||
            old.text !== segment.text ||
            previous.offsets[firstChanged] !== offset
          ) {
            break;
          }
          offset += segment.text.length;
          firstChanged += 1;
        }
      }
      if (
        firstChanged === segments.length &&
        canReuse &&
        previous !== null &&
        previous.segments.length === segments.length
      ) {
        return previous.nodes;
      }
      for (let index = firstChanged; index < segments.length; index += 1) {
        const segment = segments[index];
        if (!segment) continue;
        offsets[index] = offset;
        offset += segment.text.length;
      }
      const nodes = canReuse && previous !== null ? previous.nodes.slice(0, segments.length) : [];
      nodes.length = segments.length;
      for (let index = firstChanged; index < segments.length; index += 1) {
        const segment = segments[index];
        if (!segment) continue;
        nodes[index] = (
          <SpelledSegment
            key={index}
            text={segment.text}
            offset={offsets[index] ?? 0}
            misspellings={misspellings}
            keyPrefix={String(index)}
            kind={segment.kind}
          />
        );
      }
      nodes.push(<span key="spell-sentinel">{'\n'}</span>);
      backdropCache.current = { misspellings, segments, offsets, nodes };
      return nodes;
    },
    [segments],
  );

  return (
    <div className="note-editor-body">
      {blanks.length > 0 && (
        <p className="empty-sections-note" data-testid="empty-sections">
          Nothing recorded in {joinNames(blanks)} — add or leave blank.
        </p>
      )}

      <SpellLayer
        as="textarea"
        ref={ref}
        value={value}
        onChange={onChange}
        allowWords={allowWords}
        autoGrow
        renderBackdrop={renderBackdrop}
        backdropTestId="note-highlights"
        wrapClassName={['note-editable-wrap', refined ? 'is-refined' : '', refining ? 'is-refining' : '']
          .filter(Boolean)
          .join(' ')}
        className={readOnly ? 'note-editable is-published' : 'note-editable'}
        data-testid="note-body"
        aria-label="Note body"
        readOnly={readOnly}
        onBlur={onBlur}
        onSelect={(event) => {
          const element = event.currentTarget;
          onSelect(element.value.slice(element.selectionStart, element.selectionEnd).trim());
        }}
      />
    </div>
  );
}

/** "Objective", "Objective and Plan", "Objective, Assessment and Plan". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${String(names.at(-1))}`;
}
