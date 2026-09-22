#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve(process.argv[2] ?? 'scripts/model-comparison/results/records.jsonl');
const rows =
  readFileSync(file, 'utf8').trim() === ''
    ? []
    : readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
const percentile = (values, p) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
};
const byModel = new Map();
for (const row of rows) {
  const list = byModel.get(row.model.id) ?? [];
  list.push(row);
  byModel.set(row.model.id, list);
}
const summary = [...byModel].map(([model, records]) => {
  const usable = records.filter((row) => row.outcome === 'pass' || row.outcome === 'fail');
  const scoreChecks = usable
    .map((row) => row.checks.find((check) => check.id === 'rubric-score')?.observed)
    .filter(Boolean);
  const fabricated = scoreChecks.filter(
    (score) => Array.isArray(score.gating) && score.gating.some((item) => /^F[167]/u.test(item)),
  ).length;
  const safe = scoreChecks.filter((score) => score.safetyPassed === true).length;
  const factDenom = scoreChecks.reduce((sum, score) => sum + Number(score.totalFacts ?? 0), 0);
  const factNumer = scoreChecks.reduce((sum, score) => sum + Number(score.capturedFacts ?? 0), 0);
  const warm = records.map((row) => row.timings.warmMs).filter(Number.isFinite);
  const cold = records.map((row) => row.timings.coldMs).filter(Number.isFinite);
  return {
    model,
    records: records.length,
    outcomes: Object.fromEntries(
      ['pass', 'fail', 'unsupported', 'unmeasured'].map((outcome) => [
        outcome,
        records.filter((row) => row.outcome === outcome).length,
      ]),
    ),
    fabrication: { numerator: fabricated, denominator: scoreChecks.length },
    safety: { numerator: safe, denominator: scoreChecks.length },
    salientFacts: { numerator: factNumer, denominator: factDenom },
    coldMs: { p50: percentile(cold, 0.5), p95: percentile(cold, 0.95), n: cold.length },
    warmMs: { p50: percentile(warm, 0.5), p95: percentile(warm, 0.95), n: warm.length },
    retries: records.reduce((sum, row) => sum + Number(row.retries ?? 0), 0),
    stopReasons: Object.fromEntries(
      [...new Set(records.map((row) => row.stopReason))].map((reason) => [
        reason,
        records.filter((row) => row.stopReason === reason).length,
      ]),
    ),
  };
});
const output = process.argv[3] ? resolve(process.argv[3]) : null;
if (output)
  writeFileSync(
    output,
    `${JSON.stringify({ schemaVersion: '1.1.0', source: file, models: summary }, null, 2)}\n`,
  );
console.log(JSON.stringify(summary, null, 2));
