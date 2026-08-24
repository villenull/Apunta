import { DEFAULT_MODEL, LARGE_MODEL, SMALL_MODEL, WHISPER_MODEL_FILENAME } from '@apunta/shared';

/**
 * Everything the first run downloads, pinned.
 *
 * This is the **only** file in the product that names a non-loopback host, and
 * it is the reason `CLAUDE.md` hard rule 1 has exactly one carve-out. Three
 * conditions keep the model weights at arm's length, and all three live here
 * (`docs/research/m8-shell-and-runtime-2026-08.md` §6.2):
 *
 *  1. the first-run window names the model and links its terms **before**
 *     downloading, so the person accepting them can read them;
 *  2. the hosts are a pinned allow-list, asserted by `assertAllowedHost` and
 *     by a test, and the URLs carry no query string;
 *  3. Apunta never mirrors, caches or re-serves weights. One "mirror for
 *     reliability" would turn arm's length into redistribution.
 *
 * ESLint's outbound-URL rule is switched off for this one file, deliberately
 * and narrowly, in `eslint.config.js`.
 */

/**
 * Hosts the product may contact, and nothing else.
 *
 * `huggingface.co` is fetched by the downloader in this package.
 * `registry.ollama.ai` and `ollama.com` are contacted by the bundled Ollama
 * when it pulls the writing model — we never fetch them ourselves, but they
 * are part of the product's egress and belong on the record.
 */
export const ALLOWED_DOWNLOAD_HOSTS = ['huggingface.co', 'registry.ollama.ai', 'ollama.com'] as const;

export type AllowedDownloadHost = (typeof ALLOWED_DOWNLOAD_HOSTS)[number];

export class DisallowedHostError extends Error {
  constructor(readonly url: string) {
    super(
      `"${url}" is not on the download allow-list (${ALLOWED_DOWNLOAD_HOSTS.join(', ')}). ` +
        'Apunta downloads models on first run and makes no other outbound request.',
    );
    this.name = 'DisallowedHostError';
  }
}

/** Throws unless `raw` is https, on an allow-listed host, with no query string. */
export function assertAllowedHost(raw: string): void {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new DisallowedHostError(raw);
  }
  const allowed = (ALLOWED_DOWNLOAD_HOSTS as readonly string[]).includes(parsed.hostname);
  if (parsed.protocol !== 'https:' || !allowed || parsed.search !== '' || parsed.hash !== '') {
    throw new DisallowedHostError(raw);
  }
}

export interface LicenceReference {
  /** What to call it in the window. */
  readonly name: string;
  /** Where the user can read it. Always a page, never a download. */
  readonly url: string;
  /**
   * False where nobody has opened the page yet. The first-run copy is written
   * so that it is true either way — it names the publisher and links the page
   * rather than asserting a licence identifier — but the licences document
   * says which of these has been read and which has not.
   */
  readonly verified: boolean;
}

export interface SpeechModelEntry {
  readonly filename: string;
  readonly url: string;
  /**
   * Published by whisper.cpp's own `models/download-ggml-model.sh`. SHA-1, not
   * SHA-256, because SHA-1 is all upstream publishes.
   */
  readonly sha1: string;
  /**
   * Apunta's own SHA-256, computed on the owner's Mac after the SHA-1 above
   * matched, and pinned here afterwards. Null until that happens; the
   * downloader verifies whatever is present and says which hash it used.
   */
  readonly sha256: string | null;
  /**
   * 547 MiB, from whisper.cpp's `models/README.md`. Approximate: the exact
   * byte count is whatever `Content-Length` says on the day, and the
   * downloader uses that once it has it. This number only has to be good
   * enough to refuse the download on a full disk before it starts.
   */
  readonly approxBytes: number;
  readonly licence: LicenceReference;
}

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

/**
 * The speech model.
 *
 * The Hugging Face owner is `ggerganov`, not `ggml-org` — the GitHub
 * organisation was renamed and the model repository was not. Getting that
 * wrong is a 404.
 */
export const SPEECH_MODEL: SpeechModelEntry = {
  filename: WHISPER_MODEL_FILENAME,
  url: `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${WHISPER_MODEL_FILENAME}`,
  sha1: 'e050f7970618a659205450ad97eb95a18d69c9ee',
  sha256: null,
  approxBytes: 547 * MIB,
  licence: {
    name: 'MIT (OpenAI Whisper)',
    url: 'https://huggingface.co/ggerganov/whisper.cpp',
    verified: true,
  },
};

export interface WritingModelEntry {
  /** The Ollama tag the app pulls and then asks for by name. */
  readonly tag: string;
  /** Who published the weights, in the words the window uses. */
  readonly publisher: string;
  /**
   * Rough on-disk size, for the disk check *before* anything is downloaded.
   * Ollama reports the real total once the pull starts and the check is redone
   * against that number, so this is a guard rail, not a measurement.
   *
   * **Unverified.** No machine in this project has pulled any of these tags;
   * `docs/MANUAL-VERIFICATION.md` carries the row that settles it.
   */
  readonly approxBytes: number;
  readonly licence: LicenceReference;
}

/**
 * The three tiers, keyed by the tag `modelForMemory()` returns.
 *
 * The tags themselves come from `@apunta/shared` so the table cannot drift
 * from the server's; what is added here is the download-time metadata the
 * first-run window needs.
 */
export const WRITING_MODELS: Readonly<Record<string, WritingModelEntry>> = {
  [LARGE_MODEL]: {
    tag: LARGE_MODEL,
    publisher: 'Alibaba (the Qwen team)',
    approxBytes: 22 * GIB,
    licence: { name: 'Apache-2.0', url: 'https://ollama.com/library/qwen3.6', verified: false },
  },
  [DEFAULT_MODEL]: {
    tag: DEFAULT_MODEL,
    publisher: 'Google',
    approxBytes: 8 * GIB,
    licence: { name: 'Gemma Terms of Use', url: 'https://ollama.com/library/gemma4', verified: false },
  },
  [SMALL_MODEL]: {
    tag: SMALL_MODEL,
    publisher: 'Alibaba (the Qwen team)',
    approxBytes: 3 * GIB,
    licence: { name: 'Apache-2.0', url: 'https://ollama.com/library/qwen3.5', verified: false },
  },
};

/**
 * What is known about a tag, including one the tier table never picks.
 *
 * A `--model` override or an `llm_model` setting can name anything, and the
 * window still has to say something true about it before it downloads
 * gigabytes. The fallback names the library page rather than claiming a
 * licence nobody has read.
 */
export function writingModel(tag: string): WritingModelEntry {
  const known = WRITING_MODELS[tag];
  if (known !== undefined) return known;
  return {
    tag,
    publisher: 'its publisher',
    approxBytes: 8 * GIB,
    licence: { name: 'the publisher’s terms', url: 'https://ollama.com/library', verified: false },
  };
}
