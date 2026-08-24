import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { SPEECH_MODEL } from './catalog.js';
import { verifyFile } from './checksum.js';
import { commitDownload, discardDownload, downloadWithResume } from './download.js';
import { DisallowedHostError } from './catalog.js';
import { partPathFor, readSidecar, writeSidecar } from './resume.js';

/**
 * The downloader, against a fake `fetch` rather than a socket.
 *
 * The URL stays the real pinned one so `assertAllowedHost` is exercised for
 * real — pointing the test at a loopback server would have meant putting
 * `127.0.0.1` on the download allow-list, which is precisely the hole the
 * allow-list exists to prevent. Everything else here is real: real files, real
 * appends, real checksums.
 */

const CONTENT = Buffer.from('the quick brown fox jumps over the lazy dog, repeatedly. '.repeat(64));
const URL = SPEECH_MODEL.url;

interface FakeServer {
  readonly fetchImpl: typeof fetch;
  /** Ranges the client asked for, in order. */
  readonly ranges: (string | null)[];
}

function fakeServer(
  options: { honourRange?: boolean; body?: Buffer; truncateAfter?: number } = {},
): FakeServer {
  const body = options.body ?? CONTENT;
  const honourRange = options.honourRange ?? true;
  const ranges: (string | null)[] = [];

  const fetchImpl = ((_url: string, init?: RequestInit) => {
    const header = new Headers(init?.headers ?? {}).get('range');
    ranges.push(header);

    let slice = body;
    let status = 200;
    const headers = new Headers();

    if (header !== null && honourRange) {
      const start = Number(/bytes=(\d+)-/.exec(header)?.[1] ?? '0');
      slice = body.subarray(start);
      status = 206;
      headers.set(
        'content-range',
        `bytes ${String(start)}-${String(body.length - 1)}/${String(body.length)}`,
      );
    }
    if (options.truncateAfter !== undefined) {
      // A connection that dies mid-body: the length promised is not delivered.
      headers.set('content-length', String(slice.length));
      const short = slice.subarray(0, options.truncateAfter);
      return Promise.resolve(new Response(short, { status, headers }));
    }
    headers.set('content-length', String(slice.length));
    return Promise.resolve(new Response(slice, { status, headers }));
  }) as unknown as typeof fetch;

  return { fetchImpl, ranges };
}

let dir: string | null = null;

afterEach(() => {
  if (dir !== null) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

function destination(): string {
  dir = mkdtempSync(join(tmpdir(), 'apunta-download-'));
  mkdirSync(join(dir, 'models'), { recursive: true });
  return join(dir, 'models', 'model.bin');
}

describe('downloadWithResume', () => {
  it('downloads to a .part file and leaves the real name alone until it is committed', async () => {
    const target = destination();
    const server = fakeServer();

    const result = await downloadWithResume({
      url: URL,
      destination: target,
      checksum: 'pin-1',
      fetchImpl: server.fetchImpl,
    });

    expect(result.bytes).toBe(CONTENT.length);
    expect(result.resumedFromBytes).toBe(0);
    expect(server.ranges).toEqual([null]);
    expect(() => statSync(target)).toThrow();
    expect(readFileSync(partPathFor(target))).toEqual(CONTENT);

    await commitDownload(target);
    expect(readFileSync(target)).toEqual(CONTENT);
    expect(readSidecar(target)).toBeNull();
  });

  it('resumes: asks for the rest, appends it, and ends up byte-identical', async () => {
    const target = destination();

    // Simulate a run that was killed after 100 bytes.
    const server = fakeServer();
    await downloadWithResume({
      url: URL,
      destination: target,
      checksum: 'pin-1',
      fetchImpl: fakeServer({ truncateAfter: 100 }).fetchImpl,
    });
    expect(statSync(partPathFor(target)).size).toBe(100);

    const second = await downloadWithResume({
      url: URL,
      destination: target,
      checksum: 'pin-1',
      fetchImpl: server.fetchImpl,
    });

    expect(server.ranges).toEqual(['bytes=100-']);
    expect(second.resumedFromBytes).toBe(100);
    expect(second.plan).toEqual({ mode: 'resume', offset: 100 });
    expect(readFileSync(partPathFor(target))).toEqual(CONTENT);
  });

  /**
   * The failure this whole design exists to avoid: a server that ignores
   * `Range` answers 200 with the whole file, and appending that to a
   * half-finished file produces a corrupt file of plausible length.
   */
  it('starts over when the server ignores the range request', async () => {
    const target = destination();
    writeFileSync(partPathFor(target), CONTENT.subarray(0, 100));
    writeSidecar(target, {
      url: URL,
      expectedBytes: CONTENT.length,
      downloadedBytes: 100,
      checksum: 'pin-1',
    });

    const server = fakeServer({ honourRange: false });
    const result = await downloadWithResume({
      url: URL,
      destination: target,
      checksum: 'pin-1',
      fetchImpl: server.fetchImpl,
    });

    expect(server.ranges).toEqual(['bytes=100-']);
    expect(result.bytes).toBe(CONTENT.length);
    expect(readFileSync(partPathFor(target))).toEqual(CONTENT);
  });

  it('does not re-request a file that is already complete', async () => {
    const target = destination();
    const server = fakeServer();
    await downloadWithResume({
      url: URL,
      destination: target,
      checksum: 'pin-1',
      fetchImpl: server.fetchImpl,
    });

    const again = await downloadWithResume({
      url: URL,
      destination: target,
      checksum: 'pin-1',
      fetchImpl: server.fetchImpl,
    });
    expect(again.plan.mode).toBe('complete');
    expect(server.ranges).toHaveLength(1);
  });

  it('throws away a part file downloaded against a different pin', async () => {
    const target = destination();
    await downloadWithResume({
      url: URL,
      destination: target,
      checksum: 'pin-1',
      fetchImpl: fakeServer({ truncateAfter: 100 }).fetchImpl,
    });

    const server = fakeServer();
    const result = await downloadWithResume({
      url: URL,
      destination: target,
      checksum: 'pin-2',
      fetchImpl: server.fetchImpl,
    });
    expect(result.plan.mode).toBe('fresh');
    expect(server.ranges).toEqual([null]);
    expect(readFileSync(partPathFor(target))).toEqual(CONTENT);
  });

  it('reports progress with a total that counts the bytes already on disk', async () => {
    const target = destination();
    await downloadWithResume({
      url: URL,
      destination: target,
      checksum: 'pin-1',
      fetchImpl: fakeServer({ truncateAfter: 100 }).fetchImpl,
    });

    const seen: { completedBytes: number; totalBytes: number | null; resumedFromBytes: number }[] = [];
    await downloadWithResume({
      url: URL,
      destination: target,
      checksum: 'pin-1',
      fetchImpl: fakeServer().fetchImpl,
      progressIntervalMs: 0,
      onProgress: (progress) => seen.push(progress),
    });

    expect(seen[0]?.completedBytes).toBe(100);
    expect(seen[0]?.resumedFromBytes).toBe(100);
    // `content-length` on a 206 is the length of the range, not of the file.
    for (const progress of seen) expect(progress.totalBytes).toBe(CONTENT.length);
  });

  it('refuses a URL that is not on the allow-list before it opens a socket', async () => {
    const target = destination();
    await expect(
      downloadWithResume({
        url: 'https://example.com/model.bin',
        destination: target,
        checksum: null,
        fetchImpl: fakeServer().fetchImpl,
      }),
    ).rejects.toBeInstanceOf(DisallowedHostError);
  });

  it('turns a refused HTTP status into a download failure, not a stack trace', async () => {
    const target = destination();
    const failing = (() => Promise.resolve(new Response('nope', { status: 503 }))) as unknown as typeof fetch;
    await expect(
      downloadWithResume({ url: URL, destination: target, checksum: null, fetchImpl: failing }),
    ).rejects.toMatchObject({ name: 'SetupError', code: 'download_failed' });
  });
});

describe('verify, then commit or discard', () => {
  it('commits a file whose checksum matches', async () => {
    const target = destination();
    await downloadWithResume({
      url: URL,
      destination: target,
      checksum: null,
      fetchImpl: fakeServer().fetchImpl,
    });

    const { createHash } = await import('node:crypto');
    const sha1 = createHash('sha1').update(CONTENT).digest('hex');
    const verification = await verifyFile(partPathFor(target), { sha1 });
    expect(verification.ok).toBe(true);

    await commitDownload(target);
    expect(readFileSync(target)).toEqual(CONTENT);
  });

  /**
   * A corrupt download is deleted rather than resumed onto: the retry has to
   * start clean, or it appends good bytes to bad ones for ever.
   */
  it('discards a file whose checksum does not match, so a retry starts clean', async () => {
    const target = destination();
    await downloadWithResume({
      url: URL,
      destination: target,
      checksum: null,
      fetchImpl: fakeServer().fetchImpl,
    });

    const verification = await verifyFile(partPathFor(target), { sha1: 'f'.repeat(40) });
    expect(verification.ok).toBe(false);
    expect(verification.algorithm).toBe('sha1');

    await discardDownload(target);
    expect(() => statSync(partPathFor(target))).toThrow();
    expect(readSidecar(target)).toBeNull();
  });
});
