import { readFileSync } from 'node:fs';
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

/**
 * S6.1's two Spanish constants, asserted at source level (D8's V1(g)): this is
 * where the `/dictionary-es-mx/` substring belongs, because a browser row
 * cannot say which package a hashed asset came from (A1).
 */
describe('the bundled es-MX dictionary', () => {
  const source = readFileSync(resolve(process.cwd(), 'web/src/lib/speller.ts'), 'utf8');

  it('addresses the Mexican Spanish pair from the module, on loopback, like the English one', () => {
    for (const file of ['index.aff', 'index.dic']) {
      expect(source).toContain(
        `new URL('../../../node_modules/dictionary-es-mx/${file}', import.meta.url).href`,
      );
    }
    for (const name of ['ES_MX_AFF_URL', 'ES_MX_DIC_URL']) {
      const line = source.split('\n').find((candidate) => candidate.includes(`const ${name} = `));
      expect(line, `${name} is built from the installed package`).toBeDefined();
      const url = new URL(/'(.*?)'/.exec(line ?? '')![1]!, 'http://localhost');
      expect(url.pathname).toContain('/node_modules/dictionary-es-mx/');
      expect(url.hostname === 'localhost' || url.hostname === '127.0.0.1').toBe(true);
    }
  });

  it('keeps the English pair exactly as it was, and the two locales in one table', () => {
    expect(source).toContain(
      "const AFF_URL = new URL('../../../node_modules/dictionary-en/index.aff', import.meta.url).href;",
    );
    expect(source).toContain(
      "const DIC_URL = new URL('../../../node_modules/dictionary-en/index.dic', import.meta.url).href;",
    );
    expect(source).toContain("'es-MX': { aff: ES_MX_AFF_URL, dic: ES_MX_DIC_URL }");
    expect(source).toContain('en: { aff: AFF_URL, dic: DIC_URL }');
  });
});
