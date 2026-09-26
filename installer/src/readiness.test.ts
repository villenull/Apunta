import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { hashFile, type hashFile as HashFile } from './checksum.js';

/** The module shape `vi.mock` re-exports, named once so the cast needs no `import()`. */
type ChecksumModule = { hashFile: typeof HashFile };
import { partPathFor, writeSidecar } from './resume.js';
import {
  assessModel,
  clearReceipt,
  MAX_REDIRECT_HOPS,
  queryParameterNames,
  READINESS_CODES,
  readReceipt,
  receiptPathFor,
  receiptFor,
  safeUrl,
  writeReceiptFor,
  type ModelSubject,
  type ReadinessVerdict,
} from './readiness.js';

/**
 * Is the file at this path the artifact the catalogue pins?
 *
 * The transport here is a real filesystem and a real `node:crypto` hash — the
 * verdicts are about bytes, mtimes and inodes, and a mocked `fs` would be
 * asserting the mock. The one thing that *is* injected is the hasher, so that
 * "a valid receipt needs no hash" can be observed as a count rather than argued.
 */

vi.mock('./checksum.js', async (importOriginal) => {
  const actual = await importOriginal<ChecksumModule>();
  return { ...actual, hashFile: vi.fn(actual.hashFile) };
});

const CONTENT = Buffer.from('a whisper model, in the small'.repeat(512));
const PINNED_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/synthetic-model.bin';

function digestOf(body: Buffer, algorithm: 'sha1' | 'sha256'): string {
  return createHash(algorithm).update(body).digest('hex');
}

const SUBJECT: ModelSubject = {
  filename: 'synthetic-model.bin',
  sizeBytes: CONTENT.length,
  sha256: digestOf(CONTENT, 'sha256'),
  sha1: digestOf(CONTENT, 'sha1'),
  url: PINNED_URL,
};

let dir: string | null = null;

afterEach(() => {
  if (dir !== null) rmSync(dir, { recursive: true, force: true });
  dir = null;
  vi.mocked(hashFile).mockClear();
});

function modelsDir(): string {
  dir = mkdtempSync(join(tmpdir(), 'apunta-readiness-'));
  const models = join(dir, 'models');
  mkdirSync(models, { recursive: true });
  return models;
}

function pathOf(subject: ModelSubject = SUBJECT, models = modelsDir()): string {
  return join(models, subject.filename);
}

function place(body: Buffer, subject: ModelSubject = SUBJECT, models = modelsDir()): string {
  const target = pathOf(subject, models);
  writeFileSync(target, body);
  return target;
}

async function verdictOf(target: string, subject: ModelSubject = SUBJECT): Promise<ReadinessVerdict> {
  return assessModel(subject, target);
}

function hashCalls(): number {
  return vi.mocked(hashFile).mock.calls.length;
}

describe('a file that is simply not there', () => {
  it('is missing, which is not a failure', async () => {
    expect(await verdictOf(pathOf())).toEqual({
      state: 'missing',
      reason: 'nothing is there yet',
    });
  });

  it('a partly-downloaded file that is ours makes it missing rather than invalid', async () => {
    const target = pathOf();
    writeFileSync(partPathFor(target), CONTENT.subarray(0, 32));
    writeSidecar(target, {
      url: PINNED_URL,
      expectedBytes: CONTENT.length,
      downloadedBytes: 32,
      checksum: SUBJECT.sha256,
    });

    expect((await verdictOf(target)).state).toBe('missing');
  });
});

describe('the size is a pin', () => {
  /** Case 15: the file is there, it is 11 bytes, and that is not the model. */
  it('calls an 11-byte file at the model path a size_mismatch', async () => {
    const target = place(CONTENT.subarray(0, 11));
    const verdict = await verdictOf(target);

    expect(verdict.state).toBe('invalid');
    expect(verdict).toMatchObject({ code: 'size_mismatch' });
    expect(verdict.state === 'invalid' && verdict.reason).toContain(String(CONTENT.length));
  });

  /** Case 16: zero bytes is a disk that filled up, not a first run. */
  it('calls a zero-byte file a size_mismatch rather than missing', async () => {
    const target = place(Buffer.alloc(0));
    const verdict = await verdictOf(target);

    expect(verdict.state).toBe('invalid');
    expect(verdict).toMatchObject({ code: 'size_mismatch' });
  });

  it('is measured against the pinned sizeBytes and not against "more than nothing"', async () => {
    // One byte more than pinned is as wrong as eleven bytes, and the old
    // "any non-empty file is the model" rule called both of them ready.
    const target = place(Buffer.alloc(SUBJECT.sizeBytes + 1));
    expect(await verdictOf(target)).toMatchObject({ state: 'invalid', code: 'size_mismatch' });

    const short = place(Buffer.alloc(SUBJECT.sizeBytes - 1));
    expect(await verdictOf(short)).toMatchObject({ state: 'invalid', code: 'size_mismatch' });
  });
});

describe('only a regular file is a model', () => {
  /** Case 17: a directory, and a link to one. */
  it('calls a directory at the path not_a_regular_file', async () => {
    const target = pathOf();
    mkdirSync(target, { recursive: true });

    expect(await verdictOf(target)).toMatchObject({
      state: 'invalid',
      code: 'not_a_regular_file',
    });
  });

  it('calls a symlink to a directory the same, and does not follow it', async () => {
    const models = modelsDir();
    const real = join(models, 'somewhere-else');
    mkdirSync(real, { recursive: true });
    const target = pathOf(SUBJECT, models);
    symlinkSync(real, target);

    expect(await verdictOf(target)).toMatchObject({
      state: 'invalid',
      code: 'not_a_regular_file',
    });
  });

  it('calls a symlink to a real model not_a_regular_file too: it is not the file', async () => {
    const models = modelsDir();
    const real = join(models, 'the-real-file');
    writeFileSync(real, CONTENT);
    const target = pathOf(SUBJECT, models);
    symlinkSync(real, target);

    expect(await verdictOf(target)).toMatchObject({
      state: 'invalid',
      code: 'not_a_regular_file',
    });
  });
});

describe('the receipt', () => {
  /** Case 19: a valid receipt is believed, and nothing is hashed. */
  it('believes a receipt that matches the file it describes, and hashes nothing', async () => {
    const target = place(CONTENT);
    expect(writeReceiptFor(target, SUBJECT, SUBJECT.sha256 ?? '')).not.toBeNull();
    expect(hashCalls()).toBe(0);

    const verdict = await verdictOf(target);

    expect(verdict).toMatchObject({ state: 'ready', proof: 'receipt', algorithm: 'sha256' });
    expect(hashCalls()).toBe(0);
  });

  /** Case 18: an mtime that moved at all costs one hash and nothing more. */
  it('re-hashes a file whose mtime moved since its receipt was written', async () => {
    const target = place(CONTENT);
    writeReceiptFor(target, SUBJECT, SUBJECT.sha256 ?? '');
    expect((await verdictOf(target)).state).toBe('ready');
    expect(hashCalls()).toBe(0);

    // A restore, or a copy that did not preserve the timestamp: the bytes are
    // identical and the receipt is suddenly about a file that no longer exists.
    const later = new Date(Date.now() + 60_000);
    utimesSync(target, later, later);

    const verdict = await verdictOf(target);
    expect(verdict).toMatchObject({ state: 'ready', proof: 'hashed' });
    expect(hashCalls()).toBe(1);
  });

  it('re-hashes a file whose inode changed, which is what a copy onto another volume looks like', async () => {
    const models = modelsDir();
    const target = place(CONTENT, SUBJECT, models);
    writeReceiptFor(target, SUBJECT, SUBJECT.sha256 ?? '');

    const moved = join(models, 'moved.bin');
    writeFileSync(moved, CONTENT);
    // Same size, same bytes, same mtime — a different inode.
    const original = statSync(target);
    utimesSync(moved, original.atime, original.mtime);

    expect(await verdictOf(moved)).toMatchObject({ state: 'ready', proof: 'hashed' });
    expect(hashCalls()).toBe(1);
  });

  it('treats a receipt whose digest disagrees with the pin as no receipt at all', async () => {
    const target = place(CONTENT);
    writeReceiptFor(target, SUBJECT, 'f'.repeat(64));

    expect(receiptFor(target, SUBJECT)).toBeNull();
    const verdict = await verdictOf(target);
    expect(verdict).toMatchObject({ state: 'ready', proof: 'hashed' });
    expect(hashCalls()).toBe(1);
  });

  it('treats a receipt whose sizeBytes disagrees with the pin as no receipt', async () => {
    const target = place(CONTENT);
    writeReceiptFor(target, SUBJECT, SUBJECT.sha256 ?? '');
    const raw = readReceipt(target);
    expect(raw).not.toBeNull();
    writeFileSync(receiptPathFor(target), JSON.stringify({ ...raw, sizeBytes: 11 }));
    expect(receiptFor(target, SUBJECT)).toBeNull();
  });

  it('refuses a receipt with a trailing field, because a future build is not a claim', () => {
    const target = place(CONTENT);
    writeReceiptFor(target, SUBJECT, SUBJECT.sha256 ?? '');
    const raw = readReceipt(target);
    expect(raw).not.toBeNull();

    writeFileSync(receiptPathFor(target), JSON.stringify({ ...raw, signedBy: 'someone' }));
    expect(readReceipt(target)).toBeNull();
  });

  it('refuses a receipt of a version it does not know, and one that will not parse', () => {
    const target = place(CONTENT);
    writeReceiptFor(target, SUBJECT, SUBJECT.sha256 ?? '');
    const raw = readReceipt(target);
    expect(raw).not.toBeNull();

    writeFileSync(receiptPathFor(target), JSON.stringify({ ...raw, version: 2 }));
    expect(readReceipt(target)).toBeNull();

    writeFileSync(receiptPathFor(target), 'not json at all');
    expect(readReceipt(target)).toBeNull();
  });

  it('writes exactly the eight pinned keys, at mode 0600, and nothing else', () => {
    const target = place(CONTENT);
    writeReceiptFor(target, SUBJECT, SUBJECT.sha256 ?? '');

    const parsed: unknown = JSON.parse(readFileSync(receiptPathFor(target), 'utf8'));
    expect(Object.keys(parsed as object)).toEqual([
      'version',
      'filename',
      'algorithm',
      'digest',
      'sizeBytes',
      'mtimeMs',
      'dev',
      'ino',
    ]);
    expect(statSync(receiptPathFor(target)).mode % 0o1000).toBe(0o600);
  });

  it('goes away with the file it described', () => {
    const target = place(CONTENT);
    writeReceiptFor(target, SUBJECT, SUBJECT.sha256 ?? '');
    expect(existsSync(receiptPathFor(target))).toBe(true);

    clearReceipt(target);
    expect(existsSync(receiptPathFor(target))).toBe(false);
  });

  it('will not write a receipt for a file whose size is not the pinned one', () => {
    const target = place(Buffer.alloc(11));
    expect(writeReceiptFor(target, SUBJECT, SUBJECT.sha256 ?? '')).toBeNull();
    expect(existsSync(receiptPathFor(target))).toBe(false);
  });
});

describe('assessing a model writes nothing', () => {
  it('leaves the disk exactly as it found it, ready or not', async () => {
    const target = place(CONTENT);

    const verdict = await verdictOf(target);
    expect(verdict).toMatchObject({ state: 'ready', proof: 'hashed' });
    expect(existsSync(receiptPathFor(target))).toBe(false);

    // The probe runs on every launch, including the one behind the plan. A
    // probe that wrote a receipt would write to disk on a run that was asked
    // only what was needed.
    await verdictOf(target);
    expect(existsSync(receiptPathFor(target))).toBe(false);
  });
});

describe('a file with the right size and the wrong bytes', () => {
  it('is a hash_mismatch', async () => {
    const other = Buffer.from('a whisper model, in the LARGE'.repeat(512));
    expect(other.length).toBe(SUBJECT.sizeBytes);
    const target = place(other);

    expect(await verdictOf(target)).toMatchObject({ state: 'invalid', code: 'hash_mismatch' });
  });
});

describe('an entry that pins nothing', () => {
  /** Case 20: readiness says so rather than hashing. */
  it('is no_pinned_hash, and never hashed', async () => {
    const subject: ModelSubject = { ...SUBJECT, sha256: null, sha1: null };
    const target = place(CONTENT, subject);

    expect(await verdictOf(target, subject)).toMatchObject({
      state: 'invalid',
      code: 'no_pinned_hash',
    });
    expect(hashCalls()).toBe(0);
  });

  it('falls back to the SHA-1 when the SHA-256 is null, and records algorithm sha1', async () => {
    const subject: ModelSubject = { ...SUBJECT, sha256: null };
    const target = place(CONTENT, subject);

    const verdict = await verdictOf(target, subject);
    expect(verdict).toMatchObject({ state: 'ready', algorithm: 'sha1', digest: subject.sha1 });
    expect(writeReceiptFor(target, subject, subject.sha1 ?? '')).toMatchObject({
      algorithm: 'sha1',
      digest: subject.sha1,
    });
  });
});

describe('a partly-downloaded file that cannot be trusted', () => {
  /** Case 21: bytes with no record of where they came from. */
  it('is a dangling_part when nothing records it', async () => {
    const target = pathOf();
    writeFileSync(partPathFor(target), CONTENT.subarray(0, 64));

    expect(await verdictOf(target)).toMatchObject({
      state: 'invalid',
      code: 'dangling_part',
    });
  });

  /** Case 22: a record that describes a different file. */
  it('is a stale_pin when the sidecar names an address the catalogue no longer pins', async () => {
    const target = pathOf();
    writeFileSync(partPathFor(target), CONTENT.subarray(0, 64));
    writeSidecar(target, {
      url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/older-model.bin',
      expectedBytes: CONTENT.length,
      downloadedBytes: 64,
      checksum: SUBJECT.sha256,
    });

    expect(await verdictOf(target)).toMatchObject({ state: 'invalid', code: 'stale_pin' });
  });

  it('is a stale_pin when the sidecar names a checksum the catalogue no longer pins', async () => {
    const target = pathOf();
    writeFileSync(partPathFor(target), CONTENT.subarray(0, 64));
    writeSidecar(target, {
      url: PINNED_URL,
      expectedBytes: CONTENT.length,
      downloadedBytes: 64,
      checksum: 'a'.repeat(64),
    });

    expect(await verdictOf(target)).toMatchObject({ state: 'invalid', code: 'stale_pin' });
  });
});

describe('the two vocabularies', () => {
  it('are closed, and every code this file can return is in one of them', () => {
    expect([...READINESS_CODES]).toEqual([
      'size_mismatch',
      'hash_mismatch',
      'not_a_regular_file',
      'stale_pin',
      'dangling_part',
      'no_pinned_hash',
    ]);
  });

  it('allows at most five hops, and hop 0 is the initial request', () => {
    expect(MAX_REDIRECT_HOPS).toBe(5);
  });
});

describe('a URL in a message', () => {
  it('keeps the facts a refusal has to name and drops everything secret', () => {
    const rendered = safeUrl('https://user:secret@cdn.example.test:8443/a/b.bin?Signature=abc#frag');

    expect(rendered).toBe('https://cdn.example.test:8443/a/b.bin?<redacted>');
    expect(rendered).not.toContain('secret');
    expect(rendered).not.toContain('Signature=abc');
    expect(rendered).not.toContain('frag');
  });

  it('says a string that is not a URL at all, rather than echoing it', () => {
    expect(safeUrl('not a url')).toBe('(not a URL at all)');
  });
});

describe('query parameter names', () => {
  it('reads names and stops at the first equals sign, so no value is ever materialised', () => {
    expect(queryParameterNames('?Expires=1&Policy=two')).toEqual(['Expires', 'Policy']);
    // The values below are the shape of a signed URL's signature. The function
    // is given the whole string and is structurally unable to return them.
    expect(queryParameterNames('?Signature=never-returned-this')).toEqual(['Signature']);
  });

  it('counts a parameter with no equals sign as a name, which is all there is', () => {
    expect(queryParameterNames('?Expires')).toEqual(['Expires']);
  });

  it('decodes a percent-encoded name, because an allow-list has to be able to name it', () => {
    expect(queryParameterNames('?a%20b=1')).toEqual(['a b']);
  });

  it('leaves a malformed escape as it arrived, so it fails closed against any list', () => {
    expect(queryParameterNames('?%zz=1')).toEqual(['%zz']);
  });

  it('de-duplicates and keeps the first arrival order', () => {
    expect(queryParameterNames('?b=1&a=2&b=3')).toEqual(['b', 'a']);
  });

  it('is empty for no query at all', () => {
    expect(queryParameterNames('')).toEqual([]);
    expect(queryParameterNames('?')).toEqual([]);
  });
});

/** Mode of a file, read the way the receipt's own `0600` claim is checked. */
