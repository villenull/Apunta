import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { assertAllowedHost } from './catalog.js';
import { setupError } from './errors.js';
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
 * The shape is deliberately boring: fetch with a `Range` header, append to
 * `<file>.part`, keep a sidecar saying what that file is, and only rename it
 * into place once a checksum has passed. Every interesting decision — whether
 * to resume, and from where — lives in `resume.ts` as a pure function, and is
 * tested there.
 *
 * What is *not* boring, and is the reason for the branching below: a server
 * that ignores `Range` answers 200 with the whole file, and appending that to
 * a half-finished file produces a corrupt one of plausible length. So a 200 in
 * response to a `Range` request truncates and starts over, and only a 206
 * appends.
 */

export interface DownloadOptions {
  readonly url: string;
  /** Final path. The download lives at `<destination>.part` until verified. */
  readonly destination: string;
  /** Pinned checksum, used to invalidate a stale `.part` from an older pin. */
  readonly checksum: string | null;
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
  assertAllowedHost(options.url);

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
  const headers: Record<string, string> = {};
  if (offset > 0) headers['range'] = `bytes=${String(offset)}-`;

  const response = await fetchImpl(options.url, {
    headers,
    redirect: 'follow',
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });

  // 416 means the server thinks we already have all of it. Fall back to a
  // clean download rather than guessing which of us is right.
  if (response.status === 416) {
    await rm(part, { force: true });
    clearSidecar(options.destination);
    throw setupError('download_failed', `range request rejected for ${options.url}`);
  }
  if (!response.ok) {
    throw setupError('download_failed', `HTTP ${String(response.status)} for ${options.url}`);
  }
  if (response.body === null) {
    throw setupError('download_failed', `no response body for ${options.url}`);
  }

  // A server that ignored `Range` answers 200 with the whole file.
  const appending = offset > 0 && response.status === 206;
  const startBytes = appending ? offset : 0;
  if (!appending && offset > 0) {
    await rm(part, { force: true });
  }

  const totalBytes = totalFrom(response, startBytes);
  writeSidecar(options.destination, {
    url: options.url,
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
    writeSidecar(options.destination, {
      url: options.url,
      expectedBytes: totalBytes,
      downloadedBytes: written,
      checksum: options.checksum,
    });
    throw error;
  }

  completedBytes = await sizeOf(part);
  report(true);
  writeSidecar(options.destination, {
    url: options.url,
    expectedBytes: totalBytes,
    downloadedBytes: completedBytes,
    checksum: options.checksum,
  });

  return { bytes: completedBytes, resumedFromBytes: startBytes, plan };
}

/** Move the verified `.part` into place and forget the bookkeeping. */
export async function commitDownload(destination: string): Promise<void> {
  await rename(partPathFor(destination), destination);
  clearSidecar(destination);
}

/** Throw away a download that failed its checksum, so a retry starts clean. */
export async function discardDownload(destination: string): Promise<void> {
  await rm(partPathFor(destination), { force: true });
  clearSidecar(destination);
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
