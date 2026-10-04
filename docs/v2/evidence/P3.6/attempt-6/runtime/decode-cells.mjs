#!/usr/bin/env node
/**
 * P3.6 attempt 6 runtime -- verification-cell codec.
 *
 * Decodes a row's Command cell out of docs/v2/state/dispatch/P3.6.md exactly as
 * attempt 2 did: split the table on UNESCAPED pipes only, refuse anything that
 * does not yield three cells, strip one outer backtick pair, unescape GFM's
 * `\|` -> `|` and `\\` -> `\`, then verify with bash -n. Nothing is retyped.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const DISPATCH = 'docs/v2/state/dispatch/P3.6.md';
const lines = readFileSync(DISPATCH, 'utf8').split('\n');

const headerIndex = lines.findIndex((l) => l.startsWith('| ID | Command (cwd: repo root) | Expected |'));
if (headerIndex < 0) throw new Error('verification table header not found');
console.log(`header row at dispatch line ${headerIndex + 1}`);

function splitCells(row) {
  // A GFM table row's own leading/trailing pipe delimits the row, not a cell.
  const body = row.startsWith('|') && row.endsWith('|') ? row.slice(1, -1) : row;
  const cells = [];
  let cur = '';
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === '\\' && body[i + 1] === '|') {
      cur += '\\|';
      i += 1;
      continue;
    }
    if (ch === '|') {
      cells.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

const headerCells = splitCells(lines[headerIndex]);
if (headerCells.length !== 3) throw new Error(`header cell count ${headerCells.length}`);
console.log(`header cell count: ${headerCells.length}  ${JSON.stringify(headerCells)}`);

const sha = (s) => createHash('sha256').update(s).digest('hex');
const out = { dispatch: DISPATCH, rows: {} };

for (const id of process.argv.slice(2)) {
  const rowIndex = lines.findIndex((l, i) => i > headerIndex && splitCells(l)[0] === id);
  if (rowIndex < 0) throw new Error(`row ${id} not found`);
  const rawCells = splitCells(lines[rowIndex]);
  if (rawCells.length !== 3) throw new Error(`row ${id} cell count ${rawCells.length}`);
  const raw = rawCells[1];
  const rec = {
    rowId: id,
    rowLine: rowIndex + 1,
    rowCellCount: rawCells.length,
    rawCellLength: raw.length,
    rawCellSha256: sha(raw),
  };
  if (!raw.startsWith('`')) throw new Error(`${id}: cell does not open with a backtick`);
  const close = raw.indexOf('`', 1);
  if (close < 0) throw new Error(`${id}: no closing backtick`);
  rec.trailingProseInCell = raw.slice(close + 1).trim().length > 0;
  rec.trailingProseBytes = raw.length - close - 1;
  const interior = raw.slice(1, close);
  rec.outerBackticksStripped = true;
  if (interior.includes('\n')) throw new Error(`${id}: newline inside the command cell`);
  const decoded = interior.replace(/\\\|/g, '|').replace(/\\\\/g, '\\');
  if (decoded.includes('\\|')) throw new Error(`${id}: an escaped pipe survived into the shell text`);
  rec.decodedLength = decoded.length;
  rec.decodedSha256 = sha(decoded);
  const file = `docs/v2/evidence/P3.6/attempt-6/runtime/${id.toLowerCase()}-command-decoded.sh`;
  writeFileSync(file, `${decoded}\n`);
  rec.decodedFile = file;
  rec.decodedFileSha256 = sha(`${decoded}\n`);
  execFileSync('bash', ['-n', file]);
  rec.bashNExit = 0;
  console.log(`\n=== ${id} ===`);
  console.log(`dispatch line          ${rec.rowLine}`);
  console.log(`row cell count         ${rec.rowCellCount}`);
  console.log(`raw cell length        ${rec.rawCellLength}`);
  console.log(`raw cell sha256        ${rec.rawCellSha256}`);
  console.log(`outer backticks        ${rec.outerBackticksStripped}`);
  console.log(`decoded length         ${rec.decodedLength}`);
  console.log(`decoded sha256         ${rec.decodedSha256}`);
  console.log(`file                   ${file}  sha256 ${rec.decodedFileSha256}`);
  console.log(`bash -n                exit 0`);
  console.log('--- decoded, exactly as it will be executed ---');
  console.log(decoded);
  out.rows[id] = rec;
}

writeFileSync('docs/v2/evidence/P3.6/attempt-6/runtime/decode.meta.json', `${JSON.stringify(out, null, 2)}\n`);
