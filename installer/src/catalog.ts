import {
  DEFAULT_MODEL,
  LARGE_MODEL,
  SMALL_MODEL,
  WHISPER_MODEL_FILENAME,
  WHISPER_PREVIEW_MODEL_FILENAME,
} from '@apunta/shared';

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
 *  2. the hosts are a pinned allow-list, asserted by the guard in
 *     `readiness.ts` and by a test, and the URLs Apunta composes carry no query
 *     string of its own. A `Location` the pinned host hands back may carry
 *     one — a Hugging Face signed URL cannot be fetched without one — so its
 *     parameter **names** are enumerated per artifact
 *     (`ACQUISITION.md` §1's *Allowed query keys*) and its values are never
 *     read, logged or recorded anywhere;
 *  3. Apunta never mirrors, caches or re-serves weights. One "mirror for
 *     reliability" would turn arm's length into redistribution.
 *
 * ESLint's outbound-URL rule is switched off for this one file, deliberately
 * and narrowly, in `eslint.config.js`.
 */

/**
 * What one artifact is allowed to be fetched from.
 *
 * Two lists, not one, because a redirect is a second decision: the initial
 * request goes to the host the catalogue pins, and a `Location` goes to a host
 * the redirect probe observed for that same artifact. Keeping them apart is
 * what stops an admitted redirect host from becoming a general-purpose one —
 * the initial request can never be aimed at a CDN by anything but the catalogue
 * itself.
 *
 * An empty list is the correct answer, not a gap: an artifact nobody has seen
 * redirect has no redirect host, and one whose probe was never run has none
 * either.
 */
export interface DownloadAllowance {
  readonly allowedHosts: readonly string[];
  readonly allowedRedirectHosts: readonly string[];
}

/**
 * The two speech entries' allowance.
 *
 * `us.aws.cdn.hf.co` is here because P4.1's redirect probe observed it as the
 * `Location` host for the pinned whisper file on 2026-09-26
 * (`docs/v2/evidence/P4.1/redirects.md`), and it ends in `hf.co` on a dot
 * boundary, so it is inside the Hugging Face domain tree that `ACQUISITION.md`
 * A07 admits. It is one host, observed for these artifacts, on that day.
 */
export const SPEECH_DOWNLOAD_ALLOWANCE: DownloadAllowance = {
  allowedHosts: ['huggingface.co'],
  allowedRedirectHosts: ['us.aws.cdn.hf.co'],
};

/**
 * The six C-STT candidates' allowance — the file `S4a.2` chooses.
 *
 * They are not catalogue entries yet, so nothing in this package uses this
 * object. It is named and admitted now so the guard the downloader already runs
 * is the same guard the chosen candidate will be fetched under, rather than a
 * second one added at the moment the choice is made.
 */
export const C_STT_CANDIDATE_ALLOWANCE: DownloadAllowance = {
  allowedHosts: ['huggingface.co'],
  allowedRedirectHosts: ['us.aws.cdn.hf.co'],
};

/**
 * Hosts the licence pages name, which the product never fetches.
 *
 * `registry.ollama.ai` and `ollama.com` are contacted by the bundled Ollama when
 * it pulls the writing model. Apunta opens no request to either — the window
 * only shows the link — but they are part of the product's egress and belong on
 * the record, and they are why the union below is larger than any allowance.
 */
export const LICENCE_PAGE_HOSTS = ['registry.ollama.ai', 'ollama.com'] as const;

/**
 * Every host the product may contact, and nothing else — the union.
 *
 * Derived rather than written, so admitting a redirect host cannot be
 * forgotten here: a host enters this list only by entering an allowance, and
 * `catalog.test.ts` asserts the arithmetic. The guard itself never reads it; it
 * reads the one allowance matching the artifact being fetched.
 */
export const ALLOWED_DOWNLOAD_HOSTS: readonly string[] = [
  ...SPEECH_DOWNLOAD_ALLOWANCE.allowedHosts,
  ...SPEECH_DOWNLOAD_ALLOWANCE.allowedRedirectHosts,
  ...C_STT_CANDIDATE_ALLOWANCE.allowedHosts,
  ...C_STT_CANDIDATE_ALLOWANCE.allowedRedirectHosts,
  ...LICENCE_PAGE_HOSTS,
].filter((host, index, all) => all.indexOf(host) === index);

/**
 * The query parameter names A07's artifacts actually present, verbatim.
 *
 * Every pinned whisper file answers `302` to a CloudFront **signed** URL, so
 * there is no download without a query: the signature lives in the query and
 * expires. `docs/v2/ACQUISITION.md` §1's *Allowed query keys* cell for A07
 * enumerates these ten names (AM-042, owner-approved) and the cell is the
 * complete list — a name outside it is refused before the request.
 *
 * **No value is ever read.** Admission tests the parameter *name* against this
 * set and nothing else: never a prefix, never a wildcard, never a blanket
 * permission, and case-sensitively, because a signed URL's names are. The
 * signature itself must never reach this repository, the evidence, a log or an
 * error message, which is why the probe records names and writes every value as
 * `<redacted>`.
 */
export const A07_ALLOWED_QUERY_KEYS: readonly string[] = [
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
];

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
   *
   * Nullable because readiness has to be able to say "this entry pins nothing"
   * as a verdict rather than as a crash. No entry pins null today; the type
   * admits it so the refusal is expressible.
   */
  readonly sha1: string | null;
  /**
   * Apunta's own SHA-256, computed after the SHA-1 above matched, and pinned
   * here afterwards — `tiny.en`'s on 2026-09-20, the superseded turbo model's
   * in M10, both on the partner's Linux machine. The downloader verifies
   * whatever is present and says which hash it used.
   */
  readonly sha256: string | null;
  /**
   * The exact byte count the catalogue pins. This is what "the size is the
   * pinned size" means, and it is what an 11-byte file at this path is
   * measured against. The number is upstream's own, measured 77,704,715 bytes
   * and quoted in whisper.cpp's `models/README.md`.
   */
  readonly sizeBytes: number;
  /**
   * 75 MiB, from whisper.cpp's `models/README.md` (measured 77,704,715 bytes).
   * Approximate: the exact byte count is whatever `Content-Length` says on the
   * day, and the downloader uses that once it has it. This number only has to
   * be good enough to refuse the download on a full disk before it starts.
   */
  readonly approxBytes: number;
  /**
   * Where this artifact, and only this artifact, may be fetched from — the
   * initial host and the observed redirect host. The downloader is handed this
   * one object, so rule 2 is per artifact rather than a second global list.
   */
  readonly allowance: DownloadAllowance;
  /**
   * The query parameter names this artifact's own `Location` may carry, from
   * `ACQUISITION.md` §1's *Allowed query keys* cell. Empty means no query at
   * all, which is the default and the behaviour for every row the manifest
   * marks `none`.
   */
  readonly allowedQueryKeys: readonly string[];
  readonly licence: LicenceReference;
}

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

/**
 * The measured size of the pinned whisper file, in bytes.
 *
 * whisper.cpp's `models/README.md` states 77,704,715 bytes for `ggml-tiny.en`,
 * and the catalogue pinned it inside an `approxBytes` comment until P4.1 made it
 * a pin of its own. `sizeBytes` is a pin — a file of any other size is not this
 * model — and `approxBytes` keeps its one remaining job, which is refusing the
 * download on a full disk before it starts.
 */
const PINNED_SPEECH_SIZE_BYTES = 77_704_715;

/**
 * The speech model — the one file used for both the note and the live preview.
 *
 * Dictation and notes are English-only, so this is the English-only
 * `ggml-tiny.en`: the smallest whisper, and fast enough that the same file
 * serves the preview and the final transcript. The Hugging Face owner is
 * `ggerganov`, not `ggml-org` — the GitHub organisation was renamed and the
 * model repository was not. Getting that wrong is a 404.
 */
export const SPEECH_MODEL: SpeechModelEntry = {
  filename: WHISPER_MODEL_FILENAME,
  url: `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${WHISPER_MODEL_FILENAME}`,
  sha1: 'c78c86eb1a8faa21b369bcd33207cc90d64ae9df',
  sha256: '921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f',
  sizeBytes: PINNED_SPEECH_SIZE_BYTES,
  approxBytes: 75 * MIB,
  allowance: SPEECH_DOWNLOAD_ALLOWANCE,
  allowedQueryKeys: A07_ALLOWED_QUERY_KEYS,
  licence: {
    name: 'MIT (OpenAI Whisper)',
    url: 'https://huggingface.co/ggerganov/whisper.cpp',
    verified: true,
  },
};

/**
 * The preview's model: the words she sees while still speaking. Not the
 * record — the note is transcribed by `SPEECH_MODEL` — but on English-only
 * dictation the same English-only `tiny.en` serves both, so this entry names
 * the very same file. Keeping it as its own entry is what lets the plan and
 * the window link the preview to a step; the installer downloads the file
 * once (see `plan.ts`). Same publisher, same repository, same licence. The
 * SHA-1 is whisper.cpp's published one; the SHA-256 was computed after it
 * matched (2026-09-20).
 */
export const PREVIEW_SPEECH_MODEL: SpeechModelEntry = {
  filename: WHISPER_PREVIEW_MODEL_FILENAME,
  url: `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${WHISPER_PREVIEW_MODEL_FILENAME}`,
  sha1: 'c78c86eb1a8faa21b369bcd33207cc90d64ae9df',
  sha256: '921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f',
  sizeBytes: PINNED_SPEECH_SIZE_BYTES,
  approxBytes: 75 * MIB,
  allowance: SPEECH_DOWNLOAD_ALLOWANCE,
  allowedQueryKeys: A07_ALLOWED_QUERY_KEYS,
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
 * **A writing model is not downloaded by Apunta.**
 *
 * It is pulled by the bundled Ollama daemon, which is the thing that talks to
 * the registry, and that daemon's network behaviour is outside anything this
 * package can check: it is another program, with its own store and its own
 * endpoints, and Apunta neither configures nor observes where it fetches from.
 * What Apunta does do is read the resulting tag's digest back with
 * `POST /api/show` over loopback and report it, so the tag in the store can be
 * named exactly rather than trusted — and then say, in the window, in as many
 * words, that the pull itself was the daemon's doing.
 *
 * This paragraph is the documentation half of that statement. The other half is
 * the `message` event `run.ts` emits after every successful pull, and neither
 * half is optional: a user who cannot tell which of the two programs reached out
 * cannot reason about either one.
 */

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
    // Measured, not guessed: the registry manifest's config + layer sizes for
    // this tag summed to 3,389,983,735 bytes on 2026-08-26 (M10). Rounded up
    // so the disk check keeps a margin.
    approxBytes: Math.ceil(3.2 * GIB),
    // The licence blob the tag actually ships was read on the same day: it is
    // the Apache License 2.0 text (`ollama show qwen3.5:4b-q4_K_M --license`).
    licence: { name: 'Apache-2.0', url: 'https://ollama.com/library/qwen3.5', verified: true },
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
