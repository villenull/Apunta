import { useRef } from 'react';

import { Dialog } from './Dialog.js';
/**
 * A confirmation the keyboard can dismiss (M7 deliverable 5).
 *
 * `window.confirm` was doing this job and does it badly: it cannot be styled,
 * it cannot carry a second paragraph, and — the reason it had to go — the
 * copy it can hold is one line, while the honest copy for deleting a patient
 * needs two. Deleting here removes the notes, the transcripts and the chat
 * history, and it *cannot* reach a backup already written, a Time Machine
 * copy, or the records system the notes were pasted into. Saying only "this
 * cannot be undone" gets that exactly backwards in both directions
 * (`docs/research/data-at-rest-2026-08.md` §3.2, §6.3.4).
 *
 * Escape closes it, the destructive button is not the one focused on open, and
 * the backdrop is a click target — the three things people reach for without
 * thinking and are annoyed not to find.
 */
export interface ConfirmDialogProps {
  readonly title: string;
  readonly body: React.ReactNode;
  /** The destructive button's label, e.g. "Delete John Smith". */
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmDialogProps): React.JSX.Element {
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog title={title} onClose={onCancel} backdropTestId="confirm-backdrop" initialFocusRef={cancelRef}>
      <div className="small note-meta modal-body">{body}</div>
      <div className="modal-actions">
        <button type="button" className="btn" ref={cancelRef} onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className="btn btn-danger" data-testid="confirm-accept" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
