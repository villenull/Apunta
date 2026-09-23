#!/usr/bin/env node
/**
 * Held-out evaluation for a consented run, and for the synthetic prototype.
 *
 * Generates the note for every held-out pair with a local model, then judges
 * the result with the same pair filter the dataset was built with. **It prints
 * metrics only**: counts, rates and reasons. No note, no source, no name and
 * no excerpt reaches stdout, so the run can be reported to the therapist and
 * to a reviewer without either of them reading her material, and without the
 * agent that wrote this script ever seeing it.
 *
 * The two numbers that matter are the pair filter's (does the model's note
 * add a clinical term, a conclusion or a figure the input did not carry?) and
 * section agreement (did the note arrive in her seven sections at all?).
 *
 * Usage:
 *   npx tsx tools/model-lab/pipeline/evaluate-heldout.ts \
 *     --data ~/.local/share/apunta/model-lab/datasets/pairs.jsonl \
 *     --model <ollama-tag> --ollama-url http://127.0.0.1:11437 --out <metrics.json>
 */

import { readFileSync, writeFileSync } from 'node:fs';

import { reviewPair } from './grounding.js';
import { requireOutputUnderLab } from './guards.js';

interface Row {
  readonly id: string;
  readonly split?: string;
  readonly sections: readonly string[];
  readonly input?: string;
  readonly system: string;
  readonly user: string;
  readonly target: string;
}

function requiredArg(argv: readonly string[], flag: string): string {
  const index = argv.indexOf(flag);
  const value = index === -1 ? undefined : argv[index + 1];
  if (value === undefined) throw new Error(`${flag} is required`);
  return value;
}

/** Ollama's chat API, one non-streaming reply. */
async function chat(url: string, model: string, system: string, user: string): Promise<string> {
  const response = await fetch(`${url}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      think: false,
      options: { temperature: 0, seed: 0, num_ctx: 16384, num_predict: 3072 },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!response.ok) throw new Error(`ollama ${String(response.status)}: ${await response.text()}`);
  const body = (await response.json()) as { message?: { content?: string } };
  return body.message?.content ?? '';
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const data = requiredArg(argv, '--data');
  const model = requiredArg(argv, '--model');
  const url = requiredArg(argv, '--ollama-url');
  const out = requireOutputUnderLab(requiredArg(argv, '--out'));

  const rows: Row[] = readFileSync(data, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as Row)
    .filter((row) => row.split === undefined || row.split === 'heldout');

  let kept = 0;
  let sectionsPresent = 0;
  let sectionsExpected = 0;
  const reasons: Record<string, number> = {};
  const replyChars: number[] = [];

  for (const row of rows) {
    const reply = await chat(url, model, row.system, row.user);
    replyChars.push(reply.length);
    const input = row.input ?? row.user;
    const verdict = reviewPair(input, reply);
    if (verdict.keep) kept += 1;
    for (const reason of verdict.reasons) reasons[reason] = (reasons[reason] ?? 0) + 1;
    for (const section of row.sections) {
      sectionsExpected += 1;
      const pattern = new RegExp(
        `^\\s*(?:#+\\s*)?\\*{0,2}${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*{0,2}\\s*:?`,
        'im',
      );
      if (pattern.test(reply)) sectionsPresent += 1;
    }
  }

  const metrics = {
    model,
    data,
    pairs: rows.length,
    pairs_without_added_material: kept,
    pairs_without_added_material_rate: rows.length === 0 ? null : Number((kept / rows.length).toFixed(3)),
    drop_reasons: reasons,
    section_headings_present: sectionsPresent,
    section_headings_expected: sectionsExpected,
    section_agreement_rate:
      sectionsExpected === 0 ? null : Number((sectionsPresent / sectionsExpected).toFixed(3)),
    mean_reply_chars:
      replyChars.length === 0 ? 0 : Math.round(replyChars.reduce((a, b) => a + b, 0) / replyChars.length),
  };
  writeFileSync(out, `${JSON.stringify(metrics, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  process.stdout.write(`${JSON.stringify(metrics, null, 2)}\n`);
}

await main();
