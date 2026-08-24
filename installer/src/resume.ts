import { readFileSync, statSync, writeFileSync, rmSync } from 'node:fs';

/**
 * Picking up a half-finished download.
 *
 * "Kill the app mid-download, relaunch, and confirm the download resumes" is
 * an acceptance criterion, and getting it wrong is silent: a resume that
 * appends to the wrong file produces a 574 MB file of the right length whose
 * middle is garbage, and the only thing that catches it is the checksum at the
 * end — after another twenty minutes.
 *
 * So the decision is a pure function over three inputs (what the sidecar
 * claims, what is actually on disk, and what the catalogue expects) and the
 * rule is: **the file on disk is the truth about length; the sidecar is the
 * truth about identity.** Anything that does not line up starts again, because
 * re-downloading is merely slow and appending to the wrong bytes is wrong.
 */

/** Written next to `<file>.part`, so a relaunch knows what it was downloading. */
export interface ResumeSidecar {
  readonly url: string;
  /** `Content-Length` from the first response, or null if it never said. */
  readonly expectedBytes: number | null;
  /** Bytes the previous run believed it had written. Advisory only. */
  readonly downloadedBytes: number;
  /** The catalogue's checksum at the time, so a re-pinned file starts over. */
  readonly checksum: string | null;
}

export const SidecarSuffix = '.resume.json';

export type ResumePlan =
  | { readonly mode: 'fresh'; readonly reason: string }
  | { readonly mode: 'resume'; readonly offset: number }
  | { readonly mode: 'complete'; readonly bytes: number };

export interface ResumeInput {
  /** Null when there is no sidecar, or it could not be read. */
  readonly sidecar: ResumeSidecar | null;
  /** Size of the `.part` file, or null when there isn't one. */
  readonly partBytes: number | null;
  /** The URL we are about to fetch. */
  readonly url: string;
  /** The checksum currently pinned for this file. */
  readonly checksum: string | null;
}

export function planResume(input: ResumeInput): ResumePlan {
  const { sidecar, partBytes, url, checksum } = input;

  if (partBytes === null || partBytes === 0) {
    return { mode: 'fresh', reason: 'nothing has been downloaded yet' };
  }
  if (sidecar === null) {
    // Bytes with no record of where they came from. They could be anything.
    return { mode: 'fresh', reason: 'the record of the previous download is missing' };
  }
  if (sidecar.url !== url) {
    return { mode: 'fresh', reason: 'the download address changed since last time' };
  }
  if (sidecar.checksum !== checksum) {
    return { mode: 'fresh', reason: 'the expected file changed since last time' };
  }
  if (sidecar.expectedBytes !== null && partBytes > sidecar.expectedBytes) {
    // Longer than the whole file. Something else wrote to it.
    return { mode: 'fresh', reason: 'the partly-downloaded file is the wrong size' };
  }
  if (sidecar.expectedBytes !== null && partBytes === sidecar.expectedBytes) {
    return { mode: 'complete', bytes: partBytes };
  }
  return { mode: 'resume', offset: partBytes };
}

/** `<destination>.part` — where a download lives until it has been verified. */
export function partPathFor(destination: string): string {
  return `${destination}.part`;
}

export function sidecarPathFor(destination: string): string {
  return `${destination}${SidecarSuffix}`;
}

export function readSidecar(destination: string): ResumeSidecar | null {
  try {
    const raw = readFileSync(sidecarPathFor(destination), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record['url'] !== 'string') return null;
    const expected = record['expectedBytes'];
    const downloaded = record['downloadedBytes'];
    const checksum = record['checksum'];
    return {
      url: record['url'],
      expectedBytes: typeof expected === 'number' ? expected : null,
      downloadedBytes: typeof downloaded === 'number' ? downloaded : 0,
      checksum: typeof checksum === 'string' ? checksum : null,
    };
  } catch {
    return null;
  }
}

export function writeSidecar(destination: string, sidecar: ResumeSidecar): void {
  writeFileSync(sidecarPathFor(destination), `${JSON.stringify(sidecar, null, 2)}\n`, { mode: 0o600 });
}

export function clearSidecar(destination: string): void {
  rmSync(sidecarPathFor(destination), { force: true });
}

/** Size of the `.part` file, or null when there isn't one. */
export function partBytes(destination: string): number | null {
  try {
    return statSync(partPathFor(destination)).size;
  } catch {
    return null;
  }
}
