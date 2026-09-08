import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { findMisspellings } from './spelling.js';
import { loadSpeller } from './speller.js';

describe('the bundled en-US dictionary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads both local Hunspell assets and applies American spelling', async () => {
    const fetched: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      fetched.push(url);
      const file = url.endsWith('.aff') ? 'index.aff' : url.endsWith('.dic') ? 'index.dic' : null;
      if (file === null) return new Response(null, { status: 404 });
      const contents = await readFile(resolve(process.cwd(), 'node_modules/dictionary-en', file));
      return new Response(contents.toString('utf8'), { status: 200 });
    });

    const speller = await loadSpeller();

    expect(fetched).toHaveLength(2);
    expect(fetched.every((url) => url.includes('/dictionary-en/'))).toBe(true);
    expect(
      fetched.every((url) => /^(localhost|127\.0\.0\.1)$/u.test(new URL(url, 'http://localhost').hostname)),
    ).toBe(true);

    const allow = new Set(['zebediah', 'sertraline', 'qvplum']);
    expect(
      findMisspellings(
        'criticized behavior organize center criticised Zebediah sertraline Qvplum',
        speller,
        allow,
      ).map((entry) => entry.word),
    ).toEqual(['criticised']);
  });
});
