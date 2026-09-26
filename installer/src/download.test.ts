import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { A07_ALLOWED_QUERY_KEYS, SPEECH_DOWNLOAD_ALLOWANCE, SPEECH_MODEL } from './catalog.js';
import { verifyFile } from './checksum.js';
import { commitDownload, discardDownload, downloadWithResume, type DownloadOptions } from './download.js';
import { partPathFor, readSidecar, writeSidecar } from './resume.js';
import {
  assertRequestAllowed,
  receiptPathFor,
  REQUEST_REFUSAL_CODES,
  RequestRefusedError,
  writeReceipt,
} from './readiness.js';

/**
 * The downloader, against a fake `fetch` rather than a socket.
 *
 * The URL stays the real pinned one so the guard is exercised for real —
 * pointing the test at a loopback server would have meant putting
 * `127.0.0.1` on the download allow-list, which is precisely the hole the
 * allow-list exists to prevent. Everything else here is real: real files, real
 * appends, real checksums, and a real assertion about how many requests were
 * made and what each one carried.
 */

const CONTENT = Buffer.from('the quick brown fox jumps over the lazy dog, repeatedly. '.repeat(64));
const URL = SPEECH_MODEL.url;

/**
 * The admitted redirect host, read out of the catalogue rather than written
 * here, so a test cannot quietly pass against a host the product has since
 * stopped admitting. The first test below fails loudly if it is ever empty.
 */
const CDN = SPEECH_DOWNLOAD_ALLOWANCE.allowedRedirectHosts[0] ?? '';

/**
 * The options every case shares: the artifact's own allowance and its own
 * enumerated query names, exactly as `run.ts` passes them.
 */
const ALLOWANCE = {
  allowance: SPEECH_DOWNLOAD_ALLOWANCE,
  allowedQueryKeys: A07_ALLOWED_QUERY_KEYS,
} satisfies Partial<DownloadOptions>;

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

interface Recorded {
  readonly url: string;
  /** Every header the request carried, so "none" is assertable. */
  readonly headers: Record<string, string>;
}

interface Step {
  readonly status: number;
  /** Only for a redirect; relative is resolved against the current URL. */
  readonly location?: string;
  readonly body?: Buffer;
}

/**
 * A `fetch` that answers a fixed script, in order, and records what it was
 * asked for.
 *
 * A script rather than a routing table, because the whole point of most of
 * these cases is the *order* and the *count*: how many requests were made, which
 * host each went to, and what it carried. A router would answer the same way
 * however many times it was called, and a loop that requested one URL twice
 * would then look identical to a loop that refused the second request.
 */
function scripted(...steps: readonly Step[]): { fetchImpl: typeof fetch; calls: Recorded[] } {
  const calls: Recorded[] = [];
  let index = 0;
  const fetchImpl = ((url: string, init?: RequestInit) => {
    const step = steps[index];
    index += 1;
    calls.push({ url, headers: { ...(init?.headers as Record<string, string> | undefined) } });
    if (step === undefined) {
      return Promise.resolve(new Response('ran past the script', { status: 500 }));
    }
    const headers = new Headers();
    if (step.location !== undefined) headers.set('location', step.location);
    const body = step.body ?? CONTENT;
    headers.set('content-length', String(body.length));
    return Promise.resolve(
      new Response(step.status >= 300 && step.status < 400 ? null : body, {
        status: step.status,
        headers,
      }),
    );
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
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

describe('the download allow-list', () => {
  it('has admitted exactly one redirect host, and it is the one the probe observed', () => {
    expect(SPEECH_DOWNLOAD_ALLOWANCE.allowedRedirectHosts).toEqual(['us.aws.cdn.hf.co']);
    expect(SPEECH_DOWNLOAD_ALLOWANCE.allowedHosts).toEqual(['huggingface.co']);
    expect(CDN).not.toBe('');
  });
});

describe('downloadWithResume', () => {
  /** Case 1: the ordinary case, end to end. */
  it('downloads to a .part file and leaves the real name alone until it is committed', async () => {
    const target = destination();
    const { fetchImpl, calls } = scripted({ status: 200 });

    const result = await downloadWithResume({
      url: URL,
      destination: target,
      checksum: 'pin-1',
      ...ALLOWANCE,
      fetchImpl,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(URL);
    expect(calls[0]?.headers).toEqual({});
    expect(result.bytes).toBe(CONTENT.length);
    expect(result.resumedFromBytes).toBe(0);
    expect(() => statSync(target)).toThrow();
    expect(readFileSync(partPathFor(target))).toEqual(CONTENT);

    await commitDownload(target);
    expect(readFileSync(target)).toEqual(CONTENT);
    expect(readSidecar(target)).toBeNull();
  });

  /** Case 1's other half: the receipt, which the caller writes after verifying. */
  it('leaves a receipt for the committed file and no receipt for the part', async () => {
    const target = destination();
    const { createHash } = await import('node:crypto');
    const digest = createHash('sha256').update(CONTENT).digest('hex');

    await downloadWithResume({
      url: URL,
      destination: target,
      checksum: 'pin-1',
      ...ALLOWANCE,
      fetchImpl: fakeServer().fetchImpl,
    });
    const verification = await verifyFile(partPathFor(target), { sha256: digest });
    expect(verification.ok).toBe(true);
    await commitDownload(target);

    // No receipt yet: nothing has claimed this file.
    expect(existsSync(receiptPathFor(target))).toBe(false);
    writeReceipt(target, {
      filename: 'model.bin',
      algorithm: 'sha256',
      digest,
      sizeBytes: CONTENT.length,
      mtimeMs: Math.floor(statSync(target).mtimeMs),
      dev: statSync(target).dev,
      ino: statSync(target).ino,
    });
    expect(existsSync(receiptPathFor(target))).toBe(true);
  });

  it('resumes: asks for the rest, appends it, and ends up byte-identical', async () => {
    const target = destination();

    // Simulate a run that was killed after 100 bytes.
    const server = fakeServer();
    await downloadWithResume({
      url: URL,
      destination: target,
      checksum: 'pin-1',
      ...ALLOWANCE,
      fetchImpl: fakeServer({ truncateAfter: 100 }).fetchImpl,
    });
    expect(statSync(partPathFor(target)).size).toBe(100);

    const second = await downloadWithResume({
      url: URL,
      destination: target,
      checksum: 'pin-1',
      ...ALLOWANCE,
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
      ...ALLOWANCE,
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
      ...ALLOWANCE,
      fetchImpl: server.fetchImpl,
    });

    const again = await downloadWithResume({
      url: URL,
      destination: target,
      checksum: 'pin-1',
      ...ALLOWANCE,
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
      ...ALLOWANCE,
      fetchImpl: fakeServer({ truncateAfter: 100 }).fetchImpl,
    });

    const server = fakeServer();
    const result = await downloadWithResume({
      url: URL,
      destination: target,
      checksum: 'pin-2',
      ...ALLOWANCE,
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
      ...ALLOWANCE,
      fetchImpl: fakeServer({ truncateAfter: 100 }).fetchImpl,
    });

    const seen: { completedBytes: number; totalBytes: number | null; resumedFromBytes: number }[] = [];
    await downloadWithResume({
      url: URL,
      destination: target,
      checksum: 'pin-1',
      ...ALLOWANCE,
      fetchImpl: fakeServer().fetchImpl,
      progressIntervalMs: 0,
      onProgress: (progress) => seen.push(progress),
    });

    expect(seen[0]?.completedBytes).toBe(100);
    expect(seen[0]?.resumedFromBytes).toBe(100);
    // `content-length` on a 206 is the length of the range, not of the file.
    for (const progress of seen) expect(progress.totalBytes).toBe(CONTENT.length);
  });

  it('turns a refused HTTP status into a download failure, not a stack trace', async () => {
    const target = destination();
    const failing = (() => Promise.resolve(new Response('nope', { status: 503 }))) as unknown as typeof fetch;
    await expect(
      downloadWithResume({
        url: URL,
        destination: target,
        checksum: null,
        ...ALLOWANCE,
        fetchImpl: failing,
      }),
    ).rejects.toMatchObject({ name: 'SetupError', code: 'download_failed' });
  });
});

/**
 * The redirect rules, each one as a refusal that happens **before** the request
 * it refuses. Every case here counts the requests the fake `fetch` received: a
 * guard that refused after asking would still look correct from the error
 * alone.
 */
describe('before a single request is made', () => {
  /** Case 3: a `Location` on a host nobody admitted. */
  it('refuses a redirect to an unlisted host, and never requests it', async () => {
    for (const host of ['us.aws.cdn.hf.co.evil.test', 'elsewhere.example.invalid']) {
      const target = destination();
      const { fetchImpl, calls } = scripted({ status: 302, location: `https://${host}/model.bin` });

      await expect(
        downloadWithResume({
          url: URL,
          destination: target,
          checksum: null,
          ...ALLOWANCE,
          fetchImpl,
        }),
      ).rejects.toMatchObject({ name: 'RequestRefusedError', refusal: 'host_not_allowed' });

      expect(calls).toHaveLength(1);
      expect(calls.some((call) => call.url.includes(host))).toBe(false);
    }
  });

  /** Case 4: a downgrade. */
  it('refuses an http: redirect and puts the exact Location in the message', async () => {
    const target = destination();
    const location = 'http://us.aws.cdn.hf.co/model.bin';
    const { fetchImpl, calls } = scripted({ status: 302, location });

    const failure = await downloadWithResume({
      url: URL,
      destination: target,
      checksum: null,
      ...ALLOWANCE,
      fetchImpl,
    }).catch((error: unknown) => error);

    expect(failure).toMatchObject({ name: 'RequestRefusedError', refusal: 'scheme_not_https' });
    expect((failure as Error).message).toContain(location);
    expect(calls).toHaveLength(1);
  });

  /** Case 5: credentials in the address are credentials Apunta would send. */
  it('refuses a user-info URL with no request at all', async () => {
    const target = destination();
    const { fetchImpl, calls } = scripted({ status: 200 });

    await expect(
      downloadWithResume({
        url: 'https://someone:secret@huggingface.co/x/y.bin',
        destination: target,
        checksum: null,
        ...ALLOWANCE,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ name: 'RequestRefusedError', refusal: 'user_info_present' });
    expect(calls).toEqual([]);
  });

  /** Case 6: a port is a destination. */
  it('refuses port 8443 with no request at all', async () => {
    const target = destination();
    const { fetchImpl, calls } = scripted({ status: 200 });

    await expect(
      downloadWithResume({
        url: 'https://huggingface.co:8443/x/y.bin',
        destination: target,
        checksum: null,
        ...ALLOWANCE,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ name: 'RequestRefusedError', refusal: 'port_not_allowed' });
    expect(calls).toEqual([]);
  });

  it('allows an explicit 443, because that is the scheme default written out', () => {
    expect(() => {
      assertRequestAllowed({
        url: 'https://huggingface.co:443/x/y.bin',
        allowance: SPEECH_DOWNLOAD_ALLOWANCE,
        allowedQueryKeys: A07_ALLOWED_QUERY_KEYS,
        redirect: false,
      });
    }).not.toThrow();
  });

  /** Case 7: a fragment is never sent to a server, so its presence is a smell. */
  it('refuses a fragment in the URL with no request at all', async () => {
    const target = destination();
    const { fetchImpl, calls } = scripted({ status: 200 });

    await expect(
      downloadWithResume({
        url: 'https://huggingface.co/x/y.bin#section',
        destination: target,
        checksum: null,
        ...ALLOWANCE,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ name: 'RequestRefusedError', refusal: 'fragment_present' });
    expect(calls).toEqual([]);
  });

  /**
   * Case 8: a row whose manifest cell says `none`.
   *
   * Every row of `ACQUISITION.md` except A07 admits no query at all, and this is
   * that default: no names, so no query, whatever it carries.
   */
  it('refuses any query on an artifact that admits none, with no request at all', async () => {
    const target = destination();
    const { fetchImpl, calls } = scripted({ status: 200 });

    await expect(
      downloadWithResume({
        url: 'https://huggingface.co/x/y.bin?anything=at-all',
        destination: target,
        checksum: null,
        allowance: SPEECH_DOWNLOAD_ALLOWANCE,
        allowedQueryKeys: [],
        fetchImpl,
      }),
    ).rejects.toMatchObject({ name: 'RequestRefusedError', refusal: 'query_not_allowed' });
    expect(calls).toEqual([]);
  });

  /** Case 8b: the enumeration is the whole of the permission. */
  it('refuses a query carrying one name outside the list, naming it and not its value', async () => {
    const target = destination();
    const { fetchImpl, calls } = scripted({ status: 200 });

    const failure = await downloadWithResume({
      url: 'https://huggingface.co/x/y.bin?Expires=1&extra=never-shown',
      destination: target,
      checksum: null,
      ...ALLOWANCE,
      fetchImpl,
    }).catch((error: unknown) => error);

    expect(failure).toMatchObject({ name: 'RequestRefusedError', refusal: 'query_key_not_allowed' });
    expect((failure as Error).message).toContain('extra');
    expect((failure as Error).message).not.toContain('never-shown');
    expect(calls).toEqual([]);
  });

  it('refuses a name that differs only in case, because a signed URL is case-sensitive', () => {
    for (const name of ['expires', 'EXPIRES', 'Sign', 'Policy2', 'user_id2']) {
      expect(() => {
        assertRequestAllowed({
          url: `https://huggingface.co/x/y.bin?${name}=1`,
          allowance: SPEECH_DOWNLOAD_ALLOWANCE,
          allowedQueryKeys: A07_ALLOWED_QUERY_KEYS,
          redirect: false,
        });
      }, name).toThrow(RequestRefusedError);
    }
  });

  it('refuses an off-list name on a redirect Location too, without requesting it', async () => {
    const target = destination();
    const { fetchImpl, calls } = scripted({
      status: 302,
      location: `https://${CDN}/model.bin?Expires=1&SessionToken=never-shown`,
    });

    const failure = await downloadWithResume({
      url: URL,
      destination: target,
      checksum: null,
      ...ALLOWANCE,
      fetchImpl,
    }).catch((error: unknown) => error);

    expect(failure).toMatchObject({ refusal: 'query_key_not_allowed' });
    expect((failure as Error).message).toContain('SessionToken');
    expect((failure as Error).message).not.toContain('never-shown');
    expect(calls).toHaveLength(1);
    expect(calls.every((call) => call.url === URL)).toBe(true);
  });

  it('admits every name the manifest enumerates, and nothing else', () => {
    for (const name of A07_ALLOWED_QUERY_KEYS) {
      expect(() => {
        assertRequestAllowed({
          url: `https://huggingface.co/x/y.bin?${name}=1`,
          allowance: SPEECH_DOWNLOAD_ALLOWANCE,
          allowedQueryKeys: A07_ALLOWED_QUERY_KEYS,
          redirect: false,
        });
      }, name).not.toThrow();
    }
    // The whole signed set together, which is the shape the CDN actually sends.
    expect(() => {
      assertRequestAllowed({
        url: `https://huggingface.co/x/y.bin?${A07_ALLOWED_QUERY_KEYS.map((name) => `${name}=v`).join('&')}`,
        allowance: SPEECH_DOWNLOAD_ALLOWANCE,
        allowedQueryKeys: A07_ALLOWED_QUERY_KEYS,
        redirect: false,
      });
    }).not.toThrow();
  });

  it('has a refusal code for every way a request can be turned down', () => {
    expect([...REQUEST_REFUSAL_CODES]).toEqual([
      'scheme_not_https',
      'port_not_allowed',
      'user_info_present',
      'fragment_present',
      'query_not_allowed',
      'query_key_not_allowed',
      'host_not_allowed',
      'too_many_hops',
      'redirect_loop',
    ]);
  });
});

describe('following a redirect', () => {
  /** Case 2: the vendor's own behaviour, on the host the probe admitted. */
  it('follows an admitted redirect, byte for byte, carrying no header of its own', async () => {
    const target = destination();
    const signed = `https://${CDN}/xet-bridge/abc/123?Expires=1&Policy=p&Signature=s`;
    const { fetchImpl, calls } = scripted({ status: 302, location: signed }, { status: 200 });

    const result = await downloadWithResume({
      url: URL,
      destination: target,
      checksum: null,
      ...ALLOWANCE,
      fetchImpl,
    });

    expect(calls.map((call) => call.url)).toEqual([URL, signed]);
    expect(result.bytes).toBe(CONTENT.length);
    expect(readFileSync(partPathFor(target))).toEqual(CONTENT);
    // The admitted query survives admission unchanged — the guard decides, it
    // does not rewrite. (`URL` is this file's name for the pinned address, so
    // the comparison is on the text rather than through the URL class.)
    expect(calls[1]?.url.split('?')[1]).toBe(signed.split('?')[1]);
    // Case 12: the only header the downloader ever sends is `Range`, and only
    // on the initial request.
    expect(calls[1]?.headers).toEqual({});
  });

  /** Case 9: a `Location` back to somewhere this download already went. */
  it('refuses a redirect loop and never requests the repeated URL twice', async () => {
    const target = destination();
    const loop = `https://${CDN}/xet-bridge/abc/loop`;
    const { fetchImpl, calls } = scripted(
      { status: 302, location: loop },
      { status: 302, location: loop },
      { status: 200 },
    );

    await expect(
      downloadWithResume({
        url: URL,
        destination: target,
        checksum: null,
        ...ALLOWANCE,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ name: 'RequestRefusedError', refusal: 'redirect_loop' });

    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call.url)).toEqual([URL, loop]);
  });

  /** Case 10: the success boundary. */
  it('follows five hops and commits the file', async () => {
    const target = destination();
    const hops = Array.from({ length: 5 }, (_unused, index) => `https://${CDN}/hop/${String(index)}`);
    const { fetchImpl, calls } = scripted(...hops.map((location) => ({ status: 302, location })), {
      status: 200,
    });

    const result = await downloadWithResume({
      url: URL,
      destination: target,
      checksum: null,
      ...ALLOWANCE,
      fetchImpl,
    });

    expect(calls).toHaveLength(6);
    expect(calls.map((call) => call.url)).toEqual([URL, ...hops]);
    expect(result.bytes).toBe(CONTENT.length);

    await commitDownload(target);
    expect(readFileSync(target)).toEqual(CONTENT);
  });

  /** Case 11: one hop too many, refused before it is requested. */
  it('refuses a sixth hop and never requests the address it named', async () => {
    const target = destination();
    const hops = Array.from({ length: 6 }, (_unused, index) => `https://${CDN}/hop/${String(index)}`);
    const { fetchImpl, calls } = scripted(...hops.map((location) => ({ status: 302, location })), {
      status: 200,
    });

    await expect(
      downloadWithResume({
        url: URL,
        destination: target,
        checksum: null,
        ...ALLOWANCE,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ name: 'RequestRefusedError', refusal: 'too_many_hops' });

    expect(calls).toHaveLength(6);
    expect(calls.some((call) => call.url === hops[5])).toBe(false);
  });

  /** Case 12: the header rule, on a resumed download that meets a redirect. */
  it('sends Range to the first host only, and re-requests the whole file at the new one', async () => {
    const target = destination();
    // A previous run left 100 bytes and a sidecar that describes them.
    writeFileSync(partPathFor(target), CONTENT.subarray(0, 100));
    writeSidecar(target, {
      url: URL,
      expectedBytes: CONTENT.length,
      downloadedBytes: 100,
      checksum: 'pin-1',
    });

    const signed = `https://${CDN}/xet-bridge/abc/123?Policy=p`;
    const { fetchImpl, calls } = scripted({ status: 302, location: signed }, { status: 200 });

    const result = await downloadWithResume({
      url: URL,
      destination: target,
      checksum: 'pin-1',
      ...ALLOWANCE,
      fetchImpl,
    });

    expect(calls[0]?.headers).toEqual({ range: 'bytes=100-' });
    // The redirect hop asks for nothing: a host that was never offered the
    // whole of the file cannot be asked for its tail.
    expect(calls[1]?.headers).toEqual({});
    // And the bytes the old host had are gone rather than appended to.
    expect(readFileSync(partPathFor(target))).toEqual(CONTENT);
    expect(result.resumedFromBytes).toBe(0);
    expect(result.plan).toMatchObject({ mode: 'fresh' });
  });

  /**
   * A relative `Location` is resolved against the address that produced it,
   * which means a same-host redirect lands back on the *initial* host — and the
   * initial host is not in the redirect list. That is the rule working, not a
   * gap: only the host the probe observed for this artifact is admitted for a
   * hop, and it is not this one.
   */
  it('resolves a relative Location against the current URL, then refuses its host', async () => {
    const target = destination();
    const { fetchImpl, calls } = scripted({ status: 302, location: '/elsewhere/model.bin' }, { status: 200 });

    const failure = await downloadWithResume({
      url: URL,
      destination: target,
      checksum: null,
      ...ALLOWANCE,
      fetchImpl,
    }).catch((error: unknown) => error);

    expect(failure).toMatchObject({ refusal: 'host_not_allowed' });
    expect((failure as Error).message).toContain('https://huggingface.co/elsewhere/model.bin');
    // The one request that was made is the initial one, and nothing else.
    expect(calls.map((call) => call.url)).toEqual([URL]);
  });
});

describe('verify, then commit or discard', () => {
  it('commits a file whose checksum matches', async () => {
    const target = destination();
    await downloadWithResume({
      url: URL,
      destination: target,
      checksum: null,
      ...ALLOWANCE,
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
      ...ALLOWANCE,
      fetchImpl: fakeServer().fetchImpl,
    });

    const verification = await verifyFile(partPathFor(target), { sha1: 'f'.repeat(40) });
    expect(verification.ok).toBe(false);
    expect(verification.algorithm).toBe('sha1');

    await discardDownload(target);
    expect(() => statSync(partPathFor(target))).toThrow();
    expect(readSidecar(target)).toBeNull();
  });

  /** Case 13: a discard takes the receipt with it. */
  it('leaves neither a part file nor a receipt behind after a discard', async () => {
    const target = destination();
    await downloadWithResume({
      url: URL,
      destination: target,
      checksum: null,
      ...ALLOWANCE,
      fetchImpl: fakeServer().fetchImpl,
    });
    writeReceipt(target, {
      filename: 'model.bin',
      algorithm: 'sha256',
      digest: 'a'.repeat(64),
      sizeBytes: CONTENT.length,
      mtimeMs: 0,
      dev: 0,
      ino: 0,
    });

    await discardDownload(target);

    expect(() => statSync(partPathFor(target))).toThrow();
    expect(existsSync(receiptPathFor(target))).toBe(false);
  });
});

/** Case 14: interrupted and resumed, through to a committed file and a receipt. */
describe('an interrupted download, resumed', () => {
  it('asks for the rest, gets 206, appends, verifies, commits and records a receipt', async () => {
    const target = destination();
    const first = await downloadWithResume({
      url: URL,
      destination: target,
      checksum: 'pin-1',
      ...ALLOWANCE,
      fetchImpl: fakeServer({ truncateAfter: 100 }).fetchImpl,
    });
    expect(first.bytes).toBe(100);

    const server = fakeServer();
    const second = await downloadWithResume({
      url: URL,
      destination: target,
      checksum: 'pin-1',
      ...ALLOWANCE,
      fetchImpl: server.fetchImpl,
    });
    expect(server.ranges).toEqual(['bytes=100-']);
    expect(second.plan).toEqual({ mode: 'resume', offset: 100 });

    const { createHash } = await import('node:crypto');
    const digest = createHash('sha256').update(CONTENT).digest('hex');
    const verification = await verifyFile(partPathFor(target), { sha256: digest });
    expect(verification.ok).toBe(true);

    await commitDownload(target);
    const stat = statSync(target);
    writeReceipt(target, {
      filename: 'model.bin',
      algorithm: 'sha256',
      digest,
      sizeBytes: stat.size,
      mtimeMs: Math.floor(stat.mtimeMs),
      dev: stat.dev,
      ino: stat.ino,
    });

    expect(readFileSync(target)).toEqual(CONTENT);
    expect(existsSync(receiptPathFor(target))).toBe(true);
  });
});
