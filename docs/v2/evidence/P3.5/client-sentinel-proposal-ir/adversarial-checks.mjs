#!/usr/bin/env node
/**
 * Independent adversarial checks for the P3.5 client-column sentinel repair.
 *
 * Written by the IR reviewer, NOT the author. It does not reuse the author's
 * sentinel-proof.mjs: it extracts the functions from the committed harness and
 * from a fresh patched replay copy with its own brace-matching extractor, and
 * runs its own cases. Read-only with respect to the repository.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const sha = (t) => createHash('sha256').update(t).digest('hex');

function extractFunction(text, name) {
  const at = text.indexOf(`function ${name}(`);
  if (at < 0) throw new Error(`function ${name} not found`);
  const brace = text.indexOf('{', at);
  let depth = 0;
  for (let i = brace; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(at, i + 1);
    }
  }
  throw new Error(`unbalanced braces for ${name}`);
}

function load(file) {
  const text = readFileSync(file, 'utf8');
  const src =
    "const SOURCE_NAME = 'apunta_p35_mic';\n" +
    "const REAL_MIC_PREFIX = 'alsa_input.usb-UGREEN';\n" +
    extractFunction(text, 'parseSourceTable') +
    '\n' +
    extractFunction(text, 'classifySourceOutputs') +
    '\nreturn { classifySourceOutputs };';
  return new Function(src)();
}

const before = load('scripts/v2/tauri-audio.test.mjs');
const after = load('build/p35-client-proposal-ir/replay/scripts/v2/tauri-audio.test.mjs');

const SOURCES = [
  '8035 apunta_p35_mic PipeWire s16le 2ch 48000Hz SUSPENDED',
  '61 alsa_input.usb-UGREEN_Camera_2K.analog-stereo PipeWire s16le 2ch 48000Hz SUSPENDED',
  '70 alsa_output.other.analog-stereo PipeWire s16le 2ch 48000Hz RUNNING',
].join('\n');
const row = (a, b, c) => `${a}\t${b}\t${c}\tPipeWire\tfloat32le 2ch 48000Hz`;

let pass = 0;
let fail = 0;
const check = (label, ok, detail) => {
  if (ok) {
    pass += 1;
    console.log(`PASS ${label}`);
  } else {
    fail += 1;
    console.log(`FAIL ${label}: ${detail}`);
  }
};
const run = (fn, outputs, sources) => {
  try {
    return { value: fn(outputs, sources) };
  } catch (error) {
    return { error: String(error?.message ?? error) };
  }
};

// 1-3: the three shapes the fix exists for.
const vDash = run(after.classifySourceOutputs, row(8043, 8035, '-'), SOURCES);
check(
  'dash client on virtual source classifies and clientId is null',
  vDash.error === undefined && vDash.value.virtual.length === 1 && vDash.value.all[0].clientId === null,
  JSON.stringify(vDash),
);
const bDash = run(before.classifySourceOutputs, row(8043, 8035, '-'), SOURCES);
check('dash client on virtual source is non-vacuous: shipped code throws', bDash.error !== undefined, JSON.stringify(bDash));

const micDash = run(after.classifySourceOutputs, row(8044, 61, '-'), SOURCES);
check(
  'dash client on the real microphone is detected as a leak',
  micDash.error === undefined && micDash.value.realMic.length === 1,
  JSON.stringify(micDash),
);

const unknownDash = run(after.classifySourceOutputs, row(8045, 4242, '-'), SOURCES);
check(
  'dash client on an unknown source still throws the unknown-source error, not a pass',
  unknownDash.error !== undefined && unknownDash.error.includes('is not in the'),
  JSON.stringify(unknownDash),
);

// 4-6: the dash is only tolerated in the third column; malformed rows still stop.
const sourceDash = run(after.classifySourceOutputs, row(8046, '-', '167'), SOURCES);
check(
  'dash in the source column is still refused (source column stays strict)',
  sourceDash.error !== undefined && sourceDash.error.includes('non-numeric source-outputs'),
  JSON.stringify(sourceDash),
);
const streamDash = run(after.classifySourceOutputs, row('-', '8035', '167'), SOURCES);
check('dash in the stream column is still refused', streamDash.error !== undefined, JSON.stringify(streamDash));
const twoCol = run(after.classifySourceOutputs, '21\t8035', SOURCES);
check('two-column row is still malformed', twoCol.error !== undefined, JSON.stringify(twoCol));
const doubleDash = run(after.classifySourceOutputs, row(8047, 8035, '--'), SOURCES);
check('a double dash is not the sentinel', doubleDash.error !== undefined, JSON.stringify(doubleDash));
const naDash = run(after.classifySourceOutputs, row(8048, 8035, 'n/a'), SOURCES);
check('a dash-with-digit token is not the sentinel', naDash.error !== undefined, JSON.stringify(naDash));

// 7-10: every numeric client is byte-for-byte preserved, including negative legacy.
for (const [token, expected] of [
  ['167', 167],
  ['0', 0],
  ['-1', -1],
  ['167.0', 167],
]) {
  const b = run(before.classifySourceOutputs, row(10, 8035, token), SOURCES);
  const a = run(after.classifySourceOutputs, row(10, 8035, token), SOURCES);
  check(
    `numeric client ${token} is identical before and after and equals ${expected}`,
    b.error === undefined &&
      a.error === undefined &&
      a.value.all[0].clientId === expected &&
      b.value.all[0].clientId === expected,
    `before=${JSON.stringify(b)} after=${JSON.stringify(a)}`,
  );
}
const neg = run(after.classifySourceOutputs, row(10, 8035, '-1'), SOURCES);
check('negative client -1 is retained as a number, not turned into the sentinel', neg.value.all[0].clientId === -1, JSON.stringify(neg));

// 11: numeric client with an unknown source still fails closed, as before.
const unknownNumeric = run(after.classifySourceOutputs, row(11, 4242, '167'), SOURCES);
check(
  'numeric client on an unknown source still fails closed',
  unknownNumeric.error !== undefined && unknownNumeric.error.includes('is not in the'),
  JSON.stringify(unknownNumeric),
);

// 12: malformed/duplicate source tables still stop, dash or not.
const dup = run(after.classifySourceOutputs, row(12, 8035, '-'), `${SOURCES}\n8035 alsa_input.usb-UGREEN_y PipeWire s16le 2ch 48000Hz SUSPENDED`);
check('duplicate source index still stops', dup.error !== undefined, JSON.stringify(dup));
const badTable = run(after.classifySourceOutputs, row(13, 8035, '-'), '8035');
check('malformed source table row still stops', badTable.error !== undefined, JSON.stringify(badTable));

// 13: scope — the only difference between shipped and patched is the sentinel block.
const beforeText = readFileSync('scripts/v2/tauri-audio.test.mjs', 'utf8');
const afterText = readFileSync('build/p35-client-proposal-ir/replay/scripts/v2/tauri-audio.test.mjs', 'utf8');
const bLines = beforeText.split('\n');
const aLines = afterText.split('\n');
let prefix = 0;
while (prefix < bLines.length && prefix < aLines.length && bLines[prefix] === aLines[prefix]) prefix += 1;
let suffix = 0;
while (
  suffix < bLines.length - prefix &&
  suffix < aLines.length - prefix &&
  bLines[bLines.length - 1 - suffix] === aLines[aLines.length - 1 - suffix]
) {
  suffix += 1;
}
const bChanged = bLines.slice(prefix, bLines.length - suffix);
const aChanged = aLines.slice(prefix, aLines.length - suffix);
check(
  'exactly one contiguous changed region, the shipped client-sentinel block',
  prefix === 308 &&
    bChanged.length === 2 &&
    bChanged[0] === '    const clientId = Number(columns[2]);' &&
    bChanged[1] === '    if (![streamId, sourceId, clientId].every((value) => Number.isInteger(value))) {' &&
    aChanged.length === 7 &&
    aChanged[0] === '    // Only the literal `-` means "no client"; any other client-column value',
    `prefix=${prefix} before-changed=${JSON.stringify(bChanged)} after-changed=${JSON.stringify(aChanged)}`,
);

// 14: the author's candidate-after.mjs classifySourceOutputs equals the patched function.
const cand = readFileSync('docs/v2/evidence/P3.5/client-sentinel-proposal/candidate-after.mjs', 'utf8');
const candFn = extractFunction(cand, 'classifySourceOutputs');
const patchedFn = extractFunction(afterText, 'classifySourceOutputs');
check('author candidate-after.mjs matches the patched shipping function', candFn === patchedFn, 'function bodies differ');

console.log('');
console.log(`before sha256 ${sha(beforeText)}`);
console.log(`after  sha256 ${sha(afterText)}`);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
