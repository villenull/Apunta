import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ALLOWED_DOWNLOAD_HOSTS,
  assertAllowedHost,
  DisallowedHostError,
  SPEECH_MODEL,
  WRITING_MODELS,
  writingModel,
} from './catalog.js';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The exemption in `eslint.config.js` switches the outbound-URL rule off for
 * `catalog.ts` and nothing else. These tests are what stops that from
 * mattering: they pin the hosts, and they assert the exemption has not spread.
 */
describe('the download allow-list', () => {
  it('is three hosts, and every URL in the catalogue is on it', () => {
    expect([...ALLOWED_DOWNLOAD_HOSTS]).toEqual(['huggingface.co', 'registry.ollama.ai', 'ollama.com']);

    const urls = [
      SPEECH_MODEL.url,
      SPEECH_MODEL.licence.url,
      ...Object.values(WRITING_MODELS).map((entry) => entry.licence.url),
      writingModel('something:unheard-of').licence.url,
    ];
    for (const url of urls) {
      expect(() => {
        assertAllowedHost(url);
      }, url).not.toThrow();
    }
  });

  it('refuses anything else, including a lookalike host', () => {
    for (const url of [
      'https://example.com/model.bin',
      'https://huggingface.co.evil.test/model.bin',
      'https://notollama.com/library/gemma4',
      'http://huggingface.co/model.bin',
      'not a url',
    ]) {
      expect(() => {
        assertAllowedHost(url);
      }, url).toThrow(DisallowedHostError);
    }
  });

  /**
   * A query string is where a download URL turns into a message: an id, a
   * token, a machine fingerprint. The weights-at-arm's-length reasoning only
   * holds while the request is a plain file path.
   */
  it('refuses a query string or a fragment', () => {
    expect(() => {
      assertAllowedHost('https://huggingface.co/x/y.bin?telemetry=1');
    }).toThrow(DisallowedHostError);
    expect(() => {
      assertAllowedHost('https://huggingface.co/x/y.bin#frag');
    }).toThrow(DisallowedHostError);
  });
});

describe('the exemption cannot spread', () => {
  /**
   * `catalog.ts` is the only file ESLint stops checking, so it must also be
   * the only file that *needs* the exemption. If a URL literal turns up
   * anywhere else in the package, this fails before lint gets a chance to pass
   * it silently.
   */
  it('leaves every other file in the package free of non-loopback URLs', () => {
    const offenders: string[] = [];
    for (const name of readdirSync(here)) {
      if (!name.endsWith('.ts')) continue;
      if (name === 'catalog.ts' || name.endsWith('.test.ts')) continue;
      const text = readFileSync(join(here, name), 'utf8');
      // Comments are prose, not requests; only code can reach a host.
      const code = text.replaceAll(/\/\*[\s\S]*?\*\//g, ' ').replaceAll(/^\s*\/\/.*$/gm, ' ');
      for (const match of code.matchAll(/https?:\/\/[^\s'"`)]+/g)) {
        const url = match[0];
        if (/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(?![\w.-])/.test(url)) continue;
        offenders.push(`${name}: ${url}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('the speech model entry', () => {
  it('names the ggerganov repository, not ggml-org', () => {
    // The GitHub organisation was renamed; the model repository was not.
    // Getting this wrong is a 404 at the end of first-run setup.
    expect(SPEECH_MODEL.url).toContain('/ggerganov/whisper.cpp/');
    expect(SPEECH_MODEL.url).toContain(SPEECH_MODEL.filename);
  });

  it('pins the published SHA-1 and our own SHA-256', () => {
    expect(SPEECH_MODEL.sha1).toMatch(/^[0-9a-f]{40}$/);
    // Upstream publishes SHA-1 only. The SHA-256 is Apunta's own, computed in
    // M10 after the SHA-1 matched, and the exact value is asserted so a
    // regenerated catalog cannot quietly swap the file it certifies.
    expect(SPEECH_MODEL.sha256).toBe('394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2');
  });
});

describe('the writing models', () => {
  it('names a publisher and a licence page for every tier', () => {
    for (const entry of Object.values(WRITING_MODELS)) {
      expect(entry.publisher.length, entry.tag).toBeGreaterThan(0);
      expect(entry.licence.name.length, entry.tag).toBeGreaterThan(0);
      expect(() => {
        assertAllowedHost(entry.licence.url);
      }, entry.tag).not.toThrow();
      expect(entry.approxBytes, entry.tag).toBeGreaterThan(0);
    }
  });

  it('still says something true about a tag nobody pinned', () => {
    const unknown = writingModel('mystery:7b');
    expect(unknown.tag).toBe('mystery:7b');
    expect(unknown.licence.verified).toBe(false);
    expect(unknown.approxBytes).toBeGreaterThan(0);
  });
});
