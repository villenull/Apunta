import { useEffect, useState } from 'react';

import { fetchHealth } from './api.js';

type Status = { state: 'loading' } | { state: 'ok'; version: string } | { state: 'error'; message: string };

export function App(): React.JSX.Element {
  const [status, setStatus] = useState<Status>({ state: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal)
      .then((health) => {
        setStatus({ state: 'ok', version: health.version });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setStatus({ state: 'error', message: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      controller.abort();
    };
  }, []);

  return (
    <main className="placeholder">
      <h1 data-testid="health-status">
        {status.state === 'loading' && 'Practice Notes — checking server…'}
        {status.state === 'ok' && 'Practice Notes — server ok'}
        {status.state === 'error' && 'Practice Notes — server unreachable'}
      </h1>
      <p className="muted">
        {status.state === 'ok'
          ? `Scaffold running (v${status.version}). Screens arrive in M2.`
          : status.state === 'error'
            ? status.message
            : 'Contacting http://127.0.0.1:7717/api/health'}
      </p>
    </main>
  );
}
