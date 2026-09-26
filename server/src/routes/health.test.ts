import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { HealthResponseSchema, PROMOTED_DEFAULT_MODEL } from '@apunta/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { FakeLlmProvider, FakeSttProvider } from '../ai/fake.js';
import type { AiProviders, LlmDescription } from '../ai/types.js';
import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import { openDatabase } from '../db/index.js';
import { putSettings } from '../db/settings.js';

/**
 * The sandbox wrapper's ownership check (C-ISO@1 rule 5): a server running
 * inside a sandbox run answers `/api/health` with that run's id, so the
 * wrapper can refuse a foreign server on its port. The field appears only
 * while `APUNTA_TEST_RUN_ID` is set.
 *
 * The C-MODEL@1 rows below are the other half: `ollama.tag`, `ollama.source`
 * and `ollama.present` come from `shared/`'s resolver, and the installed list
 * is injected rather than fetched — no listener, no stub HTTP server, no
 * `listen` anywhere in this file.
 */

let app: FastifyInstance | null = null;
let dir: string | null = null;
const savedRunId = process.env['APUNTA_TEST_RUN_ID'];

afterEach(async () => {
  await app?.close();
  app = null;
  if (dir !== null) rmSync(dir, { recursive: true, force: true });
  dir = null;
  if (savedRunId === undefined) delete process.env['APUNTA_TEST_RUN_ID'];
  else process.env['APUNTA_TEST_RUN_ID'] = savedRunId;
});

async function healthApp(): Promise<FastifyInstance> {
  dir = mkdtempSync(join(tmpdir(), 'apunta-health-'));
  const config = loadConfig({
    // The port these injected requests present: `light-my-request` writes
    // `Host: localhost:80` for a path-only URL (C-REQ@1, P1.3).
    APUNTA_PORT: '80',
    APUNTA_DATA_DIR: dir,
    APUNTA_FAKE_AI: '1',
  });
  const { db } = openDatabase({ file: config.dbFile, migrationsDir: config.migrationsDir });
  app = await buildApp({ config, db, logger: false });
  return app;
}

/**
 * A provider whose only decision is what `describe()` says. A stub cannot by
 * itself make `present` false — the installed list does — which is why both
 * seams are needed and why neither is redundant with the other.
 */
class StubLlmProvider extends FakeLlmProvider {
  constructor(private readonly description: LlmDescription) {
    super();
  }

  override describe(): Promise<LlmDescription> {
    return Promise.resolve(this.description);
  }
}

interface RealModeOptions {
  readonly description: LlmDescription;
  readonly installedModels: readonly string[] | null;
  readonly override?: string | null;
}

async function realModeApp(options: RealModeOptions): Promise<FastifyInstance> {
  dir = mkdtempSync(join(tmpdir(), 'apunta-health-real-'));
  // `APUNTA_FAKE_AI` deliberately unset: the agreement rule is real-mode only.
  // The port is the one these injected requests present — `light-my-request`
  // writes `Host: localhost:80` for a path-only URL (C-REQ@1, P1.3).
  const config = loadConfig({ APUNTA_PORT: '80', APUNTA_DATA_DIR: dir });
  const { db } = openDatabase({ file: config.dbFile, migrationsDir: config.migrationsDir });
  if (options.override !== undefined && options.override !== null) {
    putSettings(db, { llm_model: options.override });
  }
  const providers: AiProviders = {
    llm: new StubLlmProvider(options.description),
    stt: new FakeSttProvider(),
  };
  app = await buildApp({
    config,
    db,
    logger: false,
    providers,
    installedModels: options.installedModels,
  });
  return app;
}

async function ollamaOf(server: FastifyInstance): Promise<HealthOllama> {
  const response = await server.inject({ method: 'GET', url: '/api/health' });
  expect(response.statusCode).toBe(200);
  const body = response.json() as Record<string, unknown>;
  expect(() => HealthResponseSchema.parse(body)).not.toThrow();
  return (body as { ollama: HealthOllama }).ollama;
}

interface HealthOllama {
  readonly reachable: boolean;
  readonly model: string | null;
  readonly modelPresent: boolean;
  readonly tag?: string;
  readonly source?: 'override' | 'promoted';
  readonly present?: boolean | null;
}

describe('GET /api/health testRunId', () => {
  it('omits testRunId when APUNTA_TEST_RUN_ID is unset', async () => {
    delete process.env['APUNTA_TEST_RUN_ID'];
    const server = await healthApp();

    const response = await server.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(body).not.toHaveProperty('testRunId');
    expect(() => HealthResponseSchema.parse(body)).not.toThrow();
  });

  it('answers with the run id when APUNTA_TEST_RUN_ID is set', async () => {
    process.env['APUNTA_TEST_RUN_ID'] = 'sandbox-run-for-test';
    const server = await healthApp();

    const response = await server.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(body.testRunId).toBe('sandbox-run-for-test');
    expect(() => HealthResponseSchema.parse(body)).not.toThrow();
  });

  it('omits testRunId when APUNTA_TEST_RUN_ID is blank', async () => {
    process.env['APUNTA_TEST_RUN_ID'] = '   ';
    const server = await healthApp();

    const response = await server.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json() as Record<string, unknown>).not.toHaveProperty('testRunId');
  });
});

/**
 * C-MODEL@1: "Health and preflight report `{ tag, source, present }`."
 *
 * The change is additive, so the two typed `HealthResponse` literals in
 * Must-not-edit `web/**` still compile — which is what the `parse` in
 * `ollamaOf` above and `server/src/app.test.ts`'s unedited fake-mode
 * assertion are together asserting.
 */
describe('GET /api/health — the effective model (real mode)', () => {
  const REACHABLE = {
    reachable: true,
    model: PROMOTED_DEFAULT_MODEL,
    modelPresent: true,
    weightsFormat: 'gguf',
  } as const;

  it('reports the promoted tag and source when no override is set', async () => {
    const server = await realModeApp({
      description: REACHABLE,
      installedModels: [PROMOTED_DEFAULT_MODEL],
    });

    expect(await ollamaOf(server)).toMatchObject({
      tag: PROMOTED_DEFAULT_MODEL,
      source: 'promoted',
      present: true,
    });
  });

  it('reports present: false when the tag is not in the installed list', async () => {
    const server = await realModeApp({
      description: { ...REACHABLE, modelPresent: false },
      installedModels: ['some-other-tag'],
    });

    expect(await ollamaOf(server)).toMatchObject({
      tag: PROMOTED_DEFAULT_MODEL,
      source: 'promoted',
      present: false,
    });
  });

  it('reports an override as its own tag with source override', async () => {
    const server = await realModeApp({
      description: { ...REACHABLE, model: 'gemma4:12b-it-qat', modelPresent: true },
      installedModels: [PROMOTED_DEFAULT_MODEL, 'gemma4:12b-it-qat'],
      override: 'gemma4:12b-it-qat',
    });

    expect(await ollamaOf(server)).toMatchObject({
      tag: 'gemma4:12b-it-qat',
      source: 'override',
      present: true,
    });
  });

  it('reports an override that is not installed as present: false', async () => {
    const server = await realModeApp({
      description: { ...REACHABLE, model: 'gemma4:12b-it-qat', modelPresent: false },
      installedModels: [PROMOTED_DEFAULT_MODEL],
      override: 'gemma4:12b-it-qat',
    });

    expect(await ollamaOf(server)).toMatchObject({
      tag: 'gemma4:12b-it-qat',
      source: 'override',
      present: false,
    });
  });

  /**
   * An unreachable runtime is **unknown**, never "missing". A machine whose
   * Ollama happens to be restarting must not be told it is missing a model it
   * has, and `tag`/`source` still come from the setting alone.
   */
  it('reports present: null, and never false, when the runtime could not be asked', async () => {
    const server = await realModeApp({
      description: {
        reachable: false,
        model: PROMOTED_DEFAULT_MODEL,
        modelPresent: false,
        weightsFormat: null,
      },
      installedModels: null,
    });

    const ollama = await ollamaOf(server);
    expect(ollama.present).toBeNull();
    expect(ollama.tag).toBe(PROMOTED_DEFAULT_MODEL);
    expect(ollama.source).toBe('promoted');
  });

  /**
   * The agreement rule. `model`/`modelPresent` come from `describe()`;
   * `tag`/`present` come from the resolver. A reachable runtime where the two
   * pairs disagree is a bug in this card, not a tolerated difference — the
   * setup screen would then show one model while the server ran another.
   */
  it('keeps describe() and the resolver in agreement whenever the runtime answers', async () => {
    for (const installedModels of [[], ['some-other-tag'], [PROMOTED_DEFAULT_MODEL]]) {
      const server = await realModeApp({
        description: {
          ...REACHABLE,
          modelPresent: installedModels.includes(PROMOTED_DEFAULT_MODEL),
        },
        installedModels,
      });

      const ollama = await ollamaOf(server);
      expect(ollama.reachable).toBe(true);
      expect(ollama.model).toBe(ollama.tag);
      expect(ollama.modelPresent).toBe(ollama.present === true);

      // The loop builds more than one app; only the last would be closed by
      // afterEach, so each is closed as it goes.
      await server.close();
      rmSync(dir ?? '', { recursive: true, force: true });
      app = null;
      dir = null;
    }
  });

  it('reports present: null exactly when the runtime is unreachable', async () => {
    const server = await realModeApp({
      description: {
        reachable: false,
        model: PROMOTED_DEFAULT_MODEL,
        modelPresent: false,
        weightsFormat: null,
      },
      installedModels: null,
    });

    const ollama = await ollamaOf(server);
    expect(ollama.reachable).toBe(false);
    expect(ollama.present).toBeNull();
  });
});

/**
 * Fake mode has no runtime to ask, so the route must not read the installed
 * list at all. `present` is `true` because `FakeLlmProvider.describe()` reports
 * the model as present, and `model` stays `'fake-llm'` so
 * `server/src/app.test.ts:31` keeps passing unedited.
 */
describe('GET /api/health — the effective model (fake mode)', () => {
  it('reports the promoted tag and source, with present: true, and no rule asserted', async () => {
    const server = await healthApp();

    expect(await ollamaOf(server)).toMatchObject({
      reachable: true,
      model: 'fake-llm',
      modelPresent: true,
      tag: PROMOTED_DEFAULT_MODEL,
      source: 'promoted',
      present: true,
    });
  });
});
