import type { HealthResponse } from '@patience/shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App.js';

const health: HealthResponse = {
  ok: true,
  version: '0.0.0',
  fakeAi: true,
  db: { path: '/tmp/practice-notes.db', migrationLevel: 1 },
  ollama: { reachable: false, model: null, modelPresent: false },
  whisper: { binaryPresent: false, modelPresent: false },
  ffmpeg: { present: false },
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('App', () => {
  it('reports the server as ok once /api/health answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify(health), { headers: { 'content-type': 'application/json' } }),
      ),
    );

    render(<App />);

    expect(await screen.findByText('Practice Notes — server ok')).toBeDefined();
  });

  it('reports the server as unreachable when the fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connection refused');
      }),
    );

    render(<App />);

    expect(await screen.findByText('Practice Notes — server unreachable')).toBeDefined();
  });
});
