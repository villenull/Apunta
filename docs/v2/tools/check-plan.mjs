#!/usr/bin/env node
// Checks the v2 plan for internal consistency and writes DEPENDENCIES.md.
//
//   node docs/v2/tools/check-plan.mjs            # check, rewrite DEPENDENCIES.md
//   node docs/v2/tools/check-plan.mjs --no-write # check only
//   node docs/v2/tools/check-plan.mjs --final    # also check FINAL-REPORT.md
//
// Exit 0 when consistent, 1 when not. No dependencies; Node 22 or later.

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlan } from './plan-lib.mjs';

const planDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const errors = [];
const warn = [];

const plan = loadPlan(planDir);
const { cards, reviews, contracts } = plan;
const all = new Map([...cards, ...reviews]);

const ROLES = new Set(['SETUP', 'IMPLEMENTATION', 'RESEARCH', 'MEASUREMENT', 'REVIEW', 'OWNER']);
const LEVELS = new Set(['L0', 'L1', 'L2', 'L3', 'L2+L3']);
const REQUIRED_FIELDS = ['Parent', 'Role', 'Level', 'Contracts', 'Depends', 'Findings', 'Confidence'];
const REQUIRED_HEADINGS = ['Objective', 'Read', 'May edit', 'Must not edit', 'Verification'];
const PARENTS_WITHOUT_REVIEW = new Set(['C0', 'P7a', 'P7b', 'Q1']);

for (const [id, card] of cards) {
  for (const field of REQUIRED_FIELDS) {
    if (!(field in card.fields)) errors.push(`${id}: missing field "${field}"`);
  }
  for (const heading of REQUIRED_HEADINGS) {
    if (!card.sections.has(heading)) errors.push(`${id}: missing section "## ${heading}"`);
    else if (card.sections.get(heading).trim() === '') errors.push(`${id}: empty section "## ${heading}"`);
  }
  if (!ROLES.has(card.role)) errors.push(`${id}: unknown role "${card.role}"`);
  if (!LEVELS.has(card.level)) errors.push(`${id}: unknown level "${card.level}"`);
  if (card.verification.length === 0) errors.push(`${id}: no verification rows`);
  const seen = new Set();
  for (const row of card.verification) {
    if (seen.has(row.id)) errors.push(`${id}: duplicate verification id ${row.id}`);
    seen.add(row.id);
    if (/\b7717\b/.test(row.command)) errors.push(`${id} ${row.id}: command mentions port 7717`);
    if (row.command.trim() === '') errors.push(`${id} ${row.id}: empty command`);
    if (row.expected.trim() === '') errors.push(`${id} ${row.id}: empty expected result`);
  }
  for (const c of card.contracts) {
    if (!contracts.has(c)) errors.push(`${id}: unknown contract ${c}`);
  }
}

for (const [id, card] of all) {
  for (const dep of card.depends) {
    if (!all.has(dep)) errors.push(`${id}: depends on unknown card ${dep}`);
  }
}

// Every parent with children has a review, except the listed ones.
const parents = new Map();
for (const [id, card] of cards) {
  if (!parents.has(card.parent)) parents.set(card.parent, []);
  parents.get(card.parent).push(id);
}
for (const [parent, children] of parents) {
  const reviewId = `${parent}.R`;
  if (PARENTS_WITHOUT_REVIEW.has(parent)) continue;
  if (!reviews.has(reviewId))
    errors.push(`parent ${parent} (${children.join(', ')}) has no ${reviewId} in MILESTONES.md`);
}
for (const [id, review] of reviews) {
  if (!parents.has(review.parent)) errors.push(`${id}: parent ${review.parent} has no child cards`);
}

// Cycle check and topological order (stable: file order within stages).
const order = [];
const state = new Map();
function visit(id, trail) {
  if (state.get(id) === 'done') return;
  if (state.get(id) === 'active') {
    errors.push(`dependency cycle: ${[...trail, id].join(' -> ')}`);
    return;
  }
  state.set(id, 'active');
  const card = all.get(id);
  if (card) for (const dep of card.depends) if (all.has(dep)) visit(dep, [...trail, id]);
  state.set(id, 'done');
  order.push(id);
}
for (const id of plan.stageOrder) visit(id, []);

// Findings coverage.
const traceability = readFileSync(join(planDir, 'TRACEABILITY.md'), 'utf8');
for (let n = 1; n <= 20; n += 1) {
  const r = `R${String(n).padStart(2, '0')}`;
  const owners = [...cards.values()].filter((c) => c.findings.includes(r));
  if (owners.length === 0) errors.push(`${r}: no card lists it under Findings`);
  if (!new RegExp(`^\\| ${r} `, 'm').test(traceability)) errors.push(`${r}: no row in TRACEABILITY.md`);
}

// Templates must not start with a pass.
for (const file of readdirSync(join(planDir, 'templates'))) {
  const text = readFileSync(join(planDir, 'templates', file), 'utf8');
  if (/\|\s*(PASS|CLEAR|APPROVED)\s*\|/.test(text))
    errors.push(`templates/${file}: a table cell starts as a pass`);
  if (/\[x\]/i.test(text)) errors.push(`templates/${file}: a checked box`);
}

// Final-report mode.
if (args.has('--final')) {
  const finalPath = join(planDir, 'FINAL-REPORT.md');
  if (!existsSync(finalPath)) errors.push('FINAL-REPORT.md is missing');
  else {
    const text = readFileSync(finalPath, 'utf8');
    for (const line of text.split('\n')) {
      const cells = line.split('|').map((c) => c.trim());
      if (cells.includes('PASS') && cells.at(-2) === '')
        errors.push(`FINAL-REPORT.md: PASS without evidence: ${line}`);
    }
  }
}

if (!args.has('--no-write') && errors.length === 0) {
  const rows = order.map((id, index) => {
    const c = all.get(id);
    return `| ${index + 1} | ${id} | ${c.title} | ${c.role} | ${c.level} | ${c.depends.join(', ') || 'none'} |`;
  });
  const text = [
    '# Dependencies and dispatch order (generated)',
    '',
    'Generated by `tools/check-plan.mjs`. Do not edit by hand. The coordinator',
    'takes the first card in this order whose dependencies are all APPROVED.',
    'Research cards (S1.x, P7a.1) have few dependencies and may be run early;',
    'there is still only one sub-session writing code at a time.',
    '',
    '| # | Card | Title | Role | Level | Depends on |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
  writeFileSync(join(planDir, 'DEPENDENCIES.md'), text);
}

for (const w of warn) console.error(`warning: ${w}`);
if (errors.length > 0) {
  for (const e of errors) console.error(`error: ${e}`);
  console.error(`\n${errors.length} error(s).`);
  process.exit(1);
}
process.stdout.write(
  `Plan consistent: ${cards.size} cards, ${reviews.size} parent reviews, ${contracts.size} contracts, R01-R20 covered, no cycles.\n`,
);
