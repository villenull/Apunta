import type { HealthResponse } from '@apunta/shared';
import type { Database } from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

import type { AiProviders } from '../ai/types.js';
import type { AppConfig } from '../config.js';
import { migrationLevel } from '../db/index.js';

/**
 * Every dependency, asked rather than assumed.
 *
 * M3 made the LLM half real; M5 does whisper — the binary is probed and the
 * model file is stat'd, both through the provider, so fake mode answers yes to
 * everything and `APUNTA_FAKE_AI=1` stays a complete app rather than a
 * half-broken one.
 *
 * There is no ffmpeg check any more, because there is no ffmpeg: the browser
 * records 16 kHz mono WAV and `whisper-cli` reads it directly. A machine
 * without ffmpeg installed is a machine that works
 * (`docs/research/m8-bundling-2026-08.md` §11).
 */
export async function buildHealthResponse(
  config: AppConfig,
  db: Database,
  providers: AiProviders,
): Promise<HealthResponse> {
  const [llm, stt] = await Promise.all([providers.llm.describe(), providers.stt.describe()]);
  return {
    ok: true,
    version: config.version,
    fakeAi: config.fakeAi,
    db: { path: config.dbFile, migrationLevel: migrationLevel(db) },
    ollama: { reachable: llm.reachable, model: llm.model, modelPresent: llm.modelPresent },
    whisper: {
      binaryPresent: stt.binaryPresent,
      modelPresent: stt.modelPresent,
      binary: stt.binary,
      model: stt.model,
    },
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
