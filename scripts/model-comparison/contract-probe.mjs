#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const base = process.env.APUNTA_BENCH_URL ?? 'http://127.0.0.1:11435';
const out = resolve(process.argv[2] ?? 'scripts/model-comparison/results/contract.jsonl');
const models = [
  ['qwen3.5:4b-q4_K_M', 'qwen3.5:4b-q4_K_M'],
  ['qwen3.5:2b-q4_K_M', 'qwen3.5:2b-q4_K_M'],
  ['prism-ml/Bonsai-8B-gguf/Bonsai-8B-Q1_0.gguf', 'prism-ml/Bonsai-8B-gguf:Q1_0'],
  ['prism-ml/Bonsai-4B-gguf/Bonsai-4B-Q1_0.gguf', 'prism-ml/Bonsai-4B-gguf:Q1_0'],
];
mkdirSync(resolve(out, '..'), { recursive: true });
writeFileSync(out, '', 'utf8');
const schema = {
  type: 'object',
  properties: {
    Subjective: { type: 'string' },
    Objective: { type: 'string' },
    Assessment: { type: 'string' },
    Plan: { type: 'string' },
  },
  required: ['Subjective', 'Objective', 'Assessment', 'Plan'],
  additionalProperties: false,
};
const messages = [
  { role: 'system', content: 'Return only the requested JSON object. Never invent facts.' },
  {
    role: 'user',
    content:
      'Synthetic smoke source: Alex Roe said sleep improved after breathing exercises. No risk, diagnosis, medication, or plan was discussed.',
  },
];
async function probe(candidate, runtimeModel) {
  const checks = [];
  let template = '';
  let format = null;
  let showError = '';
  try {
    const response = await fetch(`${base}/api/show`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: runtimeModel }),
    });
    const body = await response.json();
    template = body.template ?? '';
    format = body.details?.format ?? null;
    checks.push({ id: 'show', pass: response.ok, observed: response.status });
  } catch (error) {
    showError = String(error);
    checks.push({ id: 'show', pass: false, observed: showError });
  }
  const common = {
    model: runtimeModel,
    messages,
    format: schema,
    think: false,
    options: { temperature: 0, seed: 0, num_ctx: 16384, num_predict: 256, repeat_penalty: 1 },
    keep_alive: '30m',
  };
  for (const stream of [true, false]) {
    try {
      const response = await fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...common, stream }),
      });
      const text = await response.text();
      let doneReason = '';
      let raw = text;
      if (stream) {
        const chunks = text.trim().split('\n').filter(Boolean).map(JSON.parse);
        const last = chunks.at(-1) ?? {};
        doneReason = String(last.done_reason ?? '');
        raw = chunks.map((chunk) => chunk.message?.content ?? '').join('');
      } else {
        const body = JSON.parse(text);
        doneReason = String(body.done_reason ?? '');
        raw = body.message?.content ?? '';
      }
      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        /* check records failure */
      }
      checks.push({
        id: stream ? 'stream-schema' : 'nonstream-schema',
        pass: response.ok && doneReason !== 'length' && parsed !== null,
        observed: { status: response.status, doneReason, bytes: raw.length },
      });
    } catch (error) {
      checks.push({
        id: stream ? 'stream-schema' : 'nonstream-schema',
        pass: false,
        observed: String(error),
      });
    }
  }
  const controller = new AbortController();
  const cancellation = fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...common,
      stream: true,
      options: { ...common.options, num_predict: 3072 },
      messages: [
        { role: 'system', content: 'Generate a long synthetic response.' },
        { role: 'user', content: 'Repeat the synthetic sentence many times: no risk stated.' },
      ],
    }),
    signal: controller.signal,
  })
    .then(() => false)
    .catch((error) => error?.name === 'AbortError');
  setTimeout(() => controller.abort(), 20);
  const cancelled = await cancellation;
  checks.push({
    id: 'cancellation',
    pass: cancelled,
    observed: cancelled ? 'AbortController rejected request' : 'request completed before abort',
  });
  const record = {
    schemaVersion: '1.1.0',
    candidate,
    runtimeModel,
    format,
    templateSha256: createHash('sha256').update(template).digest('hex'),
    checks,
    outcome: checks.every((check) => check.pass) ? 'pass' : 'fail',
    limitation: showError || 'Synthetic contract probe only; not a quality score.',
  };
  appendFileSync(out, `${JSON.stringify(record)}\n`);
  console.error(`${candidate}: ${record.outcome}`);
  return record;
}
for (const [candidate, runtimeModel] of models) await probe(candidate, runtimeModel);
