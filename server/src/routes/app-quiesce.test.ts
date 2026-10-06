import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import { openDatabase } from '../db/index.js';

/**
 * The four routes of FD1, over a **real socket**.
 *
 * `app.inject` never opens one, and the socket is the whole point of the case
 * that matters most here: the wait is a request that stays open, and "a closed
 * socket marks the record rather than deleting it" (FD13(a)) is a statement about
 * a connection going away. The disconnect is produced the way a browser produces
 * it — by aborting the request — and not by a switch in the server.
 *
 * The clock is the FD4 seam, as in `maintenance.test.ts`, for the same reason: no
 * case may spend 30 real seconds proving the bound.
 */

interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

/** Moves only when something sleeps on it, so the bound arrives at once. */
function virtualClock(): Clock {
  let time = 1_700_000_000_000;
  return {
    now: () => time,
    sleep: async (ms: number) => {
      time += Math.max(ms, 1);
    },
  };
}

/** Stands still while the case answers over a real socket. */
function stillClock(): Clock {
  return {
    now: () => 0,
    sleep: async () => {
      await new Promise((done) => setTimeout(done, 1));
    },
  };
}

interface Local {
  readonly app: FastifyInstance;
  /** `http://127.0.0.1:<ephemeral>`, with C-REQ@1's guard satisfied. */
  readonly url: string;
  close(): Promise<void>;
}

const built: Local[] = [];
/** Every wait this file opened, so none is left hanging at teardown. */
const openWaits: AbortController[] = [];

async function listen(clock: Clock = virtualClock()): Promise<Local> {
  const dataDir = mkdtempSync(join(tmpdir(), 'apunta-quiesce-'));
  const config = loadConfig({
    APUNTA_PORT: '80',
    APUNTA_DATA_DIR: dataDir,
    APUNTA_FAKE_AI: '1',
    APUNTA_FAKE_STREAM_DELAY_MS: '0',
  });
  const { db } = openDatabase({ file: config.dbFile, migrationsDir: config.migrationsDir });
  const app = await buildApp({
    config,
    db,
    logger: false,
    maintenance: { now: () => clock.now(), sleep: (ms) => clock.sleep(ms) },
  });
  await app.ready();
  // Port 0: the note in `http/request-guard.ts` explains why a suite that listens
  // on an ephemeral port needs no `Host` change.
  const address = await app.listen({ port: 0, host: '127.0.0.1' });
  const local: Local = {
    app,
    url: address,
    async close() {
      await app.close();
      db.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
  built.push(local);
  return local;
}

afterEach(async () => {
  // A held wait keeps the connection open, and `app.close()` waits for it.
  for (const controller of openWaits.splice(0)) controller.abort();
  for (const local of built.splice(0)) await local.close();
});

/**
 * The per-document nonce the reporter sends beside the tab id, derived from the
 * tab so a case only has to name the document it means.
 */
function docOf(tab: string, generation = 'first'): string {
  return `doc-${tab}-${generation}`;
}

/** Open a wait and leave it open, the way the reporter does from mount. */
function openWait(
  url: string,
  tab: string,
  doc: string = docOf(tab),
): { controller: AbortController; done: Promise<Response> } {
  const controller = new AbortController();
  openWaits.push(controller);
  const done = fetch(`${url}/api/app/quiesce/wait?tab=${tab}&doc=${doc}`, { signal: controller.signal });
  // Aborting a wait is the point of one case and the teardown of every other, and
  // an abort rejects the request: handled here so a deliberate abort is never an
  // unhandled rejection, while a case that does await it still sees the error.
  void done.catch(() => undefined);
  return { controller, done };
}

interface StatusBody {
  windows: number;
  quiescing: boolean;
  maintenance: boolean;
}

async function readStatus(url: string): Promise<StatusBody> {
  const response = await fetch(`${url}/api/app/quiesce/status`);
  return (await response.json()) as StatusBody;
}

/** Poll the status route until `predicate` holds, so no case waits on a timing. */
async function until(url: string, predicate: (status: StatusBody) => boolean): Promise<StatusBody> {
  const deadline = Date.now() + 4000;
  for (;;) {
    const body = await readStatus(url);
    if (predicate(body)) return body;
    if (Date.now() > deadline) {
      throw new Error(`the precondition never held: ${JSON.stringify(body)}`);
    }
    await new Promise((done) => setTimeout(done, 10));
  }
}

async function quiesce(url: string): Promise<{ quiesceId: string; ok: boolean; blockers: string[] }> {
  const response = await fetch(`${url}/api/app/quiesce`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  expect(response.status).toBe(200);
  return (await response.json()) as { quiesceId: string; ok: boolean; blockers: string[] };
}

async function report(
  url: string,
  tab: string,
  quiesceId: string,
  ok: boolean,
  blockers: readonly string[] = [],
  doc: string = docOf(tab),
): Promise<Response> {
  return fetch(`${url}/api/app/quiesce/report?tab=${tab}&doc=${doc}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ quiesceId, ok, blockers }),
  });
}

describe('GET /api/app/quiesce/wait', () => {
  it('registers the window, answers it at entry, and carries its report', async () => {
    const local = await listen(stillClock());
    const waiting = openWait(local.url, 'tab-a');
    await until(local.url, (status) => status.windows === 1);

    const running = quiesce(local.url);
    const asked = (await (await waiting.done).json()) as { request: string; quiesceId: string };
    expect(asked.request).toBe('flush');

    const accepted = await report(local.url, 'tab-a', asked.quiesceId, true);
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({ accepted: true });

    const answer = await running;
    expect(answer.ok).toBe(true);
    expect(answer.quiesceId).toBe(asked.quiesceId);
  });

  it('answers every registered window at entry, and refuses when nobody answers', async () => {
    const local = await listen();
    const waiting = openWait(local.url, 'tab-a');
    await until(local.url, (status) => status.windows === 1);

    const running = quiesce(local.url);
    // Asked at entry, not after the drain: the two phases are concurrent (FD3),
    // so an editor is asked to flush while the drain is still running.
    expect(((await (await waiting.done).json()) as { request: string }).request).toBe('flush');
    expect(await running).toMatchObject({ ok: false, blockers: ['no_response'] });
  });

  it('asks a window that registers mid-quiesce, and applies its answer', async () => {
    const local = await listen(stillClock());
    const first = openWait(local.url, 'tab-a');
    await until(local.url, (status) => status.windows === 1);
    const running = quiesce(local.url);
    const asked = (await (await first.done).json()) as { quiesceId: string };
    // The window that was asked holds no wait now, so the live set is empty…
    await until(local.url, (status) => status.windows === 0);

    // …and this one arrives after the entry snapshot. It is asked at once rather
    // than left holding a request nobody will answer — so it never appears in the
    // live set at all — and its answer counts.
    const late = openWait(local.url, 'tab-late');
    const askedLate = (await (await late.done).json()) as { request: string; quiesceId: string };
    expect(askedLate.request).toBe('flush');

    expect((await report(local.url, 'tab-a', asked.quiesceId, true)).status).toBe(200);
    expect((await report(local.url, 'tab-late', askedLate.quiesceId, true)).status).toBe(200);
    expect((await running).ok).toBe(true);
  });

  it('marks a record when its socket closes, and keeps its obligation counting', async () => {
    const local = await listen(stillClock());
    const dirty = openWait(local.url, 'tab-dirty');
    await until(local.url, (status) => status.windows === 1);

    // The dirty window goes away with its text unacknowledged: its request is
    // aborted, exactly as a closed tab aborts it.
    dirty.controller.abort();
    await until(local.url, (status) => status.windows === 0);

    // An inert second window registers and answers, and the quiesce is still
    // refused: the retained record's unpersisted obligation is what blocks it,
    // and a second window's `ok` cannot settle this over the first one's text.
    const idle = openWait(local.url, 'tab-idle');
    await until(local.url, (status) => status.windows === 1);
    const first = quiesce(local.url);
    const askedIdle = (await (await idle.done).json()) as { quiesceId: string };
    expect((await report(local.url, 'tab-idle', askedIdle.quiesceId, true)).status).toBe(200);
    expect(await first).toMatchObject({ ok: false, blockers: ['no_response'] });

    // A **different** tab does not supersede the retained record.
    const other = openWait(local.url, 'tab-other');
    await until(local.url, (status) => status.windows === 1);
    const second = quiesce(local.url);
    const askedOther = (await (await other.done).json()) as { quiesceId: string };
    expect((await report(local.url, 'tab-other', askedOther.quiesceId, true)).status).toBe(200);
    expect(await second).toMatchObject({ ok: false, blockers: ['no_response'] });

    // The **same** tab registers again — the same `sessionStorage` identity — and
    // supersedes its own retained record, so this quiesce may settle.
    const again = openWait(local.url, 'tab-dirty');
    await until(local.url, (status) => status.windows === 1);
    const third = quiesce(local.url);
    const askedAgain = (await (await again.done).json()) as { quiesceId: string };
    expect((await report(local.url, 'tab-dirty', askedAgain.quiesceId, true)).status).toBe(200);
    expect((await third).ok).toBe(true);
  });
});

describe('POST /api/app/quiesce/report', () => {
  it('refuses a report with no quiesce in flight, and says which reason it was', async () => {
    const local = await listen();
    const response = await report(local.url, 'tab-a', '00000000-0000-7000-8000-000000000000', true);
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string; message: string; details?: unknown };
    expect(body.error).toBe('conflict');
    expect(body.message).not.toBe('');
    // The reason rides `details`, so a machine can tell the two refusals apart
    // without reading the sentence.
    expect(body.details).toEqual({ reason: 'quiesce_not_in_flight' });
  });

  it('names the other refusal: a window this quiesce never asked', async () => {
    const local = await listen(stillClock());
    const waiting = openWait(local.url, 'tab-a');
    await until(local.url, (status) => status.windows === 1);
    const running = quiesce(local.url);
    const asked = (await (await waiting.done).json()) as { quiesceId: string };

    const response = await report(local.url, 'tab-stranger', asked.quiesceId, true);
    expect(response.status).toBe(409);
    expect(((await response.json()) as { details?: unknown }).details).toEqual({
      reason: 'window_not_registered',
    });

    expect((await report(local.url, 'tab-a', asked.quiesceId, true)).status).toBe(200);
    expect((await running).ok).toBe(true);
  });

  it('refuses a body that does not match the report shape', async () => {
    const local = await listen();
    const response = await fetch(`${local.url}/api/app/quiesce/report?tab=tab-a&doc=${docOf('tab-a')}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quiesceId: 'x', ok: 'yes' }),
    });
    expect(response.status).toBe(400);
  });

  it('answers during a quiesce rather than 503, or the client could never report', async () => {
    const local = await listen(stillClock());
    const waiting = openWait(local.url, 'tab-a');
    await until(local.url, (status) => status.windows === 1);
    const running = quiesce(local.url);
    const asked = (await (await waiting.done).json()) as { quiesceId: string };
    // Maintenance is on for the whole of this quiesce.
    expect((await readStatus(local.url)).maintenance).toBe(true);

    // A report that does not belong to this quiesce is 409, not 503: the route is
    // exempt and the report is refused on its merits.
    expect((await report(local.url, 'tab-a', '00000000-0000-7000-8000-000000000000', true)).status).toBe(409);
    // And the trigger itself is exempt too, so a second call joins rather than
    // being maintenance-refused.
    expect((await report(local.url, 'tab-a', asked.quiesceId, true)).status).toBe(200);
    expect((await running).ok).toBe(true);
  });
});

describe('POST /api/app/quiesce/close (AM-215)', () => {
  /** The window's last word, as the reporter sends it from `pagehide`. */
  function close(url: string, tab: string, clean: boolean, doc: string = docOf(tab)): Promise<Response> {
    return fetch(`${url}/api/app/quiesce/close?tab=${tab}&doc=${doc}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clean }),
    });
  }

  it('discharges a clean record, so a later quiesce from another tab settles', async () => {
    const local = await listen(stillClock());
    const leaving = openWait(local.url, 'tab-leaving');
    await until(local.url, (status) => status.windows === 1);

    // The socket goes first: this is a close, and the record is retained (FD13).
    leaving.controller.abort();
    await until(local.url, (status) => status.windows === 0);

    // Before the word arrives, an inert window's `ok` cannot settle over it.
    const idle = openWait(local.url, 'tab-idle');
    await until(local.url, (status) => status.windows === 1);
    const blocked = quiesce(local.url);
    const askedIdle = (await (await idle.done).json()) as { quiesceId: string };
    expect((await report(local.url, 'tab-idle', askedIdle.quiesceId, true)).status).toBe(200);
    expect(await blocked).toMatchObject({ ok: false, blockers: ['no_response'] });

    // Then the closing tab says it was leaving nothing behind.
    expect((await close(local.url, 'tab-leaving', true)).status).toBe(204);

    const fresh = openWait(local.url, 'tab-fresh');
    await until(local.url, (status) => status.windows === 1);
    const settled = quiesce(local.url);
    const asked = (await (await fresh.done).json()) as { quiesceId: string };
    expect((await report(local.url, 'tab-fresh', asked.quiesceId, true)).status).toBe(200);
    expect(await settled).toMatchObject({ ok: true, blockers: [] });
  });

  it('leaves a dirty record exactly where it was', async () => {
    const local = await listen(stillClock());
    const dirty = openWait(local.url, 'tab-dirty');
    await until(local.url, (status) => status.windows === 1);
    dirty.controller.abort();
    await until(local.url, (status) => status.windows === 0);

    expect((await close(local.url, 'tab-dirty', false)).status).toBe(204);

    const idle = openWait(local.url, 'tab-idle');
    await until(local.url, (status) => status.windows === 1);
    const refused = quiesce(local.url);
    const asked = (await (await idle.done).json()) as { quiesceId: string };
    expect((await report(local.url, 'tab-idle', asked.quiesceId, true)).status).toBe(200);
    expect(await refused).toMatchObject({ ok: false, blockers: ['no_response'] });
  });

  it('is answered during a successful quiesce, and releases the held maintenance', async () => {
    const local = await listen(stillClock());
    const leaving = openWait(local.url, 'tab-leaving');
    await until(local.url, (status) => status.windows === 1);

    const running = quiesce(local.url);
    const asked = (await (await leaving.done).json()) as { quiesceId: string };
    expect((await report(local.url, 'tab-leaving', asked.quiesceId, true)).status).toBe(200);
    expect((await running).ok).toBe(true);
    // Maintenance is held by the registered window — and this request is during
    // that hold, so a route that was not exempt would answer 503 here and strand
    // the server with nothing left to release it.
    expect((await readStatus(local.url)).maintenance).toBe(true);

    // The reporter re-arms the moment it has reported. The run has already ended,
    // so that first re-arm is handed the `settled` word it missed (still held)
    // rather than parking; the next one parks, and is the poll that a `pagehide`
    // abort would actually close.
    const missed = (await (await openWait(local.url, 'tab-leaving').done).json()) as { request: string };
    expect(missed).toMatchObject({ request: 'settled', held: true });
    const rearmed = openWait(local.url, 'tab-leaving');
    await until(local.url, (status) => status.windows === 1);

    // The word goes out while that socket is still open, which is the order this
    // browser produces: the beacon is queued on `pagehide` and the abort reaches
    // the server a moment later. Nothing is discharged yet — the record is still
    // connected — and a claim is not an unregistration, so the hold stands.
    expect((await close(local.url, 'tab-leaving', true)).status).toBe(204);
    expect((await readStatus(local.url)).maintenance).toBe(true);

    // The window's own socket then goes, which is the other half of the same
    // fact: the record is discharged rather than retained, and FD1's bounded
    // release runs.
    rearmed.controller.abort();
    await until(local.url, (status) => status.maintenance === false);
    expect((await readStatus(local.url)).windows).toBe(0);
  });

  it('refuses a body that does not say whether the window was clean', async () => {
    const local = await listen(stillClock());
    const response = await fetch(`${local.url}/api/app/quiesce/close?tab=tab-a&doc=${docOf('tab-a')}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: 'clean' }),
    });
    expect(response.status).toBe(400);
  });

  it('is behind C-REQ@1 like every other route on the channel', async () => {
    const local = await listen(stillClock());
    const refused = await fetch(`${local.url}/api/app/quiesce/close?tab=tab-a&doc=${docOf('tab-a')}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://example.invalid' },
      body: JSON.stringify({ clean: true }),
    });
    expect(refused.status).toBe(403);
  });
});

describe('GET /api/app/quiesce/status', () => {
  it('is a read-only sibling reporting quiescing, jobs, windows and the mode', async () => {
    const local = await listen();
    const response = await fetch(`${local.url}/api/app/quiesce/status`);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({
      quiescing: false,
      activeJobs: [],
      windows: 0,
      maintenance: false,
    });
  });
});

describe('the channel itself', () => {
  it('is behind C-REQ@1 and nothing else: a foreign origin is still refused', async () => {
    const local = await listen();
    // The four routes are a server-mode group, not an exemption from the request
    // guard, which runs first and is not relaxed for any of them.
    const refused = await fetch(`${local.url}/api/app/quiesce`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://example.invalid' },
      body: '{}',
    });
    expect(refused.status).toBe(403);
  });

  it('refuses a trigger body carrying a field it does not define', async () => {
    const local = await listen();
    const response = await fetch(`${local.url}/api/app/quiesce`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ force: true }),
    });
    expect(response.status).toBe(400);
  });
});
