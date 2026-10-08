import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';

import type { SetupStatusResponse } from '@apunta/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import { openDatabase } from '../db/index.js';
import { startStdinBridge } from '../shell-bridge.js';

interface Harness {
  readonly app: FastifyInstance;
  /** Every JSON line the server wrote for the shell. */
  readonly lines: Record<string, unknown>[];
  /** Write one JSON line to the server's stdin, as the shell would. */
  send(message: Record<string, unknown>): void;
  close(): Promise<void>;
}

const harnesses: Harness[] = [];

async function build(shell: boolean): Promise<Harness> {
  const dataDir = mkdtempSync(join(tmpdir(), 'apunta-setup-'));
  const config = loadConfig({
    APUNTA_PORT: '80',
    APUNTA_DATA_DIR: dataDir,
    APUNTA_FAKE_AI: '1',
    APUNTA_FAKE_STREAM_DELAY_MS: '0',
  });
  const { db } = openDatabase({ file: config.dbFile, migrationsDir: config.migrationsDir });
  const lines: Record<string, unknown>[] = [];
  const write = (line: string): void => {
    lines.push(JSON.parse(line) as Record<string, unknown>);
  };
  const app = await buildApp({
    config,
    db,
    logger: false,
    maintenance: { shellMode: shell },
    update: { shell, write, autoCheckDelayMs: 3_600_000 },
  });
  await app.ready();
  const input = new PassThrough();
  startStdinBridge({ env: { APUNTA_SHELL: '1' }, input, onShutdown: () => undefined, write });
  const harness: Harness = {
    app,
    lines,
    send: (message) => {
      input.write(`${JSON.stringify(message)}\n`);
    },
    async close() {
      input.destroy();
      await app.close();
      db.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
  harnesses.push(harness);
  return harness;
}

afterEach(async () => {
  for (const harness of harnesses.splice(0)) await harness.close();
});

async function status(harness: Harness): Promise<SetupStatusResponse> {
  const response = await harness.app.inject({ method: 'GET', url: '/api/app/setup' });
  expect(response.statusCode).toBe(200);
  return response.json<SetupStatusResponse>();
}

async function until(harness: Harness, predicate: (s: SetupStatusResponse) => boolean): Promise<void> {
  const deadline = Date.now() + 4000;
  while (!predicate(await status(harness))) {
    if (Date.now() > deadline) throw new Error('condition not reached');
    await new Promise((done) => setTimeout(done, 5));
  }
}

const PLAN = {
  event: 'plan',
  memoryGib: 16,
  model: {
    tag: 'qwen3.5:4b-q4_K_M',
    publisher: 'Alibaba Cloud (Qwen)',
    reason: 'Apunta uses qwen3.5:4b-q4_K_M on every computer.',
    licence: { name: 'Apache-2.0', url: 'https://example.invalid/licence', verified: true },
  },
  steps: [
    { id: 'speech_model', label: 'The speech model', needed: true, approxBytes: 77_691_713 },
    { id: 'preview_model', label: 'The preview model', needed: false, approxBytes: 0 },
    { id: 'writing_model', label: 'The writing model', needed: true, approxBytes: 3_400_000_000 },
  ],
  disk: {
    ok: true,
    freeBytes: 100e9,
    requiredBytes: 3.5e9,
    headroomBytes: 5e9,
    shortfallBytes: 0,
    message: 'There is room.',
  },
  ready: false,
};

describe('first-run setup routes', () => {
  it('do not exist in browser mode', async () => {
    const harness = await build(false);
    for (const [method, url] of [
      ['GET', '/api/app/setup'],
      ['POST', '/api/app/setup/plan'],
      ['POST', '/api/app/setup/run'],
      ['POST', '/api/app/setup/cancel'],
    ] as const) {
      const response = await harness.app.inject({ method, url });
      expect(response.statusCode, `${method} ${url}`).toBe(404);
    }
    expect(harness.lines).toEqual([]);
  });

  it('relays a plan request and mirrors the plan the installer printed', async () => {
    const harness = await build(true);
    expect(await status(harness)).toEqual({ state: 'idle', steps: [] });

    const plan = await harness.app.inject({ method: 'POST', url: '/api/app/setup/plan' });
    expect(plan.statusCode).toBe(202);
    expect(harness.lines).toEqual([{ type: 'setup_request', action: 'plan' }]);
    expect((await status(harness)).state).toBe('planning');

    // A second plan while one is in flight is refused rather than doubled.
    const again = await harness.app.inject({ method: 'POST', url: '/api/app/setup/plan' });
    expect(again.statusCode).toBe(409);

    harness.send({ type: 'setup_event', event: PLAN });
    harness.send({ type: 'setup_exit', code: 0 });
    await until(harness, (s) => s.state === 'planned');
    const planned = await status(harness);
    expect(planned.plan?.model.tag).toBe('qwen3.5:4b-q4_K_M');
    expect(planned.steps).toEqual([
      { id: 'speech_model', status: 'pending' },
      { id: 'preview_model', status: 'skipped' },
      { id: 'writing_model', status: 'pending' },
    ]);
  });

  it('follows a run through its steps and progress to done', async () => {
    const harness = await build(true);
    await harness.app.inject({ method: 'POST', url: '/api/app/setup/run' });
    expect(harness.lines).toEqual([{ type: 'setup_request', action: 'run' }]);

    harness.send({ type: 'setup_event', event: PLAN });
    harness.send({
      type: 'setup_event',
      event: { event: 'step', id: 'speech_model', status: 'started', label: 'The speech model' },
    });
    harness.send({
      type: 'setup_event',
      event: {
        event: 'progress',
        id: 'speech_model',
        completedBytes: 10,
        totalBytes: 100,
        percent: 10,
        bytesPerSecond: 5,
        etaSeconds: 18,
        detail: '10 B of 100 B',
      },
    });
    await until(harness, (s) => s.progress?.percent === 10);
    const midway = await status(harness);
    expect(midway.state).toBe('running');
    expect(midway.steps[0]).toEqual({ id: 'speech_model', status: 'started' });

    harness.send({
      type: 'setup_event',
      event: { event: 'step', id: 'speech_model', status: 'finished', label: 'The speech model' },
    });
    harness.send({ type: 'setup_event', event: { event: 'done', ok: true } });
    harness.send({ type: 'setup_exit', code: 0 });
    await until(harness, (s) => s.state === 'done');
    const done = await status(harness);
    expect(done.progress).toBeUndefined();
    expect(done.steps[0]).toEqual({ id: 'speech_model', status: 'finished' });
  });

  it('keeps the failure code so the page can word it, and allows a retry', async () => {
    const harness = await build(true);
    await harness.app.inject({ method: 'POST', url: '/api/app/setup/run' });
    harness.send({
      type: 'setup_event',
      event: {
        event: 'failed',
        code: 'download_failed',
        title: 'The download stopped',
        detail: 'Check the internet connection, then try again.',
        retryable: true,
      },
    });
    harness.send({ type: 'setup_exit', code: 1 });
    await until(harness, (s) => s.state === 'failed');
    expect((await status(harness)).failure).toEqual({ code: 'download_failed', retryable: true });

    const retry = await harness.app.inject({ method: 'POST', url: '/api/app/setup/run' });
    expect(retry.statusCode).toBe(202);
    const after = await status(harness);
    expect(after.state).toBe('running');
    expect(after.failure).toBeUndefined();
  });

  it('relays a cancel only while running, and an exit after it reads as cancelled', async () => {
    const harness = await build(true);
    const early = await harness.app.inject({ method: 'POST', url: '/api/app/setup/cancel' });
    expect(early.statusCode).toBe(409);

    await harness.app.inject({ method: 'POST', url: '/api/app/setup/run' });
    const cancel = await harness.app.inject({ method: 'POST', url: '/api/app/setup/cancel' });
    expect(cancel.statusCode).toBe(202);
    expect(harness.lines.at(-1)).toEqual({ type: 'setup_request', action: 'cancel' });
    expect((await status(harness)).state).toBe('cancelling');

    harness.send({ type: 'setup_exit', code: null });
    await until(harness, (s) => s.state === 'failed');
    expect((await status(harness)).failure).toEqual({ code: 'cancelled', retryable: true });
  });

  it('turns an installer that died without a word into a retryable failure', async () => {
    const harness = await build(true);
    await harness.app.inject({ method: 'POST', url: '/api/app/setup/plan' });
    harness.send({ type: 'setup_exit', code: 1 });
    await until(harness, (s) => s.state === 'failed');
    expect((await status(harness)).failure).toEqual({ code: 'unexpected', retryable: true });
  });

  it('drops a setup_event this build cannot read', async () => {
    const harness = await build(true);
    await harness.app.inject({ method: 'POST', url: '/api/app/setup/plan' });
    harness.send({ type: 'setup_event', event: { event: 'plan', steps: 'not a list' } });
    harness.send({ type: 'setup_event', event: { event: 'teleport' } });
    harness.send({ type: 'setup_event', event: PLAN });
    await until(harness, (s) => s.state === 'planned');
    expect((await status(harness)).steps).toHaveLength(3);
  });
});
