import { describe, expect, it, vi } from 'vitest';

import { hasModel, ndjson, pullModel, waitForOllama } from './ollama.js';

const BASE = 'http://127.0.0.1:11434';

function streamOf(lines: readonly string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    },
  });
}

function fetchReturning(response: Response): typeof fetch {
  return (() => Promise.resolve(response)) as unknown as typeof fetch;
}

describe('ndjson', () => {
  it('yields one object per line even when the chunks do not line up', async () => {
    const stream = streamOf(['{"a":1}\n{"b":', '2}\n{"c":3}']);
    const seen: unknown[] = [];
    for await (const value of ndjson(stream)) seen.push(value);
    expect(seen).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
  });
});

describe('waitForOllama', () => {
  it('gives up after the budget rather than hanging the window for ever', async () => {
    let clock = 0;
    const reachable = await waitForOllama({
      baseUrl: BASE,
      fetchImpl: (() => Promise.reject(new Error('refused'))) as unknown as typeof fetch,
      timeoutMs: 1000,
      intervalMs: 100,
      now: () => clock,
      sleep: (ms) => {
        clock += ms;
        return Promise.resolve();
      },
    });
    expect(reachable).toBe(false);
  });

  it('returns as soon as it answers', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })));
    const reachable = await waitForOllama({
      baseUrl: BASE,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 10_000,
    });
    expect(reachable).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('hasModel', () => {
  const body = JSON.stringify({ models: [{ name: 'gemma4:12b-it-qat' }, { name: 'qwen3.5:4b-q4_K_M' }] });

  it('matches the exact tag', async () => {
    const fetchImpl = fetchReturning(new Response(body, { status: 200 }));
    expect(await hasModel('gemma4:12b-it-qat', { baseUrl: BASE, fetchImpl })).toBe(true);
  });

  /**
   * A bare family name matching would defeat the whole point of pinning tags:
   * `gemma4:latest` is E4B, not 12B.
   */
  it('does not match a bare family name or a different tag', async () => {
    const fetchImpl = fetchReturning(new Response(body, { status: 200 }));
    expect(await hasModel('gemma4', { baseUrl: BASE, fetchImpl })).toBe(false);
    expect(await hasModel('gemma4:latest', { baseUrl: BASE, fetchImpl })).toBe(false);
  });

  it('answers false rather than throwing when the runtime is not there', async () => {
    const fetchImpl = (() => Promise.reject(new Error('refused'))) as unknown as typeof fetch;
    expect(await hasModel('gemma4:12b-it-qat', { baseUrl: BASE, fetchImpl })).toBe(false);
  });
});

describe('pullModel', () => {
  it('sums progress per layer instead of accumulating repeats', async () => {
    const lines = [
      '{"status":"pulling manifest"}\n',
      '{"status":"pulling aaa","digest":"aaa","total":1000,"completed":200}\n',
      '{"status":"pulling aaa","digest":"aaa","total":1000,"completed":600}\n',
      '{"status":"pulling bbb","digest":"bbb","total":500,"completed":500}\n',
      '{"status":"pulling aaa","digest":"aaa","total":1000,"completed":1000}\n',
      '{"status":"success"}\n',
    ];
    const seen: { completedBytes: number; totalBytes: number | null }[] = [];
    await pullModel({
      tag: 'gemma4:12b-it-qat',
      baseUrl: BASE,
      fetchImpl: fetchReturning(new Response(streamOf(lines), { status: 200 })),
      onProgress: (progress) => seen.push({ ...progress }),
    });

    const last = seen.at(-1);
    expect(last?.completedBytes).toBe(1500);
    expect(last?.totalBytes).toBe(1500);
    // The same digest reported four times must not add up to 2800.
    expect(Math.max(...seen.map((entry) => entry.completedBytes))).toBe(1500);
  });

  it('fails when the stream ends without succeeding', async () => {
    await expect(
      pullModel({
        tag: 'gemma4:12b-it-qat',
        baseUrl: BASE,
        fetchImpl: fetchReturning(
          new Response(streamOf(['{"status":"pulling manifest"}\n']), { status: 200 }),
        ),
      }),
    ).rejects.toMatchObject({ code: 'model_pull_failed' });
  });

  /**
   * The tier tags have never been checked against a live registry
   * (`docs/MANUAL-VERIFICATION.md` §2). A withdrawn tag is the one pull
   * failure retrying cannot fix, so it gets its own sentence.
   */
  it('says plainly when the model no longer exists, rather than offering a pointless retry', async () => {
    const lines = ['{"error":"model \'gemma4:12b-it-qat\' not found"}\n'];
    await expect(
      pullModel({
        tag: 'gemma4:12b-it-qat',
        baseUrl: BASE,
        fetchImpl: fetchReturning(new Response(streamOf(lines), { status: 200 })),
      }),
    ).rejects.toMatchObject({
      code: 'model_pull_failed',
      override: expect.stringContaining('does not have one by that name'),
    });
  });

  it('turns a refused request into a pull failure', async () => {
    await expect(
      pullModel({
        tag: 'x:1b',
        baseUrl: BASE,
        fetchImpl: fetchReturning(new Response('no', { status: 500 })),
      }),
    ).rejects.toMatchObject({ code: 'model_pull_failed' });
  });
});
