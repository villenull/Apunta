import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { cpus, totalmem } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { EvalLocale } from './lexicon.js';

/**
 * C-EVAL@1 §7 identity, computed rather than asserted (FD7).
 *
 * A number without the identity that produced it is not a baseline, and the
 * fields that move most — the model digest, the corpus hashes, the commit — are
 * exactly the ones a reader cannot reconstruct afterwards. Everything here is
 * read from the machine or from files under the repository; nothing is recorded
 * from memory.
 */

export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export interface DirectoryHash {
  readonly directory: string;
  readonly expectationsSha256: string;
  readonly transcriptsSha256: string;
  readonly transcriptCount: number;
}

export interface ReportIdentity {
  readonly mode: 'provider' | 'pipeline';
  readonly locale: EvalLocale;
  readonly gitCommit: string;
  readonly gitDirty: string;
  readonly modelTag: string;
  /** Never blank in a pipeline report; the runner fails rather than record one. */
  readonly modelDigest: string;
  readonly inferenceOptions: string;
  readonly promptSetHashes: Readonly<Record<string, string>>;
  readonly scorerSha256: string;
  readonly corpus: DirectoryHash | undefined;
  readonly controls: DirectoryHash | undefined;
  readonly hardware: string;
  readonly ollamaVersion: string;
  readonly gpu: string;
  readonly node: string;
}

const PROMPT_SET_FILES = [
  'server/src/ai/default-instructions.ts',
  'server/src/ai/prompts.ts',
  'server/src/ai/clinical-knowledge/integration.ts',
  'server/src/ai/clinical-knowledge/presentation.ts',
  'server/src/ai/clinical-knowledge/interventions.ts',
  'server/src/ai/clinical-knowledge/discussion-subheadings.ts',
] as const;

/** FD7's inference options, verbatim from the recorded English baseline. */
export const INFERENCE_OPTIONS =
  'temperature 0, num_ctx 16384, num_predict 3072, seed 0, repeat_penalty 1.0, ' +
  'keep_alive 30m, JSON-schema output, sequential';

export function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * FD7's reproducible corpus hash: `sha256sum <corpus>/expectations.json` and
 * `find <corpus> -name '*.txt' -print0 | LC_ALL=C sort -z | xargs -0 cat | sha256sum`.
 * Per corpus and per controls directory, **never merged**.
 */
export function hashDirectory(directory: string): DirectoryHash {
  const transcripts: string[] = [];
  const walk = (current: string, prefix: string): void => {
    const entries = readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      const path = join(current, entry.name);
      const key = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(path, key);
      else if (entry.name.endsWith('.txt')) transcripts.push(path);
    }
  };
  walk(directory, '');
  const hash = createHash('sha256');
  for (const path of transcripts) hash.update(readFileSync(path));
  return {
    directory,
    expectationsSha256: sha256File(join(directory, 'expectations.json')),
    transcriptsSha256: hash.digest('hex'),
    transcriptCount: transcripts.length,
  };
}

function git(args: readonly string[]): string {
  try {
    return execFileSync('git', [...args], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unavailable';
  }
}

export interface IdentityInput {
  readonly mode: 'provider' | 'pipeline';
  readonly locale: EvalLocale;
  readonly modelTag: string;
  readonly modelDigest: string;
  readonly corpusDirectory?: string | undefined;
  readonly controlsDirectory?: string | undefined;
  /** Ollama's own answers, when the runner reached it. */
  readonly ollamaVersion?: string | undefined;
  readonly ollamaProcessor?: string | undefined;
}

export function buildIdentity(input: IdentityInput): ReportIdentity {
  const promptSetHashes: Record<string, string> = {};
  for (const relative of PROMPT_SET_FILES) {
    promptSetHashes[relative.split('/').pop() ?? relative] = sha256File(join(REPOSITORY_ROOT, relative));
  }

  const processor = cpus()[0]?.model.trim() ?? 'unknown';
  const cores = cpus().length;

  return {
    mode: input.mode,
    locale: input.locale,
    gitCommit: git(['rev-parse', 'HEAD']),
    gitDirty: git(['status', '--porcelain']) === '' ? 'clean' : 'dirty',
    modelTag: input.modelTag,
    modelDigest: input.modelDigest,
    inferenceOptions: INFERENCE_OPTIONS,
    promptSetHashes,
    scorerSha256: sha256File(join(REPOSITORY_ROOT, 'server/src/eval/score.ts')),
    corpus: input.corpusDirectory === undefined ? undefined : hashDirectory(input.corpusDirectory),
    controls: input.controlsDirectory === undefined ? undefined : hashDirectory(input.controlsDirectory),
    hardware: `${processor}, ${String(cores)} cores / ${String(cores)} threads, ${String(
      Math.round(totalmem() / 1024 ** 3),
    )} GiB RAM`,
    ollamaVersion: input.ollamaVersion ?? 'not recorded',
    gpu: input.ollamaProcessor ?? 'not recorded',
    node: process.version,
  };
}

/**
 * The model digest, which `/api/health` does **not** carry (FD7).
 *
 * Read from `GET /api/tags` on the loopback Ollama, under the egress guard the
 * CLI already installs, or from `ollama show`. A pipeline run fails rather than
 * recording a blank digest, because a baseline whose identity block has a hole
 * in it is the artefact this whole card exists to prevent.
 */
export async function readModelDigest(baseUrl: string, tag: string): Promise<string | undefined> {
  try {
    const response = await fetch(new URL('/api/tags', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`));
    if (!response.ok) return undefined;
    const body = (await response.json()) as { models?: { name?: string; model?: string; digest?: string }[] };
    const match = (body.models ?? []).find((entry) => (entry.name ?? entry.model) === tag);
    return match?.digest;
  } catch {
    return undefined;
  }
}

export async function readOllamaVersion(baseUrl: string): Promise<string | undefined> {
  try {
    const response = await fetch(new URL('/api/version', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`));
    if (!response.ok) return undefined;
    const body = (await response.json()) as { version?: string };
    return body.version === undefined ? undefined : `ollama ${body.version}`;
  } catch {
    return undefined;
  }
}

export async function readOllamaProcessor(baseUrl: string, tag: string): Promise<string | undefined> {
  try {
    const response = await fetch(new URL('/api/ps', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`));
    if (!response.ok) return undefined;
    const body = (await response.json()) as {
      models?: { name?: string; model?: string; size_vram?: number }[];
    };
    const loaded = (body.models ?? []).find((entry) => (entry.name ?? entry.model) === tag);
    const vram = loaded?.size_vram;
    if (loaded === undefined || vram === undefined) {
      return 'present locally; not resident, so GPU offload was not observable';
    }
    return vram === 0
      ? 'running on CPU (no VRAM offload reported)'
      : `running with ${String(Math.round((vram / 1024 ** 3) * 10) / 10)} GiB on GPU`;
  } catch {
    return undefined;
  }
}
