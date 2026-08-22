import type { HealthResponse } from '@patience/shared';
import type { FastifyInstance } from 'fastify';

import type { AppConfig } from '../config.js';

/**
 * M0 stub: the server reports itself up and every local dependency as absent.
 * M3 (Ollama) and M5 (whisper/ffmpeg) replace the hard-coded checks with real
 * loopback probes.
 */
export function buildHealthResponse(config: AppConfig): HealthResponse {
  return {
    ok: true,
    version: config.version,
    fakeAi: config.fakeAi,
    ollama: { reachable: false, model: null, modelPresent: false },
    whisper: { binaryPresent: false, modelPresent: false },
    ffmpeg: { present: false },
  };
}

export function registerHealthRoute(app: FastifyInstance, config: AppConfig): void {
  app.get('/api/health', async (): Promise<HealthResponse> => buildHealthResponse(config));
}
