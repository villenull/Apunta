#!/usr/bin/env node
/**
 * The synthetic corpus's own acceptance check: run the pair filter over every
 * example and print metrics only.
 *
 * The corpus is faithful by construction, so the expected result is **zero
 * dropped pairs**. Anything else is a generator bug — a note that states
 * something its dictation does not, or a label the server would refuse — and
 * finding it here is cheaper than finding it in a trained adapter.
 *
 * It also checks the two structural rules the app enforces at draft time:
 * a Discussion subheading must be grounded in the source and at most four
 * words, and the target must be valid JSON with exactly the format's keys.
 *
 * Usage:
 *   npx tsx tools/model-lab/synth/check-dataset.ts --data <path.jsonl>
 */

import { readFileSync } from 'node:fs';

import {
  headingIsGrounded,
  MAX_SUBHEADING_WORDS,
} from '../../../server/src/ai/clinical-knowledge/discussion-subheadings.js';
import { reviewPair } from '../pipeline/grounding.js';
import { auditFactPools } from './generate.js';

interface Row {
  readonly id: string;
  readonly format: string;
  readonly sections: readonly string[];
  readonly source: string;
  readonly target: string;
}

function main(): void {
  const dataIndex = process.argv.indexOf('--data');
  const path = process.argv[dataIndex + 1];
  if (dataIndex === -1 || path === undefined) throw new Error('--data <path.jsonl> is required');
  const rows: Row[] = readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as Row);

  const poolProblems = auditFactPools();
  let dropped = 0;
  let ungroundedHeadings = 0;
  let badJson = 0;
  let wrongKeys = 0;
  const reasons: Record<string, number> = {};
  const examples: string[] = [];

  for (const row of rows) {
    const verdict = reviewPair(row.source, row.target);
    if (!verdict.keep) {
      dropped += 1;
      for (const reason of verdict.reasons) reasons[reason] = (reasons[reason] ?? 0) + 1;
      if (examples.length < 5) {
        examples.push(
          `${row.id}: ${verdict.reasons.join(', ')} — terms=${JSON.stringify(verdict.novelTerms)} markers=${JSON.stringify(verdict.conclusionMarkers)} figures=${JSON.stringify(verdict.novelFigures)}`,
        );
      }
    }

    let sections: Record<string, string>;
    try {
      sections = JSON.parse(row.target) as Record<string, string>;
    } catch {
      badJson += 1;
      continue;
    }
    const keys = Object.keys(sections);
    if (keys.length !== row.sections.length || keys.some((key) => !row.sections.includes(key))) {
      wrongKeys += 1;
    }

    const discussion = sections.Discussion ?? sections['Presenting problem'] ?? '';
    for (const line of discussion.split('\n')) {
      const trimmed = line.trim();
      // A heading line is short, ends in a colon, and has no sentence punctuation.
      if (!trimmed.endsWith(':') || /[.!?;,]/.test(trimmed)) continue;
      const title = trimmed.replace(/:$/, '');
      if (!headingIsGrounded(title, row.source) || title.split(/\s+/).length > MAX_SUBHEADING_WORDS) {
        ungroundedHeadings += 1;
        if (examples.length < 5) examples.push(`${row.id}: ungrounded heading "${title}"`);
      }
    }
  }

  process.stdout.write(
    [
      `pairs: ${String(rows.length)}`,
      `dropped by the pair filter: ${String(dropped)}`,
      `drop reasons: ${JSON.stringify(reasons)}`,
      `targets that were not JSON: ${String(badJson)}`,
      `targets with the wrong keys: ${String(wrongKeys)}`,
      `ungrounded Discussion headings: ${String(ungroundedHeadings)}`,
      `fact pools whose say/note lists differ in length: ${String(poolProblems.length)}`,
      ...examples.map((line) => `  ${line}`),
      '',
    ].join('\n'),
  );
  for (const problem of poolProblems) process.stdout.write(`  ${problem}\n`);
  if (dropped > 0 || badJson > 0 || wrongKeys > 0 || ungroundedHeadings > 0 || poolProblems.length > 0) {
    process.exitCode = 1;
  }
}

main();
