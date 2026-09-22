#!/usr/bin/env node
import { writeFileSync } from 'node:fs';

const base = process.env.APUNTA_CHECK_URL ?? 'http://127.0.0.1:17717';
const transcript =
  'The client said the sleep was better this week, but, um, she woke at four hours actually scratched that. Six hours, not four. Home, she denied suicidal thoughts, and she plans to call on Tuesday. She repeated that the morning meeting was cancelled, cancelled, before correcting herself. The afternoon meeting was cancelled.';
const models = [
  'qwen3.5:4b-q4_K_M',
  'qwen3.5:2b-q4_K_M',
  'prism-ml/Bonsai-8B-gguf/Bonsai-8B-Q1_0.gguf',
  'prism-ml/Bonsai-4B-gguf/Bonsai-4B-Q1_0.gguf',
];
async function api(path, init) {
  const response = await fetch(`${base}${path}`, init);
  if (!response.ok) throw new Error(`${path} ${response.status}: ${await response.text()}`);
  return response;
}
function bodyFromSse(text) {
  let note = null;
  for (const frame of text.split('\n\n')) {
    const at = frame.indexOf('data:');
    if (at < 0) continue;
    try {
      const value = JSON.parse(frame.slice(at + 5).trim());
      if (value.note) note = value.note;
    } catch {
      continue;
    }
  }
  return note;
}
const formats = await (await api('/api/formats')).json();
const format = formats.formats?.[0];
const patients = await (await api('/api/patients')).json();
const patient = patients.patients?.[0];
if (!format || !patient) throw new Error('disposable app needs a format and patient');
const rows = [];
for (const model of models) {
  const runtimeModel = model.includes('Bonsai-8B')
    ? 'prism-ml/Bonsai-8B-gguf:Q1_0'
    : model.includes('Bonsai-4B')
      ? 'prism-ml/Bonsai-4B-gguf:Q1_0'
      : model;
  await api('/api/settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ llm_model: runtimeModel }),
  });
  const response = await api('/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      patient_id: patient.id,
      format_id: format.id,
      typed_notes: '',
      transcript,
      title: `critical retraction — ${model}`,
    }),
  });
  const rawSse = await response.text();
  const note = bodyFromSse(rawSse);
  const content = String(note?.content ?? '');
  const checks = [
    {
      id: 'corrected-number',
      expected: 'six hours retained and four hours withdrawn',
      observed: content,
      pass: /six hours/iu.test(content) && !/four hours/iu.test(content),
    },
    {
      id: 'withdrawn-topic-absent',
      expected: 'morning meeting absent; afternoon meeting retained',
      observed: content,
      pass: !/morning meeting/iu.test(content) && /afternoon meeting/iu.test(content),
    },
    {
      id: 'risk-negation',
      expected: 'denied or denies suicidal thoughts retained',
      observed: content,
      pass: /den(?:ied|ies) suicidal thoughts/iu.test(content),
    },
  ];
  rows.push({
    schemaVersion: '1.1.0',
    model,
    runtimeModel,
    inputSha256: await crypto.subtle
      .digest('SHA-256', new TextEncoder().encode(transcript))
      .then((b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')),
    transcript,
    rawSse,
    noteContent: content,
    checks,
    outcome: checks.every((check) => check.pass) ? 'pass' : 'fail',
  });
  console.error(`${model}: ${rows.at(-1).outcome}`);
}
writeFileSync(
  'scripts/model-comparison/results/critical-app-matrix.jsonl',
  `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`,
);
