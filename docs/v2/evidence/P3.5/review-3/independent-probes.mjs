#!/usr/bin/env node
/**
 * P3.5 final source review (review-3) — independent adversarial probes.
 *
 * The shipped harness is read and the exact function bodies are extracted by
 * brace matching; nothing is reimplemented. `process.stdout.write` only, so the
 * durable copy under docs/v2/evidence/P3.5/review-3/ stays lint-clean.
 *
 * No app, server, database, build, LLM, audio, microphone, display, input,
 * pactl mutation, network or port 7717 is touched. One repository file is read.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

let checks = 0;
let failures = 0;
const ok = (name, detail = '') => {
  checks += 1;
  out(`PASS ${name}${detail === '' ? '' : `: ${detail}`}`);
};
const bad = (name, detail) => {
  checks += 1;
  failures += 1;
  out(`FAIL ${name}: ${detail}`);
};
const expect = (name, condition, detail = '') => (condition ? ok(name) : bad(name, detail));
const expectThrow = (name, fn) => {
  try {
    fn();
    bad(name, 'returned instead of throwing');
  } catch (error) {
    ok(name, `threw ${JSON.stringify(String(error?.message ?? error))}`);
  }
};

/** Extract one top-level function body, comment- and string-aware. */
function extractFunction(name) {
  const candidates = [`\nasync function ${name}(`, `\nfunction ${name}(`];
  const starts = candidates.map((needle) => source.indexOf(needle)).filter((at) => at >= 0);
  if (starts.length === 0) throw new Error(`function ${name} not found`);
  const start = Math.min(...starts);
  const open = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  let index = open;
  for (; index < source.length; index += 1) {
    const char = source[index];
    if (char === '/' && source[index + 1] === '/') {
      while (index < source.length && source[index] !== '\n') index += 1;
      continue;
    }
    if (char === '/' && source[index + 1] === '*') {
      index = source.indexOf('*/', index) + 1;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      const quote = char;
      index += 1;
      while (index < source.length && source[index] !== quote) {
        if (source[index] === '\\') index += 1;
        index += 1;
      }
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const body = source.slice(start + 1, index + 1);
  if (!source.includes(body)) throw new Error(`extracted ${name} is not verbatim`);
  return body;
}

function extractConst(name) {
  const match = new RegExp(`^const ${name} = '([^']*)';$`, 'm').exec(source);
  if (match === null) throw new Error(`const ${name} not found`);
  return match[1];
}

const MARKER_PATH = extractConst('MARKER_PATH');
const OBSERVE_PATH = extractConst('OBSERVE_PATH');
const SOURCE_NAME = extractConst('SOURCE_NAME');
const REAL_MIC_PREFIX = extractConst('REAL_MIC_PREFIX');

const factory = new Function(
  'SOURCE_NAME',
  'REAL_MIC_PREFIX',
  'MARKER_PATH',
  'OBSERVE_PATH',
  [
    extractFunction('parseSourceTable'),
    extractFunction('classifySourceOutputs'),
    extractFunction('classifyPactlReads'),
    extractFunction('tidsFromNewestMarker'),
    extractFunction('latestMarker'),
    extractFunction('rectOf'),
    // rectInsideWindow calls check(); the stub returns the condition and adds no
    // logic, so the shipped predicate is what runs.
    'const check = (n, c) => c;',
    extractFunction('rectInsideWindow'),
    extractFunction('readReported'),
    extractFunction('waitForPublished'),
    'const pass = () => {};',
    'const fail = () => {};',
    'const sleep = (ms) => new Promise((d) => setTimeout(d, ms));',
    'const MAX_TEXT_LEAF = 64;',
    'return { parseSourceTable, classifySourceOutputs, classifyPactlReads, tidsFromNewestMarker, latestMarker, rectOf, rectInsideWindow, readReported, waitForPublished };',
  ].join('\n\n'),
);

const H = factory(SOURCE_NAME, REAL_MIC_PREFIX, MARKER_PATH, OBSERVE_PATH);

out(`extracted from ${harnessPath.replace(repoRoot, '<repo>')}`);
out(`MARKER_PATH=${MARKER_PATH} OBSERVE_PATH=${OBSERVE_PATH} SOURCE_NAME=${SOURCE_NAME}`);
out('');

const FIELDS = ['x', 'y', 'w', 'h'];
const GOOD = { x: '100', y: '200', w: '80', h: '40' };
const mapWith = (overrides) =>
  new Map(Object.entries({ ...GOOD, ...overrides }).map(([f, v]) => [`tid_record-start_${f}`, v]));
const paramsWithout = (omit) =>
  new URLSearchParams(
    Object.fromEntries(FIELDS.filter((f) => f !== omit).map((f) => [`tid_record-start_${f}`, GOOD[f]])),
  );
const marker = (params) => new URLSearchParams(params);
const rect = (id, x, y, w, h) =>
  `tid_${id}_x=${x}&tid_${id}_y=${y}&tid_${id}_w=${w}&tid_${id}_h=${h}`;
const base = 'phase=record-start&timer=00:03&level=0&levelPeak=0.6';

// --- A. missing field, each of the four ------------------------------------
for (const field of FIELDS) {
  const tids = H.tidsFromNewestMarker([marker(`${base}&${paramsWithout(field).toString()}`)]);
  expect(`A missing _${field} installs nothing`, !tids.has('record-start'), JSON.stringify([...tids]));
}

// --- B. empty and whitespace-only, each field, several whitespace kinds -----
for (const field of FIELDS) {
  expect(`B empty _${field} installs nothing`, !H.tidsFromNewestMarker([mapWith({ [field]: '' })]).has('record-start'));
}
for (const [kind, value] of [
  ['space', '   '],
  ['tab', '\t'],
  ['newline', '\n'],
  ['carriage-return', '\r'],
  ['mixed', ' \t\r\n '],
]) {
  for (const field of FIELDS) {
    expect(
      `B ${kind} _${field} installs nothing`,
      !H.tidsFromNewestMarker([mapWith({ [field]: value })]).has('record-start'),
    );
  }
}

// --- C. null / undefined / non-string (the Number(null) hazard) -------------
for (const field of FIELDS) {
  expect(`C null _${field} installs nothing`, !H.tidsFromNewestMarker([mapWith({ [field]: null })]).has('record-start'));
  expect(
    `C undefined _${field} installs nothing`,
    !H.tidsFromNewestMarker([mapWith({ [field]: undefined })]).has('record-start'),
  );
  expect(
    `C numeric (non-string) _${field} installs nothing`,
    !H.tidsFromNewestMarker([mapWith({ [field]: 100 })]).has('record-start'),
  );
}

// --- D. numeric boundary rules ---------------------------------------------
{
  const t = H.tidsFromNewestMarker([marker(`${base}&${rect('record-start', 0, 0, 80, 40)}`)]).get('record-start');
  expect('D zero x/y is a real coordinate and installs', t?.x === 0 && t?.y === 0, JSON.stringify(t));
}
{
  const t = H.tidsFromNewestMarker([marker(`${base}&${rect('record-start', -5, -7, 80, 40)}`)]).get('record-start');
  expect('D negative x/y installs unchanged in the reader', t?.x === -5 && t?.y === -7, JSON.stringify(t));
}
for (const field of FIELDS) {
  for (const [kind, value] of [
    ['NaN', 'NaN'],
    ['Infinity', 'Infinity'],
    ['-Infinity', '-Infinity'],
  ]) {
    expect(
      `D ${kind} _${field} installs nothing`,
      !H.tidsFromNewestMarker([mapWith({ [field]: value })]).has('record-start'),
    );
  }
}
for (const [label, overrides] of [
  ['zero width', { w: '0' }],
  ['negative width', { w: '-80' }],
  ['zero height', { h: '0' }],
  ['negative height', { h: '-40' }],
]) {
  expect(`D ${label} installs nothing`, !H.tidsFromNewestMarker([mapWith(overrides)]).has('record-start'));
}
{
  const t = H.tidsFromNewestMarker([
    marker(`${base}&tid_record-start_x=%20100%20&tid_record-start_y=200&tid_record-start_w=80&tid_record-start_h=40`),
  ]).get('record-start');
  expect('D padded numeric value installs, trimmed', t?.x === 100 && t?.h === 40, JSON.stringify(t));
}

// --- E. newest snapshot only, no partial merge, no fallback -----------------
{
  const tids = H.tidsFromNewestMarker([
    marker(`${base}&${rect('record-start', 100, 200, 80, 40)}`),
    marker(`${base}&${paramsWithout('x').toString()}`),
  ]);
  expect('E newest partial does not fall back to the older complete snapshot', tids.size === 0, JSON.stringify([...tids]));
}
{
  const tids = H.tidsFromNewestMarker([
    marker(`${base}&${rect('record-start', 1, 2, 3, 4)}&${rect('home-search', 5, 6, 7, 8)}`),
    marker(
      `${base}&${new URLSearchParams({
        ...Object.fromEntries(FIELDS.filter((f) => f !== 'w').map((f) => [`tid_record-start_${f}`, GOOD[f]])),
        ...Object.fromEntries(FIELDS.map((f) => [`tid_home-search_${f}`, GOOD[f]])),
      }).toString()}`,
    ),
  ]);
  expect(
    'E one incomplete id does not suppress a complete sibling',
    !tids.has('record-start') && tids.get('home-search')?.w === 80,
    JSON.stringify([...tids]),
  );
}
{
  const tids = H.tidsFromNewestMarker([
    marker(`${base}&${rect('record-start', 1, 2, 3, 4)}&${rect('home-search', 5, 6, 7, 8)}`),
    marker(`${base}&${rect('home-search', 5, 6, 7, 8)}`),
  ]);
  expect(
    'E a newest marker that omits an id removes it (no history union)',
    !tids.has('record-start') && tids.has('home-search'),
    JSON.stringify([...tids]),
  );
}
expect('E no markers installs nothing', H.tidsFromNewestMarker([]).size === 0);
{
  const tids = H.tidsFromNewestMarker([
    marker(`${base}&${rect('home-action-note', 1, 2, 3, 4)}&${rect('home-search', 5, 6, 7, 8)}&${rect('record-start', 9, 10, 11, 12)}`),
  ]);
  expect(
    'E the three own data-testid rectangles all resolve',
    tids.size === 3 && tids.has('home-action-note') && tids.has('home-search') && tids.has('record-start'),
    JSON.stringify([...tids.keys()]),
  );
}
{
  const tids = H.tidsFromNewestMarker([marker(`${base}&tid_a_b_x=1&tid_a_b_y=2&tid_a_b_w=3&tid_a_b_h=4`)]);
  expect('E an id containing an underscore resolves', tids.has('a_b'), JSON.stringify([...tids.keys()]));
}

// --- F. the later containment seam rejects negative coordinates -------------
{
  const t = H.tidsFromNewestMarker([marker(`${base}&${rect('record-start', -5, -7, 80, 40)}`)]).get('record-start');
  const viaRectOf = H.rectOf(t, 'record-start');
  expect('F rectOf passes the negative rectangle through (finite, positive size)', viaRectOf !== null, JSON.stringify(viaRectOf));
  const inside = H.rectInsideWindow(
    { rect: t },
    { width: 1000, height: 800 },
    'negative',
  );
  expect('F rectInsideWindow rejects the negative x/y at click time', inside === false, String(inside));
}
{
  const t = H.tidsFromNewestMarker([marker(`${base}&${rect('record-start', 100, 200, 80, 40)}`)]).get('record-start');
  const inside = H.rectInsideWindow({ rect: t }, { width: 1000, height: 800 }, 'positive');
  expect('F rectInsideWindow accepts a positive in-window rectangle', inside === true, String(inside));
}

// --- G. integration: readReported newest-only, P3.4 leaves, wait -------------
const bridge = (path, query) => `apunta: ignoring a bridge line (HttpRejection: Failed to fetch ${path}?${query}")`;
const audio = (query) => bridge(MARKER_PATH, new URLSearchParams(query).toString());
{
  const stderr = [
    audio({ phase: 'record-start', ...Object.fromEntries(FIELDS.map((f) => [`tid_record-start_${f}`, GOOD[f]])) }),
    audio({ phase: 'record-stop', ...Object.fromEntries(FIELDS.map((f) => [`tid_home-search_${f}`, GOOD[f]])) }),
  ].join('\n');
  const r = H.readReported({ stderr });
  expect(
    'G readReported keeps only the newest marker snapshot',
    r.markers.length === 2 && !r.tids.has('record-start') && r.tids.has('home-search'),
    `markers=${r.markers.length} tids=${[...r.tids.keys()].join(',')}`,
  );
  expect('G latestMarker is the last snapshot', H.latestMarker(r).get('phase') === 'record-stop');
}
{
  const stderr = [
    audio({ phase: 'record-start', ...Object.fromEntries(FIELDS.map((f) => [`tid_record-start_${f}`, GOOD[f]])) }),
    `apunta: ignoring a bridge line (HttpRejection: Failed to fetch ${MARKER_PATH}?phase=record-stop&'tid_record-start_x=111&'tid_record-start_y=222)`,
  ].join('\n');
  const r = H.readReported({ stderr });
  expect('G a truncated newest marker is present and wins', r.markers.length === 2 && r.tids.size === 0, `markers=${r.markers.length}`);
  expect('G the truncated marker does not resurrect the older rectangle', H.rectOf(r.tids.get('record-start'), 'record-start') === null);
}
{
  const stderr = [
    bridge(OBSERVE_PATH, new URLSearchParams({ i0_x: '10', i0_y: '20', i0_w: '30', i0_h: '40', i0_l: 'Stop and create draft' }).toString()),
    audio({ phase: 'record-start', ...Object.fromEntries(FIELDS.map((f) => [`tid_record-start_${f}`, GOOD[f]])) }),
  ].join('\n');
  const r = H.readReported({ stderr });
  expect('G P3.4 text leaves still read from the observe marker', r.leaves.get('Stop and create draft')?.w === 30);
  expect('G own rectangles and inherited leaves coexist', r.tids.has('record-start') && r.leaves.size === 1);
}
{
  const run = { output: { stderr: '' } };
  const timer = setTimeout(() => {
    run.output.stderr += `\n${audio({ phase: 'record-stop', ...Object.fromEntries(FIELDS.map((f) => [`tid_home-search_${f}`, GOOD[f]])) })}`;
  }, 300);
  const target = await H.waitForPublished(
    run,
    5_000,
    'the home-search rectangle',
    (reported) => H.rectOf(reported.tids.get('home-search'), 'home-search'),
  );
  clearTimeout(timer);
  expect('G waitForPublished resolves a rectangle published late', target !== null && target.cx === 140 && target.cy === 220, JSON.stringify(target));
}
{
  const before = process.exitCode;
  const run = { output: { stderr: audio({ phase: 'record-start' }) } };
  const target = await H.waitForPublished(
    run,
    600,
    'the record-start rectangle',
    (reported) => H.rectOf(reported.tids.get('record-start'), 'record-start'),
  );
  process.exitCode = before;
  expect('G waitForPublished times out rather than reusing an older rectangle', target === null, JSON.stringify(target));
}

// --- H. stream source-ID safety (unchanged in this candidate) ----------------
const SOURCES = [
  '61\talsa_input.usb-UGREEN_Camera_2K_UGREEN_Camera_2K_SN0001-02.analog-stereo\tPipeWire\ts16le 2ch 48000Hz\tSUSPENDED',
  '70\tapunta_p35_mic\tPipeWire\ts16le 2ch 48000Hz\tSUSPENDED',
  '71\tapunta_p35.monitor\tPipeWire\ts16le 2ch 48000Hz\tSUSPENDED',
  '80\tsome_other_host_stream\tPipeWire\ts16le 2ch 48000Hz\tRUNNING',
].join('\n');
const output = (id, sourceId, clientId) => `${id}\t${sourceId}\t${clientId}\tPipeWire\ts16le 2ch 48000Hz`;
{
  const r = H.classifySourceOutputs([output(12, 70, 167), output(13, 61, 168)].join('\n'), SOURCES);
  expect('H a stream whose client index is a different harmless source is still caught by resolved name', r.realMic.length === 1, JSON.stringify(r.realMic));
  expect('H the virtual stream is classified virtual', r.virtual.length === 1);
}
expectThrow('H unknown/stale source index fails closed', () => H.classifySourceOutputs(output(15, 999, 170), SOURCES));
expectThrow('H duplicate source index fails closed', () =>
  H.classifySourceOutputs(output(12, 70, 167), ['70\tapunta_p35_mic\ta\tb\tc', '70\tapunta_p35_mic\ta\tb\tc'].join('\n')),
);
expectThrow('H malformed source-outputs row fails closed', () => H.classifySourceOutputs('12\t70', SOURCES));
expectThrow('H non-numeric source-outputs column fails closed', () => H.classifySourceOutputs('x\t70\t167\ta\tb', SOURCES));
expectThrow('H failed source-outputs command fails closed', () =>
  H.classifyPactlReads({ code: 1, stdout: '', stderr: 'x' }, { code: 0, stdout: SOURCES, stderr: '' }),
);
expectThrow('H failed sources command fails closed', () =>
  H.classifyPactlReads({ code: 0, stdout: output(12, 70, 167), stderr: '' }, { code: 1, stdout: '', stderr: 'x' }),
);
expectThrow('H killed pactl (code null) fails closed', () =>
  H.classifyPactlReads({ code: null, stdout: '', stderr: '' }, { code: 0, stdout: SOURCES, stderr: '' }),
);
{
  const r = H.classifyPactlReads({ code: 0, stdout: output(12, 70, 167), stderr: '' }, { code: 0, stdout: SOURCES, stderr: '' });
  expect('H both reads succeed and resolve', r.virtual.length === 1 && r.realMic.length === 0);
}

out('');
out(`${String(checks - failures)}/${String(checks)} independent probes passed`);
process.exitCode = failures > 0 ? 1 : 0;
