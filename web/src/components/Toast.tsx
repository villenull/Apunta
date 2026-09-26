import { useEffect } from 'react';

import { useI18n } from '../lib/i18n.js';

/**
 * A failed request, said out loud (M7 deliverable 5).
 *
 * Before this, an action that failed — deleting a patient, saving a setting —
 * either wrote into a corner of the screen or, worse, did nothing visible at
 * all. The one thing an app holding clinical records must never do is look
 * like it saved something it did not.
 *
 * So: `role="alert"`, so a screen reader says it immediately; a dismiss
 * button; and **no auto-dismiss on an error**. A message that removes itself
 * after four seconds is a message she can miss entirely, and the whole point
 * is that this one is not missable. Confirmations do fade, because a
 * confirmation she misses costs nothing.
 */
export interface ToastProps {
  readonly message: string;
  readonly kind?: 'error' | 'info';
  readonly onDismiss: () => void;
}

const INFO_TIMEOUT_MS = 5000;

export function Toast({ message, kind = 'error', onDismiss }: ToastProps): React.JSX.Element {
  const { t } = useI18n();
  useEffect(() => {
    if (kind !== 'info') return;
    const timer = setTimeout(onDismiss, INFO_TIMEOUT_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [kind, onDismiss]);

  return (
    <div
      className={kind === 'error' ? 'toast toast-error' : 'toast'}
      role={kind === 'error' ? 'alert' : 'status'}
      data-testid={kind === 'error' ? 'toast-error' : 'toast-info'}
    >
      <span className="grow">{message}</span>
      <button type="button" className="toast-dismiss" aria-label={t('common.dismiss')} onClick={onDismiss}>
        ×
      </button>
    </div>
  );
}
