import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  A07_ALLOWED_QUERY_KEYS,
  ALLOWED_DOWNLOAD_HOSTS,
  C_STT_CANDIDATE_ALLOWANCE,
  LICENCE_PAGE_HOSTS,
  PREVIEW_SPEECH_MODEL,
  SPEECH_DOWNLOAD_ALLOWANCE,
  SPEECH_MODEL,
  WRITING_MODELS,
  writingModel,
} from './catalog.js';
import { assertRequestAllowed, RequestRefusedError } from './readiness.js';

const here = dirname(fileURLToPath(import.meta.url));

/** The guard, applied the way the downloader applies it to the pinned entry. */
function check(raw: string, keys: readonly string[] = A07_ALLOWED_QUERY_KEYS): void {
  assertRequestAllowed({
    url: raw,
    allowance: SPEECH_DOWNLOAD_ALLOWANCE,
    allowedQueryKeys: keys,
    redirect: false,
  });
}

/**
 * The exemption in `eslint.config.js` switches the outbound-URL rule off for
 * `catalog.ts` and nothing else. These tests are what stops that from
 * mattering: they pin the hosts, and they assert the exemption has not spread.
 */
describe('the download allow-list', () => {
  it('is four hosts, and every URL the catalogue names is on one of them', () => {
    expect([...ALLOWED_DOWNLOAD_HOSTS]).toEqual([
      'huggingface.co',
      'us.aws.cdn.hf.co',
      'registry.ollama.ai',
      'ollama.com',
    ]);

    const urls = [
      SPEECH_MODEL.url,
      SPEECH_MODEL.licence.url,
      ...Object.values(WRITING_MODELS).map((entry) => entry.licence.url),
      writingModel('something:unheard-of').licence.url,
    ];
    for (const url of urls) {
      expect(ALLOWED_DOWNLOAD_HOSTS, url).toContain(new URL(url).hostname);
    }
  });

  /**
   * The union is derived, so admitting a redirect host cannot be forgotten
   * here. This is the arithmetic, asserted rather than assumed.
   */
  it('is exactly the union of every allowance and the licence-page hosts', () => {
    const expected = [
      ...SPEECH_DOWNLOAD_ALLOWANCE.allowedHosts,
      ...SPEECH_DOWNLOAD_ALLOWANCE.allowedRedirectHosts,
      ...C_STT_CANDIDATE_ALLOWANCE.allowedHosts,
      ...C_STT_CANDIDATE_ALLOWANCE.allowedRedirectHosts,
      ...LICENCE_PAGE_HOSTS,
    ];

    expect([...ALLOWED_DOWNLOAD_HOSTS].sort()).toEqual([...new Set(expected)].sort());
    // No host is listed twice: a duplicate would be a second place to edit.
    expect(ALLOWED_DOWNLOAD_HOSTS.length).toBe(new Set(ALLOWED_DOWNLOAD_HOSTS).size);
  });

  it('refuses anything else, including a lookalike host', () => {
    for (const url of [
      'https://example.com/model.bin',
      'https://huggingface.co.evil.test/model.bin',
      'https://us.aws.cdn.hf.co.evil.test/model.bin',
      'https://notollama.com/library/gemma4',
      'http://huggingface.co/model.bin',
      'not a url',
    ]) {
      expect(() => {
        check(url);
      }, url).toThrow(RequestRefusedError);
    }
  });

  /**
   * A fragment is never sent to a server, so its presence in a download
   * address is a smell and nothing else. A query, on the other hand, is how a
   * Hugging Face signed URL has to look — so what is refused is a query whose
   * *names* are not enumerated for that row, never a blanket refusal of
   * queries. The two rules that replaced the old one are asserted side by side
   * here because that is exactly what the amendment changed.
   */
  it('refuses a fragment always, and a query only for a row that admits none', () => {
    expect(() => {
      check('https://huggingface.co/x/y.bin#frag');
    }).toThrow(RequestRefusedError);

    expect(() => {
      check('https://huggingface.co/x/y.bin?telemetry=1', []);
    }).toThrow(RequestRefusedError);

    // A07 enumerates these names, so a query carrying only them is admitted.
    expect(() => {
      check('https://huggingface.co/x/y.bin?Policy=p&Signature=s');
    }).not.toThrow();
  });
});

describe('the allowed query keys', () => {
  it('are the ten names `ACQUISITION.md` §1 enumerates for A07, and no others', () => {
    expect([...A07_ALLOWED_QUERY_KEYS]).toEqual([
      'Expires',
      'Hash-Algorithm',
      'Key-Pair-Id',
      'Policy',
      'Signature',
      'X-Xet-Cas-Uid',
      'response-content-disposition',
      'response-content-type',
      'user_id',
      'xip',
    ]);
  });

  /**
   * The enumeration is the complete permission: membership of a name set, not a
   * prefix, a wildcard or a blanket permission. The test that matters is the
   * negative one — a name that merely *starts with* an allowed name is refused.
   */
  it('is a name set, so a prefix of an allowed name is not allowed', () => {
    for (const name of ['Sign', 'Signature2', 'Policy-', 'expires', 'X-Xet']) {
      expect(() => {
        check(`https://huggingface.co/x/y.bin?${name}=1`);
      }, name).toThrow(RequestRefusedError);
    }
  });

  it('is attached to the two speech entries, which is where the vendor sends one', () => {
    // The two entries name literally the same download, so both present the
    // same signed `Location` and both must carry the same enumeration. An
    // entry that presented a query while its twin admitted none would be a
    // first-run failure nobody could explain.
    expect(SPEECH_MODEL.allowedQueryKeys).toEqual([...A07_ALLOWED_QUERY_KEYS]);
    expect(PREVIEW_SPEECH_MODEL.allowedQueryKeys).toEqual([...A07_ALLOWED_QUERY_KEYS]);
    // And no other entry exists yet, so nothing else carries a permission.
    expect(C_STT_CANDIDATE_ALLOWANCE.allowedRedirectHosts).toEqual(['us.aws.cdn.hf.co']);
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

  /**
   * The size is a pin now, not a comment. 77,704,715 is upstream's own measured
   * figure, quoted in whisper.cpp's `models/README.md`; until P4.1 it lived in
   * an `approxBytes` comment, which is why nothing could be measured against it.
   */
  it('pins the exact byte count, and keeps `approxBytes` for the disk check', () => {
    expect(SPEECH_MODEL.sizeBytes).toBe(77_704_715);
    expect(SPEECH_MODEL.sizeBytes).toBeGreaterThan(0);
    expect(Number.isSafeInteger(SPEECH_MODEL.sizeBytes)).toBe(true);
    // `approxBytes` keeps its one job, which is a coarse refusal before a
    // download starts. It is rounded up, so it is never below the pin.
    expect(SPEECH_MODEL.approxBytes).toBe(75 * 1024 * 1024);
    expect(SPEECH_MODEL.approxBytes).toBeGreaterThanOrEqual(SPEECH_MODEL.sizeBytes);
  });

  it('is fetched under its own allowance, never a global one', () => {
    expect(SPEECH_MODEL.allowance).toBe(SPEECH_DOWNLOAD_ALLOWANCE);
    expect(SPEECH_MODEL.allowance.allowedHosts).toEqual(['huggingface.co']);
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
      // The window shows this page; Apunta never requests it, so the guard
      // does not apply to it. What must hold is that it is a host the product
      // is on the record for.
      expect(ALLOWED_DOWNLOAD_HOSTS, entry.tag).toContain(new URL(entry.licence.url).hostname);
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
    expect(WRITING_MODELS['gemma4:12b-it-qat']?.licence).toEqual({
      name: 'Gemma Terms of Use',
      url: 'https://ollama.com/library/gemma4',
      verified: false,
    });
    expect(WRITING_MODELS['qwen3.6:35b-a3b']?.licence).toEqual({
      name: 'Apache-2.0',
      url: 'https://ollama.com/library/qwen3.6',
      verified: false,
    });
  });
});
