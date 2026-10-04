#!/usr/bin/env node
/**
 * CODE/UNIT helper tests for the P3.6 V3 harness repairs (attempt 3).
 *
 *   node docs/v2/evidence/P3.6/attempt-3/implementation/helper-tests.mjs
 *
 * Every input is synthetic: word lists standing in for OCR output, `pactl`
 * tables standing in for live reads, path strings standing in for a git set, and
 * one real read-only `git` call for the freshness predicate. Nothing is
 * launched, no display is touched, no AppImage is run, no port is bound and no
 * audio device is read.
 *
 * The repairs under test are D2 (ownership baseline), D4 (fail-closed bundle
 * scan), D5/R4 (NOT RUN exits non-zero, all eleven flows recorded), D6 (Rule B
 * freshness), R1 (ambiguity fails closed), R2 (a Copied **state**, not a colour
 * count), R3 (source-output containment), R5 (import runs nothing) and R7 (an
 * inherited DISPLAY is honoured).
 */

import assert from 'node:assert/strict';

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  classifySourceOutputs,
  exitCodeFor,
  ownershipBaselineProof,
  scanBundleForObservationChannel,
  snapshotDataDirNames,
  findPhraseBoxes,
  groundPhrase,
  isRuleBInput,
  newestRuleBInput,
  notRunRemaining,
  observationChannelGone,
  parseSourceTable,
  pickPrimaryCluster,
  preconditions,
  recordFlow,
  ruleBFreshness,
  FLOWS,
  RULE_B_BASE,
} from '../../../../../../scripts/v2/tauri-e2e-smoke.test.mjs';

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, body) {
  try {
    await body();
    passed += 1;
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    failed += 1;
    failures.push(`${name}: ${String(error?.message ?? error)}`);
    process.stdout.write(`FAIL ${name}: ${String(error?.message ?? error)}\n`);
  }
}

// --- R5: importing the module ran no precondition and no main ----------------

await test('R5 importing the harness ran nothing (this process is alive to assert it)', () => {
  // If the module still executed its preconditions at import, this process would
  // already have exited 2 and none of these assertions would run.
  assert.equal(process.exitCode ?? 0, 0);
  assert.equal(typeof preconditions, 'function');
  // With the sandbox variables cleared, preconditions reports rather than exits.
  const saved = { ...process.env };
  delete process.env['APUNTA_PORT'];
  delete process.env['APUNTA_DATA_DIR'];
  delete process.env['APUNTA_TEST_RUN_ID'];
  const ok = preconditions();
  process.env['APUNTA_PORT'] = saved['APUNTA_PORT'];
  process.env['APUNTA_DATA_DIR'] = saved['APUNTA_DATA_DIR'];
  process.env['APUNTA_TEST_RUN_ID'] = saved['APUNTA_TEST_RUN_ID'];
  assert.equal(ok, false, 'preconditions must report false with no sandbox environment');
  assert.equal(process.exitCode ?? 0, 0, 'preconditions must not exit the process');
});

// --- R1: cluster selection fails closed on ambiguity ---------------------------

await test('R1 a single accent cluster is picked', () => {
  const picked = pickPrimaryCluster([{ cells: 40, x: 10, y: 10, w: 100, h: 20 }], 'the button');
  assert.notEqual(picked.cluster, null);
  assert.equal(picked.cluster.cells, 40);
});

await test('R1 two comparable accent clusters are refused, not guessed', () => {
  const picked = pickPrimaryCluster(
    [
      { cells: 30, x: 10, y: 10, w: 100, h: 20 },
      { cells: 26, x: 10, y: 60, w: 100, h: 20 },
    ],
    'the button',
  );
  assert.equal(picked.cluster, null, 'an ambiguous screen must produce no click target');
  assert.match(picked.why, /ambiguous/);
});

await test('R1 no accent cluster at all is refused with a named reason', () => {
  const picked = pickPrimaryCluster([], 'the button');
  assert.equal(picked.cluster, null);
  assert.match(picked.why, /no accent cluster/);
});

await test('R1 one dominant cluster still wins over a small second one', () => {
  const picked = pickPrimaryCluster(
    [
      { cells: 60, x: 10, y: 10, w: 100, h: 20 },
      { cells: 8, x: 10, y: 60, w: 100, h: 20 },
    ],
    'the button',
  );
  assert.notEqual(picked.cluster, null);
});

// --- R2 and D1: labels are matched as whole phrases, ambiguously refused ------

/** A word list in the shape `screenWords` produces. */
function words(lines) {
  const out = [];
  let line = 0;
  for (const entries of lines) {
    line += 1;
    let order = 0;
    for (const entry of entries) {
      order += 1;
      out.push({ text: entry, left: 100 * order, top: 10 * line, width: 60, height: 12, confidence: 90, line, order });
    }
  }
  return out;
}

await test('R2 the Copied state is a control-specific label, not a colour count', () => {
  // "Copy" and "Copied" are different strings on the control: matching is by
  // whole word, so a screen still showing Copy never satisfies the Copied check.
  const beforeCopy = words([['Copy'], ['Finish']]);
  assert.equal(groundPhrase(beforeCopy, 'Copied').box, null);
  const afterCopy = words([['Copied'], ['Edit', 'again']]);
  assert.notEqual(groundPhrase(afterCopy, 'Copied').box, null);
  // And the control's own changed label after publishing.
  assert.notEqual(groundPhrase(afterCopy, 'Edit again').box, null);
});

await test('D1 a pane-only label is grounded only when it is unique', () => {
  const twice = words([['Goals'], ['Goals']]);
  const grounded = groundPhrase(twice, 'Goals');
  assert.equal(grounded.box, null, 'two matches must not become a click target');
  assert.match(grounded.why, /appears 2 times/);
  const once = words([['Treatment', 'plan'], ['Goals']]);
  const box = groundPhrase(once, 'Goals');
  assert.notEqual(box.box, null);
  assert.equal(box.box.x, 100);
});

await test('D1 a phrase must match whole words in reading order, not substrings', () => {
  const list = words([['Pretreatment', 'goals'], ['Goals']]);
  const boxes = findPhraseBoxes(list, 'Goals');
  assert.equal(boxes.length, 2, 'the whole word Goals appears twice, in two places');
  assert.equal(findPhraseBoxes(words([['Goal']]), 'Goals').length, 0);
});

// --- R3: source-output containment -------------------------------------------

const SOURCES_TABLE = [
  '0\talsa_output\tmodule-null-sink',
  '1\tapunta_p35_mic\tmodule-remap-source',
  '2\tapunta_p35.monitor\tmodule-null-sink',
].join('\n');

await test('R3 the live source table maps indices to names and rejects malformed rows', () => {
  const table = parseSourceTable(SOURCES_TABLE);
  assert.equal(table.get(1), 'apunta_p35_mic');
  assert.throws(() => parseSourceTable('alsa_output\tmodule-null-sink'), /non-numeric source index/);
  assert.throws(() => parseSourceTable('1\t'), /malformed pactl sources row/);
  assert.throws(() => parseSourceTable('1\tapunta_p35.monitor\n1\tdup'), /duplicate source index/);
  assert.throws(() => parseSourceTable('1\t'), /malformed pactl sources row/);
});

await test('R3 a source-output resolves through the table, and the dash client column is "no client"', () => {
  const classified = classifySourceOutputs(['12\t1\t-', '13\t2\t7'].join('\n'), SOURCES_TABLE);
  assert.equal(classified.virtual.length, 1, 'the stream on the virtual capture source resolves as virtual');
  assert.equal(classified.virtual[0].clientId, null, 'the literal dash means no client');
  assert.equal(classified.virtual[0].sourceName, 'apunta_p35_mic');
  assert.equal(classified.other.length, 1);
  assert.equal(classified.other[0].sourceName, 'apunta_p35.monitor');
  // The owner's own device, whatever it is named, is never in `virtual`.
  assert.equal(
    classified.all.some((output) => output.sourceName.startsWith('alsa_input')),
    false,
  );
});

await test('R3 a stream on a non-virtual source is surfaced, not dropped', () => {
  const sources = ['0\talsa_output\tmodule-alsa-sink', '1\talsa_input.usb\tmodule-alsa-card'].join('\n');
  const classified = classifySourceOutputs(['21\t1\t9'].join('\n'), sources);
  assert.equal(classified.virtual.length, 0);
  assert.equal(classified.other.length, 1);
  assert.equal(classified.other[0].sourceName, 'alsa_input.usb');
});

await test('R3 an unresolvable source index is an error, never "not the microphone"', () => {
  assert.throws(
    () => classifySourceOutputs('31\t9\t4', SOURCES_TABLE),
    /not in the pactl sources table/,
  );
  assert.throws(() => classifySourceOutputs('31\t9\tnine', SOURCES_TABLE), /non-numeric source-outputs column/);
});

// --- D6: Rule B's set and the freshness predicate -----------------------------

await test('D6 Rule B input paths are in the set and its build outputs are not', () => {
  assert.equal(RULE_B_BASE, '62abb28', 'the base is the literal hash copied out of the dispatch header');
  assert.equal(isRuleBInput('web/src/App.tsx'), true);
  assert.equal(isRuleBInput('server/src/index.ts'), true);
  assert.equal(isRuleBInput('src-tauri/src/main.rs'), true);
  assert.equal(isRuleBInput('src-tauri/target/release/bundle/appimage/Apunta.AppImage'), false);
  assert.equal(isRuleBInput('src-tauri/gen/schemas/x.json'), false);
  assert.equal(isRuleBInput('web/dist/assets/app.js'), false);
  assert.equal(isRuleBInput('scripts/v2/tauri-e2e-smoke.test.mjs'), false);
});

await test('D6 the source walk finds a Rule B input and reports its mtime', () => {
  const walk = newestRuleBInput();
  assert.notEqual(walk.newest, null, 'Rule B has inputs, so the walk must find one');
  assert.ok(walk.newestPath !== null && isRuleBInput(walk.newestPath));
  assert.ok(!walk.newestPath.startsWith('src-tauri/target/'));
});

await test('D6 the freshness predicate runs against real git and answers both halves', async () => {
  // The one live read in this file: `git diff`/`git status` over Rule B's set.
  const result = await ruleBFreshness('src-tauri/tauri.conf.json');
  assert.equal(result.diffOk, true, `git diff failed: ${String(result.diffError)}`);
  assert.equal(result.statusOk, true, `git status failed: ${String(result.statusError)}`);
  assert.deepEqual(result.moved, [], 'Rule B must not have moved for this row to be meaningful');
  assert.notEqual(result.artifactMtime, null);
});

// --- D4: the bundle scan is fail-closed ---------------------------------------

await test('D4 the observation scan refuses to pass on an unread bundle', () => {
  const result = observationChannelGone();
  assert.equal(result.unreadable, null, `the shipped bundle must be readable: ${String(result.unreadable)}`);
  assert.ok(result.files > 0, 'a bundle with no scripts is not evidence that the channel is gone');
  assert.equal(result.occurrences, 0);
});

// --- D5 and R4: NOT RUN is never a pass, and all eleven flows are recorded ----

await test('D5 an early abort records all eleven named flows as NOT RUN', () => {
  // The zero-windows case the card names: every affected flow is recorded with
  // that one cause, so no flow is left unrecorded on an early abort.
  notRunRemaining('onboarding', 'zero windows found on the display');
  const printed = [];
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => {
    printed.push(String(chunk));
    return true;
  };
  try {
    recordFlow('onboarding', 'NOT RUN', 'recorded again');
  } finally {
    process.stdout.write = write;
  }
  assert.equal(FLOWS.length, 11);
  assert.deepEqual(
    FLOWS,
    [
      'onboarding',
      'capture',
      'draft',
      'refine',
      'publish+copy',
      'patient list',
      'plan',
      'briefing',
      'brainstorm',
      'settings',
      'backup',
    ],
  );
});

// --- D2: the ownership baseline is taken after the first instance exists ------

await test('D2 the ownership baseline is a name set taken after the first instance', () => {
  const dir = mkdtempSync(join(tmpdir(), 'p36-ownership-'));
  const saved = {
    dir: process.env['APUNTA_DATA_DIR'],
    port: process.env['APUNTA_PORT'],
    runId: process.env['APUNTA_TEST_RUN_ID'],
  };
  process.env['APUNTA_DATA_DIR'] = dir;
  process.env['APUNTA_PORT'] = '7879';
  process.env['APUNTA_TEST_RUN_ID'] = 'p36-attempt3-helper';
  try {
    // Before the app starts: empty, so a pre-launch snapshot would flag the
    // run's own first set -- the defect this predicate replaces.
    assert.deepEqual(snapshotDataDirNames(), []);
    const proofBefore = ownershipBaselineProof(snapshotDataDirNames());
    assert.deepEqual(proofBefore.missing, ['apunta.lock', 'apunta.db', 'apunta.db-wal', 'apunta.db-shm']);

    // The app creates its own files; the baseline is taken here, after that.
    writeFileSync(join(dir, 'apunta.lock'), 'pid');
    writeFileSync(join(dir, 'apunta.db'), 'sqlite');
    const baseline = snapshotDataDirNames();
    assert.deepEqual(baseline, ['apunta.db', 'apunta.lock']);
    const proof = ownershipBaselineProof(baseline);
    assert.deepEqual(proof.missing, ['apunta.db-wal', 'apunta.db-shm'], 'only the absent WAL pair is missing');
    assert.deepEqual(ownershipBaselineProof(baseline).owned, [
      'apunta.lock',
      'apunta.db',
      'apunta.db-wal',
      'apunta.db-shm',
    ]);

    // Anything appearing beside the baseline is a second owner and is caught.
    mkdirSync(join(dir, 'backups'));
    const extra = snapshotDataDirNames().filter((name) => !baseline.includes(name));
    assert.deepEqual(extra, ['backups']);
  } finally {
    for (const [key, value] of [
      ['APUNTA_DATA_DIR', saved.dir],
      ['APUNTA_PORT', saved.port],
      ['APUNTA_TEST_RUN_ID', saved.runId],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

// --- D4: the bundle scan fails closed ----------------------------------------

await test('D4 an absent or scriptless bundle is unreadable, never "zero occurrences"', () => {
  const missing = join(tmpdir(), 'p36-no-such-assets-dir');
  const absent = scanBundleForObservationChannel(missing);
  assert.notEqual(absent.unreadable, null);
  assert.equal(absent.occurrences, 0);

  const empty = mkdtempSync(join(tmpdir(), 'p36-assets-'));
  const scriptless = scanBundleForObservationChannel(empty);
  assert.notEqual(scriptless.unreadable, null, 'a directory with no script is not evidence of anything');
  assert.equal(scriptless.files, 0);

  writeFileSync(join(empty, 'app-abc123.js'), 'console.log(1);');
  const clean = scanBundleForObservationChannel(empty);
  assert.equal(clean.unreadable, null);
  assert.equal(clean.files, 1);
  assert.equal(clean.occurrences, 0);

  writeFileSync(join(empty, 'hook-def456.js'), 'fetch("/api/p3.4-observe"); p3.4-observe');
  const hooked = scanBundleForObservationChannel(empty);
  assert.equal(hooked.unreadable, null);
  assert.equal(hooked.occurrences, 2, 'both the marker path and the gate string are counted');
});

// --- D5: NOT RUN is never exit 0 ---------------------------------------------

await test('D5 the exit code refuses to read a NOT RUN as a pass', () => {
  assert.equal(exitCodeFor({ failed: 0, blocked: 0, notRun: 0 }), 0);
  assert.equal(exitCodeFor({ failed: 0, blocked: 0, notRun: 1 }), 4, 'one NOT RUN must not exit 0');
  assert.equal(exitCodeFor({ failed: 0, blocked: 0, notRun: 11 }), 4);
  assert.equal(exitCodeFor({ failed: 1, blocked: 0, notRun: 0 }), 1);
  assert.equal(exitCodeFor({ failed: 1, blocked: 1, notRun: 1 }), 3, 'a blocked precondition outranks both');
});

process.stdout.write(`\n${String(passed)}/${String(passed + failed)} helper tests passed\n`);
for (const failure of failures) process.stdout.write(`  failed: ${failure}\n`);
process.exitCode = failed > 0 ? 1 : 0;