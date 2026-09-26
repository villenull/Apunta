import { useCallback, useState } from 'react';

import { readPinnedIds, writePinnedIds } from '../lib/patientPins.js';

/**
 * The pinned patients, in the order she dragged them into.
 *
 * preview-only: persist server-side in the real card — see `lib/patientPins`
 * for why this is `localStorage` in the preview.
 */
export interface PinnedPatients {
  /** Pinned ids, top of the list first. */
  readonly ids: readonly string[];
  isPinned: (patientId: string) => boolean;
  /** Pin, or unpin. A new pin lands at the BOTTOM of the pinned group. */
  toggle: (patientId: string) => void;
  /** Move the pinned row at `from` to `to`, both indexes into `ids`. */
  move: (from: number, to: number) => void;
}

export function usePinnedPatients(): PinnedPatients {
  const [ids, setIds] = useState<readonly string[]>(readPinnedIds);

  const toggle = useCallback((patientId: string) => {
    setIds((current) => {
      const next = current.includes(patientId)
        ? current.filter((id) => id !== patientId)
        : [...current, patientId];
      writePinnedIds(next);
      return next;
    });
  }, []);

  const move = useCallback((from: number, to: number) => {
    setIds((current) => {
      if (from === to || from < 0 || to < 0 || from >= current.length || to >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      if (moved === undefined) return current;
      next.splice(to, 0, moved);
      writePinnedIds(next);
      return next;
    });
  }, []);

  return { ids, isPinned: (id) => ids.includes(id), toggle, move };
}
