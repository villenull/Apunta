import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import type { DownloadAllowance } from './catalog.js';
import { setupError } from './errors.js';
import { assertRequestAllowed, clearReceipt, MAX_REDIRECT_HOPS, RequestRefusedError } from './readiness.js';
import {
  clearSidecar,
  partBytes,
  partPathFor,
  planResume,
  readSidecar,
  writeSidecar,
  type ResumePlan,
} from './resume.js';

/**
 * One resumable, verifiable download.
 *
 * The shape is deliberately boring: fetch, append to `<file>.part`, keep a
 * sidecar saying what that file is, and only rename it into place once a
 * checksum has passed. Every interesting decision — whether to resume, and from
 * where — lives in `resume.ts` as a pure function, and is tested there.
 *
 * What is *not* boring, and is the reason for the branching below: a server
 * that ignores `Range` answers 200 with the whole file, and appending that to
 * a half-finished file produces a corrupt one of plausible length. So a 200 in
 * response to a `Range` request truncates and starts over, and only a 206
 * appends.
 *
 * **Redirects are followed by hand, one at a time.** `redirect: 'manual'` and a
 * loop: each `Location` is resolved, checked against the artifact's own
 * allowance, and only then requested. The runtime's own redirect following is
 * the wrong thing twice over — it would follow a `Location` to any host at all,
 * and it would carry the `Range` header along with it, asking a CDN for a range
 * it was never offered the whole of. Here the initial request is the only one
 * that carries a header, and a redirect hop restarts from byte 0.
 */

export interface DownloadOptions {
  readonly url: string;
  /** Final path. The download lives at `<destination>.part` until verified. */
  readonly destination: string;
  /** Pinned checksum, used to invalidate a stale `.part` from an older pin. */
  readonly checksum: string | null;
  /**
   * The allowance for the artifact being fetched. Required, and not a global
   * list, so rule 2 is decided per artifact.
   */
  readonly allowance: DownloadAllowance;
  /**
   * The artifact's enumerated query parameter names. Empty means no query is
   * admitted at all. Only names are ever tested; a value is never read.
   */
  readonly allowedQueryKeys: readonly string[];
  readonly signal?: AbortSignal | undefined;
  readonly fetchImpl?: typeof fetch;
  readonly onProgress?: (progress: DownloadProgress) => void;
  /** Progress is reported no more often than this. Tests set it to 0. */
  readonly progressIntervalMs?: number;
  readonly now?: () => number;
}

export interface DownloadProgress {
  readonly completedBytes: number;
  readonly totalBytes: number | null;
  readonly resumedFromBytes: number;
  readonly elapsedMs: number;
}

export interface DownloadResult {
  /** Bytes in the `.part` file when the transfer finished. */
  readonly bytes: number;
  readonly resumedFromBytes: number;
  /** How the transfer started, for the log line and for the tests. */
  readonly plan: ResumePlan;
}

const DEFAULT_PROGRESS_INTERVAL_MS = 250;

/**
 * Download `url` into `<destination>.part`, resuming when that is safe.
 *
 * Does **not** rename into place — the caller verifies the checksum first and
 * calls `commitDownload`. Splitting it that way is what makes "a corrupted
 * file" a recoverable state rather than a file the app will try to load.
 */
export async function downloadWithResume(options: DownloadOptions): Promise<DownloadResult> {
  // The initial request is checked before anything is written and before any
  // socket opens, exactly as every `Location` is.
  const initial = assertRequestAllowed({
    url: options.url,
    allowance: options.allowance,
    allowedQueryKeys: options.allowedQueryKeys,
    redirect: false,
  });

  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const interval = options.progressIntervalMs ?? DEFAULT_PROGRESS_INTERVAL_MS;
  const part = partPathFor(options.destination);

  await mkdir(dirname(options.destination), { recursive: true, mode: 0o700 });

  const plan = planResume({
    sidecar: readSidecar(options.destination),
    partBytes: partBytes(options.destination),
    url: options.url,
    checksum: options.checksum,
  });

  if (plan.mode === 'complete') {
    return { bytes: plan.bytes, resumedFromBytes: plan.bytes, plan };
  }

  const offset = plan.mode === 'resume' ? plan.offset : 0;
  const requested = new Set<string>([initial.href]);
  let current = initial;
  let hop = 0;

  for (;;) {
    // The `Range` header goes to the first host and to no other: a redirect
    // hop carries no header at all, so a resumed download that meets a
    // redirect restarts from byte 0 at the new host rather than asking it for
    // a range it was never offered the whole of.
    const headers: Record<string, string> = {};
    if (hop === 0 && offset > 0) headers['range'] = `bytes=${String(offset)}-`;

    const response = await fetchImpl(current.href, {
      headers,
      redirect: 'manual',
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });

    const location = response.headers.get('location');
    if (location !== null && isRedirect(response.status)) {
      if (hop >= MAX_REDIRECT_HOPS) {
        throw new RequestRefusedError(
          'too_many_hops',
          `Refused to follow a ${String(hop + 1)}th redirect: at most ${String(MAX_REDIRECT_HOPS)} ` +
            'are followed, and the address it named was never requested',
        );
      }
      const next = assertRequestAllowed({
        url: new URL(location, current).href,
        allowance: options.allowance,
        allowedQueryKeys: options.allowedQueryKeys,
        redirect: true,
      });
      if (requested.has(next.href)) {
        throw new RequestRefusedError(
          'redirect_loop',
          'Refused to follow a redirect back to an address this download already requested',
        );
      }
      requested.add(next.href);
      current = next;
      hop += 1;
      continue;
    }

    return await receive({
      options,
      part,
      response,
      plan,
      offset: hop === 0 ? offset : 0,
      restart: hop > 0 && offset > 0,
      now,
      interval,
    });
  }
}

/** Statuses that carry a `Location` to be followed rather than a body to read. */
function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

interface ReceiveInput {
  readonly options: DownloadOptions;
  readonly part: string;
  readonly response: Response;
  /** The decision `planResume` reached, reported back to the caller. */
  readonly plan: ResumePlan;
  /** Bytes to resume from, or 0 when this hop restarts the transfer. */
  readonly offset: number;
  /** True when a redirect has already invalidated what is on disk. */
  readonly restart: boolean;
  readonly now: () => number;
  readonly interval: number;
}

/** The last hop: check the status, stream the body, keep the sidecar honest. */
async function receive(input: ReceiveInput): Promise<DownloadResult> {
  const { options, part, response, now, interval } = input;
  const { destination } = options;
  const url = options.url;

  // 416 means the server thinks we already have all of it. Fall back to a
  // clean download rather than guessing which of us is right.
  if (response.status === 416) {
    await rm(part, { force: true });
    clearSidecar(destination);
    throw setupError('download_failed', `range request rejected for ${url}`);
  }
  if (!response.ok) {
    throw setupError('download_failed', `HTTP ${String(response.status)} for ${url}`);
  }
  if (response.body === null) {
    throw setupError('download_failed', `no response body for ${url}`);
  }

  // A server that ignored `Range` answers 200 with the whole file.
  const appending = input.offset > 0 && response.status === 206;
  const startBytes = appending ? input.offset : 0;
  if (!appending && (input.offset > 0 || input.restart)) {
    await rm(part, { force: true });
  }

  const totalBytes = totalFrom(response, startBytes);
  writeSidecar(destination, {
    url,
    expectedBytes: totalBytes,
    downloadedBytes: startBytes,
    checksum: options.checksum,
  });

  const startedAt = now();
  let completedBytes = startBytes;
  let lastReport = 0;

  const report = (force: boolean): void => {
    if (options.onProgress === undefined) return;
    const elapsedMs = now() - startedAt;
    if (!force && elapsedMs - lastReport < interval) return;
    lastReport = elapsedMs;
    options.onProgress({ completedBytes, totalBytes, resumedFromBytes: startBytes, elapsedMs });
  };
  report(true);

  const source = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
  source.on('data', (chunk: Buffer) => {
    completedBytes += chunk.length;
    report(false);
  });

  const sink = createWriteStream(part, { flags: appending ? 'a' : 'w', mode: 0o600 });
  try {
    await pipeline(source, sink, ...(options.signal === undefined ? [] : [{ signal: options.signal }]));
  } catch (error) {
    // Whatever arrived is kept: the sidecar records where to pick up from, and
    // "trying again continues rather than starting over" is a promise the
    // failure copy makes.
    const written = await sizeOf(part);
    writeSidecar(destination, {
      url,
      expectedBytes: totalBytes,
      downloadedBytes: written,
      checksum: options.checksum,
    });
    throw error;
  }

  completedBytes = await sizeOf(part);
  report(true);
  writeSidecar(destination, {
    url,
    expectedBytes: totalBytes,
    downloadedBytes: completedBytes,
    checksum: options.checksum,
  });

  return {
    bytes: completedBytes,
    resumedFromBytes: startBytes,
    // A redirect that arrived after a partial transfer has already thrown those
    // bytes away, so reporting "resumed" would be a lie about the bytes.
    plan: input.restart
      ? {
          mode: 'fresh',
          reason: 'the address redirected, so the transfer starts again from the beginning',
        }
      : input.plan,
  };
}

/**
 * Move the verified `.part` into place and forget the bookkeeping.
 *
 * The receipt goes with it, for the same reason the sidecar does: a receipt
 * describes one file, and the file it described is not the file now at this
 * name. The caller writes the new receipt after verifying what it just moved.
 */
export async function commitDownload(destination: string): Promise<void> {
  await rename(partPathFor(destination), destination);
  clearSidecar(destination);
  clearReceipt(destination);
}

/**
 * Throw away a download that failed its checksum, so a retry starts clean.
 *
 * The receipt goes with the file, for the same reason the old `.part` does: a
 * receipt that outlived its file would vouch for bytes that are no longer
 * there.
 */
export async function discardDownload(destination: string): Promise<void> {
  await rm(partPathFor(destination), { force: true });
  clearSidecar(destination);
  clearReceipt(destination);
}

/**
 * Total size of the whole file.
 *
 * On a 206 the length in `Content-Length` is the length of the *range*, so the
 * total is that plus what we already had; `Content-Range` carries the real
 * total when it is present and is preferred.
 */
function totalFrom(response: Response, startBytes: number): number | null {
  const contentRange = response.headers.get('content-range');
  if (contentRange !== null) {
    const slash = contentRange.lastIndexOf('/');
    if (slash !== -1) {
      const total = Number(contentRange.slice(slash + 1));
      if (Number.isFinite(total) && total > 0) return total;
    }
  }
  const length = response.headers.get('content-length');
  if (length === null) return null;
  const value = Number(length);
  if (!Number.isFinite(value) || value < 0) return null;
  return value + startBytes;
}

async function sizeOf(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}
