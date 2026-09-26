import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ALLOWED_DOWNLOAD_HOSTS,
  assertAllowedHost,
  DisallowedHostError,
  PREVIEW_SPEECH_MODEL,
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
    // Upstream publishes SHA-1 only. The SHA-256 is Apunta's own, computed
    // after the SHA-1 matched (2026-09-20), and the exact value is asserted so
    // a regenerated catalog cannot quietly swap the file it certifies.
    expect(SPEECH_MODEL.sha256).toBe('921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f');
  });

  it('pins the preview to the same English-only file as the note, from the same publisher', () => {
    expect(PREVIEW_SPEECH_MODEL.filename).toBe('ggml-tiny.en.bin');
    expect(PREVIEW_SPEECH_MODEL.url).toContain('/ggerganov/whisper.cpp/');
    expect(PREVIEW_SPEECH_MODEL.url).toContain(PREVIEW_SPEECH_MODEL.filename);
    expect(PREVIEW_SPEECH_MODEL.sha1).toMatch(/^[0-9a-f]{40}$/);
    expect(PREVIEW_SPEECH_MODEL.sha256).toMatch(/^[0-9a-f]{64}$/);
    // Dictation is English-only and tiny.en is small enough to serve both the
    // preview and the note, so these describe literally the same download.
    expect(PREVIEW_SPEECH_MODEL).toEqual(SPEECH_MODEL);
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
      expect(Number.isSafeInteger(entry.approxBytes), entry.tag).toBe(true);
    }
  });

  it('still says something true about a tag nobody pinned', () => {
    const unknown = writingModel('mystery:7b');
    expect(unknown.tag).toBe('mystery:7b');
    expect(unknown.licence.verified).toBe(false);
    expect(unknown.approxBytes).toBeGreaterThan(0);
  });

  /**
   * The two writing-model licence records, pinned field by field.
   *
   * The rule these enforce: `verified: true` is only ever admissible together
   * with a read of that tag's own licence text, and the name must be whatever
   * that read said — never a remembered identifier, never the publisher's
   * reputation. Both of these records are read in
   * `docs/v2/evidence/P1.5/licence-evidence.md`: on 2026-09-26 the two library
   * pages named in each `url` were fetched (HTTP 200) and neither states a
   * licence at all, so `verified` stays `false` on both, and the names are the
   * publisher-neutral ones the window already showed. Whichever way a later
   * card settles these — a real `ollama show --license` blob, or the
   * publisher's own terms — this assertion is the tripwire that says the record
   * moved on purpose and on a read.
   */
  it('pins the licence record of each writing model whose terms were read', () => {
    expect(WRITING_MODELS['gemma4:12b-it-qat'].licence).toEqual({
      name: 'Gemma Terms of Use',
      url: 'https://ollama.com/library/gemma4',
      verified: false,
    });
    expect(WRITING_MODELS['qwen3.6:35b-a3b'].licence).toEqual({
      name: 'Apache-2.0',
      url: 'https://ollama.com/library/qwen3.6',
      verified: false,
    });
  });
});
