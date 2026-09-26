import { describe, expect, it, vi } from 'vitest';

import { hasModel, ndjson, pullModel, readModelDigest, waitForOllama } from './ollama.js';

const BASE = 'http://127.0.0.1:11434';
const TAG = 'gemma4:12b-it-qat';

/** A recorded request: which endpoint, which method, and what body it carried. */
interface Request {
  readonly url: string;
  readonly method: string;
  readonly body: string;
}

function recorder(handler: (request: Request) => Response): { fetchImpl: typeof fetch; requests: Request[] } {
  const requests: Request[] = [];
  const fetchImpl = ((url: string, init?: RequestInit) => {
    const record: Request = {
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : '',
    };
    requests.push(record);
    return Promise.resolve(handler(record));
  }) as unknown as typeof fetch;
  return { fetchImpl, requests };
}

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

/** Rule 7: the tag is pulled, then its digest is read back and named. */
describe('the digest a pull leaves behind', () => {
  const pullLines = ['{"status":"pulling manifest"}\n', '{"status":"success"}\n'];

  it('reads one /api/show after a successful pull, and reports the digest', async () => {
    const digest = 'sha256:9f8e7d6c5b4a39281706f5e4d3c2b1a0998877665544332211ffeeddccbbaa';
    const { fetchImpl, requests } = recorder((request) => {
      if (request.url.endsWith('/api/pull')) {
        return new Response(streamOf(pullLines), { status: 200 });
      }
      return new Response(JSON.stringify({ models: [{ name: TAG, digest }] }), { status: 200 });
    });

    const result = await pullModel({ tag: TAG, baseUrl: BASE, fetchImpl });

    expect(result).toEqual({ tag: TAG, digest });
    // Exactly two requests, in this order, and nothing else.
    expect(requests.map((request) => request.url)).toEqual([`${BASE}/api/pull`, `${BASE}/api/show`]);
    // The read is for the tag that was just pulled, by name in the body — the
    // tag is not in the URL, so a URL-only assertion would prove nothing.
    expect(requests[1]?.method).toBe('POST');
    expect(JSON.parse(requests[1]?.body ?? '{}')).toEqual({ model: TAG });
  });

  it('reads a digest carried at the top level, which is the other shape of /api/show', async () => {
    const { fetchImpl } = recorder(
      () => new Response(JSON.stringify({ digest: 'sha256:abc' }), { status: 200 }),
    );
    expect(await readModelDigest(TAG, { baseUrl: BASE, fetchImpl })).toBe('sha256:abc');
  });

  /**
   * No call in this module removes or replaces a tag, and a pull is never
   * repeated. `hasModel` is what stops the second one, so the shape of the
   * guarantee is: nothing here is a DELETE, and nothing here is a second pull.
   */
  it('never removes, replaces or re-pulls anything', async () => {
    const { fetchImpl, requests } = recorder((request) => {
      if (request.url.endsWith('/api/pull')) {
        return new Response(streamOf(pullLines), { status: 200 });
      }
      return new Response(JSON.stringify({ digest: 'sha256:abc' }), { status: 200 });
    });

    await pullModel({ tag: TAG, baseUrl: BASE, fetchImpl });

    // One pull, one read, and nothing that could take a tag away. The runtime
    // being the thing that stores the tag is why this list is worth asserting
    // rather than trusting: the client has no call for it.
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      `POST ${BASE}/api/pull`,
      `POST ${BASE}/api/show`,
    ]);
    expect(requests.some((request) => request.method === 'DELETE')).toBe(false);
  });

  it('reports no digest rather than inventing one when the runtime names none', async () => {
    const { fetchImpl, requests } = recorder((request) => {
      if (request.url.endsWith('/api/pull')) {
        return new Response(streamOf(pullLines), { status: 200 });
      }
      // A runtime that answers `/api/show` with something that is not a digest.
      return new Response(JSON.stringify({ license: 'Apache-2.0' }), { status: 200 });
    });

    const result = await pullModel({ tag: TAG, baseUrl: BASE, fetchImpl });

    expect(result.digest).toBeNull();
    expect(requests).toHaveLength(2);
  });

  it('does not fail a pull that succeeded just because the label could not be read', async () => {
    const { fetchImpl } = recorder((request) => {
      if (request.url.endsWith('/api/pull')) {
        return new Response(streamOf(pullLines), { status: 200 });
      }
      return new Response('no', { status: 500 });
    });

    // The model is in the store. Stranding a working install over a missing
    // label would be worse than saying the label is missing.
    await expect(pullModel({ tag: TAG, baseUrl: BASE, fetchImpl })).resolves.toMatchObject({
      tag: TAG,
      digest: null,
    });
  });

  it('answers null rather than throwing when the runtime is not there at all', async () => {
    const fetchImpl = (() => Promise.reject(new Error('refused'))) as unknown as typeof fetch;
    expect(await readModelDigest(TAG, { baseUrl: BASE, fetchImpl })).toBeNull();
  });
});
