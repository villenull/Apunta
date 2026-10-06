import type { UpdateStatusResponse } from '@apunta/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiRequestError, fetchUpdateStatus, updaterMayBeAvailable } from '../api/index.js';

/** How often the updater's state is re-read while the app is open. */
const POLL_MS = 3000;

export interface UpdateStatusHandle {
  /** `null` until the first answer, and for good when the route is a 404. */
  readonly status: UpdateStatusResponse | null;
  /** The route answered 404: no shell, so no updater and nothing to show. */
  readonly unavailable: boolean;
  /** Read the state now, instead of waiting for the next tick. */
  readonly refresh: () => void;
}

/**
 * Polls `GET /api/app/update` (shell mode only). A 404 stops the polling: a
 * browser tab has no updater and asking again every few seconds is noise. Any
 * other failure keeps the last known state and tries again on the next tick.
 */
export function useUpdateStatus(): UpdateStatusHandle {
  const [status, setStatus] = useState<UpdateStatusResponse | null>(null);
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
    fetchUpdateStatus(controller.signal).then(
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
    stopped.current = false;
    read();
    const timer = window.setInterval(read, POLL_MS);
    return () => {
      stopped.current = true;
      window.clearInterval(timer);
      inFlight.current?.abort();
    };
  }, [read]);

  return { status, unavailable, refresh: read };
}
