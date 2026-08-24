import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  clearSidecar,
  partBytes,
  partPathFor,
  planResume,
  readSidecar,
  sidecarPathFor,
  writeSidecar,
  type ResumeSidecar,
} from './resume.js';

const URL_A = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/a.bin';
const URL_B = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/b.bin';

function sidecar(overrides: Partial<ResumeSidecar> = {}): ResumeSidecar {
  return { url: URL_A, expectedBytes: 1000, downloadedBytes: 400, checksum: 'abc', ...overrides };
}

describe('planResume', () => {
  it('starts fresh when there is nothing on disk', () => {
    expect(planResume({ sidecar: null, partBytes: null, url: URL_A, checksum: 'abc' })).toEqual({
      mode: 'fresh',
      reason: 'nothing has been downloaded yet',
    });
    expect(planResume({ sidecar: sidecar(), partBytes: 0, url: URL_A, checksum: 'abc' }).mode).toBe('fresh');
  });

  it('resumes from the size of the file on disk, not from what the record claims', () => {
    // The file is the truth about length: a run killed between the last write
    // and the last sidecar update has more bytes than the record says.
    const plan = planResume({
      sidecar: sidecar({ downloadedBytes: 400 }),
      partBytes: 512,
      url: URL_A,
      checksum: 'abc',
    });
    expect(plan).toEqual({ mode: 'resume', offset: 512 });
  });

  /**
   * Every one of these would append correct-looking bytes onto the wrong file
   * and produce a 574 MB corruption that only the final checksum catches —
   * twenty minutes later.
   */
  it('starts fresh rather than resume onto bytes it cannot vouch for', () => {
    const cases: Array<[string, ReturnType<typeof planResume>]> = [
      ['no record at all', planResume({ sidecar: null, partBytes: 400, url: URL_A, checksum: 'abc' })],
      [
        'a different address',
        planResume({ sidecar: sidecar(), partBytes: 400, url: URL_B, checksum: 'abc' }),
      ],
      [
        'a re-pinned checksum',
        planResume({ sidecar: sidecar(), partBytes: 400, url: URL_A, checksum: 'different' }),
      ],
      [
        'a part file longer than the whole file',
        planResume({ sidecar: sidecar(), partBytes: 1200, url: URL_A, checksum: 'abc' }),
      ],
    ];
    for (const [name, plan] of cases) {
      expect(plan.mode, name).toBe('fresh');
    }
  });

  it('reports a complete file as complete rather than re-requesting it', () => {
    expect(planResume({ sidecar: sidecar(), partBytes: 1000, url: URL_A, checksum: 'abc' })).toEqual({
      mode: 'complete',
      bytes: 1000,
    });
  });

  it('resumes when the total length was never known', () => {
    const plan = planResume({
      sidecar: sidecar({ expectedBytes: null }),
      partBytes: 400,
      url: URL_A,
      checksum: 'abc',
    });
    expect(plan).toEqual({ mode: 'resume', offset: 400 });
  });
});

describe('the sidecar on disk', () => {
  let dir: string | null = null;

  afterEach(() => {
    if (dir !== null) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  function destination(): string {
    dir = mkdtempSync(join(tmpdir(), 'apunta-resume-'));
    return join(dir, 'model.bin');
  }

  it('round-trips, and reads back as null once cleared', () => {
    const target = destination();
    writeSidecar(target, sidecar());
    expect(readSidecar(target)).toEqual(sidecar());
    clearSidecar(target);
    expect(readSidecar(target)).toBeNull();
  });

  it('reads a damaged record as no record rather than throwing', () => {
    const target = destination();
    writeFileSync(sidecarPathFor(target), '{ this is not json');
    expect(readSidecar(target)).toBeNull();
    writeFileSync(sidecarPathFor(target), '{"nothing":"useful"}');
    expect(readSidecar(target)).toBeNull();
  });

  it('measures the part file, and answers null when there is not one', () => {
    const target = destination();
    expect(partBytes(target)).toBeNull();
    writeFileSync(partPathFor(target), Buffer.alloc(77));
    expect(partBytes(target)).toBe(77);
  });
});
