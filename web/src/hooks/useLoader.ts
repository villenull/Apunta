import { useCallback, useEffect, useState } from 'react';

import { errorMessage } from '../api/index.js';

/**
 * The loading/error pattern every screen uses, in about thirty lines instead of
 * a data-fetching library (M2 deliverable 5).
 *
 * `load` must be stable — wrap it in `useCallback` with the ids it depends on,
 * and a change of those ids re-runs it. In-flight requests are aborted when the
 * component unmounts or the inputs change, so a late answer never overwrites a
 * newer one.
 */
export type LoadState<T> =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T };

export interface Loader<T> {
  state: LoadState<T>;
  /** Re-run `load`. */
  reload: () => void;
  /** Apply a local edit to already-loaded data, without a round trip. */
  update: (updater: (current: T) => T) => void;
}

export function useLoader<T>(load: (signal: AbortSignal) => Promise<T>): Loader<T> {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });

    load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ status: 'ready', data });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'error', message: errorMessage(error) });
      },
    );

    return () => {
      controller.abort();
    };
  }, [load, attempt]);

  const reload = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  const update = useCallback((updater: (current: T) => T) => {
    setState((current) =>
      current.status === 'ready' ? { status: 'ready', data: updater(current.data) } : current,
    );
  }, []);

  return { state, reload, update };
}
