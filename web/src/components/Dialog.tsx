import { useEffect, useRef } from 'react';

export interface DialogProps {
  readonly title: string;
  readonly children: React.ReactNode;
  readonly onClose: () => void;
  readonly variant?: 'dialog' | 'sheet';
  readonly className?: string;
  readonly initialFocusRef?: React.RefObject<HTMLElement | null>;
  /**
   * The dialog itself — the element with `role="dialog"`, which is the one that
   * has a box and carries the caller's `className`. Name a test hook for the
   * element you mean: a non-modal sheet's wrapper is a zero-sized div, so a
   * hook there would never be visible.
   */
  readonly testId?: string;
  /** The wrapper that dims the page behind a modal. */
  readonly backdropTestId?: string;
  readonly open?: boolean;
  readonly showTitle?: boolean;
  /** Confirmation surfaces trap focus; the refine sheet remains non-modal. */
  readonly modal?: boolean;
}
/**
 * The one modal surface used by confirmations and the refine sheet. It owns
 * keyboard dismissal, a contained tab order, and returning focus to the
 * control that opened it.
 */
export function Dialog({
  title,
  children,
  onClose,
  variant = 'dialog',
  className = '',
  initialFocusRef,
  testId,
  backdropTestId,
  open = true,
  showTitle = true,
  modal = true,
}: DialogProps): React.JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useRef(`dialog-title-${Math.random().toString(36).slice(2)}`);
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const focusTarget =
      initialFocusRef?.current ??
      panel?.querySelector<HTMLElement>(
        'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
      );
    (focusTarget ?? panel)?.focus();

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (!modal || event.key !== 'Tab' || panel === null) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true',
      );
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) {
        event.preventDefault();
        panel.focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      restoreRef.current?.focus();
    };
  }, [initialFocusRef, modal, onClose, open]);
  return (
    <div
      className={
        open
          ? modal
            ? variant === 'sheet'
              ? 'modal-backdrop sheet-backdrop'
              : 'modal-backdrop'
            : ''
          : 'is-dialog-closed'
      }
      data-testid={backdropTestId}
    >
      <div
        ref={panelRef}
        className={className || (variant === 'sheet' ? 'sheet' : 'modal card')}
        data-testid={testId}
        role="dialog"
        aria-modal={modal || undefined}
        aria-labelledby={showTitle ? titleId.current : undefined}
        aria-label={showTitle ? undefined : title}
        aria-hidden={!open}
        tabIndex={-1}
      >
        {showTitle && (
          <h2 id={titleId.current} className="heading-tight">
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>
  );
}
