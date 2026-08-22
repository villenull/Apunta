import type { HealthResponse } from '@patience/shared';
import type { Database } from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

import { migrationLevel } from '../db/index.js';
import type { AppConfig } from '../config.js';

/**
 * M1: the database half is real (path on disk + how far migrations have run).
 * The AI checks are still hard-coded — M3 (Ollama) and M5 (whisper/ffmpeg)
 * replace them with real loopback probes.
 */
export function buildHealthResponse(config: AppConfig, db: Database): HealthResponse {
  return {
    ok: true,
    version: config.version,
    fakeAi: config.fakeAi,
    db: { path: config.dbFile, migrationLevel: migrationLevel(db) },
    ollama: { reachable: false, model: null, modelPresent: false },
    whisper: { binaryPresent: false, modelPresent: false },
    ffmpeg: { present: false },
  };
}

export function registerHealthRoute(app: FastifyInstance, config: AppConfig, db: Database): void {
  app.get('/api/health', async (): Promise<HealthResponse> => buildHealthResponse(config, db));
}
