import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildGeneratePrompt } from '../../server/src/ai/prompts.js';
import { sectionsJsonSchema } from '@apunta/shared';

const base = process.env.APUNTA_BENCH_URL ?? 'http://127.0.0.1:11435';
const recoveryInstructions = readFileSync(
  resolve(process.cwd(), 'docs/note-instructions/current-linux-progress-instructions.md'),
  'utf8',
).trim();
const output = resolve(process.argv[2] ?? 'scripts/model-comparison/results/discussion-matrix.jsonl');
const sections = [
  'Location',
  'Client presentation',
  'Risk review',
  'Discussion',
  'Intervention',
  'Out of session actions',
  'Note for next session',
];
const cases = [
  {
    id: 'single-topic-prose',
    source:
      'Alex Roe attended from home. She said the breathing exercise helped her sleep. No risk or plan was discussed.',
    expected: 'Discussion has one plain prose topic and no heading label.',
  },
  {
    id: 'two-topics-labels',
    source:
      'Alex Roe attended from home. She described poor sleep and said the breathing exercise helped. She also discussed an argument with her sister and feeling uncertain about setting a boundary. No risk or plan was discussed.',
    expected:
      'Discussion has two or more grounded label lines whose first letters are capitalised, with facts conserved.',
  },
  {
    id: 'withdrawn-topic-not-label',
    source:
      'Alex Roe said the appointment was about grief, scratch that, that was last session. Today she discussed sleep and a breathing exercise. No risk or plan was discussed.',
    expected:
      'No label or sentence repeats the withdrawn grief topic; only current sleep/breathing content remains.',
  },
  {
    id: 'sentence-conservation',
    source:
      'Alex Roe reported sleeping six hours and plans to continue the breathing exercise before next session. No risk or diagnosis was discussed.',
    expected: 'Numbers and forward plan remain; labels cannot replace or drop source sentences.',
  },
];
mkdirSync(resolve(output, '..'), { recursive: true });
writeFileSync(output, '', 'utf8');
function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
async function runCase(testCase: (typeof cases)[number]) {
  const prompt = buildGeneratePrompt({
    instructions: recoveryInstructions,
    sections,
    formatName: 'Progress note',
    typedNotes: testCase.source,
  });
  const response = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen3.5:4b-q4_K_M',
      stream: true,
      keep_alive: '30m',
      think: false,
      format: sectionsJsonSchema(sections),
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      options: { temperature: 0, seed: 0, num_ctx: 16384, num_predict: 3072, repeat_penalty: 1 },
    }),
  });
  const text = await response.text();
  const chunks = text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const raw = chunks.map((chunk) => chunk.message?.content ?? '').join('');
  const done = chunks.at(-1)?.done_reason ?? '';
  let parsed: Record<string, string> | null = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    /* recorded below */
  }
  const discussion = parsed?.Discussion ?? '';
  const labels = [...discussion.matchAll(/(?:^|\n)\s*label:\s*([^\n]+)/giu)].map((match) => match[1].trim());
  const withdrawnAbsent = !/grief/iu.test(discussion);
  const allLabelsCapitalized = labels.every((label) => /^\p{Lu}/u.test(label));
  const checks = [
    {
      id: 'schema-stop',
      pass: response.ok && done === 'stop' && parsed !== null,
      observed: { status: response.status, done, rawBytes: raw.length },
    },
    {
      id: 'grounded-label-shape',
      pass: labels.length <= 1 || allLabelsCapitalized,
      observed: labels,
    },
    {
      id: 'withdrawn-topic-absent',
      pass: testCase.id !== 'withdrawn-topic-not-label' || withdrawnAbsent,
      observed: discussion,
    },
    { id: 'source-fact-visible', pass: /sleep|breathing/iu.test(discussion), observed: discussion },
  ];
  const record = {
    schemaVersion: '1.1.0',
    experimentId: 'discussion-matrix-control',
    model: 'qwen3.5:4b-q4_K_M',
    caseId: testCase.id,
    expected: testCase.expected,
    inputSha256: hash(`${prompt.system}\n${prompt.user}`),
    rawOutput: raw,
    outputSha256: hash(raw),
    checks,
    outcome: checks.every((check) => check.pass) ? 'pass' : 'fail',
    limitation: 'Focused synthetic control matrix; not a corpus score or clinical-safety claim.',
  };
  appendFileSync(output, `${JSON.stringify(record)}\n`);
  console.error(`${testCase.id}: ${record.outcome}`);
}
for (const testCase of cases) await runCase(testCase);
