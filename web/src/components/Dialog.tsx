import { useEffect, useId, useRef } from 'react';

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
  const titleId = useId();
  /**
   * Latest-callback refs: callers pass a fresh inline `onClose` on every
   * render (each note keystroke), so the effects below stay keyed on `open`
   * only and read the handler, trap flag, and focus target through these.
   * Otherwise each keystroke re-runs the focus setup — its cleanup restores
   * focus and its body re-focuses the chat input, stealing the caret.
   */
  const onCloseRef = useRef(onClose);
  const modalRef = useRef(modal);
  const openRef = useRef(open);
  const initialFocusTargetRef = useRef(initialFocusRef);
  useEffect(() => {
    onCloseRef.current = onClose;
    modalRef.current = modal;
    openRef.current = open;
    initialFocusTargetRef.current = initialFocusRef;
  });
  // Initial focus + restore: keyed on the open transition only. Caller renders
  // pass fresh inline `onClose` closures on every keystroke, so depending on
  // anything but `open` re-runs this setup per character — the cleanup
  // restores the opener's focus and the body re-focuses the chat input,
  // stealing the caret out of the note textarea mid-word.
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const focusTarget =
      initialFocusTargetRef.current?.current ??
      panel?.querySelector<HTMLElement>(
        'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
      );
    (focusTarget ?? panel)?.focus();
    return () => {
      restoreRef.current?.focus();
    };
  }, [open]);
  // Keyboard dismissal + focus trap: mounted once, always consulting the
  // latest handler/flag through refs, so callback identity churn neither
  // re-registers the listener nor touches focus.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      // The refine sheet stays mounted while closed (`open=false`), where the
      // previous version had no listener at all — ignore keys until reopened.
      if (!openRef.current) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      const panel = panelRef.current;
      if (!modalRef.current || event.key !== 'Tab' || panel === null) return;
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
    };
  }, []);
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
        aria-labelledby={showTitle ? titleId : undefined}
        aria-label={showTitle ? undefined : title}
        aria-hidden={!open}
        tabIndex={-1}
      >
        {showTitle && (
          <h2 id={titleId} className="heading-tight">
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>
  );
}
