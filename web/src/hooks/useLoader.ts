import { useCallback, useEffect, useRef, useState } from 'react';

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
  /** Re-run `load`, showing the loading state while it runs. */
  reload: () => void;
  /**
   * Re-run `load` **without** going back to loading: the data on screen stays
   * until the answer replaces it. For a background re-read after an edit that
   * was already applied locally — a list that blanked to "Loading…" and redrew
   * every row on each drag was the owner's complaint (2026-09-27).
   */
  refresh: () => void;
  /** Apply a local edit to already-loaded data, without a round trip. */
  update: (updater: (current: T) => T) => void;
}

export interface LoaderOptions {
  /**
   * Once there is data, never go back to loading: a new `load` (its inputs
   * changed) swaps the data when the answer arrives, like a refresh. For a list
   * whose inputs only widen or narrow it — the sidebar asking for archived
   * patients too — where blanking to "Loading…" redrew every row (owner,
   * 2026-09-28).
   */
  readonly keepData?: boolean;
}

export function useLoader<T>(
  load: (signal: AbortSignal) => Promise<T>,
  options: LoaderOptions = {},
): Loader<T> {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const quiet = useRef(false);
  const hasData = useRef(false);
  const keepData = options.keepData === true;

  useEffect(() => {
    const controller = new AbortController();
    // A refresh keeps what is on screen; anything else (a first load, new
    // inputs, a reload) says it is loading. The flag is spent either way.
    const keep = quiet.current || (keepData && hasData.current);
    quiet.current = false;
    if (!keep) setState({ status: 'loading' });

    load(controller.signal).then(
      (data) => {
        if (controller.signal.aborted) return;
        hasData.current = true;
        setState({ status: 'ready', data });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        // A failed background refresh leaves the list she was looking at alone;
        // the edit that asked for it reports its own failure.
        setState((current) =>
          keep && current.status === 'ready' ? current : { status: 'error', message: errorMessage(error) },
        );
      },
    );

    return () => {
      controller.abort();
    };
  }, [load, attempt, keepData]);

  const reload = useCallback(() => {
    quiet.current = false;
    setAttempt((value) => value + 1);
  }, []);

  const refresh = useCallback(() => {
    quiet.current = true;
    setAttempt((value) => value + 1);
  }, []);

  const update = useCallback((updater: (current: T) => T) => {
    setState((current) =>
      current.status === 'ready' ? { status: 'ready', data: updater(current.data) } : current,
    );
  }, []);

  return { state, reload, refresh, update };
}
