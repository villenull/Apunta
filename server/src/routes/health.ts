import type { HealthResponse } from '@apunta/shared';
import type { Database } from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

import type { AiProviders } from '../ai/types.js';
import type { AppConfig } from '../config.js';
import { migrationLevel } from '../db/index.js';

/**
 * M3 makes the LLM half real: the provider is asked whether it can reach the
 * local runtime and whether the configured model is actually pulled. In fake
 * mode it always answers yes, which is what keeps `APUNTA_FAKE_AI=1` a
 * complete app rather than a half-broken one.
 *
 * whisper and ffmpeg stay hard-coded until M5.
 */
export async function buildHealthResponse(
  config: AppConfig,
  db: Database,
  providers: AiProviders,
): Promise<HealthResponse> {
  const llm = await providers.llm.describe();
  return {
    ok: true,
    version: config.version,
    fakeAi: config.fakeAi,
    db: { path: config.dbFile, migrationLevel: migrationLevel(db) },
    ollama: { reachable: llm.reachable, model: llm.model, modelPresent: llm.modelPresent },
    whisper: { binaryPresent: false, modelPresent: false },
    ffmpeg: { present: false },
  };
}

export function registerHealthRoute(
  app: FastifyInstance,
  config: AppConfig,
  db: Database,
  providers: AiProviders,
): void {
  app.get('/api/health', async (): Promise<HealthResponse> => buildHealthResponse(config, db, providers));
}
