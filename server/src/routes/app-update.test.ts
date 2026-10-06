import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { loadConfig, type AppConfig } from '../config.js';
import { openDatabase } from '../db/index.js';
import { startStdinBridge } from '../shell-bridge.js';
import { readJournal } from '../update-journal.js';
import type { UpdateRoutesOptions } from './app-update.js';

interface Harness {
  readonly app: FastifyInstance;
  readonly config: AppConfig;
  /** Every JSON line the server wrote for the shell. */
  readonly lines: Record<string, unknown>[];
  /** Write one JSON line to the server's stdin, as the shell would. */
  send(message: Record<string, unknown>): void;
  close(): Promise<void>;
}

const harnesses: Harness[] = [];

async function build(options: { shell: boolean; update?: UpdateRoutesOptions }): Promise<Harness> {
  const dataDir = mkdtempSync(join(tmpdir(), 'apunta-update-'));
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
    maintenance: { shellMode: options.shell, sleep: () => new Promise((done) => setTimeout(done, 1)) },
    update: { shell: options.shell, write, autoCheckDelayMs: 3_600_000, ...options.update },
  });
  await app.ready();
  const input = new PassThrough();
  startStdinBridge({ env: { APUNTA_SHELL: '1' }, input, onShutdown: () => undefined, write });
  const harness: Harness = {
    app,
    config,
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

async function until(predicate: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 4000;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error('condition not reached');
    await new Promise((done) => setTimeout(done, 5));
  }
}

async function getUpdate(harness: Harness): Promise<Record<string, unknown>> {
  const response = await harness.app.inject({ method: 'GET', url: '/api/app/update' });
  expect(response.statusCode).toBe(200);
  return response.json() as Record<string, unknown>;
}

describe('browser mode', () => {
  it('answers the quiesce routes and 404s every updater route', async () => {
    const harness = await build({ shell: false });

    const status = await harness.app.inject({ method: 'GET', url: '/api/app/quiesce/status' });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({ quiescing: false, maintenance: false });

    for (const [method, url] of [
      ['GET', '/api/app/update'],
      ['POST', '/api/app/update/check'],
      ['POST', '/api/app/update/download'],
      ['POST', '/api/app/update/install'],
      ['PUT', '/api/app/update/settings'],
      ['POST', '/api/app/close/decision'],
    ] as const) {
      const response = await harness.app.inject({ method, url, payload: {} });
      expect(response.statusCode, `${method} ${url}`).toBe(404);
    }
    expect(harness.lines).toEqual([]);
  });
});

describe('shell mode: mirror and relay', () => {
  it('rejects actions in unsafe states and permits a fresh check while available', async () => {
    const harness = await build({ shell: true });

    // idle: a check is allowed, a download or install is not.
    for (const action of ['download', 'install'] as const) {
      const refused = await harness.app.inject({ method: 'POST', url: `/api/app/update/${action}` });
      expect(refused.statusCode).toBe(409);
      expect(refused.json()).toMatchObject({ error: 'invalid_state' });
    }
    const check = await harness.app.inject({ method: 'POST', url: '/api/app/update/check' });
    expect(check.statusCode).toBe(202);

    harness.send({ type: 'update_status', state: 'available', version: '9.9.9' });
    await until(async () => (await getUpdate(harness))['state'] === 'available');

    const again = await harness.app.inject({ method: 'POST', url: '/api/app/update/check' });
    expect(again.statusCode).toBe(202);
    const download = await harness.app.inject({ method: 'POST', url: '/api/app/update/download' });
    expect(download.statusCode).toBe(202);

    harness.send({ type: 'update_status', state: 'idle', code: 'offline' });
    await until(async () => (await getUpdate(harness))['state'] === 'idle');
  });

  it('ignores an update_status with an unknown state', async () => {
    const harness = await build({ shell: true });
    harness.send({ type: 'update_status', state: 'downloading' });
    await until(async () => (await getUpdate(harness))['state'] === 'downloading');
    harness.send({ type: 'update_status', state: 'nonsense' });
    harness.send({ type: 'update_status', state: 'verified', version: '1.0.0' });
    await until(async () => (await getUpdate(harness))['state'] === 'verified');
  });

  it('stores the auto-check toggle, and the launch check obeys it', async () => {
    const on = await build({ shell: true, update: { autoCheckDelayMs: 20 } });
    await until(() =>
      on.lines.some((line) => line['type'] === 'update_request' && line['action'] === 'check'),
    );

    const off = await build({ shell: true, update: { autoCheckDelayMs: 3_600_000 } });
    const put = await off.app.inject({
      method: 'PUT',
      url: '/api/app/update/settings',
      payload: { autoCheck: false },
    });
    expect(put.statusCode).toBe(200);
    expect(await getUpdate(off)).toMatchObject({ autoCheck: false });
    const bad = await off.app.inject({
      method: 'PUT',
      url: '/api/app/update/settings',
      payload: { autoCheck: 'yes' },
    });
    expect(bad.statusCode).toBe(400);

    const quiet = await build({ shell: true, update: { autoCheckDelayMs: 20 } });
    await quiet.app.inject({ method: 'PUT', url: '/api/app/update/settings', payload: { autoCheck: false } });
    await new Promise((done) => setTimeout(done, 80));
    expect(quiet.lines).toEqual([]);
  });
});

describe('shell mode: native close', () => {
  it('records a refused close with its blockers and relays the explicit decision', async () => {
    const harness = await build({ shell: true });
    // No window is registered, so the canonical check answers `no_response`.
    harness.send({ type: 'quiesce' });
    await until(() => harness.lines.some((line) => line['type'] === 'quiesce_result'));
    expect(harness.lines.find((line) => line['type'] === 'quiesce_result')).toEqual({
      type: 'quiesce_result',
      ok: false,
      blockers: ['no_response'],
    });

    // A decision with nothing refused is a conflict, and writes nothing.
    const early = await harness.app.inject({
      method: 'POST',
      url: '/api/app/close/decision',
      payload: { confirm: true },
    });
    expect(early.statusCode).toBe(409);
    expect(early.json()).toMatchObject({ error: 'invalid_state' });

    harness.send({ type: 'update_status', state: 'idle', code: 'close_requested' });
    await until(async () => ((await getUpdate(harness))['close'] as { state: string }).state === 'requested');
    harness.send({ type: 'update_status', state: 'idle', code: 'close_refused' });
    await until(async () => ((await getUpdate(harness))['close'] as { state: string }).state === 'refused');
    expect(await getUpdate(harness)).toMatchObject({
      state: 'idle',
      close: { state: 'refused', blockers: ['no_response'] },
    });

    const confirm = await harness.app.inject({
      method: 'POST',
      url: '/api/app/close/decision',
      payload: { confirm: true },
    });
    expect(confirm.statusCode).toBe(202);
    expect(harness.lines.at(-1)).toEqual({ type: 'close_decision', confirm: true });
    expect(await getUpdate(harness)).toMatchObject({ close: { state: 'requested', blockers: [] } });

    // Refused again, then cancelled.
    harness.send({ type: 'update_status', state: 'idle', code: 'close_refused' });
    await until(async () => ((await getUpdate(harness))['close'] as { state: string }).state === 'refused');
    const cancel = await harness.app.inject({
      method: 'POST',
      url: '/api/app/close/decision',
      payload: { confirm: false },
    });
    expect(cancel.statusCode).toBe(202);
    expect(harness.lines.at(-1)).toEqual({ type: 'close_decision', confirm: false });
    expect(await getUpdate(harness)).toMatchObject({ close: { state: 'none' } });
    const malformed = await harness.app.inject({
      method: 'POST',
      url: '/api/app/close/decision',
      payload: {},
    });
    expect(malformed.statusCode).toBe(400);
  });
});

describe('shell mode: snapshot and release', () => {
  it('refuses a snapshot that did not follow a quiesce', async () => {
    const harness = await build({ shell: true });
    harness.send({ type: 'update_status', state: 'snapshotting', version: '9.9.9' });
    harness.send({ type: 'snapshot_request', id: '1' });
    await until(() => harness.lines.some((line) => line['type'] === 'snapshot_result'));
    expect(harness.lines.at(-1)).toEqual({
      type: 'snapshot_result',
      id: '1',
      ok: false,
      code: 'not_quiesced',
    });
    expect(readJournal(harness.config.dataDir)).toBeNull();
  });

  it('snapshots durably after a clean quiesce, holds maintenance, and releases only on request', async () => {
    const harness = await build({ shell: true });
    const base = await harness.app.listen({ port: 0, host: '127.0.0.1' });

    // One registered window that answers clean, the way the page's reporter does.
    const wait = fetch(`${base}/api/app/quiesce/wait?tab=t1&doc=d1`);
    await until(async () => {
      const status = (await (await fetch(`${base}/api/app/quiesce/status`)).json()) as { windows: number };
      return status.windows === 1;
    });
    const quiesce = fetch(`${base}/api/app/quiesce`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const asked = (await (await wait).json()) as { request: string; quiesceId: string };
    expect(asked.request).toBe('flush');
    const report = await fetch(`${base}/api/app/quiesce/report?tab=t1&doc=d1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quiesceId: asked.quiesceId, ok: true, blockers: [] }),
    });
    expect(report.status).toBe(200);
    expect(((await (await quiesce).json()) as { ok: boolean }).ok).toBe(true);

    // The window's next wait is owed the settled word (held: it is frozen), not parked.
    const settled = (await (await fetch(`${base}/api/app/quiesce/wait?tab=t1&doc=d1`)).json()) as Record<
      string,
      unknown
    >;
    expect(settled).toMatchObject({ request: 'settled', ok: true, held: true, blockers: [] });

    harness.send({ type: 'update_status', state: 'snapshotting', version: '9.9.9' });
    harness.send({ type: 'snapshot_request', id: '42' });
    await until(() => harness.lines.some((line) => line['type'] === 'snapshot_result'));
    expect(harness.lines.at(-1)).toEqual({ type: 'snapshot_result', id: '42', ok: true });

    const journal = readJournal(harness.config.dataDir);
    expect(journal).toMatchObject({ phase: 'pending', updateId: '42', toVersion: '9.9.9' });
    if (journal === null || journal === 'corrupt') throw new Error('journal missing');
    expect(existsSync(journal.snapshotPath)).toBe(true);
    expect(journal.snapshotPath).toMatch(/safety[\\/]pre-update-.+-9\.9\.9-.+\.db$/);
    expect(readdirSync(join(harness.config.dataDir, 'safety'))).toHaveLength(1);

    // Maintenance is still held, and writes are still refused.
    const putSettings = (): Promise<Response> =>
      fetch(`${base}/api/app/update/settings`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ autoCheck: false }),
      });
    expect((await putSettings()).status).toBe(503);
    // A re-arm while held hears the same word again, not a parked request.
    const again = (await (await fetch(`${base}/api/app/quiesce/wait?tab=t1&doc=d1`)).json()) as Record<
      string,
      unknown
    >;
    expect(again).toMatchObject({ request: 'settled', held: true });
    // But the notice's own read and the close decision are not.
    expect((await fetch(`${base}/api/app/update`)).status).toBe(200);

    harness.send({ type: 'maintenance_release' });
    await until(async () => {
      const status = (await (await fetch(`${base}/api/app/quiesce/status`)).json()) as {
        maintenance: boolean;
      };
      return !status.maintenance;
    });
    // The abandoned update's pending journal is gone, so the next boot is ordinary.
    expect(readJournal(harness.config.dataDir)).toBeNull();
    expect((await putSettings()).status).toBe(200);
    // The release is heard once, by the window's next wait.
    const released = (await (await fetch(`${base}/api/app/quiesce/wait?tab=t1&doc=d1`)).json()) as Record<
      string,
      unknown
    >;
    expect(released).toMatchObject({ request: 'settled', held: false });
  });
});
