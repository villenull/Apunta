import { setupError } from './errors.js';

/**
 * Talking to the bundled runtime over loopback.
 *
 * Apunta speaks Ollama's native API — `/api/chat`, `/api/tags`, `/api/show` —
 * and M8 bundles the runtime the app actually speaks
 * (`docs/agents/M8-installer.md`, *Correction: the runtime swap is not this
 * packet*). So the writing model is not a file this package downloads; it is a
 * pull the runtime performs, and this module's job is to ask for it and turn
 * its progress into the same events the file downloader emits.
 *
 * Nothing here starts a process. The **server** owns `ollama serve`
 * (`server/src/ai/ollama-process.ts`), exactly as it already owns
 * `whisper-cli`, which is what keeps the process tree two levels deep and
 * "quit leaves no orphans" a single kill rather than tree bookkeeping.
 */

export interface OllamaClientOptions {
  /** Always loopback. */
  readonly baseUrl: string;
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal | undefined;
}

/** Milliseconds a single probe gets before it counts as unreachable. */
const PROBE_TIMEOUT_MS = 3000;

/**
 * Is the runtime answering yet?
 *
 * `/api/tags` rather than `/`: it is the endpoint the app's own health check
 * uses, so "reachable" means the same thing in both places.
 */
export async function isReachable(options: OllamaClientOptions): Promise<boolean> {
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(`${options.baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export interface WaitOptions extends OllamaClientOptions {
  readonly timeoutMs: number;
  readonly intervalMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}

/** Poll until the runtime answers, or the budget runs out. */
export async function waitForOllama(options: WaitOptions): Promise<boolean> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const interval = options.intervalMs ?? 500;
  const deadline = now() + options.timeoutMs;

  for (;;) {
    if (await isReachable(options)) return true;
    if (now() >= deadline) return false;
    await sleep(interval);
  }
}

/**
 * Is this exact tag already pulled?
 *
 * Ollama reports `gemma4:12b-it-qat` in `models[].name`, and a bare family
 * name matches nothing — which is the intended behaviour here, because the
 * tier table pins explicit tags for a reason (`gemma4:latest` is E4B, not
 * 12B).
 */
export async function hasModel(tag: string, options: OllamaClientOptions): Promise<boolean> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let payload: unknown;
  try {
    const response = await fetchImpl(`${options.baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!response.ok) return false;
    payload = await response.json();
  } catch {
    return false;
  }
  const models = (payload as { models?: unknown }).models;
  if (!Array.isArray(models)) return false;
  return models.some((entry) => {
    const name = (entry as { name?: unknown }).name;
    return typeof name === 'string' && name === tag;
  });
}

export interface PullProgress {
  readonly completedBytes: number;
  readonly totalBytes: number | null;
  /** Ollama's own word for what it is doing, already in plain English. */
  readonly status: string;
}

export interface PullResult {
  readonly tag: string;
  /**
   * The digest the runtime reports for the tag it now holds, read back with
   * `POST /api/show` after the pull succeeded — or null when the runtime named
   * none. It is never invented: a digest nobody reported is not a digest.
   */
  readonly digest: string | null;
}

export interface PullOptions extends OllamaClientOptions {
  readonly tag: string;
  readonly onProgress?: (progress: PullProgress) => void;
}

/**
 * Pull a tag, reporting progress.
 *
 * Ollama streams NDJSON: a `status` line per phase, and for each layer a line
 * carrying `digest`, `total` and `completed`. Progress is summed **per
 * digest** rather than accumulated, because the same digest is reported many
 * times with a growing `completed` — adding them up produces a bar that
 * reaches 4000%.
 *
 * Resume is the runtime's problem and it already solves it: a pull that is
 * interrupted leaves its finished blobs in the model store, and pulling again
 * skips them. That is what makes "kill it mid-download and relaunch" work for
 * the writing model without any bookkeeping here.
 *
 * **The pull is the daemon's, not ours.** This function asks the loopback
 * runtime to do it; it does not know, and cannot find out, which registry the
 * runtime then spoke to. What it can do is read the resulting tag's digest back
 * afterwards and hand it to the caller, so the tag in the store is named exactly
 * rather than assumed — and the caller says in as many words which of the two
 * programs did the fetching. There is no call in this module that removes or
 * replaces a tag, and adding one would need its own card.
 */
export async function pullModel(options: PullOptions): Promise<PullResult> {
  const fetchImpl = options.fetchImpl ?? fetch;

  const response = await fetchImpl(`${options.baseUrl}/api/pull`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: options.tag, stream: true }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });

  if (!response.ok) {
    throw setupError('model_pull_failed', `HTTP ${String(response.status)} from /api/pull`);
  }
  if (response.body === null) {
    throw setupError('model_pull_failed', 'no response body from /api/pull');
  }

  const totals = new Map<string, number>();
  const completed = new Map<string, number>();
  let sawSuccess = false;

  for await (const line of ndjson(response.body)) {
    const record = line as Record<string, unknown>;

    const error = record['error'];
    if (typeof error === 'string' && error !== '') {
      throw setupError('model_pull_failed', error, pullErrorDetail(error, options.tag));
    }

    const digest = record['digest'];
    const total = record['total'];
    const done = record['completed'];
    if (typeof digest === 'string') {
      if (typeof total === 'number') totals.set(digest, total);
      if (typeof done === 'number') completed.set(digest, done);
    }

    const status = typeof record['status'] === 'string' ? record['status'] : '';
    if (status === 'success') sawSuccess = true;

    if (options.onProgress !== undefined) {
      const totalBytes = sum(totals);
      options.onProgress({
        completedBytes: sum(completed),
        totalBytes: totalBytes > 0 ? totalBytes : null,
        status,
      });
    }
  }

  if (!sawSuccess) {
    throw setupError('model_pull_failed', `the pull of ${options.tag} ended without succeeding`);
  }

  return { tag: options.tag, digest: await readModelDigest(options.tag, options) };
}

/**
 * The digest the runtime reports for a tag, read with one `POST /api/show`.
 *
 * This is the whole of what Apunta can say about a writing model after pulling
 * it: the tag is there, and this is the digest the runtime says is behind it.
 *
 * A runtime that answers nothing useful is **not** a failed pull. The model is
 * in the store and the install succeeded; the one thing missing is a name for
 * the bytes, so the caller is handed `null` and says so. Failing the whole
 * setup over a missing label would strand a machine that works.
 */
export async function readModelDigest(tag: string, options: OllamaClientOptions): Promise<string | null> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let payload: unknown;
  try {
    const response = await fetchImpl(`${options.baseUrl}/api/show`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: tag }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    if (!response.ok) return null;
    payload = await response.json();
  } catch {
    return null;
  }
  return digestFrom(payload);
}

/**
 * The digest out of an `/api/show` payload.
 *
 * Two shapes are read because the endpoint has carried both: the digest at the
 * top level, and a `models` array whose first entry names it. Nothing else is
 * consulted, and a payload that names no digest yields null rather than a guess
 * assembled out of the other fields.
 */
function digestFrom(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const record = payload as Record<string, unknown>;
  const direct = record['digest'];
  if (typeof direct === 'string' && direct !== '') return direct;
  const models = record['models'];
  if (Array.isArray(models)) {
    for (const entry of models) {
      const digest = (entry as { digest?: unknown }).digest;
      if (typeof digest === 'string' && digest !== '') return digest;
    }
  }
  return null;
}

/**
 * The one pull failure worth its own sentence.
 *
 * A tag that does not exist in the registry 404s, and no amount of retrying
 * fixes it — it means the pinned tier tag was renamed or withdrawn, which is
 * exactly what `docs/MANUAL-VERIFICATION.md` warns has never been checked
 * against a live registry.
 */
function pullErrorDetail(error: string, tag: string): string | undefined {
  const lower = error.toLowerCase();
  if (lower.includes('not found') || lower.includes('404')) {
    return (
      `Apunta asked for a writing model called “${tag}” and its publisher’s library does not have ` +
      'one by that name any more. Trying again will not help — this needs a new version of Apunta.'
    );
  }
  return undefined;
}

function sum(values: Map<string, number>): number {
  let total = 0;
  for (const value of values.values()) total += value;
  return total;
}

/** One parsed JSON object per line of a streaming body. */
export async function* ndjson(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line !== '') yield JSON.parse(line);
      newline = buffer.indexOf('\n');
    }
  }
  const rest = buffer.trim();
  if (rest !== '') yield JSON.parse(rest);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
