import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { SPEECH_MODEL } from './catalog.js';
import type { SetupEvent } from './protocol.js';
import { partPathFor } from './resume.js';
import { runSetup, speechModelPath, type SetupEnvironment } from './run.js';

/**
 * The whole first run, orchestrated, against a fake runtime and a fake
 * download — every branch the therapist can land in, none of them needing a
 * Mac.
 */

const BASE = 'http://127.0.0.1:11434';
const TB = 1000 ** 4;
const MODEL_BODY = Buffer.from('not really 574 MB of weights');

interface Harness {
  readonly events: SetupEvent[];
  readonly environment: SetupEnvironment;
  readonly modelsDir: string;
  readonly requested: string[];
}

let dir: string | null = null;

afterEach(() => {
  if (dir !== null) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

function harness(
  options: {
    pulled?: string[];
    runtimeUp?: boolean;
    freeBytes?: number | null;
    memoryGib?: number | null;
    speechModelPresent?: boolean;
  } = {},
): Harness {
  dir = mkdtempSync(join(tmpdir(), 'apunta-setup-'));
  const modelsDir = join(dir, 'models');
  mkdirSync(modelsDir, { recursive: true });
  if (options.speechModelPresent === true) {
    writeFileSync(speechModelPath(modelsDir), MODEL_BODY);
  }

  const events: SetupEvent[] = [];
  const requested: string[] = [];
  const pulled = options.pulled ?? [];
  const runtimeUp = options.runtimeUp ?? true;

  const fetchImpl = ((url: string) => {
    requested.push(url);
    if (url.startsWith(BASE)) {
      if (!runtimeUp) return Promise.reject(new Error('connection refused'));
      if (url.endsWith('/api/tags')) {
        const body = JSON.stringify({ models: pulled.map((name) => ({ name })) });
        return Promise.resolve(new Response(body, { status: 200 }));
      }
      if (url.endsWith('/api/pull')) {
        const encoder = new TextEncoder();
        const lines = [
          '{"status":"pulling manifest"}\n',
          '{"status":"pulling aaa","digest":"aaa","total":100,"completed":100}\n',
          '{"status":"success"}\n',
        ];
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            for (const line of lines) controller.enqueue(encoder.encode(line));
            controller.close();
          },
        });
        return Promise.resolve(new Response(stream, { status: 200 }));
      }
    }
    return Promise.resolve(
      new Response(MODEL_BODY, {
        status: 200,
        headers: { 'content-length': String(MODEL_BODY.length) },
      }),
    );
  }) as unknown as typeof fetch;

  const environment: SetupEnvironment = {
    dataDir: dir,
    modelsDir,
    ollamaBaseUrl: BASE,
    memoryGib: options.memoryGib === undefined ? 32 : options.memoryGib,
    modelOverride: null,
    emit: (event) => events.push(event),
    fetchImpl,
    runtimeWaitMs: 0,
    freeBytesImpl: () => (options.freeBytes === undefined ? TB : options.freeBytes),
  };

  return { events, environment, modelsDir, requested };
}

function eventsOf<K extends SetupEvent['event']>(
  events: SetupEvent[],
  kind: K,
): Extract<SetupEvent, { event: K }>[] {
  return events.filter((event): event is Extract<SetupEvent, { event: K }> => event.event === kind);
}

describe('runSetup', () => {
  it('does nothing and reports ready when both models are already there', async () => {
    const { events, environment, requested } = harness({
      speechModelPresent: true,
      pulled: ['gemma4:12b-it-qat'],
    });

    expect(await runSetup(environment)).toBe(true);
    expect(eventsOf(events, 'done')).toHaveLength(1);
    expect(eventsOf(events, 'plan')[0]?.ready).toBe(true);
    expect(requested.some((url) => url.includes('huggingface'))).toBe(false);
    expect(requested.some((url) => url.endsWith('/api/pull'))).toBe(false);
  });

  it('pulls the writing model and reports its progress', async () => {
    const { events, environment } = harness({ speechModelPresent: true });

    expect(await runSetup(environment)).toBe(true);
    const steps = eventsOf(events, 'step');
    expect(steps.find((step) => step.id === 'speech_model')?.status).toBe('skipped');
    expect(steps.filter((step) => step.id === 'writing_model').map((step) => step.status)).toEqual([
      'started',
      'finished',
    ]);
    const progress = eventsOf(events, 'progress').filter((event) => event.id === 'writing_model');
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.at(-1)?.percent).toBe(100);
  });

  /**
   * Condition 1 of keeping the weights at arm's length: the person accepting
   * the publisher's terms sees whose terms they are, before the download.
   */
  it('names the model and links its terms before pulling it', async () => {
    const { events, environment } = harness({ speechModelPresent: true });
    await runSetup(environment);

    const messages = eventsOf(events, 'message').map((event) => event.text);
    const provenance = messages.find((text) => text.includes('published by'));
    expect(provenance).toBeDefined();
    expect(provenance).toContain('ollama.com/library/gemma4');
    expect(provenance).toContain('does not host or copy');
  });

  it('refuses a full disk before it downloads anything', async () => {
    const { events, environment, requested } = harness({ freeBytes: 1000 * 1000 * 1000 });

    expect(await runSetup(environment)).toBe(false);
    const failure = eventsOf(events, 'failed')[0];
    expect(failure?.code).toBe('not_enough_disk');
    expect(failure?.retryable).toBe(true);
    expect(failure?.detail).toMatch(/GB/);
    expect(requested.some((url) => url.includes('huggingface'))).toBe(false);
    expect(requested.some((url) => url.endsWith('/api/pull'))).toBe(false);
  });

  it('blames the engine, not the internet, when the runtime is not answering', async () => {
    const { events, environment } = harness({ runtimeUp: false, speechModelPresent: true });

    expect(await runSetup(environment)).toBe(false);
    expect(eventsOf(events, 'failed')[0]?.code).toBe('runtime_unreachable');
  });

  /**
   * A damaged download is deleted rather than kept: a retry that resumed onto
   * bad bytes would append good ones to them for ever.
   */
  it('deletes a download that fails its checksum, and says so in plain words', async () => {
    const { events, environment, modelsDir } = harness({ pulled: ['gemma4:12b-it-qat'] });

    expect(await runSetup(environment)).toBe(false);
    const failure = eventsOf(events, 'failed')[0];
    expect(failure?.code).toBe('checksum_mismatch');
    expect(failure?.title).toContain('damaged');
    expect(() => statSync(partPathFor(join(modelsDir, SPEECH_MODEL.filename)))).toThrow();
    expect(() => statSync(speechModelPath(modelsDir))).toThrow();
  });

  it('reports the model it chose and why, before doing anything', async () => {
    const { events, environment } = harness({ memoryGib: 8, speechModelPresent: true });
    await runSetup(environment);

    const plan = eventsOf(events, 'plan')[0];
    expect(plan?.model.tag).toBe('qwen3.5:4b-q4_K_M');
    expect(plan?.model.reason).toContain('8 GB');
    expect(plan?.memoryGib).toBe(8);
  });

  it('never lets an internal detail out as an event', async () => {
    const { events, environment } = harness({ pulled: ['gemma4:12b-it-qat'] });
    await runSetup(environment);

    for (const event of events) {
      const text = JSON.stringify(event);
      expect(text).not.toContain('Error:');
      expect(text).not.toMatch(/at .*\.ts:\d+/);
    }
  });
});
