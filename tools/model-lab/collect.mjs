#!/usr/bin/env node
// Collect the headline tables from `npm run eval` markdown reports into one
// TSV, so the scout report's numbers are copied from the instrument rather
// than retyped. Reads arm-*.md files (and their sibling ps-*.json) written by
// tools/model-lab/run-arm.sh.
//
//   node tools/model-lab/collect.mjs /tmp/smarter-scout

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? '/tmp/smarter-scout';

/** Pull the data row of the first table after a `## <section>` heading. */
function tableRow(md, section) {
  const start = md.indexOf(`## ${section}`);
  if (start === -1) return null;
  const rest = md.slice(start);
  const lines = rest.split('\n');
  const rows = lines.filter((l) => l.startsWith('|'));
  // rows[0] = header, rows[1] = separator, rows[2] = first data row
  return rows[2] ?? null;
}

function cells(row) {
  if (row === null) return [];
  return row
    .split('|')
    .slice(1, -1)
    .map((c) => c.replace(/\*\*/g, '').trim());
}

function psSummary(label, corpusTag, invocation) {
  const f = join(dir, `ps-${label}-${corpusTag}-i${invocation}.json`);
  if (!existsSync(f)) return '';
  try {
    const ps = JSON.parse(readFileSync(f, 'utf8'));
    const models = ps.models ?? [];
    if (models.length === 0) return 'none';
    return models
      .map((m) => {
        const pct = m.size > 0 ? Math.round((m.size_vram / m.size) * 100) : 0;
        return `${m.name} size=${m.size} vram=${m.size_vram} (${pct}% GPU)`;
      })
      .join('; ');
  } catch {
    return 'unreadable';
  }
}

const files = readdirSync(dir)
  .filter((f) => /^arm-.*-i\d+\.md$/.test(f))
  .sort();

console.log(
  [
    'report',
    'model',
    'fixtures',
    'runs',
    'fabrication',
    'gated',
    'safety_facts',
    'salient_facts',
    'schema_valid',
    'novel_content_per_100w',
    'novel_clinical_per_100w',
    'mean_wall',
    'tok_per_s',
    'context_full',
    'retries',
    'ps',
  ].join('\t'),
);

for (const file of files) {
  const md = readFileSync(join(dir, file), 'utf8');
  const fab = cells(tableRow(md, 'Fabrication rate'));
  const comp = cells(tableRow(md, 'Completeness'));
  const struct = cells(tableRow(md, 'Structure, tone and voice'));
  const cost = cells(tableRow(md, 'Cost, and the trap that would read as a pass'));
  const header = /·\s*(\d+) fixtures · ([^·]+)·/u.exec(md.replace(/\n/g, ' '));
  const m = /^arm-(.+)-\d+\.md$/.exec(file.replace(/-i(\d+)\.md$/, '-$1.md'));
  // `arm-<label>-<tag>-i<N>.md`; the tag is `eval` or `eval-owner`.
  const stripped = file.replace(/^arm-/, '').replace(/-i\d+\.md$/, '');
  const corpusTag = stripped.endsWith('-eval-owner') ? 'eval-owner' : 'eval';
  const label = stripped.slice(0, stripped.length - corpusTag.length - 1);
  const invocation = /-i(\d+)\.md$/.exec(file)?.[1] ?? '?';
  void m;
  console.log(
    [
      file,
      fab[0] ?? '?',
      header?.[1] ?? '?',
      header?.[2]?.trim() ?? '?',
      fab[1] ?? '?',
      fab[2] ?? '?',
      comp[2] ?? '?',
      comp[1] ?? '?',
      struct[1] ?? '?',
      struct[6] ?? '?',
      struct[5] ?? '?',
      cost[1] ?? '?',
      cost[4] ?? '?',
      cost[5] ?? '?',
      cost[6] ?? '?',
      psSummary(label, corpusTag, invocation),
    ].join('\t'),
  );
}
