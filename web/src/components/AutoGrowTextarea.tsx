import { useLayoutEffect, useRef } from 'react';

/**
 * A textarea that is exactly as tall as its content.
 *
 * The note body is a textarea rather than a contenteditable div on purpose:
 * M4's highlight-references need `selectionStart`/`selectionEnd`, which only a
 * form control gives you (recorded in docs/decisions.md). Growing it by hand is
 * the price of that choice — and it is also what lets the marker backdrop
 * behind it be a plain block: with no inner scrolling there is no scroll
 * offset to keep the two layers in step.
 */
export type AutoGrowTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  value: string;
  /** React 19 passes `ref` as an ordinary prop; it is merged with the internal one. */
  ref?: React.Ref<HTMLTextAreaElement> | undefined;
  'data-testid'?: string;
};

export function AutoGrowTextarea({
  value,
  ref: forwarded,
  ...rest
}: AutoGrowTextareaProps): React.JSX.Element {
  const own = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const element = own.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${String(element.scrollHeight)}px`;
  }, [value]);

  return (
    <textarea
      ref={(node) => {
        own.current = node;
        if (typeof forwarded === 'function') forwarded(node);
        else if (forwarded) forwarded.current = node;
      }}
      value={value}
      rows={1}
      {...rest}
    />
  );
}
