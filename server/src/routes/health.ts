import type { HealthResponse } from '@apunta/shared';
import type { Database } from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

import type { AiProviders } from '../ai/types.js';
import type { AppConfig } from '../config.js';
import { migrationLevel } from '../db/index.js';
import { fileVaultStatus } from '../platform/filevault.js';

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
 *
 * M7 adds FileVault, which is not an AI dependency and not something the app
 * can install — but it is the one item on the setup checklist whose absence
 * makes "nothing leaves this Mac" untrue, so it is asked rather than assumed.
 * The probe is cached and portable by omission; see `platform/filevault.ts`.
 */
export async function buildHealthResponse(
  config: AppConfig,
  db: Database,
  providers: AiProviders,
): Promise<HealthResponse> {
  const [llm, stt, fileVault] = await Promise.all([
    providers.llm.describe(),
    providers.stt.describe(),
    fileVaultStatus(),
  ]);
  return {
    ok: true,
    version: config.version,
    fakeAi: config.fakeAi,
    // The bundled runtime is the one thing only the packaged app sets (M8).
    bundled: config.ollamaBin !== undefined,
    db: { path: config.dbFile, migrationLevel: migrationLevel(db) },
    ollama: { reachable: llm.reachable, model: llm.model, modelPresent: llm.modelPresent },
    whisper: {
      binaryPresent: stt.binaryPresent,
      modelPresent: stt.modelPresent,
      binary: stt.binary,
      model: stt.model,
    },
    fileVault,
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
