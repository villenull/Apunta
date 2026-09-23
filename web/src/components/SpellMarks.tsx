import { memo, useCallback, useState } from 'react';

import type { SpellingCheck } from '../hooks/useSpelling.js';
import { misspellingAt, replaceRange, type Misspelling } from '../lib/spelling.js';
import { SpellingMenu } from './SpellingMenu.js';

/**
 * Text as runs for a backdrop layer: plain strings, and misspelt words in a
 * `.misspelt` span that draws the wavy line. `offset` is where `text` sits
 * in the whole value, since a backdrop may already be split into other runs
 * (the note body's markers). Concatenating the runs reproduces `text`
 * exactly — a backdrop must lay out character for character with the textarea
 * above it.
 */
export function spelledRuns(
  text: string,
  offset: number,
  misspellings: readonly Misspelling[],
  keyPrefix: string,
): React.ReactNode[] {
  const end = offset + text.length;
  const runs: React.ReactNode[] = [];
  let cursor = offset;
  // Misspellings are sorted by start offset. Skip the prefix that cannot
  // overlap this segment instead of scanning every mark for every line.
  let low = 0;
  let high = misspellings.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    const middleEntry = misspellings[middle];
    if (!middleEntry || middleEntry.end > offset) high = middle;
    else low = middle + 1;
  }
  for (let index = low; index < misspellings.length; index += 1) {
    const entry = misspellings[index];
    if (!entry) break;
    if (entry.start >= end) break;
    const start = Math.max(entry.start, offset);
    const stop = Math.min(entry.end, end);
    if (start > cursor) runs.push(text.slice(cursor - offset, start - offset));
    runs.push(
      <span key={`${keyPrefix}-${String(start)}`} className="misspelt">
        {text.slice(start - offset, stop - offset)}
      </span>,
    );
    cursor = stop;
  }
  if (cursor < end) runs.push(text.slice(cursor - offset));
  return runs;
}

export const SpelledSegment = memo(function SpelledSegment({
  text,
  offset,
  misspellings,
  keyPrefix,
  kind,
}: {
  readonly text: string;
  readonly offset: number;
  readonly misspellings: readonly Misspelling[];
  readonly keyPrefix: string;
  readonly kind: string;
}): React.JSX.Element {
  const runs = spelledRuns(text, offset, misspellings, keyPrefix);
  return kind === 'plain' ? <span>{runs}</span> : <mark className={`marker marker-${kind}`}>{runs}</mark>;
});

interface OpenMenu {
  readonly entry: Misspelling;
  readonly suggestions: readonly string[];
  readonly left: number;
  readonly top: number;
}

/**
 * The menu under a misspelt word, for any textarea that draws marks: a click
 * (or a right-click) on a flagged word opens it where the pointer is,
 * inside `wrap`; a pick replaces the word and puts the caret after it.
 */
export function useSpellingMenu(
  value: string,
  onChange: (value: string) => void,
  spelling: SpellingCheck,
  wrap: React.RefObject<HTMLElement | null>,
  control: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>,
): {
  readonly open: (event: React.MouseEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  readonly menu: React.JSX.Element | null;
} {
  const [state, setState] = useState<OpenMenu | null>(null);

  const open = useCallback(
    (event: React.MouseEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const element = event.currentTarget;
      const start = element.selectionStart;
      const end = element.selectionEnd;
      if (start === null || end === null) {
        setState(null);
        return;
      }
      const entry = misspellingAt(spelling.misspellings, start);
      if (entry === null || start !== end) {
        setState(null);
        return;
      }
      // Ours, not the browser's: its menu would offer its own spelling.
      event.preventDefault();
      const box = wrap.current?.getBoundingClientRect();
      setState({
        entry,
        suggestions: spelling.suggest(entry.word),
        left: Math.max(0, event.clientX - (box?.left ?? 0)),
        top: Math.max(0, event.clientY - (box?.top ?? 0)) + 8,
      });
    },
    [spelling, wrap],
  );

  const close = useCallback(() => {
    setState(null);
  }, []);

  if (state === null) return { open, menu: null };

  const { entry } = state;
  const pick = (replacement: string): void => {
    onChange(replaceRange(value, entry.start, entry.end, replacement));
    setState(null);
    const element = control.current;
    if (element) {
      const caret = entry.start + replacement.length;
      // After React has written the new value.
      window.setTimeout(() => {
        element.focus();
        element.setSelectionRange(caret, caret);
      }, 0);
    }
  };

  return {
    open,
    menu: (
      <SpellingMenu
        word={entry.word}
        suggestions={state.suggestions}
        left={state.left}
        top={state.top}
        wrap={wrap}
        onPick={pick}
        onIgnore={() => {
          spelling.ignoreWord(entry.word);
          setState(null);
        }}
        onAdd={() => {
          spelling.addWord(entry.word);
          setState(null);
        }}
        onClose={close}
      />
    ),
  };
}
