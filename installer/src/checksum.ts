import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

/**
 * Checking that what arrived is what was published.
 *
 * Two hashes, for one honest reason: whisper.cpp publishes **SHA-1 only** for
 * `ggml-large-v3-turbo-q5_0.bin`, so SHA-1 is what can be checked against
 * upstream on the first download. SHA-1 is a weak hash for a 574 MB file, so
 * `docs/MANUAL-VERIFICATION.md` carries a row: compute the SHA-256 once on the
 * Mac after the SHA-1 matches, pin it in `catalog.ts`, and from then on both
 * are checked. The SHA-256 will be **Apunta's**, not upstream's, and the
 * licences document says so.
 */

export type ChecksumAlgorithm = 'sha1' | 'sha256';

export interface ExpectedChecksums {
  readonly sha1?: string | null;
  readonly sha256?: string | null;
}

export interface ChecksumResult {
  readonly ok: boolean;
  /** Which algorithms were actually checked. Empty means none was pinned. */
  readonly checked: ChecksumAlgorithm[];
  readonly algorithm?: ChecksumAlgorithm;
  readonly expected?: string;
  readonly actual?: string;
}

export async function hashFile(
  path: string,
  algorithm: ChecksumAlgorithm,
  signal?: AbortSignal,
): Promise<string> {
  const hash = createHash(algorithm);
  const stream = signal === undefined ? createReadStream(path) : createReadStream(path, { signal });
  for await (const chunk of stream) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

/** Case-insensitive, because published hashes come in both cases. */
export function matches(expected: string, actual: string): boolean {
  return expected.trim().toLowerCase() === actual.trim().toLowerCase();
}

/**
 * Verify a file against whatever is pinned for it.
 *
 * Both hashes when both are pinned: a file that matches SHA-1 and not SHA-256
 * is a file worth refusing loudly. No hash pinned is reported as `checked: []`
 * rather than as a pass, so a catalogue entry that forgot its checksum cannot
 * masquerade as a verified download.
 */
export async function verifyFile(
  path: string,
  expected: ExpectedChecksums,
  signal?: AbortSignal,
): Promise<ChecksumResult> {
  const checked: ChecksumAlgorithm[] = [];
  for (const algorithm of ['sha256', 'sha1'] as const) {
    const want = expected[algorithm];
    if (typeof want !== 'string' || want === '') continue;
    checked.push(algorithm);
    const actual = await hashFile(path, algorithm, signal);
    if (!matches(want, actual)) {
      return { ok: false, checked, algorithm, expected: want, actual };
    }
  }
  return { ok: checked.length > 0, checked };
}
