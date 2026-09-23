#!/usr/bin/env node
// Per-arm gated-fixture summary across invocations, from the eval reports.
//
//   node tools/model-lab/gates.mjs /tmp/smarter-scout <corpus-tag>
//
// The headline rate hides *which* fixtures gate. This prints, per arm, how
// many of the invocations gated each fixture, so a candidate whose 15 % is a
// different 15 % from the control's is visible.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? '/tmp/smarter-scout';
const corpusTag = process.argv[3] ?? 'eval';

const files = readdirSync(dir)
  .filter((f) => f.startsWith('arm-') && f.endsWith(`-${corpusTag}-i1.md`))
  .sort();

/** fixture -> invocations gated, per arm. */
const perArm = new Map();

for (const file of files) {
  const label = file.replace(/^arm-/, '').replace(new RegExp(`-${corpusTag}-i1\\.md$`), '');
  const gated = new Map();
  const invocations = readdirSync(dir).filter(
    (f) => f.startsWith(`arm-${label}-${corpusTag}-i`) && f.endsWith('.md'),
  ).length;
  for (let i = 1; i <= invocations; i += 1) {
    const md = readFileSync(join(dir, `arm-${label}-${corpusTag}-i${i}.md`), 'utf8');
    const section = md.slice(md.indexOf('## Per fixture'));
    const rows = section.split('\n').filter((l) => /^\| \d\d-/.test(l));
    for (const row of rows) {
      const cells = row.split('|').map((c) => c.trim());
      const fixture = cells[1];
      const gating = cells[8] ?? '';
      if (gating !== '' && gating !== '—') {
        gated.set(fixture, (gated.get(fixture) ?? 0) + 1);
      }
    }
  }
  perArm.set(label, { gated, invocations });
}

for (const [label, { gated, invocations }] of perArm) {
  const parts = [...gated.entries()]
    .sort()
    .map(([fixture, n]) => `${fixture.slice(0, 2)}:${n}/${invocations}`);
  console.log(`${label}\t${parts.join(' ') || '(none gated)'}`);
}
