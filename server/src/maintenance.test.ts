import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AUDIO_SAMPLE_RATE, encodeWav } from '@apunta/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { openDatabase } from './db/index.js';
import * as registry from './jobs/registry.js';
import { active, begin, end } from './jobs/registry.js';
import { currentMaintenance, type MaintenanceOptions, type WaitOutcome } from './maintenance.js';
import { createTestApp } from './test/harness.js';

/**
 * C-UPD@1's quiescence, driven through the FD4 seam.
 *
 * Every case here runs the **real** protocol — the trigger route, the refusal
 * hook, the drain loop and the window bookkeeping — with the two clocks replaced.
 * The 30-second bound is therefore exercised at its own 30 s with no test waiting
 * 30 s: the virtual clock advances by whatever the drain asks to sleep, so the
 * code path that would take half a minute takes a millisecond here.
 *
 * A window is registered and its wait opened through the controller, which is
 * exactly what `GET /api/app/quiesce/wait` does with them; the route itself, over
 * a real socket and with a real abort, is `routes/app-quiesce.test.ts`.
 */

interface Clock {
  readonly now: () => number;
  readonly sleep: (ms: number) => Promise<void>;
  /** Every sleep the drain asked for, in order. */
  readonly sleeps: number[];
  /** Virtual milliseconds this clock has been advanced by. */
  elapsed(): number;
}

/** A clock that moves only when something sleeps on it. */
function virtualClock(start = 1_700_000_000_000): Clock {
  let time = start;
  const sleeps: number[] = [];
  return {
    now: () => time,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      time += Math.max(ms, 1);
    },
    sleeps,
    elapsed: () => time - start,
  };
}

/**
 * A clock that stands still while the case drives the client side by hand, so a
 * report is never overtaken by the bound. It still yields to the event loop
 * between looks, so the loop cannot become a busy wait.
 */
function stillClock(): Clock {
  const sleeps: number[] = [];
  return {
    now: () => 0,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      await new Promise((done) => setTimeout(done, 1));
    },
    sleeps,
    elapsed: () => 0,
  };
}

/**
 * A clock that advances like the virtual one but also lets the case answer the
 * window phase from inside the drain's own first look.
 *
 * Both phases are concurrent (FD3), and with a virtual clock the drain reaches
 * its bound in a handful of microtasks — long before a test could get an HTTP
 * report in. Reporting from the sleep hook is the ordering the browser has: the
 * window was asked at entry and answers while the drain is still running.
 */
function answeringClock(
  tab: string,
  onLook?: (look: number) => void,
): {
  clock: Clock;
  asked: { quiesceId: string | null };
} {
  const base = virtualClock();
  const asked: { quiesceId: string | null } = { quiesceId: null };
  let answered = false;
  let look = 0;
  const clock: Clock = {
    now: base.now,
    sleeps: base.sleeps,
    elapsed: () => base.elapsed(),
    sleep: async (ms: number) => {
      look += 1;
      onLook?.(look);
      if (!answered && asked.quiesceId !== null) {
        answered = true;
        currentMaintenance().report({
          quiesceId: asked.quiesceId,
          tabId: tab,
          doc: docOf(tab),
          ok: true,
          blockers: [],
        });
      }
      await base.sleep(ms);
    },
  };
  return { clock, asked };
}

interface Harness {
  readonly app: FastifyInstance;
  readonly clock: Clock;
  close(): Promise<void>;
}

const built: Harness[] = [];

/** A temp data dir, the fake providers, and this case's clock. */
async function harness(clock: Clock, overrides: MaintenanceOptions = {}): Promise<Harness> {
  const dataDir = mkdtempSync(join(tmpdir(), 'apunta-maintenance-'));
  const config = loadConfig({
    // `light-my-request` writes `Host: localhost:80` for a path-only URL, and
    // C-REQ@1's guard checks an injected request against the configured port —
    // the same reason `test/harness.ts` passes 80.
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
    maintenance: { now: clock.now, sleep: clock.sleep, ...overrides },
  });
  await app.ready();
  const local: Harness = {
    app,
    clock,
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
  for (const local of built.splice(0)) await local.close();
  // Nothing may leak between cases: a job left registered would make the next
  // quiesce refuse at entry for entirely the wrong reason.
  for (const job of active()) end(job.id);
});

interface QuiesceAnswer {
  quiesceId: string;
  ok: boolean;
  blockers: string[];
}

async function trigger(app: FastifyInstance, payload: Record<string, unknown> = {}): Promise<QuiesceAnswer> {
  const response = await app.inject({ method: 'POST', url: '/api/app/quiesce', payload });
  expect(response.statusCode).toBe(200);
  return response.json<QuiesceAnswer>();
}

/**
 * The per-document nonce the reporter sends beside the tab id, derived from the
 * tab so a case only has to name the document it means. Two documents in one tab
 * are `docOf(tab)` and `docOf(tab, 'next')`.
 */
function docOf(tabId: string, generation = 'first'): string {
  return `doc-${tabId}-${generation}`;
}

/** A mounted window holding its wait open, as the wait route leaves it. */
function window(
  tabId: string | null,
  doc: string | null = tabId === null ? null : docOf(tabId),
): { readonly id: string; readonly asked: Promise<WaitOutcome> } {
  const maintenance = currentMaintenance();
  const id = maintenance.registerWindow(tabId, doc);
  return { id, asked: maintenance.holdFor(id) };
}

/** The browser's report, sent the way the reporter sends it. */
async function report(
  app: FastifyInstance,
  tab: string,
  quiesceId: string,
  ok: boolean,
  blockers: readonly string[] = [],
  doc: string = docOf(tab),
): Promise<number> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/app/quiesce/report?tab=${tab}&doc=${doc}`,
    payload: { quiesceId, ok, blockers },
  });
  return response.statusCode;
}

async function statusOf(app: FastifyInstance): Promise<{
  quiescing: boolean;
  activeJobs: { kind: string }[];
  windows: number;
  maintenance: boolean;
}> {
  const response = await app.inject({ method: 'GET', url: '/api/app/quiesce/status' });
  expect(response.statusCode).toBe(200);
  return response.json();
}

describe('the drain and its bound (FD4)', () => {
  it('reaches the 30 s bound and refuses with the still-active kinds as blockers', async () => {
    // Both jobs begin *after* the entry snapshot, on the drain's first look, and
    // neither ever ends: this is the case the bound exists for.
    const { clock, asked } = answeringClock('tab-1', () => {
      if (active().length > 0) return;
      begin('transcription', 'job-a');
      begin('backup', 'job-b');
    });
    const local = await harness(clock);
    const w = window('tab-1');

    const running = trigger(local.app);
    // The window answers, so the only blockers left are the drain's.
    asked.quiesceId = (await w.asked).quiesceId;
    const answer = await running;

    expect(answer.ok).toBe(false);
    expect([...answer.blockers].sort()).toEqual(['backup', 'transcription']);
    // The bound, reached and not exceeded: the drain slept its way to exactly
    // 30 s of virtual time and refused there rather than waiting on.
    expect(clock.elapsed()).toBe(30_000);
    expect(clock.sleeps.every((ms) => ms <= 250)).toBe(true);
  });

  it('drains to empty and settles ok when the registry empties inside the bound', async () => {
    // The job finishes on the first look, which is the case a drain exists for:
    // work that started after the refusal hook went up still gets to finish.
    let begun = false;
    const { clock, asked } = answeringClock('tab-1', () => {
      if (begun) {
        end('job-a');
        return;
      }
      begun = true;
      begin('draft', 'job-a');
    });
    const local = await harness(clock);
    const w = window('tab-1');

    const running = trigger(local.app);
    const flushed = await w.asked;
    expect(flushed.request).toBe('flush');
    asked.quiesceId = flushed.quiesceId;

    expect((await running).ok).toBe(true);
    expect(active()).toEqual([]);
    expect(clock.elapsed()).toBeLessThan(30_000);
  });

  it('refuses a non-empty registry at entry at once and never enters the drain', async () => {
    const clock = virtualClock();
    const local = await harness(clock);
    begin('refine', 'note-1');

    expect(await trigger(local.app)).toMatchObject({ ok: false, blockers: ['refine'] });

    // "At once" means the drain loop never ran a step: no sleep, no time passed.
    expect(clock.sleeps).toEqual([]);
    expect(clock.elapsed()).toBe(0);
  });

  it('leaves the server serving writes after a refusal (FD5)', async () => {
    const clock = virtualClock();
    const local = await harness(clock);
    begin('refine', 'note-1');
    expect((await trigger(local.app)).ok).toBe(false);
    end('note-1');

    // Back into normal service: the next request is not a 503 until restart.
    const write = await local.app.inject({
      method: 'POST',
      url: '/api/patients',
      payload: { name: 'John Smith' },
    });
    expect(write.statusCode).toBe(201);
    expect(await statusOf(local.app)).toMatchObject({ maintenance: false, quiescing: false });
  });

  it('joins a second quiesce to the one in flight instead of nesting one (FD5, FD12)', async () => {
    const clock = stillClock();
    const local = await harness(clock);
    const w = window('tab-1');

    const first = trigger(local.app);
    const second = trigger(local.app);
    const asked = await w.asked;
    await report(local.app, 'tab-1', asked.quiesceId, true);
    const [one, two] = await Promise.all([first, second]);

    // One quiesce, so one id: the second caller joined the one in flight rather
    // than nesting a second drain inside it.
    expect(one.quiesceId).toBe(asked.quiesceId);
    expect(two.quiesceId).toBe(one.quiesceId);
    expect(two.ok).toBe(true);
  });
});

describe('maintenance mode and the refusal hook (FD9)', () => {
  it('serves every exempt read, including the chat and the plan export, and refuses a write', async () => {
    const clock = stillClock();
    const local = await harness(clock);
    const fixture = await seedPractice(local.app);
    const w = window('tab-1');

    const running = trigger(local.app);
    const asked = await w.asked;
    await report(local.app, 'tab-1', asked.quiesceId, true);
    expect((await running).ok).toBe(true);

    // Every route on FD9's list — all seventeen `GET`s in `server/src/routes/`.
    for (const url of [
      '/api/health',
      '/api/settings',
      '/api/patients',
      `/api/patients/${fixture.patient}`,
      '/api/patient-groups',
      `/api/notes/${fixture.note}`,
      `/api/patients/${fixture.patient}/notes`,
      '/api/formats',
      `/api/formats/${fixture.format}`,
      `/api/patients/${fixture.patient}/plan`,
      `/api/patients/${fixture.patient}/plan/versions`,
      `/api/patients/${fixture.patient}/prep`,
      `/api/patients/${fixture.patient}/brainstorm`,
      '/api/import/batches',
      '/api/backup',
      // The two the card names: both are reads on screens already open, and
      // refusing either would blank them mid-quiesce for no gain.
      `/api/notes/${fixture.note}/chat`,
      `/api/plans/${fixture.plan}/export`,
    ]) {
      const read = await local.app.inject({ method: 'GET', url });
      expect(read.statusCode, `${url} is exempt`).toBe(200);
    }

    // A write is refused, with the code and a body the client parses.
    const write = await local.app.inject({
      method: 'POST',
      url: '/api/notes',
      payload: { patient_id: fixture.patient, format_id: fixture.format, content: 'Subjective: no.' },
    });
    expect(write.statusCode).toBe(503);
    const body = write.json<{ error: string; message: string }>();
    expect(Object.keys(body).sort()).toEqual(['error', 'message']);
    expect(body.error).toBe('maintenance');
    expect(body.message).not.toBe('');
  });

  it('refuses a write on an exempt path too, because the method is what counts', async () => {
    const clock = stillClock();
    const local = await harness(clock);
    const fixture = await seedPractice(local.app);
    const w = window('tab-1');
    const running = trigger(local.app);
    await report(local.app, 'tab-1', (await w.asked).quiesceId, true);
    await running;

    // `GET /api/notes/:id` is exempt; `DELETE` on the same path is not.
    const publish = await local.app.inject({ method: 'POST', url: `/api/notes/${fixture.note}/publish` });
    expect(publish.statusCode).toBe(503);
    const remove = await local.app.inject({ method: 'DELETE', url: `/api/notes/${fixture.note}` });
    expect(remove.statusCode).toBe(503);
  });

  it('never cuts work that was already past the hook, and refuses it by name', async () => {
    const clock = stillClock();
    const local = await harness(clock);
    // A job already in flight when the quiesce begins: the refusal hook never
    // reaches it, so it is still running when the quiesce looks — which is what
    // makes the entry snapshot refuse rather than cut.
    begin('draft', 'job-a');
    const w = window('tab-1');

    const running = trigger(local.app);
    await report(local.app, 'tab-1', (await w.asked).quiesceId, true);

    expect(await running).toMatchObject({ ok: false, blockers: ['draft'] });
    expect(active()).toEqual([{ kind: 'draft', id: 'job-a' }]);
  });

  it('holds maintenance on after a success and releases it when the last window unregisters', async () => {
    const clock = stillClock();
    const local = await harness(clock, { shellMode: false });
    const w = window('tab-1');
    const running = trigger(local.app);
    await report(local.app, 'tab-1', (await w.asked).quiesceId, true);
    expect((await running).ok).toBe(true);

    // Held while a window is registered (FD1's browser-mode clause).
    expect((await statusOf(local.app)).maintenance).toBe(true);
    expect(
      (await local.app.inject({ method: 'POST', url: '/api/patients', payload: { name: 'x' } })).statusCode,
    ).toBe(503);

    // Released by the last unregistration, so no browser-mode state persists
    // until restart.
    currentMaintenance().disconnect(w.id);
    expect((await statusOf(local.app)).maintenance).toBe(false);
    expect(
      (await local.app.inject({ method: 'POST', url: '/api/patients', payload: { name: 'x' } })).statusCode,
    ).toBe(201);
  });

  it('keeps maintenance on through a snapshot in shell mode', async () => {
    const clock = stillClock();
    const local = await harness(clock, { shellMode: true });
    const w = window('tab-1');
    const running = trigger(local.app);
    await report(local.app, 'tab-1', (await w.asked).quiesceId, true);
    expect((await running).ok).toBe(true);

    // The shell's next transition releases it, not a window closing.
    currentMaintenance().disconnect(w.id);
    expect((await statusOf(local.app)).maintenance).toBe(true);
  });
});

/**
 * The one exemption FD9 carries: the reporting window's **own note save**, during
 * the flush step that asked for it (AM-213).
 *
 * The editor's flush is `PATCH /api/notes/:id`, and maintenance mode refuses
 * every write, so without this a quiesce asked while the editor holds savable
 * text is refused `save_error` and can never settle `ok:true`. The exemption is
 * deliberately narrow, and each case below takes one of its four conditions
 * away: the identity, the tab, the route, or the window.
 */
describe('the flush-step save exemption (AM-213)', () => {
  const TYPED = 'Subjective: John Smith reports much better sleep.\n\nPlan: Continue weekly.';

  /** The editor's save, as the reporter's client sends it during a flush. */
  function flushSave(
    note: string,
    revision: number,
    query: string,
  ): {
    method: 'PATCH';
    url: string;
    payload: { revision: number; content: string };
  } {
    return { method: 'PATCH', url: `/api/notes/${note}${query}`, payload: { revision, content: TYPED } };
  }

  async function revisionOf(app: FastifyInstance, note: string): Promise<number> {
    const read = await app.inject({ method: 'GET', url: `/api/notes/${note}` });
    expect(read.statusCode).toBe(200);
    return read.json<{ revision: number }>().revision;
  }

  it("accepts the reporting window's own note save during the flush step", async () => {
    const clock = stillClock();
    const local = await harness(clock);
    const fixture = await seedPractice(local.app);
    const revision = await revisionOf(local.app, fixture.note);
    const w = window('tab-1');

    const running = trigger(local.app);
    const asked = await w.asked;
    const saved = await local.app.inject(
      flushSave(fixture.note, revision, `?tab=tab-1&doc=${docOf('tab-1')}&quiesce=${asked.quiesceId}`),
    );

    // The save landed, so the flush has nothing to report but `ok`.
    expect(saved.statusCode).toBe(200);
    expect(saved.json<{ content: string }>().content).toBe(TYPED);
    expect(await report(local.app, 'tab-1', asked.quiesceId, true)).toBe(200);
    expect(await running).toMatchObject({ ok: true, blockers: [] });
  });

  it('refuses a note save carrying a stale or foreign quiesce id', async () => {
    const clock = stillClock();
    const local = await harness(clock);
    const fixture = await seedPractice(local.app);
    const revision = await revisionOf(local.app, fixture.note);
    const w = window('tab-1');

    const running = trigger(local.app);
    const asked = await w.asked;

    // The right tab, the wrong quiesce — and no quiesce at all.
    expect(
      (await local.app.inject(flushSave(fixture.note, revision, '?tab=tab-1&quiesce=not-a-quiesce')))
        .statusCode,
    ).toBe(503);
    expect((await local.app.inject(flushSave(fixture.note, revision, '?tab=tab-1'))).statusCode).toBe(503);

    // Neither attempt touched the note, and the quiesce itself is unaffected.
    const after = await local.app.inject({ method: 'GET', url: `/api/notes/${fixture.note}` });
    expect(after.json<{ content: string }>().content).not.toBe(TYPED);
    expect(await report(local.app, 'tab-1', asked.quiesceId, true)).toBe(200);
    expect(await running).toMatchObject({ ok: true, blockers: [] });
  });

  it('refuses a note save from a window that is not registered', async () => {
    const clock = stillClock();
    const local = await harness(clock);
    const fixture = await seedPractice(local.app);
    const revision = await revisionOf(local.app, fixture.note);
    const w = window('tab-1');

    const running = trigger(local.app);
    const asked = await w.asked;

    // A tab nobody registered cannot be the window that was asked to flush, so
    // the right quiesce's id in its hand buys nothing.
    expect(
      (
        await local.app.inject(
          flushSave(
            fixture.note,
            revision,
            `?tab=tab-stranger&doc=${docOf('tab-stranger')}&quiesce=${asked.quiesceId}`,
          ),
        )
      ).statusCode,
    ).toBe(503);

    expect(await report(local.app, 'tab-1', asked.quiesceId, true)).toBe(200);
    expect(await running).toMatchObject({ ok: true, blockers: [] });
  });

  it('refuses a non-note write during the flush step', async () => {
    const clock = stillClock();
    const local = await harness(clock);
    const fixture = await seedPractice(local.app);
    const w = window('tab-1');

    const running = trigger(local.app);
    const asked = await w.asked;
    const query = `?tab=tab-1&doc=${docOf('tab-1')}&quiesce=${asked.quiesceId}`;

    // The exemption is one route. Everything else a window might be tempted to
    // write during the flush is refused exactly as before.
    expect(
      (
        await local.app.inject({
          method: 'POST',
          url: '/api/notes',
          payload: { patient_id: fixture.patient, format_id: fixture.format, content: TYPED },
        })
      ).statusCode,
    ).toBe(503);
    expect(
      (await local.app.inject({ method: 'DELETE', url: `/api/notes/${fixture.note}${query}` })).statusCode,
    ).toBe(503);
    expect(
      (await local.app.inject({ method: 'POST', url: `/api/notes/${fixture.note}/publish${query}` }))
        .statusCode,
    ).toBe(503);
    expect(
      (
        await local.app.inject({
          method: 'POST',
          url: '/api/patients' + query,
          payload: { name: 'John Smith' },
        })
      ).statusCode,
    ).toBe(503);
    // And the chat under the note, which is a different route at the same prefix.
    expect(
      (
        await local.app.inject({
          method: 'POST',
          url: `/api/notes/${fixture.note}/chat${query}`,
          payload: { content: 'hello' },
        })
      ).statusCode,
    ).toBe(503);

    expect(await report(local.app, 'tab-1', asked.quiesceId, true)).toBe(200);
    expect(await running).toMatchObject({ ok: true, blockers: [] });
  });

  it("settles ok:true when the flush's own save lands, with the text on disk", async () => {
    const clock = stillClock();
    const local = await harness(clock);
    const fixture = await seedPractice(local.app);
    const revision = await revisionOf(local.app, fixture.note);
    const w = window('tab-1');

    // Exactly what the browser does: asked to flush, the editor saves the text it
    // holds, and only then reports. The whole point of the exemption is that
    // this ends `ok:true` instead of `save_error`.
    const running = trigger(local.app);
    const asked = await w.asked;
    expect(
      (
        await local.app.inject(
          flushSave(fixture.note, revision, `?tab=tab-1&doc=${docOf('tab-1')}&quiesce=${asked.quiesceId}`),
        )
      ).statusCode,
    ).toBe(200);
    expect(await report(local.app, 'tab-1', asked.quiesceId, true)).toBe(200);

    expect(await running).toMatchObject({ ok: true, blockers: [] });
    const stored = await local.app.inject({ method: 'GET', url: `/api/notes/${fixture.note}` });
    expect(stored.json<{ content: string }>().content).toBe(TYPED);
    // A success holds maintenance, so the next write outside the flush is not.
    expect((await statusOf(local.app)).maintenance).toBe(true);
  });
});

describe('the window phase (FD2)', () => {
  it('turns a client conflict into ok:false with that blocker', async () => {
    const clock = stillClock();
    const local = await harness(clock);
    const w = window('tab-1');
    const running = trigger(local.app);
    await report(local.app, 'tab-1', (await w.asked).quiesceId, false, ['conflict']);
    expect(await running).toMatchObject({ ok: false, blockers: ['conflict'] });
  });

  it('carries a recording blocker the server could never register itself', async () => {
    const clock = stillClock();
    const local = await harness(clock);
    const w = window('tab-1');
    const running = trigger(local.app);
    await report(local.app, 'tab-1', (await w.asked).quiesceId, false, ['recording']);
    expect(await running).toMatchObject({ ok: false, blockers: ['recording'] });
  });

  it('refuses a report carrying a stale or foreign quiesceId with 409, counts it, and still refuses the quiesce', async () => {
    const clock = stillClock();
    const local = await harness(clock);
    const w = window('tab-1');
    const running = trigger(local.app);
    const asked = await w.asked;

    const before = currentMaintenance().refused();
    expect(await report(local.app, 'tab-1', '00000000-0000-7000-8000-000000000000', true)).toBe(409);
    expect(currentMaintenance().refused()).toBe(before + 1);
    // The right id is still accepted, so it was the id that was refused.
    expect(await report(local.app, 'tab-1', asked.quiesceId, true)).toBe(200);
    expect((await running).ok).toBe(true);
  });

  it('refuses a report from a window that is not registered', async () => {
    const clock = stillClock();
    const local = await harness(clock);
    const w = window('tab-1');
    const running = trigger(local.app);
    const asked = await w.asked;

    const before = currentMaintenance().refused();
    expect(await report(local.app, 'tab-stranger', asked.quiesceId, true)).toBe(409);
    expect(await report(local.app, 'tab-1', asked.quiesceId, true)).toBe(200);
    expect(currentMaintenance().refused()).toBe(before + 1);
    expect((await running).ok).toBe(true);
  });

  it('yields no_response, never ok, when a registered wait loses its socket', async () => {
    const clock = stillClock();
    const local = await harness(clock);
    const w = window('tab-1');
    expect((await statusOf(local.app)).windows).toBe(1);

    const running = trigger(local.app);
    currentMaintenance().disconnect(w.id);
    // The live set is empty, and nothing about this window has been discharged.
    expect((await statusOf(local.app)).windows).toBe(0);
    expect(await running).toMatchObject({ ok: false, blockers: ['no_response'] });
  });

  it('yields no_response when no window was ever attached at all', async () => {
    const clock = stillClock();
    const local = await harness(clock);
    // "No browser attached" is a named state, distinct from a disconnect, and it
    // gets the same honest answer.
    expect(await trigger(local.app)).toMatchObject({ ok: false, blockers: ['no_response'] });
  });
});

describe('a retained disconnected record (FD13)', () => {
  it('keeps an unpersisted obligation counting; the same tab supersedes it and another does not', async () => {
    const clock = stillClock();
    const local = await harness(clock);
    const dirty = window('tab-dirty');
    const idle = window('tab-idle');

    // The dirty window disconnects before any quiesce; the inert one stays.
    currentMaintenance().disconnect(dirty.id);
    expect((await statusOf(local.app)).windows).toBe(1);

    const refused = trigger(local.app);
    await report(local.app, 'tab-idle', (await idle.asked).quiesceId, true);
    // The secondary's `ok` does not and cannot settle this over the primary's
    // lost text.
    expect(await refused).toMatchObject({ ok: false, blockers: ['no_response'] });
    expect(dirty.asked).toBeDefined();

    // A **different** tab does not supersede the retained record.
    const other = window('tab-other');
    const stillRefused = trigger(local.app);
    await report(local.app, 'tab-idle', (await idle.asked).quiesceId, true);
    await report(local.app, 'tab-other', (await other.asked).quiesceId, true);
    expect(await stillRefused).toMatchObject({ ok: false, blockers: ['no_response'] });

    // The **same** tab registers again — the same `sessionStorage` identity —
    // and supersedes its own retained record, so the next quiesce may settle.
    const again = window('tab-dirty');
    const settled = trigger(local.app);
    await report(local.app, 'tab-idle', (await idle.asked).quiesceId, true);
    await report(local.app, 'tab-other', (await other.asked).quiesceId, true);
    await report(local.app, 'tab-dirty', (await again.asked).quiesceId, true);
    expect((await settled).ok).toBe(true);
  });

  it('refuses a later quiesce after a window reported ok and then went away', async () => {
    // A clean report says what the window held **when it said so**. A tab that
    // keeps working and is then killed — a crash, the OS, the browser quitting —
    // has said nothing about what was typed since, so its `ok` does not carry
    // over: `disconnect()` takes the clearance with it (AM-215's fail-closed
    // reading, and the only one that survives a tab that reported `ok` and then
    // died holding an edit).
    const clock = stillClock();
    const local = await harness(clock);
    const w = window('tab-1');
    const running = trigger(local.app);
    await report(local.app, 'tab-1', (await w.asked).quiesceId, true);
    expect((await running).ok).toBe(true);

    // The window goes away without saying anything, so nothing about what it
    // held now has been accounted for.
    currentMaintenance().disconnect(w.id);

    const next = window('tab-2');
    const second = trigger(local.app);
    await report(local.app, 'tab-2', (await next.asked).quiesceId, true);
    expect(await second).toMatchObject({ ok: false, blockers: ['no_response'] });
  });
});

describe('a report the server cannot place (FD8, read the other way)', () => {
  it('refuses a claim of not-ok with nothing placeable in it, and never reads it as clean', async () => {
    const clock = stillClock();
    const local = await harness(clock);
    const w = window('tab-1');
    const running = trigger(local.app);

    // `ok:false` with an empty blocker list describes no state this protocol has.
    // It must not narrow to `[]` and become the clean answer it is not.
    await report(local.app, 'tab-1', (await w.asked).quiesceId, false, []);

    expect(await running).toMatchObject({ ok: false, blockers: ['no_response'] });
  });

  it('refuses a claim carrying a blocker name this build does not know', async () => {
    const clock = stillClock();
    const local = await harness(clock);
    const w = window('tab-1');
    const running = trigger(local.app);

    // A future blocker, a typo, a corrupted body: all the same to the server,
    // which knows three names and will not invent a fourth.
    await report(local.app, 'tab-1', (await w.asked).quiesceId, false, ['spellcheck_failed']);

    expect(await running).toMatchObject({ ok: false, blockers: ['no_response'] });
  });

  it('refuses a claim of clean that contradicts itself with blockers', async () => {
    const clock = stillClock();
    const local = await harness(clock);
    const w = window('tab-1');
    const running = trigger(local.app);

    // FD8 says `ok:true` requires an empty list; a list beside `ok:true` is not
    // a state the protocol has, and is not taken at face value either.
    await report(local.app, 'tab-1', (await w.asked).quiesceId, true, ['conflict']);

    expect(await running).toMatchObject({ ok: false, blockers: ['no_response'] });
  });

  it('leaves the FD13 obligation standing when a claim cannot be placed', async () => {
    const clock = stillClock();
    const local = await harness(clock);
    const w = window('tab-1');

    const refused = trigger(local.app);
    await report(local.app, 'tab-1', (await w.asked).quiesceId, false, []);
    expect((await refused).ok).toBe(false);
    // The window goes away without ever having said it held nothing…
    currentMaintenance().disconnect(w.id);

    // …so its record still blocks, rather than being discharged by a claim the
    // server could not place.
    const other = window('tab-2');
    const second = trigger(local.app);
    await report(local.app, 'tab-2', (await other.asked).quiesceId, true);
    expect(await second).toMatchObject({ ok: false, blockers: ['no_response'] });
  });
});

describe("the window's last word (AM-215)", () => {
  it('discharges a clean record, so a later quiesce from another tab settles', async () => {
    const clock = stillClock();
    const local = await harness(clock);
    const leaving = window('tab-leaving');

    // A dirty disconnect first: the retained record and its obligation, the
    // state this row exists to release.
    currentMaintenance().disconnect(leaving.id);
    const blocked = trigger(local.app);
    await report(local.app, 'tab-leaving', (await leaving.asked).quiesceId, true);
    expect(await blocked).toMatchObject({ ok: false, blockers: ['no_response'] });

    // The same tab then says, as it goes, that it is leaving nothing behind.
    currentMaintenance().closeWindow('tab-leaving', docOf('tab-leaving'), true);

    // A **different** tab, which could never have superseded it (FD13(c)), now
    // settles — because the record is gone, not because anybody forgot it.
    const fresh = window('tab-fresh');
    const settled = trigger(local.app);
    await report(local.app, 'tab-fresh', (await fresh.asked).quiesceId, true);
    expect(await settled).toMatchObject({ ok: true, blockers: [] });
  });

  it('keeps the fail-closed obligation when the word is dirty', async () => {
    const clock = stillClock();
    const local = await harness(clock);
    const dirty = window('tab-dirty');

    currentMaintenance().disconnect(dirty.id);
    currentMaintenance().closeWindow('tab-dirty', docOf('tab-dirty'), false);

    const other = window('tab-other');
    const refused = trigger(local.app);
    await report(local.app, 'tab-other', (await other.asked).quiesceId, true);
    expect(await refused).toMatchObject({ ok: false, blockers: ['no_response'] });
  });

  it('discharges nothing for a window with no identity, or one nobody registered', async () => {
    const clock = stillClock();
    const local = await harness(clock);
    const dirty = window('tab-dirty');
    currentMaintenance().disconnect(dirty.id);

    // A window that could not read `sessionStorage` registered under no id, so it
    // has no record to be discharging and nothing to be recognised by.
    currentMaintenance().closeWindow(null, null, true);
    // And a tab id the server has never seen discharges nothing either.
    currentMaintenance().closeWindow('tab-stranger', docOf('tab-stranger'), true);

    const other = window('tab-other');
    const refused = trigger(local.app);
    await report(local.app, 'tab-other', (await other.asked).quiesceId, true);
    expect(await refused).toMatchObject({ ok: false, blockers: ['no_response'] });
  });

  it('a clean claim on a connected record is remembered, not applied, and the window is still asked', async () => {
    // The claim arrives while the tab's socket is still open — a beacon that beat
    // the socket close, which is the order this browser actually produces. It is
    // remembered, and **nothing** happens: no wait is released and no record is
    // deleted, so the window is still registered and a quiesce can still ask it.
    const { clock, asked } = answeringClock('tab-other');
    const local = await harness(clock);
    window('tab-live');

    currentMaintenance().closeWindow('tab-live', docOf('tab-live'), true);
    expect((await statusOf(local.app)).windows).toBe(1);

    // Asked in its own right, and it has reported nothing, so this quiesce is
    // refused rather than settled over it.
    const running = trigger(local.app);
    expect(await running).toMatchObject({ ok: false, blockers: ['no_response'] });

    // The word alone never discharges: it takes the window's own socket as well,
    // so a claim cannot be replayed against a record that is still being served.
    const other = window('tab-other');
    const refused = trigger(local.app);
    await report(local.app, 'tab-other', (await other.asked).quiesceId, true);
    asked.quiesceId = (await other.asked).quiesceId;
    expect(await refused).toMatchObject({ ok: false, blockers: ['no_response'] });
  });

  it("discharges the record when the claiming window's own socket closes, and then a later quiesce settles", async () => {
    const clock = stillClock();
    const local = await harness(clock);
    const leaving = window('tab-leaving');

    // A dirty disconnect first, so there is an obligation worth discharging.
    currentMaintenance().disconnect(leaving.id);
    const blocked = trigger(local.app);
    await report(local.app, 'tab-leaving', (await leaving.asked).quiesceId, true);
    expect(await blocked).toMatchObject({ ok: false, blockers: ['no_response'] });

    // The same tab then says, as it goes, that it is leaving nothing behind. Its
    // socket is already gone, so the claim is acted on at once.
    currentMaintenance().closeWindow('tab-leaving', docOf('tab-leaving'), true);

    // A **different** tab, which could never have superseded it (FD13(c)), now
    // settles — because the record is gone, not because anybody forgot it.
    const fresh = window('tab-fresh');
    const settled = trigger(local.app);
    await report(local.app, 'tab-fresh', (await fresh.asked).quiesceId, true);
    expect(await settled).toMatchObject({ ok: true, blockers: [] });
  });

  it('never lets a late beacon touch the record of a tab that reloaded', async () => {
    const clock = stillClock();
    const local = await harness(clock);
    const outgoing = window('tab-reload');
    // The reload: the outgoing document's socket closes and the incoming one
    // registers under the same `sessionStorage` identity, landing on the same
    // record (FD13(c)). A registration is a new document arriving, so it drops
    // whatever the previous one said as it went — and it now owns the record, with
    // **its own** `doc`, which is the only document allowed to speak for it.
    currentMaintenance().disconnect(outgoing.id);
    const incoming = window('tab-reload', docOf('tab-reload', 'next'));
    expect(incoming.id).toBe(outgoing.id);
    const incomingWait = incoming.asked;

    // A beacon from the *outgoing* document arrives late, after the new one is
    // registered. It must not discharge the new document's record: that document
    // holds its own text and has not been asked about it.
    currentMaintenance().closeWindow('tab-reload', docOf('tab-reload'), true);
    expect((await statusOf(local.app)).windows).toBe(1);

    // And it is asked, in its own right, and it can answer.
    const running = trigger(local.app);
    expect((await incomingWait).request).toBe('flush');
    await report(
      local.app,
      'tab-reload',
      (await incomingWait).quiesceId,
      true,
      [],
      docOf('tab-reload', 'next'),
    );
    expect(await running).toMatchObject({ ok: true, blockers: [] });
  });

  /**
   * Defect D, in the reviewer's own ordering: the **outgoing** document's beacon
   * arrives after its successor has registered under the same tab id, so the
   * server sees one connected record under that id and would bank the word on it.
   * Then the successor dies without saying anything, holding an edit. Without the
   * per-document `doc` that beacon is exactly what turns the fail-closed answer
   * into a fail-open one: the word is spent on the successor's socket close, the
   * record is deleted, and a bystander's `ok` settles a quiesce over text nobody
   * was asked about.
   */
  it('lets a predecessor document’s late beacon neither bank on nor discharge its successor’s record', async () => {
    const clock = stillClock();
    const local = await harness(clock);
    const maintenance = currentMaintenance();

    // Document one registers and its socket goes first; document two, in the same
    // tab, registers under the same `sessionStorage` identity and its own `doc`.
    const first = maintenance.registerWindow('tab-swap', docOf('tab-swap', 'one'));
    maintenance.disconnect(first);
    const second = maintenance.registerWindow('tab-swap', docOf('tab-swap', 'two'));
    expect(second).toBe(first);
    maintenance.holdFor(second).catch(() => undefined);

    // The beacon that lost the race: it is `clean`, and it arrives while the
    // record is *connected* — which, without the `doc`, is indistinguishable from
    // the ordinary beacon-first close.
    maintenance.closeWindow('tab-swap', docOf('tab-swap', 'one'), true);

    // Document two dies without saying anything, holding an edit.
    maintenance.disconnect(second);

    // A bystander answers cleanly and still cannot settle over it.
    const other = window('tab-other');
    const refused = trigger(local.app);
    await report(local.app, 'tab-other', (await other.asked).quiesceId, true);
    expect(await refused).toMatchObject({ ok: false, blockers: ['no_response'] });
  });

  it('still discharges the ordinary beacon-first clean close, which the doc guard must not swallow', async () => {
    // The control for the case above, and the reason the guard is on the document
    // rather than on the *order* of the two events: a word that beats its own
    // socket close is the ordinary close in this browser, every time, and it still
    // discharges.
    const clock = stillClock();
    const local = await harness(clock);
    const maintenance = currentMaintenance();

    const next = maintenance.registerWindow('tab-control', docOf('tab-control'));
    maintenance.holdFor(next).catch(() => undefined);
    maintenance.closeWindow('tab-control', docOf('tab-control'), true);
    maintenance.disconnect(next);

    const witness = window('tab-witness');
    const settled = trigger(local.app);
    await report(local.app, 'tab-witness', (await witness.asked).quiesceId, true);
    expect(await settled).toMatchObject({ ok: true, blockers: [] });
  });

  it('refuses a report whose document is not the one holding the record', async () => {
    // Called on the controller rather than over HTTP, because what is under test is
    // the placement of the claim and not the route: this quiesce is in flight
    // while the case makes both reports, and a still clock is what keeps it in
    // flight for exactly as long as the case needs.
    const clock = stillClock();
    const local = await harness(clock);
    const maintenance = currentMaintenance();
    const held = window('tab-doc');

    const running = trigger(local.app);
    const asked = await held.asked;
    expect(asked.request).toBe('flush');

    // The right quiesce, the right tab, and a document that never registered.
    const before = maintenance.refused();
    expect(
      maintenance.report({
        quiesceId: asked.quiesceId,
        tabId: 'tab-doc',
        doc: 'doc-tab-doc-someone-else',
        ok: true,
        blockers: [],
      }),
    ).toBe('window_not_registered');
    expect(maintenance.refused()).toBe(before + 1);

    // The document that does hold the record is still the one that settles it.
    expect(
      maintenance.report({
        quiesceId: asked.quiesceId,
        tabId: 'tab-doc',
        doc: docOf('tab-doc'),
        ok: true,
        blockers: [],
      }),
    ).toBe('accepted');
    expect(await running).toMatchObject({ ok: true, blockers: [] });
  });

  it('releases browser-mode maintenance when the last window goes away, and its word changes nothing', async () => {
    const clock = stillClock();
    const local = await harness(clock, { shellMode: false });
    const w = window('tab-1');
    const running = trigger(local.app);
    await report(local.app, 'tab-1', (await w.asked).quiesceId, true);
    expect((await running).ok).toBe(true);
    expect((await statusOf(local.app)).maintenance).toBe(true);

    // The window says its last word on the way out. Its record is **not**
    // discharged yet — its socket is still open, and a claim never releases a live
    // wait or deletes a live record — and a claim is not an unregistration either,
    // so FD1's hold stands.
    currentMaintenance().closeWindow('tab-1', docOf('tab-1'), true);
    expect((await statusOf(local.app)).maintenance).toBe(true);

    // The socket going away is the unregistration: it releases the hold, and it is
    // also what lets the word be spent, so the record is discharged rather than
    // retained and the next tab is not left blocked by one nobody is behind.
    currentMaintenance().disconnect(w.id);
    expect((await statusOf(local.app)).maintenance).toBe(false);
    expect((await statusOf(local.app)).windows).toBe(0);
    const fresh = window('tab-2');
    const settled = trigger(local.app);
    await report(local.app, 'tab-2', (await fresh.asked).quiesceId, true);
    expect(await settled).toMatchObject({ ok: true, blockers: [] });
  });
});

describe('a duplicated tab identity', () => {
  it('never makes a live window invisible to the quiesce', async () => {
    // Chromium's *Duplicate Tab* copies `sessionStorage`, so two windows really
    // can arrive with one id. The first is holding a wait.
    const { clock, asked } = answeringClock('tab-shared');
    const local = await harness(clock);
    const first = window('tab-shared');
    const second = window('tab-shared');
    expect((await statusOf(local.app)).windows).toBe(2);

    const running = trigger(local.app);
    // Both registrations are asked: a live window must not be deleted by a second
    // arrival carrying the same identity, or a quiesce could settle over text it
    // never got asked about.
    expect((await first.asked).request).toBe('flush');
    expect((await second.asked).request).toBe('flush');
    asked.quiesceId = (await first.asked).quiesceId;

    // Only one of the two can be told apart from the other by the tab id they
    // share, so the other is unanswered — which refuses the quiesce rather than
    // settling it. Fail-closed, and the honest answer for a state that cannot
    // exist in the app itself.
    expect(await running).toMatchObject({ ok: false, blockers: ['no_response'] });
  });

  it('a clean report from one copy settles nothing over the other copy’s retained obligation', async () => {
    // The data-loss direction: the `answered` set is keyed by the record's own
    // identity, never by the shared tab id — a tab identity is a *slot* that
    // Chromium's *Duplicate Tab* copies, so one copy's clean answer must not
    // stand in for the other's unpersisted something. A and B share tab `T` with
    // their own `doc`s; B's socket goes dirty; A reports `ok`. The quiesce must
    // be refused `no_response`, never settled over B's lost text.
    const clock = stillClock();
    const local = await harness(clock);
    const maintenance = currentMaintenance();

    const clean = window('tab-shared', docOf('tab-shared'));
    const dirty = window('tab-shared', docOf('tab-shared', 'next'));
    expect((await statusOf(local.app)).windows).toBe(2);

    // The dirty copy's socket goes away without saying anything: the record is
    // retained, `resolved` false — the obligation FD13 keeps.
    maintenance.disconnect(dirty.id);
    expect((await statusOf(local.app)).windows).toBe(1);

    // The clean copy is asked and reports the ordinary clean word.
    const running = trigger(local.app);
    expect((await clean.asked).request).toBe('flush');
    await report(local.app, 'tab-shared', (await clean.asked).quiesceId, true, [], docOf('tab-shared'));

    // Its clean word clears its own record and nothing else: the retained copy
    // is not the one that said `ok`, so it still blocks.
    expect(await running).toMatchObject({ ok: false, blockers: ['no_response'] });
  });

  it('asks a duplicate that arrives mid-quiesce, rather than skipping it as answered', async () => {
    // The reverse observable shape of the same fix: with the set keyed by the
    // shared tab id, a second document arriving under an already-answered tab id
    // while the quiesce runs would be **never asked** — `holdFor` sees the id in
    // `answered` and quietly holds — and the quiesce would settle `ok:true` over
    // a window nobody ever asked about. Keyed by the record, the newcomer is
    // asked at once; it never answers, so the quiesce is refused.
    const base = virtualClock();
    const newcomer: { asked: Promise<WaitOutcome> | null } = { asked: null };
    let staged: (() => void) | null = null;
    const clock: Clock = {
      now: base.now,
      sleeps: base.sleeps,
      elapsed: () => base.elapsed(),
      sleep: async (ms: number) => {
        staged?.();
        staged = null;
        await base.sleep(ms);
      },
    };
    const local = await harness(clock);
    const maintenance = currentMaintenance();
    const a = window('tab-shared');

    const running = trigger(local.app);
    expect((await a.asked).request).toBe('flush');
    const quiesceId = (await a.asked).quiesceId;

    // Staged for the first sleep after the quiesce is in flight: the first copy
    // answers clean and re-arms its poll (the transport loop), then a second
    // document — Duplicate Tab, own `doc` — registers under the same tab id
    // while the quiesce is still running.
    staged = () => {
      expect(
        maintenance.report({
          quiesceId,
          tabId: 'tab-shared',
          doc: docOf('tab-shared'),
          ok: true,
          blockers: [],
        }),
      ).toBe('accepted');
      void maintenance.holdFor(a.id);
      const id = maintenance.registerWindow('tab-shared', docOf('tab-shared', 'next'));
      newcomer.asked = maintenance.holdFor(id);
    };

    // The newcomer was asked (`flush`, not a silent hold), and because it never
    // answers the quiesce is refused — never settled while a live window was
    // never asked.
    const answer = await running;
    expect(await newcomer.asked).toMatchObject({
      request: 'flush',
    });
    expect(answer).toMatchObject({ ok: false, blockers: ['no_response'] });
  });

  it("spends a claim banked on a connected record when that window's own socket closes", async () => {
    const clock = stillClock();
    const local = await harness(clock);
    const leaving = window('tab-leaving');
    // The word goes out while the socket is still open — the order this browser
    // produces — so nothing is discharged yet and the window is still registered.
    currentMaintenance().closeWindow('tab-leaving', docOf('tab-leaving'), true);
    expect((await statusOf(local.app)).windows).toBe(1);

    // Its own socket goes, and that is the other half of the same fact: the
    // ordinary clean close, discharged rather than retained. A different tab,
    // which could never have superseded it, settles.
    currentMaintenance().disconnect(leaving.id);
    const fresh = window('tab-fresh');
    const settled = trigger(local.app);
    await report(local.app, 'tab-fresh', (await fresh.asked).quiesceId, true);
    expect(await settled).toMatchObject({ ok: true, blockers: [] });
  });

  it('a clean claim under a duplicated identity acts on neither copy', async () => {
    // Chromium's *Duplicate Tab* copies `sessionStorage`, so two windows really
    // can hold unpersisted text under one identity. The dirty one was here first
    // and the clean copy was made from it, and a clean claim says nothing about
    // which of them is speaking.
    const clock = stillClock();
    const local = await harness(clock);
    const dirty = window('tab-shared');
    const clean = window('tab-shared');

    // The clean copy says its word, with both sockets still open. **Nothing** is
    // released and nothing is deleted: either choice would be a guess, and the
    // guess this protocol must not make is the one that would release the dirty
    // copy's wait.
    currentMaintenance().closeWindow('tab-shared', docOf('tab-shared'), true);
    expect((await statusOf(local.app)).windows).toBe(2);

    // The clean copy's own socket goes, so its record is retained — no word was
    // ever banked against this identity.
    currentMaintenance().disconnect(clean.id);
    expect((await statusOf(local.app)).windows).toBe(1);

    // And the dirty copy is killed holding an edit. It has said nothing, its
    // record is not the one any claim was banked on, and another tab's `ok` cannot
    // settle a quiesce over it.
    currentMaintenance().disconnect(dirty.id);
    const other = window('tab-other');
    const refused = trigger(local.app);
    await report(local.app, 'tab-other', (await other.asked).quiesceId, true);
    expect(await refused).toMatchObject({ ok: false, blockers: ['no_response'] });
  });

  it('reuses one record for the ordinary re-arm, so registration churns no ids', async () => {
    await harness(stillClock());
    const maintenance = currentMaintenance();
    // The reporter re-arms a fresh request the moment it reports; the same tab
    // must land on the same record, or an in-flight quiesce would keep a stale id
    // in its expected set and force a false `no_response`.
    const first = maintenance.registerWindow('tab-rearm', docOf('tab-rearm'));
    const second = maintenance.registerWindow('tab-rearm', docOf('tab-rearm'));
    expect(second).toBe(first);
  });
});

describe('a throw out of a phase', () => {
  it('leaves the server serving writes rather than 503 until restart (FD5)', async () => {
    // A `sleep` that rejects stands in for anything unexpected out of a phase —
    // a database that cannot answer, a clock that misbehaves. The refusal hook is
    // up by then, so this is the case where a missed `finally` would be visible.
    const clock: Clock = {
      now: () => 0,
      sleeps: [],
      elapsed: () => 0,
      sleep: async () => {
        throw new Error('the clock went wrong');
      },
    };
    const local = await harness(clock);
    const w = window('tab-1');

    const response = await local.app.inject({ method: 'POST', url: '/api/app/quiesce', payload: {} });
    // The request failed — this row is not about how a throw is reported.
    expect(response.statusCode).toBe(500);
    void w.asked.catch(() => undefined);

    expect((await statusOf(local.app)).maintenance).toBe(false);
    expect(
      (await local.app.inject({ method: 'POST', url: '/api/patients', payload: { name: 'John Smith' } }))
        .statusCode,
    ).toBe(201);
  });
});

describe('which mode releases a successful quiesce (C-BRIDGE@1 rule 3)', () => {
  it('derives shell mode from APUNTA_SHELL when nothing is passed', async () => {
    const previous = process.env.APUNTA_SHELL;
    process.env.APUNTA_SHELL = '1';
    try {
      const clock = stillClock();
      const local = await harness(clock);
      const w = window('tab-1');
      const running = trigger(local.app);
      await report(local.app, 'tab-1', (await w.asked).quiesceId, true);
      expect((await running).ok).toBe(true);

      // Shell mode: a window closing is not what releases maintenance — the
      // shell's next transition is, and that is P5.4's.
      currentMaintenance().disconnect(w.id);
      expect((await statusOf(local.app)).maintenance).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.APUNTA_SHELL;
      else process.env.APUNTA_SHELL = previous;
    }
  });

  it('stays in browser mode when the environment says there is no shell', async () => {
    const previous = process.env.APUNTA_SHELL;
    delete process.env.APUNTA_SHELL;
    try {
      const clock = stillClock();
      const local = await harness(clock);
      const w = window('tab-1');
      const running = trigger(local.app);
      await report(local.app, 'tab-1', (await w.asked).quiesceId, true);
      expect((await running).ok).toBe(true);

      currentMaintenance().disconnect(w.id);
      expect((await statusOf(local.app)).maintenance).toBe(false);
    } finally {
      if (previous !== undefined) process.env.APUNTA_SHELL = previous;
    }
  });
});

describe('the status route (FD1)', () => {
  it('counts live registered windows, names the active jobs, and reports the mode', async () => {
    const clock = stillClock();
    const local = await harness(clock);
    expect(await statusOf(local.app)).toEqual({
      quiescing: false,
      activeJobs: [],
      windows: 0,
      maintenance: false,
    });

    const w = window('tab-1');
    begin('plan', 'job-1');
    expect(await statusOf(local.app)).toEqual({
      quiescing: false,
      activeJobs: [{ kind: 'plan' }],
      windows: 1,
      maintenance: false,
    });
    // A retained record holds no wait, so it is not a registered window.
    currentMaintenance().disconnect(w.id);
    end('job-1');
    expect((await statusOf(local.app)).windows).toBe(0);
  });

  it('refuses a trigger body carrying a field it does not define', async () => {
    const clock = stillClock();
    const local = await harness(clock);
    const response = await local.app.inject({
      method: 'POST',
      url: '/api/app/quiesce',
      payload: { force: true },
    });
    expect(response.statusCode).toBe(400);
  });
});

interface Practice {
  format: string;
  patient: string;
  note: string;
  plan: string;
}

/** A format, a patient, a note and a plan version, all synthetic. */
async function seedPractice(app: FastifyInstance): Promise<Practice> {
  const format = (
    await app.inject({
      method: 'POST',
      url: '/api/formats',
      payload: { name: 'Progress note', sections: ['Subjective', 'Plan'] },
    })
  ).json<{ id: string }>();
  const patient = (
    await app.inject({
      method: 'POST',
      url: '/api/patients',
      payload: { name: 'John Smith' },
    })
  ).json<{ id: string }>();
  const note = (
    await app.inject({
      method: 'POST',
      url: '/api/notes',
      payload: {
        patient_id: patient.id,
        format_id: format.id,
        content: 'Subjective: Sample body.\n\nPlan: Continue weekly.',
      },
    })
  ).json<{ id: string }>();
  const started = await app.inject({
    method: 'POST',
    url: `/api/patients/${patient.id}/plan`,
    payload: {},
  });
  expect(started.statusCode).toBe(201);
  const plan = started.json<{ plan: { id: string } | null }>().plan;
  expect(plan).not.toBeNull();
  return { format: format.id, patient: patient.id, note: note.id, plan: plan?.id ?? '' };
}

/**
 * **FD7's ten kinds, proven at the route sites.** Every case below sends a real
 * request to the real route and asserts that the route — not this file — began and
 * ended the kind it claims, and that the registry really held it while the request
 * was open.
 *
 * The earlier version of this row called `begin`/`end` directly for the ten kinds.
 * That proved the registry works and nothing else: deleting every `begin` this card
 * added in `plans.ts`, `prep.ts`, `brainstorm.ts`, `import.ts`, `halaxy.ts`,
 * `backup.ts` and `notes.ts` would have left it green.
 *
 * **How it observes without editing a handler.** A `save`'s `begin` and `end` are
 * microseconds apart inside one synchronous handler, so nothing outside the process
 * can ever catch it — not the status route, not a quiesce, not a second tab. The
 * registry's own `begin` is therefore wrapped, and the registry is read **inside**
 * the wrapper: the assertion is that the site's call reached the real registry and
 * the real registry held that kind, which is the thing FD7 claims. The wrapper
 * calls the original, so nothing else about the route changes behaviour.
 */
interface Registration {
  readonly kind: string;
  /** What the registry held at the moment the site registered it. */
  readonly registry: readonly { kind: string; id: string }[];
}

function watchRegistrations(): {
  readonly seen: Registration[];
  restore(): void;
} {
  const seen: Registration[] = [];
  const realBegin = registry.begin;
  const realEnd = registry.end;
  const begin = vi.spyOn(registry, 'begin').mockImplementation((kind, id) => {
    const job = realBegin(kind, id);
    seen.push({ kind, registry: active().map((entry) => ({ kind: entry.kind, id: entry.id })) });
    return job;
  });
  const done = vi.spyOn(registry, 'end').mockImplementation((id) => realEnd(id));
  return {
    seen,
    restore: () => {
      begin.mockRestore();
      done.mockRestore();
    },
  };
}

/** A multipart body, for the two routes that take an upload. */
function multipart(
  boundary: string,
  fields: Record<string, string>,
  file: { name: string; filename: string; bytes: Buffer; type: string },
): { payload: Buffer; headers: Record<string, string> } {
  const parts = Object.entries(fields).map(([name, value]) =>
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`),
  );
  return {
    payload: Buffer.concat([
      ...parts,
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\nContent-Type: ${file.type}\r\n\r\n`,
      ),
      file.bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

describe('the ten server-observable kinds, through their own routes (FD7)', () => {
  const WAVE = Buffer.from(encodeWav(new Int16Array(AUDIO_SAMPLE_RATE)));
  const CLAUDE_EXPORT = readFileSync(
    join(import.meta.dirname, '..', '..', 'e2e', 'fixtures', 'claude-export', 'patient-chats.json'),
  );
  const HALAXY_PDF = readFileSync(
    join(import.meta.dirname, '..', '..', 'e2e', 'fixtures', 'halaxy', 'john-smith.pdf'),
  );

  /**
   * One site, one kind, and the request that exercises it. `site` is in the
   * failure message because the whole point of this block is that the claim is
   * about a specific line in a specific file.
   */
  const sites: readonly {
    readonly kind: string;
    readonly site: string;
    readonly request: string;
    run(fixture: Practice, app: FastifyInstance): Promise<unknown>;
  }[] = [
    {
      kind: 'draft',
      site: 'routes/draft.ts:90, reached from POST /api/generate',
      request: 'POST /api/generate',
      run: async (fixture, app) =>
        app.inject({
          method: 'POST',
          url: '/api/generate',
          payload: {
            patient_id: fixture.patient,
            format_id: fixture.format,
            typed_notes: 'John Smith reports improved sleep.',
          },
        }),
    },
    {
      kind: 'refine',
      site: 'routes/chat.ts:122',
      request: 'POST /api/notes/:id/chat',
      run: async (fixture, app) =>
        app.inject({
          method: 'POST',
          url: `/api/notes/${fixture.note}/chat`,
          payload: { message: 'Make the plan shorter' },
        }),
    },
    {
      kind: 'transcription',
      site: 'routes/transcribe.ts:276',
      request: 'POST /api/transcribe',
      run: async (fixture, app) => {
        const upload = multipart(
          'apunta-registration-test',
          { patient_id: fixture.patient, format_id: fixture.format },
          { name: 'audio', filename: 'recording.wav', bytes: WAVE, type: 'audio/wav' },
        );
        return app.inject({
          method: 'POST',
          url: '/api/transcribe',
          payload: upload.payload,
          headers: upload.headers,
        });
      },
    },
    {
      kind: 'plan',
      site: 'routes/plans.ts:333',
      request: 'POST /api/patients/:id/plan/suggest',
      run: async (fixture, app) =>
        app.inject({ method: 'POST', url: `/api/patients/${fixture.patient}/plan/suggest`, payload: {} }),
    },
    {
      kind: 'briefing',
      site: 'routes/prep.ts:62',
      request: 'POST /api/patients/:id/prep',
      run: async (fixture, app) =>
        app.inject({ method: 'POST', url: `/api/patients/${fixture.patient}/prep`, payload: {} }),
    },
    {
      kind: 'brainstorm',
      site: 'routes/brainstorm.ts:142',
      request: 'POST /api/patients/:id/brainstorm',
      run: async (fixture, app) =>
        app.inject({
          method: 'POST',
          url: `/api/patients/${fixture.patient}/brainstorm`,
          payload: { message: 'What would you explore with her next?' },
        }),
    },
    {
      kind: 'import',
      site: 'routes/import.ts:78',
      request: 'POST /api/import/claude/run',
      run: async (_fixture, app) => {
        const upload = multipart(
          'apunta-claude-registration-test',
          {},
          {
            name: 'export',
            filename: 'conversations.json',
            bytes: CLAUDE_EXPORT,
            type: 'application/octet-stream',
          },
        );
        return app.inject({
          method: 'POST',
          url: '/api/import/claude/run',
          payload: upload.payload,
          headers: upload.headers,
        });
      },
    },
    {
      kind: 'import',
      site: 'routes/halaxy.ts:56',
      request: 'POST /api/import/halaxy',
      run: async (_fixture, app) => {
        // The run takes the selection the preview produced, so the preview is
        // part of exercising the route — and the preview is registered by rule as
        // *not* a job, which the "recording" case below also relies on.
        const preview = await app.inject({
          method: 'POST',
          url: '/api/import/halaxy/preview',
          payload: Buffer.concat([
            Buffer.from(
              `--apunta-halaxy-registration-test\r\nContent-Disposition: form-data; name="files"; filename="john-smith.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
            ),
            HALAXY_PDF,
            Buffer.from('\r\n--apunta-halaxy-registration-test--\r\n'),
          ]),
          headers: { 'content-type': 'multipart/form-data; boundary=apunta-halaxy-registration-test' },
        });
        expect(preview.statusCode).toBe(200);
        const patient = preview.json<{ patients: { fileName: string; notes: unknown[] }[] }>().patients[0];
        expect(patient).toBeDefined();
        return app.inject({
          method: 'POST',
          url: '/api/import/halaxy',
          payload: { patients: [{ ...patient, patientName: 'John Smith' }] },
        });
      },
    },
    {
      kind: 'backup',
      site: 'routes/backup.ts:73',
      request: 'POST /api/backup',
      run: async (_fixture, app) => app.inject({ method: 'POST', url: '/api/backup', payload: {} }),
    },
    {
      kind: 'restore',
      site: 'routes/backup.ts:122',
      request: 'POST /api/backup/restore',
      run: async (_fixture, app) => {
        const created = await app.inject({ method: 'POST', url: '/api/backup', payload: {} });
        expect(created.statusCode).toBe(201);
        const file = created.json<{ file: { filename: string } }>().file.filename;
        return app.inject({ method: 'POST', url: '/api/backup/restore', payload: { file } });
      },
    },
    {
      kind: 'save',
      site: 'routes/notes.ts:94',
      request: 'PATCH /api/notes/:id',
      run: async (fixture, app) => {
        const current = await app.inject({ method: 'GET', url: `/api/notes/${fixture.note}` });
        return app.inject({
          method: 'PATCH',
          url: `/api/notes/${fixture.note}`,
          payload: {
            revision: current.json<{ revision: number }>().revision,
            content: 'Subjective: Sample body, edited.\n\nPlan: Continue weekly.',
          },
        });
      },
    },
  ];

  it.each(sites)('registers and releases $kind through $site', async ({ kind, site, run }) => {
    const local = await createTestApp();
    const fixture = await seedPractice(local.app);
    const watch = watchRegistrations();
    try {
      const response = (await run(fixture, local.app)) as { statusCode?: number };
      expect(response.statusCode ?? 200, `${site} answered the request`).toBeLessThan(400);

      // The site began the kind it claims, exactly once.
      expect(
        watch.seen.map((entry) => entry.kind),
        `${site} registered ${kind}`,
      ).toContain(kind);
      const registration = watch.seen.find((entry) => entry.kind === kind);
      expect(registration).toBeDefined();
      // And the real registry held it at that moment — not a call that went
      // nowhere, and not a kind somebody else registered.
      expect(
        registration?.registry.some((job) => job.kind === kind),
        `${site} put ${kind} in the registry`,
      ).toBe(true);

      // Released: the `finally` ran, so the registry is empty again and a later
      // quiesce will not be refused over this request.
      expect(active(), `${site} released ${kind}`).toEqual([]);
    } finally {
      watch.restore();
      await local.close();
    }
  });

  it('never registers the browser-side recording kind server-side', async () => {
    const local = await createTestApp();
    const watch = watchRegistrations();
    try {
      // Every site above, with nothing watched but the vocabulary: the microphone
      // is in the browser and travels on the client channel, so no route may ever
      // begin `recording`.
      const fixture = await seedPractice(local.app);
      for (const site of sites) await site.run(fixture, local.app);
      expect(watch.seen.map((entry) => entry.kind)).not.toContain('recording');
    } finally {
      watch.restore();
      await local.close();
    }
  });
});
