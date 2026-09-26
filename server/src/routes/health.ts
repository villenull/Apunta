import { effectiveModel, type HealthResponse } from '@apunta/shared';
import type { Database } from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

import { installedModelTags, llmModelOverride } from '../ai/profiles.js';
import type { AiProviders } from '../ai/types.js';
import type { AppConfig } from '../config.js';
import { migrationLevel } from '../db/index.js';
import { fileVaultStatus } from '../platform/filevault.js';

/**
 * The agreement rule (C-MODEL@1): in real mode `present` is `null` **exactly**
 * when the runtime is unreachable.
 *
 * `reachable` is consulted *before* the installed list, so the invariant holds
 * by construction rather than by the two happening to agree. It matters
 * because they are independent round trips to the same loopback URL:
 * `OllamaProvider.describe()` reads `/api/tags` with its own 2500 ms timeout
 * and `readInstalledModelNames` reads it again, the second time possibly
 * answered from its 2 s cache while the first was not. Computing `present` from
 * the list alone lets the route publish two states that are both wrong:
 * `present: false` for a runtime it had just failed to reach, which tells the
 * owner a model is missing that she has; and `present: true` for a runtime
 * that never answered at all, which is how a machine looks set up and cannot
 * draft. An unreachable runtime is `null` and the list is not read.
 *
 * `undefined` means "nobody injected a list", so the route asks `profiles.ts`.
 * An explicit `null` is itself the answer — the caller is saying the runtime
 * could not be asked — and must not be turned into a fetch by `??`.
 *
 * The residual: a runtime that *is* reachable, whose model list could not be
 * read, is `null` too, because that is unknown and `false` would be a lie the
 * owner sees. `describe()` may well have found the model in the same second, so
 * the two halves can legitimately differ there. It is the one state the card's
 * rule cannot close from the route, and it is recorded in the return file.
 */
async function effectiveInstalled(
  config: AppConfig,
  reachable: boolean,
  injected: readonly string[] | null | undefined,
): Promise<readonly string[] | null> {
  if (!reachable) return null;
  if (injected !== undefined) return injected;
  return installedModelTags({ baseUrl: config.ollamaUrl });
}

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
  /**
   * C-MODEL@1's installed-tag list. Production passes nothing and the route
   * asks `profiles.ts`, exactly as it does today; the parameter exists so a
   * test can make `present: false` without a listener or a stub HTTP server.
   * A stub `providers.llm` cannot do it — it decides only `describe()`.
   */
  injectedInstalledModels?: readonly string[] | null,
): Promise<HealthResponse & { testRunId?: string }> {
  const [llm, stt, fileVault] = await Promise.all([
    providers.llm.describe(),
    providers.stt.describe(),
    fileVaultStatus(),
  ]);

  /**
   * C-MODEL@1's `{ tag, source, present }`, from the same resolver the server
   * and the installer use. The three fields are the resolver's answer and the
   * `describe()`-derived `model`/`modelPresent` beside them are unchanged,
   * which is what lets the setup UI keep reading the pair it reads today.
   */
  const override = llmModelOverride(db);
  const resolved = config.fakeAi
    ? // Fake mode has no runtime to ask, so the installed list is not read at
      // all. `FakeLlmProvider.describe()` reports the model as present, so
      // `present` is `true`; the agreement rule below is real-mode only.
      { ...effectiveModel({ override, installed: null }), present: true as const }
    : effectiveModel({
        override,
        installed: await effectiveInstalled(config, llm.reachable, injectedInstalledModels),
      });

  // The sandbox wrapper's ownership check (C-ISO@1 rule 5): when the server
  // runs inside a sandbox run, it says which one, so the wrapper can refuse
  // a foreign server answering on its port. The field never appears
  // otherwise, so production responses are unchanged.
  const testRunId = process.env['APUNTA_TEST_RUN_ID']?.trim() || undefined;
  return {
    ok: true,
    version: config.version,
    fakeAi: config.fakeAi,
    // The bundled runtime is the one thing only the packaged app sets (M8).
    bundled: config.ollamaBin !== undefined,
    db: { path: config.dbFile, migrationLevel: migrationLevel(db) },
    ollama: {
      reachable: llm.reachable,
      model: llm.model,
      modelPresent: llm.modelPresent,
      tag: resolved.tag,
      source: resolved.source,
      present: resolved.present,
    },
    whisper: {
      binaryPresent: stt.binaryPresent,
      modelPresent: stt.modelPresent,
      binary: stt.binary,
      model: stt.model,
    },
    fileVault,
    ...(testRunId === undefined ? {} : { testRunId }),
  };
}

export function registerHealthRoute(
  app: FastifyInstance,
  config: AppConfig,
  db: Database,
  providers: AiProviders,
  installedModels?: readonly string[] | null,
): void {
  app.get('/api/health', async (): Promise<HealthResponse & { testRunId?: string }> =>
    buildHealthResponse(config, db, providers, installedModels),
  );
}
