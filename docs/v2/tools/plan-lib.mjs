// Parses the v2 plan files, and owns the table codec. Used by check-plan.mjs and
// build-dispatch.mjs.
//
// The codec lives here, not in build-dispatch.mjs, because that is the only
// direction the two files can import in: build-dispatch already imports this one,
// so importing the codec back out of build-dispatch would be a cycle. One
// definition, two consumers — build-dispatch re-exports both names for
// check-plan.mjs and for its own tests, so the two tools cannot disagree about
// what a cell is, not as a claim to be tested but structurally.

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

/*
 * Escapes one table cell, and only what the table gives meaning to: a backslash
 * that would otherwise pair with the character after it, and a pipe, which is the
 * delimiter. A backslash before anything else — `printf "a\nb"`, `\"`, `\(` — is
 * ordinary text in GFM and is left exactly as it is, because a cell that gained a
 * backslash it did not need would change the command a reviewer copies out of it.
 *
 * It is the exact inverse of `parseCells` on **every cell a card can hold** — the
 * cell `parseCells` returns for a row is the text this emits back for it, byte
 * for byte, so a parent's inherited cell is the child's own cell. The one
 * documented exception is edge whitespace, because `parseCells` trims each cell
 * as GFM requires; that trim is correct for this use and must not be weakened to
 * make a broader claim true. It cannot arise through the card path, since the
 * same trim is applied when the card is read — a caller that pads text itself is
 * the only case the exception is written for. The cell *count* never changes for
 * any input, which is what lets a row's cell count be used as a validity check.
 */
export function escapeCell(text) {
  const s = String(text);
  let out = '';
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    const next = s[i + 1];
    if (ch === '\\' && next === '|') {
      out += '\\\\\\|';
      i += 1;
    } else if (ch === '\\' && next === '\\') {
      out += '\\\\\\\\';
      i += 1;
    } else if (ch === '|') out += '\\|';
    else out += ch;
  }
  return out;
}

/*
 * Splits a Markdown table row into its cells, undoing `escapeCell`. A pipe that
 * is preceded by a backslash is content, never a delimiter; everything else,
 * including a backslash that precedes anything other than a backslash or a
 * pipe, is carried through unchanged. Returns the inner cells (the leading and
 * trailing delimiters are dropped).
 *
 * This is the *only* table parser in the plan tooling, and it reads a card's row
 * as well as a dispatch's emitted row — one function, so a spelling that survives
 * one survives both. Its property: **identity on every card cell.** For any cell
 * text a card can hold, parsing a row and re-escaping the cell returns that
 * cell's own source text byte for byte, so `\|` in a card means a pipe to the
 * shell and `\\\|` means a BRE alternation (`\|`) that is still an alternation
 * after the round trip. It reads escapes the way it emits them: `\\` in a card
 * is one backslash to the shell, as `\|` is one pipe, and a cell that must carry
 * two writes four. The one documented exception is trimming: each cell is
 * trimmed, as GFM requires, so a caller that hands it padded text loses the
 * padding. Nothing in the card path can do that.
 */
export function parseCells(line) {
  const raw = [];
  let current = '';
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '\\' && (line[i + 1] === '\\' || line[i + 1] === '|')) {
      current += ch + line[i + 1];
      i += 1;
    } else if (ch === '|') {
      raw.push(current.trim());
      current = '';
    } else current += ch;
  }
  raw.push(current.trim());
  const inner = raw.slice(1, -1);
  return inner.map((cell) => cell.replace(/\\([\\|])/g, '$1'));
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
      const [key, value] = parseCells(line);
      if (key) fields[key] = value ?? '';
    }
  }
  if (current) sections.set(current, buffer.join('\n'));
  const verification = [];
  for (const line of (sections.get('Verification') ?? '').split('\n')) {
    if (/^\| V\d+ \|/.test(line)) {
      const [vid, command, expected] = parseCells(line);
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
    const [id, parent, title, level, extra] = parseCells(line);
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
