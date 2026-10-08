import type { SetupStatusResponse } from '@apunta/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiRequestError, fetchSetupStatus, updaterMayBeAvailable } from '../api/index.js';

/** How often setup is re-read while its window is open: progress should move. */
const POLL_MS = 1000;

export interface SetupStatusHandle {
  /** `null` until the first answer, and for good when the route is a 404. */
  readonly status: SetupStatusResponse | null;
  /** The route answered 404: a browser tab, where the app does not set itself up. */
  readonly unavailable: boolean;
  /** Read the state now, instead of waiting for the next tick. */
  readonly refresh: () => void;
}

/**
 * Reads `GET /api/app/setup` (shell mode only) once, and every second while
 * `polling`. A 404 stops it for good, as the updater's hook does.
 */
export function useSetupStatus(polling: boolean): SetupStatusHandle {
  const [status, setStatus] = useState<SetupStatusResponse | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const stopped = useRef(false);
  const inFlight = useRef<AbortController | null>(null);

  const read = useCallback(() => {
    if (stopped.current) return;
    if (!updaterMayBeAvailable()) {
      stopped.current = true;
      setUnavailable(true);
      return;
    }
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    fetchSetupStatus(controller.signal).then(
      (next) => {
        if (!controller.signal.aborted) setStatus(next);
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiRequestError && error.status === 404) {
          stopped.current = true;
          setUnavailable(true);
        }
      },
    );
  }, []);

  useEffect(() => {
    read();
    if (!polling) return undefined;
    const timer = window.setInterval(read, POLL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [polling, read]);

  useEffect(
    () => () => {
      inFlight.current?.abort();
    },
    [],
  );

  return { status, unavailable, refresh: read };
}
