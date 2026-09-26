import { DEFAULT_MODEL, LARGE_MODEL, PROMOTED_DEFAULT_MODEL } from '@apunta/shared';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  A07_ALLOWED_QUERY_KEYS,
  SPEECH_DOWNLOAD_ALLOWANCE,
  SPEECH_MODEL,
  type SpeechModelEntry,
} from './catalog.js';
import type { SetupEvent } from './protocol.js';
import { partPathFor } from './resume.js';
import { receiptPathFor, writeReceiptFor } from './readiness.js';
import {
  downloadSpeechFile,
  previewModelPath,
  runSetup,
  speechModelPath,
  type SetupEnvironment,
} from './run.js';

/**
 * The whole first run, orchestrated, against a fake runtime and a fake
 * download — every branch the therapist can land in, none of them needing a
 * Mac.
 */

const BASE = 'http://127.0.0.1:11434';
const TB = 1000 ** 4;
const MODEL_BODY = Buffer.from('not really 75 MB of weights');

/** The admitted redirect host, read from the catalogue rather than written here. */
const CDN = SPEECH_DOWNLOAD_ALLOWANCE.allowedRedirectHosts[0] ?? '';

/**
 * Put a file at the model path that readiness calls **ready**.
 *
 * The pin is 77,704,715 bytes of one particular digest, and a test cannot
 * produce either. What a test *can* do is write a receipt — which is precisely
 * what the receipt is for: a file that has already been checked once, recorded
 * with the size, mtime and inode it had at the time. The file itself is created
 * sparse (`truncate`), so this costs no bytes and no hashing.
 *
 * That is the honest shape of the guarantee rather than a shortcut around it:
 * a receipt is evidence, and the download path is what earns one.
 */
function placeReadyModel(modelsDir: string, subject: SpeechModelEntry = SPEECH_MODEL): string {
  const path = join(modelsDir, subject.filename);
  // Created empty, then made sparse: `truncate` sets the length without writing
  // 75 MiB of zeros, and an all-zero file of the pinned length is the one thing
  // that is unambiguously *not* the model — the receipt is the only claim on it.
  writeFileSync(path, '');
  truncateSync(path, subject.sizeBytes);
  writeReceiptFor(path, subject, subject.sha256 ?? '');
  return path;
}

interface Harness {
  readonly events: SetupEvent[];
  readonly environment: SetupEnvironment;
  readonly modelsDir: string;
  readonly requested: string[];
  /** Every tag asked of `POST /api/pull`, in order. */
  readonly pulledTags: string[];
  /** Every endpoint asked, as `METHOD url`, in order. */
  readonly calls: string[];
}

let dir: string | null = null;

afterEach(() => {
  if (dir !== null) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

function harness(
  options: {
    pulled?: string[];
    runtimeUp?: boolean;
    freeBytes?: number | null;
    memoryGib?: number | null;
    /** A file at the model path that is *not* the model — the old "present". */
    speechModelPresent?: boolean;
    /** A file at the model path that readiness calls ready. */
    speechModelReady?: boolean;
  } = {},
): Harness {
  dir = mkdtempSync(join(tmpdir(), 'apunta-setup-'));
  const modelsDir = join(dir, 'models');
  mkdirSync(modelsDir, { recursive: true });
  if (options.speechModelPresent === true) {
    // The preview and the note share one English-only file, so writing it
    // once is what both steps see.
    writeFileSync(speechModelPath(modelsDir), MODEL_BODY);
  }
  if (options.speechModelReady === true) {
    placeReadyModel(modelsDir);
  }

  const events: SetupEvent[] = [];
  const requested: string[] = [];
  const pulledTags: string[] = [];
  const calls: string[] = [];
  const pulled = options.pulled ?? [];
  const runtimeUp = options.runtimeUp ?? true;

  const fetchImpl = (async (url: string, init?: RequestInit) => {
    requested.push(url);
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    if (url.startsWith(BASE)) {
      if (!runtimeUp) return Promise.reject(new Error('connection refused'));
      if (url.endsWith('/api/tags')) {
        const body = JSON.stringify({ models: pulled.map((name) => ({ name })) });
        return Promise.resolve(new Response(body, { status: 200 }));
      }
      if (url.endsWith('/api/show')) {
        const body = JSON.stringify({ models: [{ name: 'x', digest: 'sha256:recorded-digest' }] });
        return Promise.resolve(new Response(body, { status: 200 }));
      }
      if (url.endsWith('/api/pull')) {
        // The tag is in the body, not the URL, so "only the effective tag was
        // pulled" has to read it from here.
        const body = JSON.parse(String(init?.body ?? '{}')) as { model?: unknown };
        if (typeof body.model === 'string') pulledTags.push(body.model);
        const encoder = new TextEncoder();
        const lines = [
          '{"status":"pulling manifest"}\n',
          '{"status":"pulling aaa","digest":"aaa","total":100,"completed":100}\n',
          '{"status":"success"}\n',
        ];
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            for (const line of lines) controller.enqueue(encoder.encode(line));
            controller.close();
          },
        });
        return Promise.resolve(new Response(stream, { status: 200 }));
      }
    }
    return Promise.resolve(
      new Response(MODEL_BODY, {
        status: 200,
        headers: { 'content-length': String(MODEL_BODY.length) },
      }),
    );
  }) as unknown as typeof fetch;

  const environment: SetupEnvironment = {
    dataDir: dir,
    modelsDir,
    ollamaBaseUrl: BASE,
    memoryGib: options.memoryGib === undefined ? 32 : options.memoryGib,
    modelOverride: null,
    emit: (event) => events.push(event),
    fetchImpl,
    runtimeWaitMs: 0,
    freeBytesImpl: () => (options.freeBytes === undefined ? TB : options.freeBytes),
  };

  return { events, environment, modelsDir, requested, pulledTags, calls };
}

function eventsOf<K extends SetupEvent['event']>(
  events: SetupEvent[],
  kind: K,
): Extract<SetupEvent, { event: K }>[] {
  return events.filter((event): event is Extract<SetupEvent, { event: K }> => event.event === kind);
}

describe('runSetup', () => {
  it('does nothing and reports ready when both models are already there', async () => {
    const { events, environment, requested } = harness({
      speechModelReady: true,
      pulled: [PROMOTED_DEFAULT_MODEL],
    });

    expect(await runSetup(environment)).toBe(true);
    expect(eventsOf(events, 'done')).toHaveLength(1);
    expect(eventsOf(events, 'plan')[0]?.ready).toBe(true);
    expect(requested.some((url) => url.includes('huggingface'))).toBe(false);
    expect(requested.some((url) => url.endsWith('/api/pull'))).toBe(false);
  });

  it('pulls the writing model and reports its progress', async () => {
    const { events, environment } = harness({ speechModelReady: true });

    expect(await runSetup(environment)).toBe(true);
    const steps = eventsOf(events, 'step');
    expect(steps.find((step) => step.id === 'speech_model')?.status).toBe('skipped');
    expect(steps.filter((step) => step.id === 'writing_model').map((step) => step.status)).toEqual([
      'started',
      'finished',
    ]);
    const progress = eventsOf(events, 'progress').filter((event) => event.id === 'writing_model');
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.at(-1)?.percent).toBe(100);
  });

  /**
   * Condition 1 of keeping the weights at arm's length: the person accepting
   * the publisher's terms sees whose terms they are, before the download.
   */
  it('names the model and links its terms before pulling it', async () => {
    const { events, environment } = harness({ speechModelReady: true });
    await runSetup(environment);

    const messages = eventsOf(events, 'message').map((event) => event.text);
    const provenance = messages.find((text) => text.includes('published by'));
    expect(provenance).toBeDefined();
    expect(provenance).toContain('ollama.com/library/qwen3.5');
    expect(provenance).toContain('does not host or copy');
  });

  it('refuses a full disk before it downloads anything', async () => {
    const { events, environment, requested } = harness({ freeBytes: 1000 * 1000 * 1000 });

    expect(await runSetup(environment)).toBe(false);
    const failure = eventsOf(events, 'failed')[0];
    expect(failure?.code).toBe('not_enough_disk');
    expect(failure?.retryable).toBe(true);
    expect(failure?.detail).toMatch(/GB/);
    expect(requested.some((url) => url.includes('huggingface'))).toBe(false);
    expect(requested.some((url) => url.endsWith('/api/pull'))).toBe(false);
  });

  it('blames the engine, not the internet, when the runtime is not answering', async () => {
    const { events, environment } = harness({ runtimeUp: false, speechModelReady: true });

    expect(await runSetup(environment)).toBe(false);
    expect(eventsOf(events, 'failed')[0]?.code).toBe('runtime_unreachable');
  });

  /**
   * English-only dictation means the preview and the note run on the same
   * `tiny.en` file. The installer must fetch it once, under `speech_model`,
   * and mark the preview step satisfied rather than reaching for the same
   * bytes a second time.
   */
  it('downloads the shared whisper file once, for both the note and the preview', async () => {
    const { events, environment, modelsDir, requested } = harness({
      pulled: [PROMOTED_DEFAULT_MODEL],
    });

    const ok = await runSetup(environment);

    // The fake server's bytes fail the pinned checksum, so the run stops at
    // the first whisper step — but it reaches for the file exactly once.
    expect(ok).toBe(false);
    expect(previewModelPath(modelsDir)).toBe(speechModelPath(modelsDir));
    const whisperRequests = requested.filter((url) => url.includes('huggingface'));
    expect(whisperRequests).toHaveLength(1);
    expect(whisperRequests[0]?.endsWith('/ggml-tiny.en.bin')).toBe(true);

    const plan = eventsOf(events, 'plan')[0];
    expect(plan?.steps.find((step) => step.id === 'speech_model')?.needed).toBe(true);
    expect(plan?.steps.find((step) => step.id === 'preview_model')?.needed).toBe(false);
    expect(eventsOf(events, 'failed')[0]?.code).toBe('checksum_mismatch');
  });

  it('deletes a download that fails its checksum, and says so in plain words', async () => {
    const { events, environment, modelsDir } = harness({ pulled: [PROMOTED_DEFAULT_MODEL] });

    expect(await runSetup(environment)).toBe(false);
    const failure = eventsOf(events, 'failed')[0];
    expect(failure?.code).toBe('checksum_mismatch');
    expect(failure?.title).toContain('damaged');
    expect(() => statSync(partPathFor(join(modelsDir, SPEECH_MODEL.filename)))).toThrow();
    expect(() => statSync(speechModelPath(modelsDir))).toThrow();
  });

  /**
   * C-MODEL@1's normal example, end to end: a 16 GB machine that used to pull
   * `gemma4:12b-it-qat` now pulls the promoted tag, and the reason says so
   * without citing the 8 GB it used to be chosen by.
   */
  it('reports the effective model and why, before doing anything', async () => {
    const { events, environment } = harness({ memoryGib: 8, speechModelReady: true });
    await runSetup(environment);

    const plan = eventsOf(events, 'plan')[0];
    expect(plan?.model.tag).toBe(PROMOTED_DEFAULT_MODEL);
    expect(plan?.model.reason).toContain(PROMOTED_DEFAULT_MODEL);
    // The old row said "8 GB" and named the tier boundary. Neither is a fact
    // about the choice any more, and the reason must not imply it is.
    expect(plan?.model.reason).not.toContain('8 GB');
    // `memoryGib` is still reported — the window shows what it read.
    expect(plan?.memoryGib).toBe(8);
  });

  /**
   * The "no pull" leg. One policy means the setup run pulls the effective tag
   * and nothing else, whatever this machine could have run: no tier the RAM
   * table would have chosen, and no second model.
   */
  it('pulls only the effective tag, and no tier the machine could have used', async () => {
    // 64 GiB, 16 GiB and 8 GiB between them cover every branch of the old
    // table: large, middle, small, and the unreadable-memory fallback.
    for (const memoryGib of [64, 16, 8, null]) {
      const { events, environment, pulledTags } = harness({ memoryGib, speechModelReady: true });

      expect(await runSetup(environment)).toBe(true);
      expect(pulledTags).toEqual([PROMOTED_DEFAULT_MODEL]);
      expect(pulledTags).not.toContain(LARGE_MODEL);
      expect(pulledTags).not.toContain(DEFAULT_MODEL);
      expect(eventsOf(events, 'plan')[0]?.model.tag).toBe(PROMOTED_DEFAULT_MODEL);
    }
  });

  it('never lets an internal detail out as an event', async () => {
    const { events, environment } = harness({ pulled: [PROMOTED_DEFAULT_MODEL] });
    await runSetup(environment);

    for (const event of events) {
      const text = JSON.stringify(event);
      expect(text).not.toContain('Error:');
      expect(text).not.toMatch(/at .*\.ts:\d+/);
    }
  });
});

/**
 * The download step, on its own, with a synthetic catalogue entry.
 *
 * `downloadSpeechFile` is exported so these can drive the real thing — the real
 * verifier, the real commit, the real receipt — against an entry whose digest
 * the test *can* satisfy. A synthetic entry is the only way to assert "verified
 * against the pinned sha256" without a 75 MiB file of real weights.
 */
describe('downloading one speech file', () => {
  /** A `fetch` that answers the pinned URL, then whatever the script says. */
  function answering(...steps: readonly Response[]): { fetchImpl: typeof fetch; calls: string[] } {
    const calls: string[] = [];
    let index = 0;
    const fetchImpl = ((url: string) => {
      calls.push(url);
      const response = steps[index];
      index += 1;
      return Promise.resolve(
        response ??
          new Response('ran past the script', {
            status: 500,
          }),
      );
    }) as unknown as typeof fetch;
    return { fetchImpl, calls };
  }

  function entryWith(body: Buffer, overrides: Partial<SpeechModelEntry> = {}): SpeechModelEntry {
    return {
      filename: 'synthetic-model.bin',
      // The real pinned address, so the guard runs for real on a URL the
      // catalogue holds rather than one a test invented.
      url: SPEECH_MODEL.url,
      sha1: createHash('sha1').update(body).digest('hex'),
      sha256: createHash('sha256').update(body).digest('hex'),
      sizeBytes: body.length,
      approxBytes: body.length,
      allowance: SPEECH_DOWNLOAD_ALLOWANCE,
      allowedQueryKeys: A07_ALLOWED_QUERY_KEYS,
      licence: SPEECH_MODEL.licence,
      ...overrides,
    };
  }

  /**
   * Case 8a: the vendor's own shape. A `302` to the admitted CDN host carrying
   * the ten enumerated names, then the bytes — verified against the pinned
   * sha256, committed, and a receipt written.
   */
  it('admits the enumerated query on a redirect, and completes the download', async () => {
    const body = Buffer.from('the whole whisper model, in the small'.repeat(64));
    const signed =
      `https://${CDN}/xet-bridge-us/abc/123?` +
      A07_ALLOWED_QUERY_KEYS.map((name) => `${name}=redacted`).join('&');
    const location = new Headers();
    location.set('location', signed);
    const { fetchImpl, calls } = answering(
      new Response(null, { status: 302, headers: location }),
      new Response(body, { status: 200, headers: { 'content-length': String(body.length) } }),
    );

    const { environment, modelsDir } = harness();
    const entry = entryWith(body);
    await downloadSpeechFile({ ...environment, fetchImpl }, entry, 'speech_model');

    // Two requests, and the second is the signed address exactly as sent.
    expect(calls).toHaveLength(2);
    expect(calls[1]).toBe(signed);
    // The bytes arrived, matched the pin, and were committed under the entry's
    // own name.
    const committed = join(modelsDir, entry.filename);
    expect(statSync(committed).size).toBe(body.length);
    // And a receipt records them, so the next launch does not hash 75 MiB again.
    expect(existsSync(receiptPathFor(committed))).toBe(true);
  });

  /** Case 13: the download that failed, and everything it left behind. */
  it('leaves no file and no receipt when the bytes do not match', async () => {
    const body = Buffer.from('not the model at all'.repeat(64));
    const { fetchImpl } = answering(
      new Response(body, { status: 200, headers: { 'content-length': String(body.length) } }),
    );

    const { environment, modelsDir, events } = harness();
    const entry = entryWith(Buffer.from('what was actually pinned'.repeat(64)));

    await expect(
      downloadSpeechFile({ ...environment, fetchImpl }, entry, 'speech_model'),
    ).rejects.toMatchObject({
      name: 'SetupError',
      code: 'checksum_mismatch',
    });

    const target = join(modelsDir, entry.filename);
    expect(() => statSync(target)).toThrow();
    expect(() => statSync(partPathFor(target))).toThrow();
    expect(existsSync(receiptPathFor(target))).toBe(false);
    expect(events.filter((event) => event.event === 'failed')).toEqual([]);
  });

  /** Case 15, at the level a user sees it: a file that is not the model. */
  it('treats a file at the model path that is not the model as absent, and repairs nothing', async () => {
    const { environment, modelsDir, requested, events } = harness({ speechModelPresent: true });
    const target = speechModelPath(modelsDir);
    const before = statSync(target);

    // A plan-only run: what setup would decide, with nothing pressed.
    const { plan, state } = await import('./run.js').then((run) => run.makePlan(environment));

    expect(state.speechModelPresent).toBe(false);
    expect(plan.steps.find((step) => step.id === 'speech_model')?.needed).toBe(true);
    // Readiness wrote nothing and requested nothing.
    expect(statSync(target).mtimeMs).toBe(before.mtimeMs);
    expect(existsSync(receiptPathFor(target))).toBe(false);
    expect(requested.some((url) => url.includes('huggingface'))).toBe(false);
    expect(events).toEqual([]);
  });

  /** Case 20: a receipt records SHA-1 when that is all the entry pins. */
  it('records the SHA-1 when the entry pins no SHA-256', async () => {
    const body = Buffer.from('only a sha1 was ever published'.repeat(64));
    const { fetchImpl } = answering(
      new Response(body, { status: 200, headers: { 'content-length': String(body.length) } }),
    );

    const { environment, modelsDir } = harness();
    const entry = entryWith(body, { sha256: null });
    await downloadSpeechFile({ ...environment, fetchImpl }, entry, 'speech_model');

    const receipt = JSON.parse(
      readFileSync(receiptPathFor(join(modelsDir, entry.filename)), 'utf8'),
    ) as Record<string, unknown>;
    expect(receipt['algorithm']).toBe('sha1');
    expect(receipt['digest']).toBe(entry.sha1);
  });

  /** Case 20's other half: an entry with nothing pinned is refused outright. */
  it('issues no request at all for an entry that pins no digest', async () => {
    const { environment, modelsDir } = harness();
    const { fetchImpl, calls } = answering();
    const entry = entryWith(Buffer.from('anything'), { sha256: null, sha1: null });

    await expect(
      downloadSpeechFile({ ...environment, fetchImpl }, entry, 'speech_model'),
    ).rejects.toMatchObject({
      code: 'checksum_mismatch',
    });

    // Not merely "the harness's fetch was never called": the only transport in
    // play is the one that would have recorded a call, and it recorded none.
    expect(calls).toEqual([]);
    expect(() => statSync(join(modelsDir, entry.filename))).toThrow();
    expect(() => statSync(partPathFor(join(modelsDir, entry.filename)))).toThrow();
  });

  /** Rule 7's other half: a tag already present is not pulled again. */
  it('issues no pull at all for a tag the runtime already reports', async () => {
    const { environment, calls } = harness({
      speechModelReady: true,
      pulled: [PROMOTED_DEFAULT_MODEL],
    });

    expect(await runSetup(environment)).toBe(true);
    expect(calls.some((call) => call.includes('/api/pull'))).toBe(false);
    expect(calls.some((call) => call.includes('/api/show'))).toBe(false);
  });

  /** Rule 7's report: the tag and its digest, and who did the fetching. */
  it('names the pulled tag and the digest the runtime reports for it', async () => {
    const { environment, events } = harness({ speechModelReady: true });

    expect(await runSetup(environment)).toBe(true);
    const messages = eventsOf(events, 'message').map((event) => event.text);
    const digest = messages.find((text) => text.includes('recorded-digest'));
    expect(digest).toContain(PROMOTED_DEFAULT_MODEL);
    // The sentence has to say the pull was the runtime's, because it was.
    expect(digest).toMatch(/AI engine/);
  });
});
