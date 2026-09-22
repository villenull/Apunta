import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { hostname, platform, release } from 'node:os';
import { buildSectionsSchema, sectionsJsonSchema, type Sections } from '@apunta/shared';
import { buildGeneratePrompt } from '../../server/src/ai/prompts.js';
import { instructionsFor } from '../../server/src/eval/run.js';
import { draftSourceFor, loadCorpus, type Fixture } from '../../server/src/eval/corpus.js';
import { scoreNote } from '../../server/src/eval/score.js';
import { assertRecord, SCHEMA_VERSION } from './schema.mjs';

type Json = Record<string, unknown>;
const ROOT = resolve(import.meta.dirname, '../..');
const OUT_DIR = resolve(ROOT, 'scripts/model-comparison/results');
const CONTEXT = 16_384;
const PREDICT = 3_072;
const KEEP_ALIVE = '30m';
const MODELS = [
  'qwen3.5:4b-q4_K_M',
  'qwen3.5:2b-q4_K_M',
  'prism-ml/Bonsai-8B-gguf/Bonsai-8B-Q1_0.gguf',
  'prism-ml/Bonsai-4B-gguf/Bonsai-4B-Q1_0.gguf',
] as const;

const sha = (text: string | Uint8Array) => createHash('sha256').update(text).digest('hex');
const words = (text: string) => (text.trim() === '' ? 0 : text.trim().split(/\s+/u).length);
const now = () => new Date().toISOString();

interface Args {
  url: string;
  models: string[];
  runs: number;
  fixtures: string;
  out: string;
  nearBudget: boolean;
}
function args(argv: string[]): Args {
  const result: Args = {
    url: process.env.APUNTA_BENCH_URL ?? 'http://127.0.0.1:11435',
    models: [...MODELS],
    runs: 3,
    fixtures: 'all',
    out: resolve(OUT_DIR, 'records.jsonl'),
    nearBudget: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--url') {
      result.url = value ?? result.url;
      i++;
    } else if (flag === '--models') {
      result.models = (value ?? '').split(',').filter(Boolean);
      i++;
    } else if (flag === '--runs') {
      result.runs = Number(value);
      i++;
    } else if (flag === '--fixtures') {
      result.fixtures = value ?? 'all';
      i++;
    } else if (flag === '--out') {
      result.out = resolve(ROOT, value ?? result.out);
      i++;
    } else if (flag === '--no-near-budget') result.nearBudget = false;
    else if (flag === '--help') {
      console.error(
        'runner.ts --url URL --models a,b --runs N --fixtures all|smoke|corpus --out FILE [--no-near-budget]',
      );
      process.exit(0);
    }
  }
  if (!Number.isInteger(result.runs) || result.runs < 1) throw new Error('--runs must be >= 1');
  return result;
}

interface ModelInfo {
  id: string;
  runtimeModel: string;
  file: string;
  sha256: string;
  template: string;
  context: number;
  decoding: Json;
  capabilities: string[];
  format: string | null;
}
function runtimeName(model: string): string {
  if (model.includes('Bonsai-8B')) return 'prism-ml/Bonsai-8B-gguf:Q1_0';
  if (model.includes('Bonsai-4B')) return 'prism-ml/Bonsai-4B-gguf:Q1_0';
  return model;
}
async function show(base: string, model: string): Promise<ModelInfo> {
  const runtimeModel = runtimeName(model);
  const response = await fetch(`${base}/api/show`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: runtimeModel }),
  });
  const body = await response.text();
  if (!response.ok)
    throw new Error(`${model} (${runtimeModel}): /api/show ${response.status}: ${body.slice(0, 200)}`);
  const parsed = JSON.parse(body) as Json;
  const details = (parsed.details ?? {}) as Json;
  const capabilities = Array.isArray(parsed.capabilities) ? parsed.capabilities.map(String) : [];
  const modelInfo = parsed.model_info as Json | undefined;
  const contextLength = details.context_length ?? modelInfo?.['general.context_length'] ?? CONTEXT;
  const tagsResponse = await fetch(`${base}/api/tags`);
  const tags = tagsResponse.ok ? ((await tagsResponse.json()) as Json) : {};
  const rows = Array.isArray(tags.models) ? tags.models : [];
  const tag = rows.find((candidate) => (candidate as Json).name === runtimeModel) as Json | undefined;
  const digest = typeof tag?.digest === 'string' ? tag.digest : String(parsed.digest ?? '');
  return {
    id: model,
    runtimeModel,
    file: `ollama:${runtimeModel}`,
    sha256: digest,
    template: String(parsed.template ?? ''),
    context: Number(contextLength),
    decoding: {
      temperature: 0,
      seed: 0,
      repeatPenalty: 1,
      numPredict: PREDICT,
      keepAlive: KEEP_ALIVE,
      think: capabilities.includes('thinking') ? false : 'omitted',
    },
    capabilities,
    format: typeof details.format === 'string' ? details.format : null,
  };
}
function processTreeRss(pid: number): number {
  if (pid <= 0) return 0;
  const parentOf = new Map<number, number>();
  const rss = new Map<number, number>();
  try {
    for (const entry of readdirSync('/proc')) {
      if (!/^\d+$/u.test(entry)) continue;
      const candidate = Number(entry);
      const status = readFileSync(`/proc/${entry}/status`, 'utf8');
      const parent = Number(/^PPid:\s+(\d+)$/mu.exec(status)?.[1] ?? '0');
      const bytes = Number(/^VmRSS:\s+(\d+)\s+kB$/mu.exec(status)?.[1] ?? '0') * 1024;
      parentOf.set(candidate, parent);
      rss.set(candidate, bytes);
    }
  } catch {
    /* process exited between directory and status reads */
  }
  const descendants = new Set<number>([pid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [candidate, parent] of parentOf) {
      if (descendants.has(parent) && !descendants.has(candidate)) {
        descendants.add(candidate);
        changed = true;
      }
    }
  }
  let total = 0;
  for (const candidate of descendants) total += rss.get(candidate) ?? 0;
  return total;
}

function memorySnapshot(): { rss: number; vram: number | null } {
  const servicePid = Number(process.env.APUNTA_BENCH_SERVICE_PID ?? '0');
  const ownRss = processTreeRss(process.pid);
  const serviceRss = servicePid > 0 ? processTreeRss(servicePid) : 0;
  let vram: number | null = null;
  try {
    const paths = [
      '/sys/class/drm/card0/device/mem_info_vram_used',
      '/sys/class/drm/card1/device/mem_info_vram_used',
    ];
    vram = paths
      .map((path) => Number(readFileSync(path, 'utf8').trim()))
      .filter(Number.isFinite)
      .reduce((a, b) => a + b, 0);
  } catch {
    /* no DRM accounting available */
  }
  return { rss: ownRss + serviceRss, vram };
}

interface ChatResult {
  raw: string;
  parsed: Sections;
  attempts: number;
  stopReason: string;
  promptTokens: number;
  outputTokens: number;
  promptEvalMs: number;
  generationMs: number;
  totalMs: number;
  peakRss: number;
  peakVram: number | null;
  baselineVram: number | null;
  peakVramDelta: number | null;
  request: Json;
}
async function chat(
  base: string,
  info: ModelInfo,
  prompt: { system: string; user: string },
  sections: readonly string[],
): Promise<ChatResult> {
  const schema = buildSectionsSchema(sections);
  let lastError = '';
  const started = performance.now();
  let peak = memorySnapshot();
  const baselineVram = peak.vram;
  const sampler = setInterval(() => {
    const sample = memorySnapshot();
    if (sample.rss > peak.rss) peak = { ...peak, rss: sample.rss };
    if (sample.vram !== null && (peak.vram === null || sample.vram > peak.vram))
      peak = { ...peak, vram: sample.vram };
  }, 50);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const messages: Json[] = [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ];
    const body: Json = {
      model: info.runtimeModel,
      stream: true,
      keep_alive: KEEP_ALIVE,
      format: sectionsJsonSchema(sections),
      options: {
        temperature: 0,
        num_ctx: CONTEXT,
        num_predict: PREDICT,
        seed: attempt - 1,
        repeat_penalty: 1,
      },
      messages,
    };
    if (info.capabilities.includes('thinking')) body.think = false;
    const response = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok || response.body === null) throw new Error(`${info.id}: /api/chat ${response.status}`);
    let raw = '';
    let doneReason = '';
    let promptTokens = 0;
    let outputTokens = 0;
    let promptEvalMs = 0;
    let generationMs = 0;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      pending += decoder.decode(next.value, { stream: true });
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const chunk = JSON.parse(line) as Json;
        const message = (chunk.message ?? {}) as Json;
        if (typeof message.content === 'string') raw += message.content;
        if (chunk.done === true) {
          doneReason = String(chunk.done_reason ?? '');
          promptTokens = Number(chunk.prompt_eval_count ?? 0);
          outputTokens = Number(chunk.eval_count ?? 0);
          promptEvalMs = Number(chunk.prompt_eval_duration ?? 0) / 1e6;
          generationMs = Number(chunk.eval_duration ?? 0) / 1e6;
        }
        const sample = memorySnapshot();
        if (sample.rss > peak.rss) peak = { ...peak, rss: sample.rss };
        if (sample.vram !== null && (peak.vram === null || sample.vram > peak.vram))
          peak = { ...peak, vram: sample.vram };
      }
    }
    if (doneReason === 'length') {
      lastError = `done_reason=length after ${outputTokens} tokens`;
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      lastError = `not JSON (${raw.length} chars)`;
      continue;
    }
    const checked = schema.safeParse(parsed);
    if (!checked.success) {
      lastError = 'schema mismatch';
      continue;
    }
    clearInterval(sampler);
    return {
      raw,
      parsed: checked.data,
      attempts: attempt,
      stopReason: doneReason || 'stop',
      promptTokens,
      outputTokens,
      promptEvalMs,
      generationMs,
      totalMs: performance.now() - started,
      peakRss: peak.rss,
      peakVram: peak.vram,
      baselineVram,
      peakVramDelta: peak.vram !== null && baselineVram !== null ? peak.vram - baselineVram : null,
      request: { ...body, messages: '[synthetic prompt omitted from request metadata]' },
    };
  }
  clearInterval(sampler);
  throw new Error(`${info.id}: ${lastError}`);
}

function checkExpected(fixture: Fixture, sections: Sections): Json[] {
  const score = scoreNote(fixture, sections);
  return [
    {
      id: 'rubric-score',
      expected: { total: '0-100', noGatingFabrication: true },
      observed: {
        total: score.total,
        structural: score.structural,
        faithfulness: score.faithfulness,
        completeness: score.completeness,
        hedging: score.hedging,
        tone: score.tone,
        gating: score.gating,
        capturedFacts: score.capturedFacts,
        totalFacts: score.totalFacts,
        safetyPassed: score.safetyPassed,
        bannedHits: score.bannedHits,
        numberFlags: score.numberFlags,
        medicationFlags: score.medicationFlags,
      },
      pass: score.gating.length === 0,
    },
    {
      id: 'json-schema',
      expected: true,
      observed: score.gating,
      pass: !score.gating.some((x) => x.startsWith('S1') || x.startsWith('S2')),
    },
    {
      id: 'no-fabrication-gate',
      expected: false,
      observed: score.gating,
      pass:
        score.gating.filter((x) => x.startsWith('F1') || x.startsWith('F6') || x.startsWith('F7')).length ===
        0,
    },
    {
      id: 'salient-facts',
      expected: `${score.totalFacts}`,
      observed: `${score.capturedFacts}`,
      pass: score.capturedFacts === score.totalFacts,
    },
    { id: 'safety-facts', expected: true, observed: score.safetyPassed, pass: score.safetyPassed },
    {
      id: 'retraction-and-negation',
      expected: true,
      observed: score.bannedHits.length === 0,
      pass: score.bannedHits.length === 0,
    },
  ];
}

function makeNearBudget(): {
  id: string;
  sections: string[];
  instructions: string;
  transcript: string;
  checks: Json[];
} {
  const sections = ['Subjective', 'Objective', 'Assessment', 'Plan'];
  const seed =
    'Synthetic source fact: Alex Roe reported a neutral check-in with no safety concern, no diagnosis, and no medication change. ';
  const transcript = seed.repeat(320);
  return {
    id: 'near-budget-negation-01',
    sections,
    instructions:
      'Write only what the source states. Preserve the explicit no-safety-concern and no-medication-change statements. Leave unsupported sections blank. Return JSON only.',
    transcript,
    checks: [
      {
        id: 'near-budget-input',
        expected: 'accepted without truncation',
        observed: 'measured by prompt_eval_count',
        pass: true,
      },
    ],
  };
}

async function main() {
  const options = args(process.argv.slice(2));
  mkdirSync(resolve(options.out, '..'), { recursive: true });
  writeFileSync(options.out, '', 'utf8');
  const experimentId = `four-model-${new Date()
    .toISOString()
    .replaceAll(/[-:.TZ]/g, '')
    .slice(0, 14)}`;
  const environment = {
    host: hostname(),
    os: `${platform()} ${release()}`,
    runtime: `node ${process.version}`,
    backend: `ollama-native-api ${options.url}`,
    revision: process.env.GIT_COMMIT ?? 'working-tree-frozen-by-integrator',
  };
  const corpus = loadCorpus();
  const chosen = options.fixtures === 'smoke' ? corpus.slice(0, 1) : corpus;
  for (const model of options.models) {
    let info: ModelInfo;
    try {
      info = await show(options.url, model);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const unsupported = assertRecord({
        schemaVersion: SCHEMA_VERSION,
        experimentId,
        startedAt: now(),
        environment,
        model: {
          id: model,
          runtimeModel: runtimeName(model),
          file: 'unavailable',
          sha256: '',
          template: '',
          context: CONTEXT,
          decoding: { temperature: 0, seed: 0, repeatPenalty: 1, numPredict: PREDICT },
          capabilities: [],
          format: null,
        },
        caseId: 'compatibility',
        input: { sha256: '', promptKind: 'compatibility-probe', sourceWords: 0 },
        request: {},
        output: { raw: '', sha256: sha('') },
        timings: {
          coldMs: null,
          warmMs: null,
          endToEndMs: null,
          promptEvalMs: null,
          generationMs: null,
          runs: 0,
          sampleCount: 0,
          coldCondition: 'not measured',
          warmCondition: 'not measured',
        },
        memory: {
          method: 'not measured because /api/show failed',
          sampleCadenceMs: 0,
          processTree: 'none',
          processIdentity: 'none',
          peakRssBytes: null,
          peakVramBytes: null,
          baselineVramBytes: null,
          peakVramDeltaBytes: null,
          contextTokens: CONTEXT,
          gpuIsolation: 'not measured',
        },
        checks: [
          { id: 'ollama-show', expected: 'model loadable and format=gguf', observed: message, pass: false },
        ],
        retries: 0,
        stopReason: 'unsupported',
        outcome: 'unsupported',
        limitations: ['Compatibility probe failed before inference; no quality score is admissible.'],
      });
      appendFileSync(options.out, `${JSON.stringify(unsupported)}\n`);
      console.error(`${model}: unsupported (${message})`);
      continue;
    }
    console.error(
      `model ${model}: format=${info.format ?? 'unknown'} template=${sha(info.template)} capabilities=${info.capabilities.join(',')}`,
    );
    const cases: Array<{
      id: string;
      fixture?: Fixture;
      sections: string[];
      instructions: string;
      transcript: string;
      typedNotes?: string;
      checks?: Json[];
    }> = [];
    if (options.fixtures !== 'near-budget')
      for (const fixture of chosen)
        cases.push({
          id: fixture.filename,
          fixture,
          sections: fixture.sections,
          instructions: instructionsFor(fixture),
          ...(draftSourceFor(fixture) as { transcript: string; typedNotes?: string }),
        });
    if (options.nearBudget && options.fixtures !== 'corpus') {
      const near = makeNearBudget();
      cases.push({
        id: near.id,
        sections: near.sections,
        instructions: near.instructions,
        transcript: near.transcript,
        checks: near.checks,
      });
    }
    if (options.fixtures === 'smoke') cases.splice(1);
    let runIndex = 0;
    for (const testCase of cases) {
      for (let run = 1; run <= options.runs; run++) {
        runIndex++;
        const prompt = buildGeneratePrompt({
          instructions: testCase.instructions,
          sections: testCase.sections,
          formatName: testCase.fixture?.format === 'intake' ? 'Intake note' : 'Progress note',
          ...(testCase.typedNotes === undefined ? {} : { typedNotes: testCase.typedNotes }),
          ...(testCase.transcript === undefined ? {} : { transcript: testCase.transcript }),
        });
        const inputHash = sha(`${prompt.system}\n---USER---\n${prompt.user}`);
        const cold = runIndex === 1;
        const startedAt = now();
        let outcome: 'pass' | 'fail' | 'unsupported' | 'unmeasured' = 'pass';
        let result: ChatResult | null = null;
        let errorText = '';
        try {
          result = await chat(options.url, info, prompt, testCase.sections);
        } catch (error) {
          outcome = 'fail';
          errorText = error instanceof Error ? error.message : String(error);
        }
        const checks =
          result === null
            ? [{ id: 'provider-call', expected: 'schema-valid response', observed: errorText, pass: false }]
            : options.fixtures === 'smoke'
              ? [
                  {
                    id: 'provider-schema',
                    expected: 'sections JSON schema',
                    observed: Object.keys(result.parsed),
                    pass: true,
                  },
                  {
                    id: 'provider-stop',
                    expected: 'stop',
                    observed: result.stopReason,
                    pass: result.stopReason === 'stop',
                  },
                  {
                    id: 'provider-not-truncated',
                    expected: 'prompt below context ceiling',
                    observed: result.promptTokens,
                    pass: result.promptTokens < CONTEXT - 64,
                  },
                ]
              : testCase.fixture
                ? checkExpected(testCase.fixture, result.parsed)
                : (testCase.checks ?? []);
        if (result !== null && testCase.id.startsWith('near-budget'))
          checks.push({
            id: 'prompt-not-truncated',
            expected: `<${String(CONTEXT - 64)} prompt tokens`,
            observed: result.promptTokens,
            pass: result.promptTokens < CONTEXT - 64,
          });
        if (checks.some((check) => check.pass === false)) outcome = 'fail';
        const coldCondition =
          process.env.APUNTA_BENCH_SERVICE_RESET === '1'
            ? 'isolated Ollama service restarted before arm; first request keep_alive=30m'
            : 'first request keep_alive=30m; process state not reset';
        const raw = result?.raw ?? '';
        const record = assertRecord({
          schemaVersion: SCHEMA_VERSION,
          experimentId,
          startedAt,
          environment,
          model: { ...info, decoding: info.decoding },
          caseId: testCase.id,
          input: {
            sha256: inputHash,
            promptKind: testCase.fixture ? 'existing-20-fixture' : 'near-budget-synthetic',
            sourceWords: words(`${testCase.typedNotes ?? ''} ${testCase.transcript ?? ''}`),
          },
          request: result?.request ?? { error: errorText },
          output: { raw, sha256: sha(raw) },
          timings: {
            coldMs: cold && result ? result.totalMs : null,
            warmMs: !cold && result ? result.totalMs : null,
            endToEndMs: result?.totalMs ?? null,
            promptEvalMs: result?.promptEvalMs ?? null,
            generationMs: result?.generationMs ?? null,
            runs: run,
            sampleCount: 1,
            coldCondition,
            warmCondition: 'subsequent sequential request keep_alive=30m',
          },
          memory: {
            method:
              'runner periodic 50ms RSS sampler plus APUNTA_BENCH_SERVICE_PID full descendant process tree via /proc PPid map; /sys/class/drm/*/mem_info_vram_used',
            sampleCadenceMs: 50,
            processTree: process.env.APUNTA_BENCH_SERVICE_PID
              ? 'runner plus isolated Ollama service full descendant process tree (PPid map)'
              : 'runner only',
            processIdentity: process.env.APUNTA_BENCH_SERVICE_PID
              ? `runner pid ${String(process.pid)}; Ollama service pid ${process.env.APUNTA_BENCH_SERVICE_PID}`
              : `runner pid ${String(process.pid)}`,
            peakRssBytes: result?.peakRss ?? null,
            peakVramBytes: result?.peakVram ?? null,
            baselineVramBytes: result?.baselineVram ?? null,
            peakVramDeltaBytes: result?.peakVramDelta ?? null,
            contextTokens: CONTEXT,
            gpuIsolation: 'same host GPU; no other benchmark arm concurrent',
          },
          checks,
          retries: Math.max(0, (result?.attempts ?? 1) - 1),
          stopReason: result?.stopReason ?? 'error',
          outcome,
          limitations: [
            'Synthetic-only input.',
            'RSS sums runner and all descendants of the isolated Ollama service via /proc PPid mapping when APUNTA_BENCH_SERVICE_PID is provided; shared pages may be counted in each process RSS.',
            'VRAM is an absolute same-host DRM counter; baseline and peak delta are recorded but unrelated desktop/process use cannot be attributed.',
            'No Mac or clinical-safety claim.',
          ],
        });
        appendFileSync(options.out, `${JSON.stringify(record)}\n`);
        console.error(
          `${model} ${testCase.id} run ${run}: ${outcome} ${result?.totalMs?.toFixed(0) ?? '-'}ms`,
        );
      }
    }
  }
  process.stdout.write(
    `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, experimentId, models: options.models, output: options.out })}\n`,
  );
}
await main();
