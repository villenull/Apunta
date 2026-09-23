import type { ImportBatch, ImportUndoResponse } from '@apunta/shared';
import { useCallback, useEffect, useState } from 'react';

import { listImportBatches, undoImportBatch } from '../api/index.js';

export interface ImportBatchState {
  readonly batches: ImportBatch[];
  readonly undone: ImportUndoResponse | null;
  readonly undoing: boolean;
  readonly reload: () => void;
  readonly undo: (id: string) => Promise<void>;
}

/** Shared undoable-import history for Claude and Halaxy. */
export function useImportBatch(): ImportBatchState {
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [undone, setUndone] = useState<ImportUndoResponse | null>(null);
  const [undoing, setUndoing] = useState(false);

  const reload = useCallback(() => {
    listImportBatches()
      .then((result) => setBatches(result.batches))
      .catch(() => setBatches([]));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const undo = useCallback(
    async (id: string): Promise<void> => {
      if (undoing) return;
      setUndoing(true);
      try {
        setUndone(await undoImportBatch(id));
        reload();
      } finally {
        setUndoing(false);
      }
    },
    [reload, undoing],
  );

  return { batches, undone, undoing, reload, undo };
}
