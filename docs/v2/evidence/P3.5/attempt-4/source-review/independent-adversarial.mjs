#!/usr/bin/env node
/**
 * Independent adversarial mechanism check for the AM-194 client-sentinel patch.
 *
 * Reviewer's own extractor and cases; not the author's and not IR-2's. It reads
 * the shipping file from the working tree and reconstructs the pre-patch
 * baseline from git (`caa6e18:scripts/v2/tauri-audio.test.mjs`), extracts both
 * `parseSourceTable` + `classifySourceOutputs` by brace matching, and drives a
 * battery of hand-written pactl rows through both copies.
 *
 * No app, server, build, model, audio, microphone, live `pactl`, network or port
 * 7717 is touched: only `node` on text and `git show` of a committed blob.
 *
 * Exit 0 = every check passed; exit 1 = at least one failed.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const sha = (text) => createHash('sha256').update(text).digest('hex');
const write = (line) => process.stdout.write(`${line}\n`);

/** Extract a top-level `function NAME(` body by brace matching from its line. */
function extractFunction(source, name) {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`function ${name}(`));
  if (start < 0) throw new Error(`function ${name} not found`);
  let depth = 0;
  let seen = false;
  for (let i = start; i < lines.length; i += 1) {
    for (const ch of lines[i]) {
      if (ch === '{') {
        depth += 1;
        seen = true;
      } else if (ch === '}') {
        depth -= 1;
      }
    }
    if (seen && depth === 0) return lines.slice(start, i + 1).join('\n');
  }
  throw new Error(`unterminated function ${name}`);
}

function buildModule(source) {
  const constants = source
    .split('\n')
    .filter((line) => line.startsWith('const SOURCE_NAME') || line.startsWith('const REAL_MIC_PREFIX'))
    .join('\n');
  const body = [
    extractFunction(source, 'parseSourceTable'),
    extractFunction(source, 'classifySourceOutputs'),
  ].join('\n\n');
  const text = `${constants}\n\n${body}\n`;
  const fn = new Function(`${text}\nreturn { parseSourceTable, classifySourceOutputs };`);
  return { text, api: fn() };
}

/** The contiguous slice from `function parseSourceTable(` to classify's close. */
function spanExtract(source) {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => line.startsWith('function parseSourceTable('));
  const classify = lines.findIndex((line) => line.startsWith('function classifySourceOutputs('));
  const end = lines.findIndex((line, i) => i > classify && line === '}');
  const constants =
    ["const SOURCE_NAME = 'apunta_p35_mic';", "const REAL_MIC_PREFIX = 'alsa_input.usb-UGREEN';", ''].join('\n') + '\n';
  return constants + lines.slice(start, end + 1).join('\n') + '\n';
}

const shippingSource = readFileSync('scripts/v2/tauri-audio.test.mjs', 'utf8');
const baselineSource = execFileSync('git', ['show', 'caa6e18:scripts/v2/tauri-audio.test.mjs'], {
  maxBuffer: 1 << 28,
}).toString('utf8');
const witness = readFileSync(
  'docs/v2/evidence/P3.5/client-sentinel-proposal/candidate-after.mjs.txt',
  'utf8',
);

const before = buildModule(baselineSource);
const after = buildModule(shippingSource);

const SOURCES = [
  '8035 apunta_p35_mic PipeWire s16le 2ch 48000Hz SUSPENDED',
  '8036 apunta_p35.monitor PipeWire s16le 2ch 48000Hz SUSPENDED',
  '61 alsa_input.usb-UGREEN_Camera_2K_UGREEN_Camera_2K_SN0001-02.analog-stereo PipeWire s16le 2ch 48000Hz SUSPENDED',
  '70 alsa_output.usb-UGREEN_Camera_2K_UGREEN_Camera_2K_SN0001-02.analog-stereo PipeWire s16le 2ch 48000Hz RUNNING',
  '8114 bluez_input.00_00_00_00_00_00.a2dp_sbc PipeWire s16le 2ch 48000Hz SUSPENDED',
].join('\n');

const row = (a, b, c) => `${a}\t${b}\t${c}\tPipeWire\tfloat32le 2ch 48000Hz`;

let pass = 0;
let fail = 0;
function check(label, ok, detail) {
  if (ok) {
    pass += 1;
    write(`PASS ${label}`);
  } else {
    fail += 1;
    write(`FAIL ${label}: ${detail}`);
  }
}

function run(api, outputs, sources) {
  try {
    return { value: api.classifySourceOutputs(outputs, sources ?? SOURCES) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
const counts = (got) => ({
  virtual: got.value.virtual.length,
  realMic: got.value.realMic.length,
  unrelated: got.value.unrelated.length,
  clientId: got.value.all[0].clientId,
});

write(`baseline source sha256 ${sha(baselineSource)}`);
write(`shipping source sha256 ${sha(shippingSource)}`);
write(`baseline extract       ${sha(before.text)}`);
write(`shipping extract       ${sha(after.text)}`);
write('');

// -- 1-7: the literal dash is the only accepted non-integer client value ------
{
  const b = run(before.api, row(8043, 8035, '-'));
  check('01 baseline throws on a dash client', b.error !== undefined, JSON.stringify(b));
  const a = run(after.api, row(8043, 8035, '-'));
  check('02 shipping classifies a dash client on the virtual source', counts(a).virtual === 1, JSON.stringify(a));
  check('03 shipping dash client is carried as null', counts(a).clientId === null, JSON.stringify(counts(a)));
  check('04 shipping dash on the real microphone lands in realMic', counts(run(after.api, row(8044, 61, '-'))).realMic === 1, 'not detected');
  check('05 shipping dash on an unrelated source lands in unrelated', counts(run(after.api, row(8045, 70, '-'))).unrelated === 1, 'not classified');
  const unknown = run(after.api, row(8046, 4242, '-'));
  check('06 shipping dash with an unknown source still throws', unknown.error !== undefined, JSON.stringify(unknown));
  check('07 baseline dash with an unknown source also throws', run(before.api, row(8046, 4242, '-')).error !== undefined, 'did not throw');
}

// -- 8-16: no other malformed client token is admitted -----------------------
for (const [n, token] of [
  ['08', '--'],
  ['09', '\u2212'],
  ['10', 'n/a'],
  ['11', 'x'],
  ['12', 'PipeWire'],
  ['13', 'Infinity'],
  ['14', 'NaN'],
  ['15', '1.5'],
  ['16', '0x'],
]) {
  const got = run(after.api, row(8100 + Number(n), 8035, token));
  check(`${n} shipping refuses client token ${JSON.stringify(token)}`, got.error !== undefined, JSON.stringify(got));
}

// -- 17-23: stream/source validation and malformed rows are unchanged --------
{
  check('17 non-numeric stream index still throws', run(after.api, `x\t8035\t167\tPipeWire\tfloat32le 2ch 48000Hz`).error !== undefined, 'no throw');
  check('18 non-numeric source index still throws', run(after.api, row(19, '80a', '-')).error !== undefined, 'no throw');
  check('19 dash in the stream column still throws', run(after.api, `-\t8035\t167\tPipeWire\tfloat32le 2ch 48000Hz`).error !== undefined, 'no throw');
  check('20 dash in the source column still throws', run(after.api, row(22, '-', '167')).error !== undefined, 'no throw');
  check('21 two-column row still throws', run(after.api, '21\t8035').error !== undefined, 'no throw');
  check('22 duplicate source index still throws', run(after.api, row(23, 8035, '-'), `${SOURCES}\n8035 alsa_input.usb-UGREEN_y PipeWire s16le 2ch 48000Hz SUSPENDED`).error !== undefined, 'no throw');
  check('23 malformed source table row still throws', run(after.api, row(24, 8035, '-'), '8035').error !== undefined, 'no throw');
}

// -- 24-26: a real-microphone leak is still detected -------------------------
{
  check('24 numeric client on the real microphone still lands in realMic', counts(run(after.api, row(11, 61, '168'))).realMic === 1, 'not detected');
  check('25 baseline numeric real-mic detection is identical', counts(run(before.api, row(11, 61, '168'))).realMic === 1, 'not detected');
  const dashMic = counts(run(after.api, row(8044, 61, '-')));
  check('26 dash real-mic row is realMic only', dashMic.realMic === 1 && dashMic.virtual === 0 && dashMic.unrelated === 0, JSON.stringify(dashMic));
}

// -- 27-34: numeric client behaviour is byte-for-byte unchanged ---------------
for (const [n, token, expected] of [
  ['27', '167', 167],
  ['28', '0', 0],
  ['29', '-1', -1],
  ['30', '167.0', 167],
  ['31', '+5', 5],
  ['32', '0x10', 16],
  ['33', '007', 7],
  ['34', '1e3', 1000],
]) {
  const b = run(before.api, row(9000 + Number(n), 8035, token));
  const a = run(after.api, row(9000 + Number(n), 8035, token));
  const same = JSON.stringify(counts(b)) === JSON.stringify(counts(a));
  check(`${n} client token ${JSON.stringify(token)} is identical before/after and equals ${expected}`, same && counts(a).clientId === expected, `before=${JSON.stringify(counts(b))} after=${JSON.stringify(counts(a))}`);
}

// -- 35: the shipping extraction is exactly the committed AFTER witness ------
const shippingSlice = spanExtract(shippingSource);
check('35 shipping function slice is byte-identical to the committed candidate witness', shippingSlice === witness, `${sha(shippingSlice)} vs ${sha(witness)}`);

write('');
write(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
