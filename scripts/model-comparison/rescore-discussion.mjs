#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2] ?? 'scripts/model-comparison/results/discussion-matrix.jsonl';
const rows = readFileSync(file, 'utf8')
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line));
for (const row of rows) {
  const parsed = JSON.parse(row.rawOutput);
  const discussion = String(parsed.Discussion ?? '');
  const actions = String(parsed['Out of session actions'] ?? '');
  const combined = `${discussion}\n${actions}`;
  const labels = [...discussion.matchAll(/(?:^|\n)\s*label:\s*([^\n]+)/giu)].map((match) => match[1].trim());
  const allLabelsLowercase = labels.every((label) => label === label.toLowerCase());
  const schemaStop = row.checks.find((check) => check.id === 'schema-stop');
  const checks = [
    schemaStop ?? { id: 'schema-stop', pass: false, observed: 'missing prior check' },
    {
      id: 'grounded-label-shape',
      pass:
        row.caseId === 'two-topics-labels'
          ? labels.length >= 2 && allLabelsLowercase
          : labels.length <= 1 && allLabelsLowercase,
      observed: labels,
    },
    {
      id: 'withdrawn-topic-absent',
      pass: row.caseId !== 'withdrawn-topic-not-label' || !/grief/iu.test(combined),
      observed: combined,
    },
    {
      id: 'source-fact-visible',
      pass:
        row.caseId === 'two-topics-labels'
          ? /poor sleep/iu.test(combined) &&
            /breathing/iu.test(combined) &&
            /sister/iu.test(combined) &&
            /boundary/iu.test(combined)
          : /sleep|breathing/iu.test(combined),
      observed: combined,
    },
    {
      id: 'sentence-facts-conserved',
      pass:
        row.caseId !== 'sentence-conservation' ||
        (/six hours/iu.test(combined) && /breathing/iu.test(combined) && /next session/iu.test(combined)),
      observed: combined,
    },
  ];
  row.checks = checks;
  row.outcome = checks.every((check) => check.pass) ? 'pass' : 'fail';
  row.limitation =
    'Focused synthetic control matrix; retained raw outputs rescored without additional inference; not a corpus score or clinical-safety claim.';
}
writeFileSync(file, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
console.error(`rescored ${rows.length} retained Discussion outputs`);
