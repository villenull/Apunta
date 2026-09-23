import type { ImportBatch, ImportUndoResponse } from '@apunta/shared';

import { plural } from '../lib/plural.js';

export interface ImportBatchListProps {
  readonly batches: readonly ImportBatch[];
  readonly undone: ImportUndoResponse | null;
  readonly busy: boolean;
  readonly onUndo: (id: string) => void;
  readonly testId: string;
  readonly showPatients?: boolean;
  readonly formatDate: (createdAt: string) => string;
}

/** Shared history/undo presentation for both import sources. */
export function ImportBatchList({
  batches,
  undone,
  busy,
  onUndo,
  testId,
  showPatients = false,
  formatDate,
}: ImportBatchListProps): React.JSX.Element | null {
  if (batches.length === 0 && undone === null) return null;
  return (
    <div className="card card-rows lede" data-testid={testId}>
      <h3 className="heading-tight">Earlier imports</h3>
      {undone !== null && (
        <p className="small note-meta" data-testid={testId.replace('batches', 'undone')}>
          Undone: {plural(undone.notes_deleted, 'note')} and {plural(undone.patients_deleted, 'patient')}{' '}
          removed.
        </p>
      )}
      {batches.map((batch) => (
        <div className="row between" key={batch.id}>
          <span className="small">
            {formatDate(batch.created_at)} — {plural(batch.notes, 'note')}
            {showPatients && batch.patients > 0 ? `, ${plural(batch.patients, 'new patient')}` : ''}
          </span>
          <button
            type="button"
            className="btn small btn-quick"
            disabled={busy}
            onClick={() => onUndo(batch.id)}
          >
            Undo
          </button>
        </div>
      ))}
    </div>
  );
}
