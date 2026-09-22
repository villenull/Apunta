import { useRef } from 'react';

import { useSpelling } from '../hooks/useSpelling.js';
import { spelledRuns, useSpellingMenu } from './SpellMarks.js';

/**
 * A single-line input with the app's own spell check. It shares the same
 * dictionary, menu, accepted words and Add to dictionary actions as the note
 * body and SpellcheckTextarea; the browser's checker stays off.
 */
export function SpellcheckInput({
  value,
  onChange,
  allowWords = [],
  className,
  ref: forwarded,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'ref'> & {
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Words this input may contain that the dictionary would not know. */
  readonly allowWords?: readonly string[];
  readonly ref?: React.Ref<HTMLInputElement> | undefined;
}): React.JSX.Element {
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const spelling = useSpelling(value, allowWords);
  const { open, menu } = useSpellingMenu(value, onChange, spelling, wrap, input);

  const classes = ['spell-layer', className].filter(Boolean).join(' ');

  return (
    <div className="spell-wrap spell-input-wrap" ref={wrap}>
      <div className={`${classes} spell-backdrop`} ref={backdrop} aria-hidden="true">
        {spelledRuns(value, 0, spelling.misspellings, 'w')}
      </div>
      <input
        {...rest}
        ref={(node) => {
          input.current = node;
          if (typeof forwarded === 'function') forwarded(node);
          else if (forwarded) forwarded.current = node;
        }}
        className={`${classes} spell-input`}
        value={value}
        spellCheck={false}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onScroll={(event) => {
          if (backdrop.current) backdrop.current.scrollLeft = event.currentTarget.scrollLeft;
        }}
        onClick={open}
        onContextMenu={open}
      />
      {menu}
    </div>
  );
}
