import { useRef } from 'react';

import { useSpelling } from '../hooks/useSpelling.js';
import { spelledRuns, useSpellingMenu } from './SpellMarks.js';

/**
 * A plain textarea with the app's own spell check: wavy marks under
 * misspelt words, a click for suggestions, and the browser's checker off
 * (`shared/src/spelling.ts` says why).
 *
 * The marks are a backdrop with the textarea's own classes, so both layers
 * share typography and box; the textarea goes transparent over it and the
 * backdrop follows its scroll. The note body does the same with its marker
 * layer (`NoteBody.tsx`); this is the version for a textarea that scrolls.
 */
export function SpellcheckTextarea({
  value,
  onChange,
  allowWords = [],
  className,
  ...rest
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Words this text may contain that the dictionary would not know. */
  readonly allowWords?: readonly string[];
  readonly 'data-testid'?: string;
}): React.JSX.Element {
  const wrap = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const spelling = useSpelling(value, allowWords);
  const { open, menu } = useSpellingMenu(value, onChange, spelling, wrap, textarea);

  const classes = ['spell-layer', className].filter(Boolean).join(' ');

  return (
    <div className="spell-wrap" ref={wrap}>
      <div className={`${classes} spell-backdrop`} ref={backdrop} aria-hidden="true">
        {spelledRuns(value, 0, spelling.misspellings, 'w')}
        {/* A sentinel: a trailing newline collapses at the end of a block,
            which would leave the backdrop a line short. */}
        {'\n'}
      </div>
      <textarea
        {...rest}
        ref={textarea}
        className={`${classes} spell-input`}
        value={value}
        spellCheck={false}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onScroll={(event) => {
          if (backdrop.current) backdrop.current.scrollTop = event.currentTarget.scrollTop;
        }}
        onClick={open}
        onContextMenu={open}
      />
      {menu}
    </div>
  );
}
