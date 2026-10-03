#!/usr/bin/env node
/**
 * P3.5 attempt 2 — pure verification of the two repaired harness functions.
 *
 * This is test scratch (under git-ignored `build/`), never a shipped file. It
 * does **not** copy the predicates it tests: it reads the shipped harness
 * `scripts/v2/tauri-audio.test.mjs`, extracts the exact function bodies by
 * brace matching, and evaluates those, so a pass means the real source behaves.
 *
 * No app, server, database, build, audio, microphone, display, network or port
 * is touched. Only `node:fs` reads one repository file.
 *
 * Run with the pinned Node:
 *   ~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node \
 *     build/p3.5-repair2/repair-verify.mjs
 *
 * `process.stdout.write` only (no `console.*`), so the durable copy under
 * `docs/v2/evidence/P3.5/attempt-2/` stays clean under the repo's lint.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The directory that holds `scripts/v2/tauri-audio.test.mjs`, wherever this copy runs from. */
function findRepoRoot(startDir) {
  let dir = startDir;
  for (;;) {
    if (existsSync(resolve(dir, 'scripts', 'v2', 'tauri-audio.test.mjs'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error('repository root not found');
    dir = parent;
  }
}

const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)));
const harnessPath = resolve(repoRoot, 'scripts', 'v2', 'tauri-audio.test.mjs');
const source = readFileSync(harnessPath, 'utf8');

const out = (line) => process.stdout.write(`${line}\n`);

let failures = 0;
let checks = 0;

function ok(name, detail = '') {
  checks += 1;
  out(`PASS ${name}${detail === '' ? '' : `: ${detail}`}`);
}

function bad(name, detail) {
  checks += 1;
  failures += 1;
  out(`FAIL ${name}: ${detail}`);
}

function expect(name, condition, detail) {
  if (condition) ok(name);
  else bad(name, detail);
}

function expectThrow(name, fn) {
  try {
    fn();
    bad(name, 'it returned instead of throwing');
  } catch (error) {
    ok(name, `threw ${JSON.stringify(String(error?.message ?? error))}`);
  }
}

/** Extract `function <name>(...) { ... }` from the real source by brace match. */
function extractFunction(text, name) {
  const start = text.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function ${name} not found in the harness`);
  const braceStart = text.indexOf('{', start);
  if (braceStart < 0) throw new Error(`no body for ${name}`);
  let depth = 0;
  for (let index = braceStart; index < text.length; index += 1) {
    const ch = text[index];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  throw new Error(`unbalanced braces for ${name}`);
}

function extractConst(text, name) {
  const match = new RegExp(`const ${name} = '([^']*)';`).exec(text);
  if (match === null) throw new Error(`const ${name} not found in the harness`);
  return match[1];
}

const SOURCE_NAME = extractConst(source, 'SOURCE_NAME');
const REAL_MIC_PREFIX = extractConst(source, 'REAL_MIC_PREFIX');

const harness = new Function(
  [
    `const SOURCE_NAME = ${JSON.stringify(SOURCE_NAME)};`,
    `const REAL_MIC_PREFIX = ${JSON.stringify(REAL_MIC_PREFIX)};`,
    extractFunction(source, 'parseSourceTable'),
    extractFunction(source, 'classifySourceOutputs'),
    extractFunction(source, 'classifyPactlReads'),
    extractFunction(source, 'tidsFromNewestMarker'),
    'return { parseSourceTable, classifySourceOutputs, classifyPactlReads, tidsFromNewestMarker };',
  ].join('\n'),
)();

out(`extracted from ${harnessPath.replace(repoRoot, '<repo>')}`);
out(`SOURCE_NAME=${JSON.stringify(SOURCE_NAME)} REAL_MIC_PREFIX=${JSON.stringify(REAL_MIC_PREFIX)}`);
out('');

// ------------------------------------------------------------------ D1 ----
// `pactl list short sources`: index, name, driver, sample-spec, state.
const SOURCES = [
  '61\talsa_input.usb-UGREEN_Camera_2K_UGREEN_Camera_2K_SN0001-02.analog-stereo\tPipeWire\ts16le 2ch 48000Hz\tSUSPENDED',
  '70\tapunta_p35_mic\tPipeWire\ts16le 2ch 48000Hz\tSUSPENDED',
  '71\tapunta_p35.monitor\tPipeWire\ts16le 2ch 48000Hz\tSUSPENDED',
  '80\tsome_other_host_stream\tPipeWire\ts16le 2ch 48000Hz\tRUNNING',
].join('\n');
// `pactl list short source-outputs`: output index, SOURCE index, client index,
// field pointer, sample-spec.
const output = (id, sourceId, clientId) => `${id}\t${sourceId}\t${clientId}\tPipeWire\ts16le 2ch 48000Hz`;

// The old defect: column [2] is the numeric client index, never a source name.
expect(
  'D1 the shipped source no longer compares a raw column to a source name',
  !source.includes('line.split(/\\s+/)[2] === SOURCE_NAME'),
  'the old column-[2]-is-a-name predicate is still present',
);

{
  const result = harness.classifySourceOutputs(output(12, 70, 167), SOURCES);
  expect('D1 virtual-only: virtual stream found', result.virtual.length === 1, JSON.stringify(result));
  expect('D1 virtual-only: no real-microphone stream', result.realMic.length === 0, JSON.stringify(result.realMic));
  expect('D1 virtual-only: no unrelated stream', result.unrelated.length === 0, JSON.stringify(result.unrelated));
}

{
  const result = harness.classifySourceOutputs([output(12, 70, 167), output(13, 61, 168)].join('\n'), SOURCES);
  expect('D1 virtual+physical leak: virtual stream found', result.virtual.length === 1, JSON.stringify(result));
  expect('D1 virtual+physical leak: real-microphone stream caught', result.realMic.length === 1, JSON.stringify(result.realMic));
  expect(
    'D1 virtual+physical leak: the resolved real source name is the microphone',
    result.realMic[0]?.sourceName === 'alsa_input.usb-UGREEN_Camera_2K_UGREEN_Camera_2K_SN0001-02.analog-stereo',
    JSON.stringify(result.realMic),
  );
}

{
  const result = harness.classifySourceOutputs(output(13, 61, 168), SOURCES);
  expect('D1 real-only: no virtual stream', result.virtual.length === 0, JSON.stringify(result.virtual));
  expect('D1 real-only: real-microphone stream caught', result.realMic.length === 1, JSON.stringify(result.realMic));
}

{
  const result = harness.classifySourceOutputs(output(14, 80, 169), SOURCES);
  expect('D1 unrelated source: no virtual stream', result.virtual.length === 0, JSON.stringify(result.virtual));
  expect('D1 unrelated source: no real-microphone stream', result.realMic.length === 0, JSON.stringify(result.realMic));
  expect('D1 unrelated source: named as unrelated', result.unrelated.length === 1, JSON.stringify(result.unrelated));
}

expectThrow('D1 stale/unknown source ID fails closed', () =>
  harness.classifySourceOutputs(output(15, 999, 170), SOURCES),
);
expectThrow('D1 missing source in the table fails closed', () =>
  harness.classifySourceOutputs(output(15, 70, 170), '80\tsome_other_host_stream\tPipeWire\ts16le 2ch 48000Hz\tRUNNING'),
);
expectThrow('D1 duplicate source index in the table fails closed', () =>
  harness.classifySourceOutputs(output(12, 70, 167), ['70\tapunta_p35_mic\tPipeWire\ts16le 2ch 48000Hz\tSUSPENDED', '70\tapunta_p35_mic\tPipeWire\ts16le 2ch 48000Hz\tSUSPENDED'].join('\n')),
);
expectThrow('D1 malformed source table row fails closed', () =>
  harness.classifySourceOutputs(output(12, 70, 167), 'notanumber\tapunta_p35_mic\tPipeWire\ts16le 2ch 48000Hz\tSUSPENDED'),
);
expectThrow('D1 malformed source-outputs row (too few columns) fails closed', () =>
  harness.classifySourceOutputs('12\t70', SOURCES),
);
expectThrow('D1 non-numeric source-output column fails closed', () =>
  harness.classifySourceOutputs('x\t70\t167\tPipeWire\ts16le 2ch 48000Hz', SOURCES),
);
expectThrow('D1 failed source-outputs command fails closed', () =>
  harness.classifyPactlReads({ code: 1, stdout: '', stderr: 'connection refused' }, { code: 0, stdout: SOURCES, stderr: '' }),
);
expectThrow('D1 failed sources command fails closed', () =>
  harness.classifyPactlReads({ code: 0, stdout: output(12, 70, 167), stderr: '' }, { code: 1, stdout: '', stderr: 'connection refused' }),
);

{
  const result = harness.classifyPactlReads(
    { code: 0, stdout: output(12, 70, 167), stderr: '' },
    { code: 0, stdout: SOURCES, stderr: '' },
  );
  expect('D1 both reads succeed and resolve', result.virtual.length === 1, JSON.stringify(result));
}

// ------------------------------------------------------------------ D2 ----
const marker = (query) => new URLSearchParams(query);
const rect = (testId, x, y, w, h) =>
  `tid_${testId}_x=${x}&tid_${testId}_y=${y}&tid_${testId}_w=${w}&tid_${testId}_h=${h}`;
const base = 'phase=record-start&timer=00:03&level=0&levelPeak=0.6';

{
  const tids = harness.tidsFromNewestMarker([
    marker(`${base}&${rect('record-start', 100, 200, 80, 40)}&${rect('home-search', 10, 20, 300, 30)}`),
  ]);
  expect('D2 single complete marker installs both rectangles', tids.size === 2, JSON.stringify([...tids]));
}

{
  const tids = harness.tidsFromNewestMarker([
    marker(`${base}&${rect('record-start', 100, 200, 80, 40)}`),
    marker(`${base}&${rect('home-search', 10, 20, 300, 30)}`),
  ]);
  expect(
    'D2 a test id the newest marker omits disappears (no history union)',
    !tids.has('record-start') && tids.has('home-search'),
    JSON.stringify([...tids]),
  );
}

{
  const tids = harness.tidsFromNewestMarker([
    marker(`${base}&${rect('home-search', 10, 20, 300, 30)}`),
    marker(`${base}&${rect('record-start', 100, 200, 80, 40)}`),
  ]);
  expect('D2 a newly published rectangle appears', tids.has('record-start'), JSON.stringify([...tids]));
  expect(
    'D2 an older removed rectangle is not resurrected',
    !tids.has('home-search'),
    JSON.stringify([...tids]),
  );
}

{
  const tids = harness.tidsFromNewestMarker([
    marker(`${base}&${rect('record-start', 100, 200, 80, 40)}`),
    marker(`${base}&tid_record-start_x=5&tid_record-start_y=6`),
  ]);
  expect(
    'D2 a partial newer marker installs no partial rectangle and does not merge with the older one',
    !tids.has('record-start'),
    JSON.stringify([...tids]),
  );
}

{
  const tids = harness.tidsFromNewestMarker([
    marker(`${base}&tid_record-start_x=5&tid_record-start_y=6&tid_record-start_w=NaN&tid_record-start_h=9`),
  ]);
  expect('D2 a NaN dimension installs nothing', !tids.has('record-start'), JSON.stringify([...tids]));
}

{
  const tids = harness.tidsFromNewestMarker([
    marker(`${base}&tid_record-start_x=5&tid_record-start_y=6&tid_record-start_w=0&tid_record-start_h=9`),
  ]);
  expect('D2 a zero dimension installs nothing', !tids.has('record-start'), JSON.stringify([...tids]));
}

{
  const tids = harness.tidsFromNewestMarker([marker(`${base}&tid_home-search_x=1&tid_home-search_y=2&tid_home-search_w=3&tid_home-search_h=4`)]);
  expect('D2 a dashed test id with all four fields installs', tids.get('home-search')?.w === 3, JSON.stringify([...tids]));
}

{
  const tids = harness.tidsFromNewestMarker([]);
  expect('D2 no markers installs nothing', tids.size === 0, JSON.stringify([...tids]));
}

out('');
out(`${String(checks - failures)}/${String(checks)} pure checks passed`);
process.exitCode = failures > 0 ? 1 : 0;
