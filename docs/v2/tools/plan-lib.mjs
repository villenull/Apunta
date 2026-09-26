// Parses the v2 plan files. Used by check-plan.mjs and build-dispatch.mjs.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PREFIX_ORDER = [
  'C0',
  'P0',
  'S1',
  'P7a',
  'P1',
  'P2',
  'S2',
  'P3',
  'S3',
  'S4a',
  'P4',
  'S4b',
  'P5',
  'P6',
  'S5',
  'S6',
  'P7b',
  'Q1',
];

function list(value) {
  const v = (value ?? '').trim();
  if (v === '' || v.toLowerCase() === 'none') return [];
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitRow(line) {
  // Splits a Markdown table row, honouring escaped pipes (\|).
  const cells = [];
  let current = '';
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '\\' && line[i + 1] === '|') {
      current += '|';
      i += 1;
    } else if (ch === '|') {
      cells.push(current.trim());
      current = '';
    } else current += ch;
  }
  cells.push(current.trim());
  return cells.slice(1, -1);
}

export function parseCard(text, file) {
  const lines = text.split('\n');
  const titleMatch = /^# (\S+) (.+)$/.exec(lines[0] ?? '');
  if (!titleMatch) throw new Error(`${file}: first line must be "# <ID> <title>"`);
  const [, id, title] = titleMatch;
  const fields = {};
  const sections = new Map();
  let current = null;
  let buffer = [];
  for (const line of lines.slice(1)) {
    const h = /^## (.+)$/.exec(line);
    if (h) {
      if (current) sections.set(current, buffer.join('\n'));
      current = h[1].trim();
      buffer = [];
      continue;
    }
    if (current) buffer.push(line);
    else if (line.startsWith('| ') && !line.startsWith('| Field') && !line.startsWith('| ---')) {
      const [key, value] = splitRow(line);
      if (key) fields[key] = value ?? '';
    }
  }
  if (current) sections.set(current, buffer.join('\n'));
  const verification = [];
  for (const line of (sections.get('Verification') ?? '').split('\n')) {
    if (/^\| V\d+ \|/.test(line)) {
      const [vid, command, expected] = splitRow(line);
      verification.push({ id: vid, command: command ?? '', expected: expected ?? '', raw: line });
    }
  }
  return {
    id,
    title,
    file,
    text,
    fields,
    sections,
    parent: fields['Parent'],
    role: fields['Role'],
    level: fields['Level'],
    contracts: list(fields['Contracts']),
    depends: list(fields['Depends']),
    findings: list(fields['Findings']),
    verification,
  };
}

export function parseContracts(text) {
  const contracts = new Map();
  const parts = text.split(/^## /m).slice(1);
  for (const part of parts) {
    const m = /^(C-[A-Z-]+@\d+)/.exec(part);
    if (!m) continue;
    const body = part.split(/^---\s*$/m)[0];
    contracts.set(m[1], `## ${body.trimEnd()}\n`);
  }
  return contracts;
}

export function parseMilestones(text, cards) {
  const reviews = new Map();
  for (const line of text.split('\n')) {
    if (!/^\| [A-Za-z0-9]+\.R \|/.test(line)) continue;
    const [id, parent, title, level, extra] = splitRow(line);
    const children = [...cards.values()].filter((c) => c.parent === parent).map((c) => c.id);
    reviews.set(id, {
      id,
      parent,
      title: `${title} (parent review)`,
      level,
      extra,
      role: 'REVIEW',
      depends: children,
      contracts: [],
      findings: [],
      verification: [],
      fields: {},
      sections: new Map(),
    });
  }
  return reviews;
}

function sortKey(id) {
  const m = /^([A-Za-z]+\d*[a-z]?)\.(\d+|R)/.exec(id);
  const prefix = m ? m[1] : id;
  const n = m ? (m[2] === 'R' ? 999 : Number(m[2])) : 0;
  const p = PREFIX_ORDER.indexOf(prefix);
  return [p === -1 ? 99 : p, n];
}

export function loadPlan(planDir) {
  const cards = new Map();
  for (const file of readdirSync(join(planDir, 'cards'))
    .filter((f) => f.endsWith('.md'))
    .sort()) {
    const card = parseCard(readFileSync(join(planDir, 'cards', file), 'utf8'), file);
    if (cards.has(card.id)) throw new Error(`duplicate card id ${card.id}`);
    if (`${card.id}.md` !== file) throw new Error(`${file}: file name must be ${card.id}.md`);
    cards.set(card.id, card);
  }
  const contracts = parseContracts(readFileSync(join(planDir, 'CONTRACTS.md'), 'utf8'));
  const reviews = parseMilestones(readFileSync(join(planDir, 'MILESTONES.md'), 'utf8'), cards);
  const stageOrder = [...cards.keys(), ...reviews.keys()].sort((a, b) => {
    const [pa, na] = sortKey(a);
    const [pb, nb] = sortKey(b);
    return pa - pb || na - nb;
  });
  return { cards, reviews, contracts, stageOrder };
}
