#!/usr/bin/env node
/**
 * Synthetic proof for the P3.5 client-column sentinel: BEFORE = the shipped
 * `classifySourceOutputs`, AFTER = the prepared candidate patch.
 *
 * NO harness edit, NO runtime, NO pactl, NO app. Both sides are *extracted*
 * function copies; the BEFORE copy is verified byte-equal to the function slice
 * of the shipped harness at candidate 7e16513, so it cannot silently drift.
 * Fixtures are hand-written tables in the shape local primary evidence proves
 * pactl prints (see format-primary-evidence.md).
 *
 * Exit 0 = every check passed. Exit 1 = at least one failed.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '../../../../..');
const sha = (text) => createHash('sha256').update(text).digest('hex');

/** The shipped harness's `parseSourceTable` + `classifySourceOutputs`, verbatim. */
function extractShipped() {
  const harness = readFileSync(join(repo, 'scripts/v2/tauri-audio.test.mjs'), 'utf8');
  const lines = harness.split('\n');
  const start = lines.findIndex((line) => line.startsWith('function parseSourceTable('));
  const classify = lines.findIndex((line) => line.startsWith('function classifySourceOutputs('));
  const end = lines.findIndex((line, index) => index > classify && line === '}');
  if (start < 0 || end < 0) throw new Error('could not locate the functions in the shipped harness');
  const constants = [
    "const SOURCE_NAME = 'apunta_p35_mic';",
    "const REAL_MIC_PREFIX = 'alsa_input.usb-UGREEN';",
    '',
  ].join('\n') + '\n';
  return {
    text: constants + lines.slice(start, end + 1).join('\n') + '\n',
    span: { start: start + 1, end: end + 1 },
  };
}

const shipped = extractShipped();
const beforeText = shipped.text;
// The candidate is a raw extraction witness, not an executable module: it is
// read as text and evaluated with `new Function`, so it carries a `.txt`
// extension and is not linted as an .mjs file.
const afterText = readFileSync(join(here, 'candidate-after.mjs.txt'), 'utf8');

const before = new Function(`${beforeText}\nreturn { parseSourceTable, classifySourceOutputs };`)();
const after = new Function(`${afterText}\nreturn { parseSourceTable, classifySourceOutputs };`)();

// ------------------------------------------------------------------ fixtures --

const SOURCES = [
  '8035 apunta_p35_mic PipeWire s16le 2ch 48000Hz SUSPENDED',
  '8036 apunta_p35.monitor PipeWire s16le 2ch 48000Hz SUSPENDED',
  '61 alsa_input.usb-UGREEN_Camera_2K_UGREEN_Camera_2K_SN0001-02.analog-stereo PipeWire s16le 2ch 48000Hz SUSPENDED',
  '70 alsa_output.usb-UGREEN_Camera_2K_UGREEN_Camera_2K_SN0001-02.analog-stereo PipeWire s16le 2ch 48000Hz RUNNING',
  '8114 bluez_input.00_00_00_00_00_00.a2dp_sbc PipeWire s16le 2ch 48000Hz SUSPENDED',
].join('\n');

const row = (a, b, c) => `${a}\t${b}\t${c}\tPipeWire\tfloat32le 2ch 48000Hz`;

// The two rows attempt 3 actually read, byte-for-byte from its evidence.
const ATTEMPT3_V3 = '8043\t8035\t-\tPipeWire\tfloat32le 2ch 48000Hz';
const ATTEMPT3_V4 = '8122\t8114\t-\tPipeWire\tfloat32le 2ch 48000Hz';

const CASES = [
  // --- the observed blocker: a literal `-` client column -----------------------
  {
    id: 'A1 valid dash on the virtual source',
    outputs: row(8043, 8035, '-'),
    before: 'throw',
    after: { virtual: 1, realMic: 0, unrelated: 0, clientId: null },
  },
  {
    id: 'A2 valid dash on the owner real microphone (leak must be detected)',
    outputs: row(8044, 61, '-'),
    before: 'throw',
    after: { virtual: 0, realMic: 1, unrelated: 0, clientId: null },
  },
  {
    id: 'A3 valid dash on an unrelated source (caller must still stop on it)',
    outputs: row(8045, 70, '-'),
    before: 'throw',
    after: { virtual: 0, realMic: 0, unrelated: 1, clientId: null },
  },
  {
    id: 'A4 attempt 3 V3 row verbatim, source index absent from the table',
    outputs: ATTEMPT3_V3,
    sources: '9999 alsa_input.usb-UGREEN_x PipeWire s16le 2ch 48000Hz SUSPENDED',
    before: 'throw',
    after: 'throw:source-output',
  },
  {
    id: 'A5 attempt 3 V4 row verbatim, source index absent from the table',
    outputs: ATTEMPT3_V4,
    sources: '9999 alsa_input.usb-UGREEN_x PipeWire s16le 2ch 48000Hz SUSPENDED',
    before: 'throw',
    after: 'throw:source-output',
  },
  {
    id: 'A6 dash row whose source index is in the table (the shape the fix enables)',
    outputs: row(8046, 8114, '-'),
    before: 'throw',
    after: { virtual: 0, realMic: 0, unrelated: 1, clientId: null },
  },
  // --- numeric client behaviour must be byte-for-byte retained ----------------
  {
    id: 'A7 numeric client, virtual source',
    outputs: row(10, 8035, '167'),
    before: { virtual: 1, realMic: 0, unrelated: 0, clientId: 167 },
    after: { virtual: 1, realMic: 0, unrelated: 0, clientId: 167 },
  },
  {
    id: 'A8 numeric client, real microphone (leak must be detected both sides)',
    outputs: row(11, 61, '168'),
    before: { realMic: 1, clientId: 168 },
    after: { realMic: 1, clientId: 168 },
  },
  {
    id: 'A9 numeric client 0 (a real client index, not a sentinel)',
    outputs: row(12, 8035, '0'),
    before: { virtual: 1, clientId: 0 },
    after: { virtual: 1, clientId: 0 },
  },
  {
    id: 'A10 numeric client -1 (retained as-is: pactl prints `-`, not `-1`)',
    outputs: row(13, 8035, '-1'),
    before: { virtual: 1, clientId: -1 },
    after: { virtual: 1, clientId: -1 },
  },
  {
    id: 'A11 numeric client with a float-shaped token (unchanged leniency)',
    outputs: row(14, 8035, '167.0'),
    before: { virtual: 1, clientId: 167 },
    after: { virtual: 1, clientId: 167 },
  },
  // --- everything else must still stop ----------------------------------------
  {
    id: 'A12 third column is garbage text',
    outputs: row(15, 8035, 'x'),
    before: 'throw',
    after: 'throw',
  },
  {
    id: 'A13 third column is a driver name in the wrong place',
    outputs: row(16, 8035, 'PipeWire'),
    before: 'throw',
    after: 'throw',
  },
  {
    id: 'A14 third column is a double dash',
    outputs: row(17, 8035, '--'),
    before: 'throw',
    after: 'throw',
  },
  {
    id: 'A15 third column is a dash with a digit (n/a)',
    outputs: row(18, 8035, 'n/a'),
    before: 'throw',
    after: 'throw',
  },
  {
    id: 'A16 dash with a non-numeric source index',
    outputs: row(19, '80a', '-'),
    before: 'throw',
    after: 'throw',
  },
  {
    id: 'A17 dash with a non-numeric stream index',
    outputs: `x\t8035\t-\tPipeWire\tfloat32le 2ch 48000Hz`,
    before: 'throw',
    after: 'throw',
  },
  {
    id: 'A18 dash with an unknown source index',
    outputs: row(20, 4242, '-'),
    before: 'throw',
    after: 'throw:source-output',
  },
  {
    id: 'A19 malformed row with two columns',
    outputs: '21\t8035',
    before: 'throw',
    after: 'throw',
  },
  {
    id: 'A20 dash in the first column',
    outputs: `-\t8035\t167\tPipeWire\tfloat32le 2ch 48000Hz`,
    before: 'throw',
    after: 'throw',
  },
  {
    id: 'A21 dash in the second column',
    outputs: row(22, '-', '167'),
    before: 'throw',
    after: 'throw',
  },
  {
    id: 'A22 sources table carries a duplicate index (unchanged guard)',
    outputs: row(23, 8035, '-'),
    sources: `${SOURCES}\n8035 alsa_input.usb-UGREEN_y PipeWire s16le 2ch 48000Hz SUSPENDED`,
    before: 'throw',
    after: 'throw',
  },
  {
    id: 'A23 sources table row is malformed (unchanged guard)',
    outputs: row(24, 8035, '-'),
    sources: '8035',
    before: 'throw',
    after: 'throw',
  },
];

// --------------------------------------------------------------------- runner --

let pass = 0;
let fail = 0;

// Output-only: this file sits under docs/, so it reports through
// process.stdout.write rather than console (which eslint's no-console
// forbids outside the scripts/ exemption).
function report(line) {
  process.stdout.write(`${line}\n`);
}

function check(label, ok, detail) {
  if (ok) {
    pass += 1;
    report(`PASS ${label}`);
  } else {
    fail += 1;
    report(`FAIL ${label}: ${detail}`);
  }
}

function run(fn, outputs, sources) {
  try {
    return { value: fn(outputs, sources) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function expectThrow(label, got, needle) {
  if (got.error === undefined) {
    check(label, false, `returned ${JSON.stringify(got.value)} instead of throwing`);
    return;
  }
  if (needle === undefined) {
    check(label, got.error.length > 0, 'empty error message');
    return;
  }
  check(label, got.error.includes(needle), `error was ${JSON.stringify(got.error)}`);
}

function expectClassified(label, got, wanted) {
  if (got.error !== undefined) {
    check(label, false, `threw ${JSON.stringify(got.error)}`);
    return;
  }
  for (const key of ['virtual', 'realMic', 'unrelated', 'clientId']) {
    if (!(key in wanted)) continue;
    const actual = key === 'clientId' ? got.value.all[0].clientId : got.value[key].length;
    check(`${label} (${key})`, Object.is(actual, wanted[key]), `wanted ${String(wanted[key])}, got ${String(actual)}`);
  }
}

report(`harness sha256      ${sha(readFileSync(join(repo, 'scripts/v2/tauri-audio.test.mjs'), 'utf8'))}`);
report(`before extract      ${sha(beforeText)}`);
report(`candidate after     ${sha(afterText)}`);
report(`extracted lines     ${shipped.span.start}-${shipped.span.end} of scripts/v2/tauri-audio.test.mjs`);
report('');

for (const testCase of CASES) {
  const sources = testCase.sources ?? SOURCES;
  const beforeGot = run(before.classifySourceOutputs, testCase.outputs, sources);
  const afterGot = run(after.classifySourceOutputs, testCase.outputs, sources);

  if (testCase.before === 'throw') {
    expectThrow(`BEFORE ${testCase.id}`, beforeGot);
  } else {
    expectClassified(`BEFORE ${testCase.id}`, beforeGot, testCase.before);
  }

  if (typeof testCase.after === 'string') {
    expectThrow(`AFTER  ${testCase.id}`, afterGot, testCase.after === 'throw:source-output' ? 'is not in the' : undefined);
  } else {
    expectClassified(`AFTER  ${testCase.id}`, afterGot, testCase.after);
  }
}

// Scope check, exact rather than approximate: every line before the changed
// statements and every line from the unknown-source guard onwards must be
// byte-identical between the shipped function and the candidate. parseSourceTable
// sits in the "before" part, so this also proves the source table is untouched.
const MARKER = '    const streamId = Number(columns[0]);';
const TAIL = '    if (!sources.has(sourceId)) {';
function scope(text) {
  const at = text.indexOf(MARKER);
  const tail = text.indexOf(TAIL);
  if (at < 0 || tail < 0) throw new Error('scope markers not found');
  return { head: text.slice(0, at), tail: text.slice(tail) };
}
const beforeScope = scope(beforeText);
const afterScope = scope(afterText);
check(
  'candidate leaves the source table and every preceding line byte-identical',
  beforeScope.head === afterScope.head,
  'the head of the extraction differs',
);
check(
  'candidate leaves the unknown-source guard and the grouping byte-identical',
  beforeScope.tail === afterScope.tail,
  'the tail of the extraction differs',
);
check(
  'candidate adds no new top-level function',
  afterText.split('\n').filter((line) => line.startsWith('function ')).length === 2,
  'function count differs',
);

report('');
report(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
