import { useLayoutEffect, useRef } from 'react';

/**
 * A textarea that is exactly as tall as its content.
 *
 * The note body is a textarea rather than a contenteditable div on purpose:
 * M4's highlight-references need `selectionStart`/`selectionEnd`, which only a
 * form control gives you (recorded in docs/decisions.md). Growing it by hand is
 * the price of that choice.
 */
export type AutoGrowTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  value: string;
  'data-testid'?: string;
};

export function AutoGrowTextarea({ value, ...rest }: AutoGrowTextareaProps): React.JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${String(element.scrollHeight)}px`;
  }, [value]);

  return <textarea ref={ref} value={value} rows={1} {...rest} />;
}
