import { lstatSync, readFileSync, rmSync, statSync, writeFileSync, type Stats } from 'node:fs';

import type { DownloadAllowance } from './catalog.js';
import { hashFile, matches, type ChecksumAlgorithm } from './checksum.js';
import { SetupError } from './errors.js';
import { partPathFor, readSidecar } from './resume.js';

/**
 * What Apunta is allowed to ask for, and whether what it has is the thing it
 * asked for.
 *
 * Two closed vocabularies live here, in one file, on purpose:
 *
 *  - **request refusals** — why a URL is not going to be requested. A refusal
 *    is decided *before* the socket opens, so a rejected URL never leaves the
 *    machine.
 *  - **readiness codes** — why a model file is not the model. `missing` is not
 *    a failure: it is what a first run legitimately looks like.
 *
 * The downloader and the readiness probe both speak these words, so a refusal
 * and the verdict it caused can never drift apart.
 *
 * **Nothing here reads, logs, records or compares a query parameter's value.**
 * A Hugging Face signed URL carries its own signature in the query, and that
 * signature is a secret: it must not reach this repository, the evidence, a log
 * line or an error message. So the *names* are extracted and the *values* are
 * never even materialised — see `queryParameterNames`, which cuts the raw query
 * string at the first `=` of each pair and stops there.
 */

/** The scheme every request must use, named once so no file repeats it. */
const REQUIRED_SCHEME = 'https:';

/** The only port a request may name. Absent means the scheme's default. */
const ALLOWED_PORTS: readonly string[] = ['443'];

/**
 * Hops that may be followed after the initial request.
 *
 * The initial request is hop 0 and is not counted. Hop 5 is the last one that
 * may be requested, so a sixth `Location` is refused before it is requested.
 */
export const MAX_REDIRECT_HOPS = 5;

export const REQUEST_REFUSAL_CODES = [
  'scheme_not_https',
  'port_not_allowed',
  'user_info_present',
  'fragment_present',
  'query_not_allowed',
  'query_key_not_allowed',
  'host_not_allowed',
  'too_many_hops',
  'redirect_loop',
] as const;

export type RequestRefusalCode = (typeof REQUEST_REFUSAL_CODES)[number];

export const READINESS_CODES = [
  'size_mismatch',
  'hash_mismatch',
  'not_a_regular_file',
  'stale_pin',
  'dangling_part',
  'no_pinned_hash',
] as const;

export type ReadinessCode = (typeof READINESS_CODES)[number];

export type ReadinessVerdict =
  | { readonly state: 'missing'; readonly reason: string }
  | {
      readonly state: 'ready';
      readonly reason: string;
      readonly algorithm: ChecksumAlgorithm;
      readonly digest: string;
      /**
       * `receipt` means a receipt already vouched for this file and no hash was
       * computed. `hashed` means the file was hashed once, just now, and the
       * digest is the one a receipt should record.
       */
      readonly proof: 'receipt' | 'hashed';
    }
  | { readonly state: 'invalid'; readonly code: ReadinessCode; readonly reason: string };

/**
 * A URL safe to put in a message, a log or an error.
 *
 * A refused URL is exactly the URL most likely to carry something secret: a
 * signed query, a token in the user-info, a fragment. So the rendering keeps
 * the scheme, the host, the port and the path — the facts a refusal has to
 * name — and replaces the query with a marker. Nothing is decoded, so a
 * percent-encoded secret cannot reappear.
 */
export function safeUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return '(not a URL at all)';
  }
  const port = parsed.port === '' ? '' : `:${parsed.port}`;
  const query = parsed.search === '' ? '' : '?<redacted>';
  return `${parsed.protocol}//${parsed.hostname}${port}${parsed.pathname}${query}`;
}

/**
 * The parameter *names* of a query string, and never a value.
 *
 * The raw string is split on `&` and each pair is cut at its first `=`; the
 * text after that position is never read, decoded or stored. A pair with no `=`
 * contributes its whole text as a name, because that is precisely the case
 * where a name is all there is and an allow-list still has to be able to
 * refuse it.
 */
export function queryParameterNames(search: string): string[] {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  if (raw === '') return [];
  const names: string[] = [];
  for (const pair of raw.split('&')) {
    if (pair === '') continue;
    const equals = pair.indexOf('=');
    const name = equals === -1 ? pair : pair.slice(0, equals);
    let decoded = name;
    try {
      decoded = decodeURIComponent(name);
    } catch {
      // A malformed escape is left as it arrived: an unreadable name is not a
      // name that can be on a list, so it fails closed below.
    }
    if (!names.includes(decoded)) names.push(decoded);
  }
  return names;
}

/**
 * A refused request, carrying which rule refused it.
 *
 * It is a `SetupError` with code `unexpected` and the refusal as its override,
 * so it surfaces through today's `describeFailure` as a sentence a person can
 * read, with no new error code and nothing added to the JSON-lines protocol —
 * P4.4 is what puts a code on the wire.
 */
export class RequestRefusedError extends SetupError {
  constructor(
    readonly refusal: RequestRefusalCode,
    sentence: string,
  ) {
    super('unexpected', sentence, sentence);
    this.name = 'RequestRefusedError';
  }
}

/**
 * A readiness code raised at a moment when no verdict is being returned.
 *
 * The download path can discover the same facts `assessModel` reports — most
 * of all that a freshly verified file is not the pinned size — and it has to
 * refuse them in the same words, on the same terms: a `SetupError` with code
 * `unexpected` and the sentence as its override, so the window says something
 * true and no code reaches the protocol.
 */
export class ModelRefusedError extends SetupError {
  constructor(
    readonly readiness: ReadinessCode,
    sentence: string,
  ) {
    super('unexpected', sentence, sentence);
    this.name = 'ModelRefusedError';
  }
}

export interface RequestCheck {
  readonly url: string;
  /** The allowance for the artifact being fetched, never a global list. */
  readonly allowance: DownloadAllowance;
  /** The artifact's own *Allowed query keys*, from the manifest row. */
  readonly allowedQueryKeys: readonly string[];
  /** True for every `Location`; false for the initial request. */
  readonly redirect: boolean;
}

/**
 * Rule 1 and rule 2 of C-ACQ@1, applied to one URL, before it is requested.
 *
 * The order is deliberate. Scheme, port, user-info, fragment and host are all
 * decided before the query is looked at at all: a URL on a host Apunta will
 * never contact is refused without a single thing being learned about what its
 * query says.
 */
export function assertRequestAllowed(check: RequestCheck): URL {
  const { url, allowance, allowedQueryKeys, redirect } = check;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new RequestRefusedError('host_not_allowed', `Refused a request: the address is not a URL.`);
  }

  const where = safeUrl(url);
  const which = redirect ? 'a redirect' : 'the download address';

  if (parsed.protocol !== REQUIRED_SCHEME) {
    throw new RequestRefusedError(
      'scheme_not_https',
      `Refused ${which} ${where}: only https: is allowed, and this one names ${parsed.protocol}`,
    );
  }
  if (parsed.port !== '' && !ALLOWED_PORTS.includes(parsed.port)) {
    throw new RequestRefusedError(
      'port_not_allowed',
      `Refused ${which} ${where}: it names port ${parsed.port}, and only 443 is allowed`,
    );
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new RequestRefusedError(
      'user_info_present',
      `Refused ${which} ${where}: it carries a username or password, which Apunta never sends`,
    );
  }
  if (parsed.hash !== '') {
    throw new RequestRefusedError(
      'fragment_present',
      `Refused ${which} ${where}: it carries a fragment, which is never sent to a server anyway`,
    );
  }

  const hosts = redirect ? allowance.allowedRedirectHosts : allowance.allowedHosts;
  if (!hosts.includes(parsed.hostname)) {
    const list = hosts.length === 0 ? 'nothing' : hosts.join(', ');
    throw new RequestRefusedError(
      'host_not_allowed',
      `Refused ${which} ${where}: that host is not on this artifact's list (${list})`,
    );
  }

  if (parsed.search !== '') {
    if (allowedQueryKeys.length === 0) {
      throw new RequestRefusedError(
        'query_not_allowed',
        `Refused ${which} ${where}: it carries a query, and this artifact's list allows no query at all`,
      );
    }
    for (const name of queryParameterNames(parsed.search)) {
      if (allowedQueryKeys.includes(name)) continue;
      throw new RequestRefusedError(
        'query_key_not_allowed',
        `Refused ${which} ${where}: its query carries the parameter "${name}", which is not on this ` +
          'artifact’s list of allowed parameter names',
      );
    }
  }

  return parsed;
}

/** The catalogue fields readiness needs. `SpeechModelEntry` satisfies it. */
export interface ModelSubject {
  readonly filename: string;
  /** The exact pinned size. Rule 5's "size equals the pinned size". */
  readonly sizeBytes: number;
  readonly sha256: string | null;
  readonly sha1: string | null;
  /** The pinned address, for recognising a `.part` sidecar that is ours. */
  readonly url: string;
}

export interface ModelReceipt {
  readonly version: 1;
  readonly filename: string;
  readonly algorithm: ChecksumAlgorithm;
  readonly digest: string;
  readonly sizeBytes: number;
  readonly mtimeMs: number;
  readonly dev: number;
  readonly ino: number;
}

/** The receipt's keys, in the order the file is written. No others are read. */
const RECEIPT_KEYS = [
  'version',
  'filename',
  'algorithm',
  'digest',
  'sizeBytes',
  'mtimeMs',
  'dev',
  'ino',
] as const;

export const RECEIPT_SUFFIX = '.receipt.json';

/** `<destination>.receipt.json`, beside the file it describes. */
export function receiptPathFor(destination: string): string {
  return `${destination}${RECEIPT_SUFFIX}`;
}

/**
 * A receipt, or nothing.
 *
 * Anything unexpected is "no receipt" rather than a failure: a file that will
 * not parse, a version this build does not know, a missing or wrongly-typed
 * field, a key this build does not recognise. The last of those matters most —
 * a receipt with a trailing field is a file from a future build or a different
 * program, and reading it on trust would be reading someone else's claim.
 */
export function readReceipt(destination: string): ModelReceipt | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(receiptPathFor(destination), 'utf8'));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).length !== RECEIPT_KEYS.length) return null;
  for (const key of RECEIPT_KEYS) {
    if (!Object.hasOwn(record, key)) return null;
  }
  if (record['version'] !== 1) return null;
  if (typeof record['filename'] !== 'string') return null;
  if (record['algorithm'] !== 'sha256' && record['algorithm'] !== 'sha1') return null;
  if (typeof record['digest'] !== 'string') return null;
  if (!isSafeInteger(record['sizeBytes'])) return null;
  if (!isSafeInteger(record['mtimeMs'])) return null;
  if (!isSafeInteger(record['dev'])) return null;
  if (!isSafeInteger(record['ino'])) return null;
  return {
    version: 1,
    filename: record['filename'],
    algorithm: record['algorithm'],
    digest: record['digest'],
    sizeBytes: record['sizeBytes'],
    mtimeMs: record['mtimeMs'],
    dev: record['dev'],
    ino: record['ino'],
  };
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

/**
 * Write the receipt, mode `0600`, one object, no other keys.
 *
 * Call this only once the bytes have been verified — either by a fresh hash
 * that matched, or by `commitDownload` renaming a verified `.part` into place.
 * A receipt written before verification is a claim nobody has checked, and the
 * whole point of the file is that somebody did.
 */
export function writeReceipt(destination: string, receipt: Omit<ModelReceipt, 'version'>): ModelReceipt {
  const full: ModelReceipt = { version: 1, ...receipt };
  writeFileSync(receiptPathFor(destination), `${JSON.stringify(full, null, 2)}\n`, { mode: 0o600 });
  return full;
}

/** The receipt that goes with the file at `destination`, as it is right now. */
export function receiptFor(destination: string, subject: ModelSubject): ModelReceipt | null {
  const receipt = readReceipt(destination);
  if (receipt === null) return null;
  if (receipt.filename !== subject.filename) return null;
  if (receipt.sizeBytes !== subject.sizeBytes) return null;
  const algorithm = preferredAlgorithm(subject);
  if (algorithm === null || receipt.algorithm !== algorithm) return null;
  const pinned = pinnedDigest(subject, algorithm);
  if (pinned === null || !matches(pinned, receipt.digest)) return null;
  return receipt;
}

/**
 * The receipt a freshly verified file deserves, from its own `stat`.
 *
 * Refuses to write when the file's size is not the pinned one: a receipt
 * asserts a size, and a receipt that recorded a size the catalogue does not pin
 * would be treated as no receipt on the next run — so the wrong thing to do is
 * write it.
 */
export function writeReceiptFor(
  destination: string,
  subject: ModelSubject,
  digest: string,
): ModelReceipt | null {
  const algorithm = preferredAlgorithm(subject);
  if (algorithm === null) return null;
  const stat = statSync(destination);
  if (stat.size !== subject.sizeBytes) return null;
  return writeReceipt(destination, {
    filename: subject.filename,
    algorithm,
    digest,
    sizeBytes: stat.size,
    mtimeMs: Math.floor(stat.mtimeMs),
    dev: stat.dev,
    ino: stat.ino,
  });
}

/** The receipt goes with the file it described. */
export function clearReceipt(destination: string): void {
  rmSync(receiptPathFor(destination), { force: true });
}

/** sha256 when the entry pins one, sha1 when it does not, null when neither. */
function preferredAlgorithm(subject: ModelSubject): ChecksumAlgorithm | null {
  if (typeof subject.sha256 === 'string' && subject.sha256 !== '') return 'sha256';
  if (typeof subject.sha1 === 'string' && subject.sha1 !== '') return 'sha1';
  return null;
}

function pinnedDigest(subject: ModelSubject, algorithm: ChecksumAlgorithm): string | null {
  const value = algorithm === 'sha256' ? subject.sha256 : subject.sha1;
  return typeof value === 'string' && value !== '' ? value : null;
}

/** What the `.part` beside this file claims about itself. */
type PartState =
  | { readonly kind: 'none' }
  | { readonly kind: 'resumable' }
  | { readonly kind: 'dangling' }
  | { readonly kind: 'stale'; readonly reason: string };

function classifyPart(destination: string, subject: ModelSubject): PartState {
  let present: boolean;
  try {
    present = lstatSync(partPathFor(destination)).isFile();
  } catch {
    return { kind: 'none' };
  }
  if (!present) return { kind: 'none' };

  const sidecar = readSidecar(destination);
  if (sidecar === null) {
    return { kind: 'dangling' };
  }
  if (sidecar.url !== subject.url) {
    return { kind: 'stale', reason: 'it was downloading from a different address than the one now pinned' };
  }
  const pinned = subject.sha256 ?? subject.sha1;
  if (sidecar.checksum !== pinned) {
    return { kind: 'stale', reason: 'it was downloading a different file than the one now pinned' };
  }
  return { kind: 'resumable' };
}

/**
 * Is the file at `destination` the artifact the catalogue pins?
 *
 * **This never writes.** It is called on every run, including the run behind
 * the plan, and a probe writes nothing to disk. The receipt a fresh hash earns
 * is written by whoever acts on this verdict, which is the step the person
 * pressed Start for.
 *
 * A receipt is a *performance* record, not a trust boundary: it lets a file
 * that has already been checked be trusted without hashing 75 MiB again. The
 * file it vouches for is the one the pinned digest names, and the download path
 * hashed that file itself before writing the receipt.
 */
export async function assessModel(
  subject: ModelSubject,
  destination: string,
  signal?: AbortSignal,
): Promise<ReadinessVerdict> {
  const part = classifyPart(destination, subject);

  let stat: Stats;
  try {
    // `lstatSync`, not `statSync`: a symlink is not the file, whatever it
    // points at, and a symlink to a directory is the case this catches.
    stat = lstatSync(destination);
  } catch {
    if (part.kind === 'resumable') {
      return { state: 'missing', reason: 'a partly-downloaded file is there and can be picked up' };
    }
    if (part.kind === 'dangling') {
      return {
        state: 'invalid',
        code: 'dangling_part',
        reason: 'a partly-downloaded file is there with nothing recording where it came from',
      };
    }
    if (part.kind === 'stale') {
      return {
        state: 'invalid',
        code: 'stale_pin',
        reason: `a partly-downloaded file is there and ${part.reason}`,
      };
    }
    return { state: 'missing', reason: 'nothing is there yet' };
  }

  if (stat.isSymbolicLink() || !stat.isFile()) {
    const kind = stat.isSymbolicLink() ? 'a link' : stat.isDirectory() ? 'a folder' : 'not a file';
    return {
      state: 'invalid',
      code: 'not_a_regular_file',
      reason: `there is ${kind} where the model file belongs, not a regular file`,
    };
  }

  const algorithm = preferredAlgorithm(subject);
  if (algorithm === null) {
    return {
      state: 'invalid',
      code: 'no_pinned_hash',
      reason: 'the catalogue pins no digest for this file, so an unverified one cannot be accepted',
    };
  }

  if (stat.size !== subject.sizeBytes) {
    return {
      state: 'invalid',
      code: 'size_mismatch',
      reason: `it is ${String(stat.size)} bytes and the catalogue pins ${String(subject.sizeBytes)}`,
    };
  }

  const receipt = receiptFor(destination, subject);
  if (
    receipt !== null &&
    receipt.mtimeMs === Math.floor(stat.mtimeMs) &&
    receipt.dev === stat.dev &&
    receipt.ino === stat.ino
  ) {
    return {
      state: 'ready',
      reason: 'a receipt already records this exact file, unchanged since it was written',
      algorithm,
      digest: receipt.digest,
      proof: 'receipt',
    };
  }

  const pinned = pinnedDigest(subject, algorithm);
  if (pinned === null) {
    return {
      state: 'invalid',
      code: 'no_pinned_hash',
      reason: 'the catalogue pins no digest for this file, so an unverified one cannot be accepted',
    };
  }

  const digest = await hashFile(destination, algorithm, signal);
  if (!matches(pinned, digest)) {
    return {
      state: 'invalid',
      code: 'hash_mismatch',
      reason: `a fresh ${algorithm} did not match the digest the catalogue pins`,
    };
  }
  return {
    state: 'ready',
    reason: 'a fresh hash matched the digest the catalogue pins',
    algorithm,
    digest,
    proof: 'hashed',
  };
}
