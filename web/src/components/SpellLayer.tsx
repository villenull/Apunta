import { useLayoutEffect, useMemo, useRef } from 'react';

import { useSpelling } from '../hooks/useSpelling.js';
import { useI18n } from '../lib/i18n.js';
import type { Misspelling } from '../lib/spelling.js';
import { spelledRuns, useSpellingMenu } from './SpellMarks.js';
import { useSpellingContext } from './SpellingProvider.js';

interface SpellLayerBase {
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Words this text may contain that the dictionary would not know. */
  readonly allowWords?: readonly string[];
  readonly className?: string;
  readonly wrapClassName?: string;
  /** A marker-aware backdrop, used by the note editor. */
  readonly renderBackdrop?: (misspellings: readonly Misspelling[]) => React.ReactNode;
  readonly backdropTestId?: string;
  /** Grow a textarea to its content instead of giving it an inner scrollbar. */
  readonly autoGrow?: boolean;
}

type InputProps = SpellLayerBase &
  Omit<React.InputHTMLAttributes<HTMLInputElement>, keyof SpellLayerBase | 'value' | 'onChange'> & {
    readonly as: 'input';
    readonly ref?: React.Ref<HTMLInputElement> | undefined;
  };

type TextareaProps = SpellLayerBase &
  Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, keyof SpellLayerBase | 'value' | 'onChange'> & {
    readonly as: 'textarea';
    readonly ref?: React.Ref<HTMLTextAreaElement> | undefined;
  };

export type SpellLayerProps = InputProps | TextareaProps;

/**
 * The one spell-check surface for single-line inputs, textareas, and the note
 * editor. It owns the delayed check, aligned backdrop, menu, and control ref;
 * callers only choose the native control with `as` and optionally render
 * marker-specific backdrop content.
 */
export function SpellLayer(props: SpellLayerProps): React.JSX.Element {
  const {
    as,
    value,
    onChange,
    allowWords = [],
    className,
    wrapClassName,
    backdropTestId,
    renderBackdrop,
    autoGrow = false,
    ...rest
  } = props;
  const wrap = useRef<HTMLDivElement>(null);
  const control = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const spelling = useSpelling(value, allowWords);
  // One alert per mounted spell surface (S6.1, D4.4), in this field's own wrap
  // and nowhere else: a note page with the chat open shows two, because the
  // note body and the refine composer are two surfaces and either can fail.
  const { error } = useSpellingContext();
  const { t } = useI18n();
  const alert =
    error === null ? null : (
      <p className="form-error" role="alert" data-testid="spelling-load-failed">
        {t(error)}
      </p>
    );
  const backdrop = useMemo(
    () =>
      renderBackdrop
        ? renderBackdrop(spelling.misspellings)
        : [spelledRuns(value, 0, spelling.misspellings, 'w'), ...(as === 'textarea' ? ['\n'] : [])],
    [as, renderBackdrop, spelling.misspellings, value],
  );
  const { open, menu } = useSpellingMenu(value, onChange, spelling, wrap, control);

  useLayoutEffect(() => {
    if (as !== 'textarea' || !autoGrow) return;
    const element = control.current;
    if (!(element instanceof HTMLTextAreaElement)) return;
    element.style.height = 'auto';
    element.style.height = `${String(element.scrollHeight)}px`;
  }, [as, autoGrow, value]);

  const classes = ['spell-layer', className].filter(Boolean).join(' ');
  const wrapperClasses = ['spell-wrap', as === 'input' ? 'spell-input-wrap' : '', wrapClassName]
    .filter(Boolean)
    .join(' ');
  const setControlRef = (node: HTMLInputElement | HTMLTextAreaElement | null): void => {
    control.current = node;
    const forwarded = rest.ref;
    if (typeof forwarded === 'function') forwarded(node as never);
    else if (forwarded)
      (forwarded as React.MutableRefObject<HTMLInputElement | HTMLTextAreaElement | null>).current = node;
  };

  if (as === 'input') {
    const {
      ref: _ref,
      onScroll,
      onClick,
      onContextMenu,
      ...attributes
    } = rest as React.InputHTMLAttributes<HTMLInputElement> & {
      ref?: React.Ref<HTMLInputElement>;
    };
    const inactive = attributes.disabled || attributes.readOnly;
    return (
      <div className={wrapperClasses} ref={wrap}>
        <div className={`${classes} spell-backdrop`} data-testid={backdropTestId} aria-hidden="true">
          {backdrop}
        </div>
        <input
          {...attributes}
          ref={setControlRef as React.Ref<HTMLInputElement>}
          className={`${classes} spell-input`}
          value={value}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
          onScroll={(event) => {
            if (wrap.current) {
              const backdropElement = wrap.current.firstElementChild;
              if (backdropElement instanceof HTMLElement)
                backdropElement.scrollLeft = event.currentTarget.scrollLeft;
            }
            onScroll?.(event);
          }}
          onClick={inactive ? onClick : open}
          onContextMenu={inactive ? onContextMenu : open}
        />
        {alert}
        {menu}
      </div>
    );
  }

  const {
    ref: _ref,
    onScroll,
    onClick,
    onContextMenu,
    ...attributes
  } = rest as React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    ref?: React.Ref<HTMLTextAreaElement>;
  };
  const inactive = attributes.disabled || attributes.readOnly;
  return (
    <div className={wrapperClasses} ref={wrap}>
      <div className={`${classes} spell-backdrop`} data-testid={backdropTestId} aria-hidden="true">
        {backdrop}
      </div>
      <textarea
        {...attributes}
        ref={setControlRef as React.Ref<HTMLTextAreaElement>}
        className={`${classes} spell-input`}
        value={value}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onScroll={(event) => {
          if (wrap.current) {
            const backdropElement = wrap.current.firstElementChild;
            if (backdropElement instanceof HTMLElement)
              backdropElement.scrollTop = event.currentTarget.scrollTop;
          }
          onScroll?.(event);
        }}
        onClick={inactive ? onClick : open}
        onContextMenu={inactive ? onContextMenu : open}
      />
      {alert}
      {menu}
    </div>
  );
}
