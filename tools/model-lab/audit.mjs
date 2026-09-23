#!/usr/bin/env node
// Print one fixture's source beside one model's generated note, for a hand
// audit. Reads the JSON written by dump-note.mts.
//
//   node tools/model-lab/audit.mjs <corpus-dir> <notes-json> [fixture-substring]

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [corpus, noteFile, filter] = process.argv.slice(2);
if (!corpus || !noteFile) throw new Error('usage: audit.mjs <corpus-dir> <notes-json> [fixture]');

const { fixture, model, sections } = JSON.parse(readFileSync(noteFile, 'utf8'));
if (filter && !fixture.includes(filter)) process.exit(0);

const source = readFileSync(join(corpus, fixture), 'utf8').trim();
console.log(`### ${model} · ${fixture}\n`);
console.log('--- SOURCE ---');
console.log(source);
console.log('\n--- NOTE ---');
for (const [name, body] of Object.entries(sections)) {
  console.log(`[${name}] ${body === '' ? '(blank)' : body}`);
}
console.log('');
