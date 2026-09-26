import type { ImportBatch, ImportUndoResponse } from '@apunta/shared';

import { useI18n } from '../lib/i18n.js';

export interface ImportBatchListProps {
  readonly batches: readonly ImportBatch[];
  readonly undone: ImportUndoResponse | null;
  readonly busy: boolean;
  readonly onUndo: (id: string) => void;
  readonly testId: string;
  readonly showPatients?: boolean;
  readonly formatDate: (createdAt: string) => string;
}

/**
 * Shared history/undo presentation for both import sources.
 *
 * `formatDate` stays a prop: the caller owns the locale, and both routes hand it
 * the catalogue's own `note.updatedAt` rather than `formatInstantAsDate`'s
 * `en-US` string (Fixed decision 3).
 */
export function ImportBatchList({
  batches,
  undone,
  busy,
  onUndo,
  testId,
  showPatients = false,
  formatDate,
}: ImportBatchListProps): React.JSX.Element | null {
  const { t } = useI18n();
  if (batches.length === 0 && undone === null) return null;
  return (
    <div className="card card-rows lede" data-testid={testId}>
      <h3 className="heading-tight">{t('import.earlier')}</h3>
      {undone !== null && (
        <p className="small note-meta" data-testid={testId.replace('batches', 'undone')}>
          {t('import.undoneLine', {
            notes: t('count.note', { count: undone.notes_deleted }),
            patients: t('count.patient', { count: undone.patients_deleted }),
          })}
        </p>
      )}
      {batches.map((batch) => (
        <div className="row between" key={batch.id}>
          <span className="small">
            {t('import.batchLine', {
              date: formatDate(batch.created_at),
              notes: t('count.note', { count: batch.notes }),
            })}
            {showPatients && batch.patients > 0 ? t('import.batchPatients', { count: batch.patients }) : ''}
          </span>
          <button
            type="button"
            className="btn small btn-quick"
            disabled={busy}
            onClick={() => onUndo(batch.id)}
          >
            {t('common.undo')}
          </button>
        </div>
      ))}
    </div>
  );
}
