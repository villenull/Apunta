/**
 * Draft-latency bench for one fixture, through the production prompt.
 *
 * This is scratch tooling for `docs/eval-reports/2026-09-23-faster-lighter.md`.
 * It builds the prompt with the shipped `buildGeneratePrompt` and the shipped
 * section schema, then measures the pieces Ollama reports: model load, prompt
 * evaluation, generation, time-to-first-token, and the resident VRAM from
 * `/api/ps`. It writes no files unless `--out` is given and it never touches
 * anything but a loopback Ollama.
 *
 *   tsx tools/model-lab/bench.ts --ollama-url http://127.0.0.1:11436 \
 *     --model qwen3.5:4b-q4_K_M --fixture 03 --runs 3 --num-ctx 16384
 */
import { readFileSync, writeFileSync } from 'node:fs';

import { sectionsJsonSchema } from '@apunta/shared';

import { buildGeneratePrompt } from '../../server/src/ai/prompts.js';
import { draftSourceFor, loadCorpus } from '../../server/src/eval/corpus.js';
import { formatNameFor, instructionsFor } from '../../server/src/eval/run.js';

interface Args {
  ollamaUrl: string;
  model: string;
  fixture: string;
  fixtures: string[];
  corpus: string;
  numCtx: number;
  numPredict: number;
  runs: number;
  keepAlive: string;
  cold: boolean;
  out: string | undefined;
  label: string;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = {
    ollamaUrl: 'http://127.0.0.1:11436',
    model: 'qwen3.5:4b-q4_K_M',
    fixture: '03',
    fixtures: [],
    corpus: 'e2e/fixtures/eval',
    numCtx: 16_384,
    numPredict: 3_072,
    runs: 3,
    keepAlive: '5m',
    cold: false,
    out: undefined,
    label: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    const num = (): number => Number(value);
    switch (flag) {
      case '--ollama-url':
        args.ollamaUrl = String(value);
        i += 1;
        break;
      case '--model':
        args.model = String(value);
        i += 1;
        break;
      case '--fixture':
        args.fixture = String(value);
        i += 1;
        break;
      case '--fixtures':
        args.fixtures = String(value)
          .split(',')
          .map((part) => part.trim())
          .filter((part) => part !== '');
        i += 1;
        break;
      case '--corpus':
        args.corpus = String(value);
        i += 1;
        break;
      case '--num-ctx':
        args.numCtx = num();
        i += 1;
        break;
      case '--num-predict':
        args.numPredict = num();
        i += 1;
        break;
      case '--runs':
        args.runs = num();
        i += 1;
        break;
      case '--keep-alive':
        args.keepAlive = String(value);
        i += 1;
        break;
      case '--cold':
        args.cold = true;
        break;
      case '--out':
        args.out = String(value);
        i += 1;
        break;
      case '--label':
        args.label = String(value);
        i += 1;
        break;
      default:
        if (flag?.startsWith('--')) throw new Error(`unknown flag ${flag}`);
    }
  }
  return args;
}

interface PsRow {
  name?: string;
  model?: string;
  size?: number;
  size_vram?: number;
  context_length?: number;
}

/**
 * The GPU's own accounting, in bytes.
 *
 * `/api/ps` reports per-model allocations, but on this shared workstation other
 * processes (a sibling agent's resident model, the live app) hold VRAM too, so
 * the absolute sysfs figure is not ours alone. The honest number is the
 * *delta* across a load with everything of ours unloaded.
 */
const VRAM_USED = '/sys/class/drm/card1/device/mem_info_vram_used';

function vramUsed(): number {
  try {
    return Number(readFileSync(VRAM_USED, 'utf8').trim());
  } catch {
    return 0;
  }
}

async function ps(base: string): Promise<PsRow[]> {
  const response = await fetch(`${base}/api/ps`);
  const body = (await response.json()) as { models?: PsRow[] };
  return body.models ?? [];
}

/** Unload every resident model so the next load is a genuine cold start. */
async function unloadAll(base: string, model: string): Promise<void> {
  await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages: [], keep_alive: 0 }),
  }).catch(() => undefined);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const rows = await ps(base);
    if (rows.length === 0) return;
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 250);
    await promise;
  }
}

interface Measurement {
  run: number;
  cold: boolean;
  wallMs: number;
  ttftMs: number;
  loadMs: number;
  promptEvalMs: number;
  promptTokens: number;
  evalMs: number;
  outputTokens: number;
  genTokPerSec: number;
  promptTokPerSec: number;
  totalReportedMs: number;
  doneReason: string;
  sizeVramBytes: number;
  sizeBytes: number;
  /** 100% GPU residency: the only rows whose timings may be trusted. */
  offloadVerified: boolean;
  contextLength: number | undefined;
  vramBeforeBytes: number;
  vramAfterBytes: number;
}

async function measure(
  args: Args,
  prompt: { system: string; user: string },
  format: object,
  run: number,
  cold: boolean,
): Promise<Measurement> {
  if (cold) await unloadAll(args.ollamaUrl, args.model);
  const vramBeforeBytes = vramUsed();
  const began = Date.now();
  const response = await fetch(`${args.ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: args.model,
      stream: true,
      keep_alive: args.keepAlive,
      think: false,
      format,
      options: {
        temperature: 0,
        seed: 0,
        num_ctx: args.numCtx,
        num_predict: args.numPredict,
        repeat_penalty: 1.0,
      },
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
    }),
  });
  if (!response.body) throw new Error('no response body');
  const reader = response.body.getReader();
  const utf8 = new TextDecoder();
  let buffer = '';
  let ttftMs = 0;
  let firstContent = true;
  let final: Record<string, number | string | undefined> = {};
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += utf8.decode(value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
      if (line === '') continue;
      const chunk = JSON.parse(line) as {
        message?: { content?: string };
        done?: boolean;
        [key: string]: unknown;
      };
      if (firstContent && (chunk.message?.content ?? '') !== '') {
        ttftMs = Date.now() - began;
        firstContent = false;
      }
      if (chunk.done === true) final = chunk as Record<string, number | string | undefined>;
    }
  }
  const wallMs = Date.now() - began;
  const evalNanos = Number(final['eval_duration'] ?? 0);
  const promptEvalNanos = Number(final['prompt_eval_duration'] ?? 0);
  const outputTokens = Number(final['eval_count'] ?? 0);
  const promptTokens = Number(final['prompt_eval_count'] ?? 0);
  const rows = await ps(args.ollamaUrl);
  const row = rows.find((candidate) => (candidate.name ?? candidate.model) === args.model) ?? rows[0];
  const sizeVramBytes = row?.size_vram ?? 0;
  const sizeBytes = row?.size ?? 0;
  return {
    run,
    cold,
    wallMs,
    ttftMs,
    loadMs: Number(final['load_duration'] ?? 0) / 1e6,
    promptEvalMs: promptEvalNanos / 1e6,
    promptTokens,
    evalMs: evalNanos / 1e6,
    outputTokens,
    genTokPerSec: evalNanos > 0 ? outputTokens / (evalNanos / 1e9) : 0,
    promptTokPerSec: promptEvalNanos > 0 ? promptTokens / (promptEvalNanos / 1e9) : 0,
    totalReportedMs: Number(final['total_duration'] ?? 0) / 1e6,
    doneReason: String(final['done_reason'] ?? 'stop'),
    sizeVramBytes,
    sizeBytes,
    offloadVerified: sizeBytes > 0 && sizeVramBytes === sizeBytes,
    contextLength: row?.context_length,
    vramBeforeBytes,
    vramAfterBytes: vramUsed(),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const corpus = loadCorpus(args.corpus);
  const wanted = args.fixtures.length > 0 ? args.fixtures : [args.fixture];
  const selected = wanted.map((needle) => {
    const fixture = corpus.find((candidate) => candidate.filename.includes(needle));
    if (fixture === undefined) throw new Error(`no fixture matching ${needle}`);
    return fixture;
  });

  const measurements: (Measurement & { fixture: string })[] = [];
  let first = true;
  for (let pass = 1; pass <= args.runs; pass += 1) {
    for (const fixture of selected) {
      const prompt = buildGeneratePrompt({
        instructions: instructionsFor(fixture),
        sections: fixture.sections,
        formatName: formatNameFor(fixture),
        ...draftSourceFor(fixture),
      });
      const format = sectionsJsonSchema(fixture.sections) as object;
      const cold = args.cold && first;
      first = false;
      const measurement = await measure(args, prompt, format, pass, cold);
      measurements.push({ ...measurement, fixture: fixture.filename });
      process.stderr.write(`  ${args.label || args.model} ${fixture.filename} pass ${String(pass)} done\n`);
    }
  }
  const summary = {
    label: args.label || args.model,
    model: args.model,
    fixtures: selected.map((fixture) => fixture.filename),
    numCtx: args.numCtx,
    numPredict: args.numPredict,
    cold: args.cold,
    measurements,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (args.out !== undefined) writeFileSync(args.out, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
}

await main();
