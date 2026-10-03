#!/usr/bin/env node
// Fresh independent adversarial checker for the P3.5 client-column sentinel.
// Written from scratch for IR-2. Does not import or reuse the author's proof or
// the IR's adversarial-checks.mjs. Extracts the functions from the committed
// shipping harness and from the freshly replayed patched copy.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const sha = (t) => createHash('sha256').update(t).digest('hex');

function extractFunction(text, name) {
  const at = text.indexOf(`function ${name}(`);
  if (at < 0) throw new Error(`missing ${name}`);
  const brace = text.indexOf('{', at);
  let depth = 0;
  for (let i = brace; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(at, i + 1);
    }
  }
  throw new Error(`unbalanced ${name}`);
}

function load(file) {
  const text = readFileSync(file, 'utf8');
  const extraction =
    "const SOURCE_NAME = 'apunta_p35_mic';\n" +
    "const REAL_MIC_PREFIX = 'alsa_input.usb-UGREEN';\n" +
    extractFunction(text, 'parseSourceTable') +
    '\n' +
    extractFunction(text, 'classifySourceOutputs') +
    '\nreturn { parseSourceTable, classifySourceOutputs };';
  return { fn: new Function(extraction)(), text, extraction };
}

const shipping = 'scripts/v2/tauri-audio.test.mjs';
const replay = 'build/p35-client-proposal-ir2/replay/scripts/v2/tauri-audio.test.mjs';
const candidateWitness = 'docs/v2/evidence/P3.5/client-sentinel-proposal/candidate-after.mjs.txt';

const before = load(shipping);
const after = load(replay);

const SOURCES = [
  '8035 apunta_p35_mic PipeWire s16le 2ch 48000Hz SUSPENDED',
  '61 alsa_input.usb-UGREEN_X.analog-stereo PipeWire s16le 2ch 48000Hz SUSPENDED',
  '70 alsa_output.other.analog-stereo PipeWire s16le 2ch 48000Hz RUNNING',
  '8114 bluez_input.aa.a2dp PipeWire s16le 2ch 48000Hz SUSPENDED',
].join('\n');
const row = (a, b, c) => `${a}\t${b}\t${c}\tPipeWire\tfloat32le 2ch 48000Hz`;

let pass = 0;
let fail = 0;
const report = (line) => process.stdout.write(`${line}\n`);
const check = (label, ok, detail) => {
  if (ok) {
    pass += 1;
    report(`PASS ${label}`);
  } else {
    fail += 1;
    report(`FAIL ${label}: ${detail}`);
  }
};
const run = (fn, outputs, sources) => {
  try {
    return { value: fn(outputs, sources) };
  } catch (error) {
    return { error: String(error?.message ?? error) };
  }
};
const outcome = (o) =>
  o.error !== undefined ? `throw:${o.error}` : JSON.stringify(o.value.all.map((r) => ({ ...r }))) + `|v${o.value.virtual.length}|m${o.value.realMic.length}|u${o.value.unrelated.length}`;

// --- 1. the fix is real and non-vacuous, on the exact shape that blocked V3 ---
const v = run(after.fn.classifySourceOutputs, row(8043, 8035, '-'), SOURCES);
const bv = run(before.fn.classifySourceOutputs, row(8043, 8035, '-'), SOURCES);
check('shipped code throws on literal dash client (non-vacuous)', bv.error !== undefined, JSON.stringify(bv));
check(
  'patched code classifies literal dash on virtual source with clientId null',
  v.error === undefined && v.value.virtual.length === 1 && v.value.all[0].clientId === null,
  JSON.stringify(v),
);

// --- 2. real microphone leak still detected under a dash client ---
const m = run(after.fn.classifySourceOutputs, row(8044, 61, '-'), SOURCES);
check(
  'dash client on the real microphone is still a detected leak (realMic=1)',
  m.error === undefined && m.value.realMic.length === 1 && m.value.virtual.length === 0,
  JSON.stringify(m),
);

// --- 3. unknown source still fails closed, dash or numeric ---
const u = run(after.fn.classifySourceOutputs, row(8045, 99999, '-'), SOURCES);
check('dash client on unknown source still throws the unknown-source error', u.error !== undefined && u.error.includes('is not in the'), JSON.stringify(u));
const un = run(after.fn.classifySourceOutputs, row(8045, 99999, '167'), SOURCES);
check('numeric client on unknown source still fails closed', un.error !== undefined && un.error.includes('is not in the'), JSON.stringify(un));

// --- 4. only the literal '-' in the client column; nothing else is accepted ---
for (const tok of ['--', 'n/a', 'x', 'PipeWire', '-1x', '−', 'Infinity']) {
  const a = run(after.fn.classifySourceOutputs, row(9, 8035, tok), SOURCES);
  const b = run(before.fn.classifySourceOutputs, row(9, 8035, tok), SOURCES);
  check(`client token ${JSON.stringify(tok)} still throws (before and after)`, a.error !== undefined && b.error !== undefined, `before=${JSON.stringify(b)} after=${JSON.stringify(a)}`);
}

// --- 5. dash is only tolerated in column 3; columns 0/1 stay strict ---
check('dash in source column still refused', run(after.fn.classifySourceOutputs, row(10, '-', '167'), SOURCES).error !== undefined, '');
check('dash in stream column still refused', run(after.fn.classifySourceOutputs, row('-', '8035', '167'), SOURCES).error !== undefined, '');
check('dash in stream column with dash client still refused', run(after.fn.classifySourceOutputs, row('-', '8035', '-'), SOURCES).error !== undefined, '');
check('two-column row still malformed', run(after.fn.classifySourceOutputs, '21\t8035', SOURCES).error !== undefined, '');

// --- 6. every numeric client is byte-for-byte preserved before/after ---
const numericTokens = ['167', '0', '-1', '167.0', '+5', '0x10', '1e3', '007'];
for (const tok of numericTokens) {
  const b = run(before.fn.classifySourceOutputs, row(11, 8035, tok), SOURCES);
  const a = run(after.fn.classifySourceOutputs, row(11, 8035, tok), SOURCES);
  check(`numeric token ${JSON.stringify(tok)} identical before/after`, outcome(b) === outcome(a) && a.error === undefined, `before=${outcome(b)} after=${outcome(a)}`);
}
// -1 is a number, not the sentinel
const neg = run(after.fn.classifySourceOutputs, row(12, 8035, '-1'), SOURCES);
check('numeric -1 stays the number -1, not the sentinel', neg.error === undefined && neg.value.all[0].clientId === -1, JSON.stringify(neg));

// --- 7. malformed / duplicate source tables still stop ---
check('duplicate source index still stops', run(after.fn.classifySourceOutputs, row(13, 8035, '-'), `${SOURCES}\n8035 dup PipeWire s16le 2ch 48000Hz`).error !== undefined, '');
check('malformed source table row still stops', run(after.fn.classifySourceOutputs, row(14, 8035, '-'), '8035').error !== undefined, '');
check('non-numeric source table index still stops', run(after.fn.classifySourceOutputs, row(15, 8035, '-'), '80a name PipeWire s16le 2ch 48000Hz').error !== undefined, '');

// --- 8. grouping: a second real-mic stream is still caught alongside a dash row ---
const both = run(after.fn.classifySourceOutputs, `${row(8046, 8035, '-')}\n${row(8047, 61, '168')}`, SOURCES);
check(
  'dash row and a numeric real-mic stream both classify; realMic still flags the leak',
  both.error === undefined && both.value.virtual.length === 1 && both.value.realMic.length === 1 && both.value.unrelated.length === 0,
  JSON.stringify(both),
);

// --- 9. scope: exactly one contiguous changed region, guard/grouping identical ---
const bLines = before.text.split('\n');
const aLines = after.text.split('\n');
let prefix = 0;
while (prefix < bLines.length && bLines[prefix] === aLines[prefix]) prefix += 1;
let suffix = 0;
while (suffix < bLines.length - prefix && suffix < aLines.length - prefix && bLines[bLines.length - 1 - suffix] === aLines[aLines.length - 1 - suffix]) suffix += 1;
const bChanged = bLines.slice(prefix, bLines.length - suffix);
const aChanged = aLines.slice(prefix, aLines.length - suffix);
check(
  'exactly one contiguous changed region of 2 removed / 7 added lines',
  bChanged.length === 2 && aChanged.length === 7,
  `before-changed=${JSON.stringify(bChanged)} after-changed=${JSON.stringify(aChanged)}`,
);
const beforeGuard = before.text.slice(before.text.indexOf('    if (!sources.has(sourceId)) {'));
const afterGuard = after.text.slice(after.text.indexOf('    if (!sources.has(sourceId)) {'));
check('unknown-source guard and grouping are byte-identical', beforeGuard === afterGuard, 'guard differs');
check('parseSourceTable is byte-identical', extractFunction(before.text, 'parseSourceTable') === extractFunction(after.text, 'parseSourceTable'), 'table differs');
check(
  'no new top-level function added (extraction has exactly the two)',
  after.extraction.split('\n').filter((l) => l.startsWith('function ')).length === 2 &&
    before.extraction.split('\n').filter((l) => l.startsWith('function ')).length === 2,
  'function count differs',
);
// Internal whitespace is a column separator for this parser (split(/\s+/)); a
// token containing a space is therefore not a single client-column token. This
// is pre-existing behaviour, unchanged by the patch: `9 8035 - 1 ...` has client
// `-` plus an ignored 4th column, and is accepted on both sides once `-` is legal.
const spaced = run(after.fn.classifySourceOutputs, row(9, 8035, '- 1'), SOURCES);
check(
  'whitespace inside the client field splits columns; the literal dash column is accepted (pre-existing split, not a new token)',
  spaced.error === undefined && spaced.value.all[0].clientId === null,
  JSON.stringify(spaced),
);

// --- 10. author witness matches the patched shipping function ---
const candFn = extractFunction(readFileSync(candidateWitness, 'utf8'), 'classifySourceOutputs');
check('candidate-after.mjs.txt classifySourceOutputs matches the patched shipping function', candFn === extractFunction(after.text, 'classifySourceOutputs'), 'witness differs');

report('');
report(`shipping sha256 ${sha(readFileSync(shipping, 'utf8'))}`);
report(`replay   sha256 ${sha(readFileSync(replay, 'utf8'))}`);
report(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
