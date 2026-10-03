#!/usr/bin/env node
/**
 * P3.5 attempt-1 independent review — synthetic proof that the harness's
 * `pactl list short source-outputs` containment predicate compares the wrong
 * column.
 *
 * This is a PURE fabricated test. It does not run `pactl`, open the microphone,
 * launch the app, touch a database or use the network. It extracts the exact
 * predicate lines from `scripts/v2/tauri-audio.test.mjs` and evaluates them
 * against fabricated `pactl` output whose column semantics are taken from the
 * host's own `/usr/bin/pactl` (libpulse 17.0+r98+gb096704c0-1) disassembly:
 *
 *   get_source_output_info_callback short-text branch prints
 *   "%u\t%u\t%s\t%s\t%s\n" with
 *     arg1 = source-output index   (offset 0x00)
 *     arg2 = source index          (offset 0x18, numeric)
 *     arg3 = client index          (offset 0x14, numeric, "%u")
 *     arg4 = pointer at 0x0c8      ("(null)" when unset)
 *     arg5 = sample specification
 *
 * so column [2] is the numeric CLIENT index, never a source name.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'node:util';

// Locate the repository by walking up until scripts/v2/tauri-audio.test.mjs is
// found, so this script runs identically from build/p3.5-review1/ and from
// docs/v2/evidence/P3.5/review-1/.
function findRepoRoot(start) {
  let dir = start;
  for (;;) {
    if (existsSync(resolve(dir, 'scripts/v2/tauri-audio.test.mjs'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error('could not locate the repository root');
    dir = parent;
  }
}
const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)));
const harnessPath = resolve(repoRoot, 'scripts/v2/tauri-audio.test.mjs');
const harness = readFileSync(harnessPath, 'utf8');

// Pull the exact predicate block out of the harness, so this tests the shipped
// code and not a paraphrase of it.
const start = harness.indexOf('const streamLines = sourceOutputs.split');
const endMarker = 'startsWith(REAL_MIC_PREFIX));';
const end = harness.indexOf(endMarker, start) + endMarker.length;
if (start < 0 || end < endMarker.length) {
  console.error('could not extract the predicate from the harness');
  process.exit(2);
}
const predicate = harness.slice(start, end);

const SOURCE_NAME = 'apunta_p35_mic';
const REAL_MIC_PREFIX = 'alsa_input.usb-UGREEN';

// Fabricated `pactl list short sources`: index, name, driver, sample spec, state.
const shortSources = [
  '61\talsa_input.usb-UGREEN_Camera_2K_UGREEN_Camera_2K_SN0001-02.analog-stereo\tPipeWire\ts16le 2ch 48000Hz\tSUSPENDED',
  '70\tapunta_p35_mic\tPipeWire\ts16le 2ch 48000Hz\tSUSPENDED',
  '71\tapunta_p35.monitor\tPipeWire\ts16le 2ch 48000Hz\tSUSPENDED',
].join('\n');

// Fabricated `pactl list short source-outputs`: index, SOURCE INDEX, CLIENT
// INDEX, driver/field, sample spec. The virtual capture is live AND the owner's
// real microphone is also being captured — the exact situation the check exists
// to catch.
const sourceOutputs = [
  '12\t70\t167\tPipeWire\ts16le 2ch 48000Hz',
  '13\t61\t168\tPipeWire\ts16le 2ch 48000Hz',
].join('\n');

// The shipped predicate, evaluated verbatim.
const evaluate = new Function(
  'sourceOutputs',
  'SOURCE_NAME',
  'REAL_MIC_PREFIX',
  `${predicate}\nreturn { streamLines, onVirtual, onRealMic };`,
);
const got = evaluate(sourceOutputs, SOURCE_NAME, REAL_MIC_PREFIX);

// The correct predicate: resolve column [1] (source index) through the source
// table, then compare the NAME.
const nameByIndex = new Map(
  shortSources
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => {
      const c = l.split(/\s+/);
      return [c[0], c[1]];
    }),
);
const correctVirtual = sourceOutputs
  .split('\n')
  .filter((l) => l.trim() !== '')
  .filter((l) => nameByIndex.get(l.split(/\s+/)[1]) === SOURCE_NAME);
const correctReal = sourceOutputs
  .split('\n')
  .filter((l) => l.trim() !== '')
  .filter((l) => (nameByIndex.get(l.split(/\s+/)[1]) ?? '').startsWith(REAL_MIC_PREFIX));

let failures = 0;
function check(name, ok, detail) {
  process.stdout.write(format(`${ok ? 'PASS' : 'FAIL'} ${name}${detail === undefined ? '' : `: ${detail}`}`) + '\n');
  if (!ok) failures += 1;
}

process.stdout.write(format(`harness predicate extracted (${predicate.length} chars):`) + '\n');
process.stdout.write(format(predicate) + '\n');
process.stdout.write(format('') + '\n');
process.stdout.write(format('fabricated source-outputs line 0 columns:') + '\n');
process.stdout.write(format(JSON.stringify(sourceOutputs.split('\n')[0].split(/\s+/))) + '\n');
process.stdout.write(format('') + '\n');

check(
  'the correct mapping sees the virtual capture stream',
  correctVirtual.length === 1,
  `${correctVirtual.length}`,
);
check(
  'the shipped predicate misses the virtual capture stream (column [2] is the client index, not the source name)',
  got.onVirtual.length === 0,
  `onVirtual=${got.onVirtual.length} (col[2]=${JSON.stringify(sourceOutputs.split('\n')[0].split(/\s+/)[2])}, SOURCE_NAME=${SOURCE_NAME})`,
);
check(
  'the correct mapping sees the stream on the owner\'s real microphone',
  correctReal.length === 1,
  `${correctReal.length}`,
);
check(
  'the shipped predicate misses the real-microphone leak (the safety-critical false negative)',
  got.onRealMic.length === 0,
  `onRealMic=${got.onRealMic.length} (col[2]=${JSON.stringify(sourceOutputs.split('\n')[1].split(/\s+/)[2])}, REAL_MIC_PREFIX=${REAL_MIC_PREFIX})`,
);

// Counterexample: even if a host DID print the source name in column [1], the
// shipped predicate still reads column [2].
const sourceNamedOutputs = '12\tapunta_p35_mic\t167\tPipeWire\ts16le 2ch 48000Hz';
const got2 = evaluate(sourceNamedOutputs, SOURCE_NAME, REAL_MIC_PREFIX);
check(
  'even with a source name in column [1], the shipped predicate still misses it (it reads column [2])',
  got2.onVirtual.length === 0,
  `onVirtual=${got2.onVirtual.length}`,
);

process.stdout.write(format('') + '\n');
process.stdout.write(format(`Verdict: ${failures === 0 ? 'containment predicate is DEFECTIVE (defect reproduced)' : 'unexpected: some expectation did not hold'}`) + '\n');
process.exit(failures === 0 ? 0 : 1);
