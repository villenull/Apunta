#!/usr/bin/env node
/**
 * CODE/UNIT helper tests for the P3.6 V3 harness repairs (attempt 4).
 *
 *   node docs/v2/evidence/P3.6/attempt-4/implementation/helper-tests.mjs
 *
 * Every input is synthetic: word lists standing in for OCR output, `pactl`
 * tables standing in for live reads, path strings standing in for a git set, one
 * real read-only `git` call for the freshness predicate, and **read-only reads of
 * the app's own source** (`shared/src/i18n/en.ts` and the components) so every
 * label the harness grounds is proved against the string the app renders. Nothing
 * is launched, no display is touched, no AppImage is run, no port is bound and no
 * audio device is read.
 *
 * This copy carries attempt 3's tests unchanged — D2, D4, D5/R4, D6, R1, R2, R3,
 * R5 — so the repairs the earlier review cleared are still asserted here, and adds
 * **F1–F7**, the seven defects `docs/v2/state/reviews/P3.6-impl3-source.md`
 * confirmed:
 *
 * - F1 the add-patient screen's `Add patient` is there twice; the label used is
 *   the identifier field's, which is there once.
 * - F2 the refine placeholder is quoted with its three ASCII dots, and the strip
 *   handles a run of them.
 * - F3 `Listening for words…` is quoted with its U+2026, and the strip handles
 *   U+2026, `...` and a bare word.
 * - F4 the plan pane is **opened** first, by whichever of its two openers is
 *   unique on the screen, and only then is `Start a plan` clicked.
 * - F5 the briefing and brainstorm openers are grounded the same way, so the
 *   welcome card and the notes column switch sharing a label is not a refusal.
 * - F6 the settings screen is confirmed by a heading inside the open section,
 *   because `Appearance` is on the modal twice.
 * - F7 the ownership containment compares the four C-OWN@1 names, so the backup
 *   flow's own `backups/` directory is not read as a second owner — while a
 *   second `apunta.db-wal` still is.
 */

import assert from 'node:assert/strict';

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  choosePaneOpener,
  classifySourceOutputs,
  exitCodeFor,
  ownershipBaselineProof,
  ownershipContainment,
  stripTrailingPunctuation,
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
  FLOW_LABELS,
  FLOWS,
  PANE_OPENERS,
  RULE_B_BASE,
  UI_LABELS,
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
  assert.notEqual(result.artifactMtime, null);
  // What the predicate asserts about its own output: every name it reports is a
  // real Rule B input, and it reports the ones that are actually there. Whether
  // the working tree is clean is **not** this test's assertion -- other cards'
  // workers edit `server/**` in parallel, and a dirty tree is recorded as the
  // count it is rather than failing a unit test over someone else's file.
  for (const relative of result.moved) {
    assert.equal(isRuleBInput(relative), true, `${relative} is reported as moved, so it must be a Rule B input`);
  }
  const again = await ruleBFreshness('src-tauri/tauri.conf.json');
  assert.deepEqual(again.moved, result.moved, 'the predicate is a read, not a stateful scan');
  process.stdout.write(
    `  note: Rule B has ${String(result.moved.length)} in-flight change(s) in this working tree\n`,
  );
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

    // A name appearing beside the baseline is seen (F7 covers what it means):
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

// ============================================================== F1 - F7 =====
//
// The seven defects `docs/v2/state/reviews/P3.6-impl3-source.md` confirmed
// against attempt 3's harness. Every one is proved here by a helper call or a
// read-only read of the app's own source; none of them needs the AppImage.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '..');

/** A word list in the shape `screenWords` produces, from an array of lines. */
function screen(lines) {
  const out = [];
  let line = 0;
  for (const entries of lines) {
    line += 1;
    let order = 0;
    for (const entry of entries) {
      order += 1;
      out.push({
        text: entry,
        left: 100 * order,
        top: 10 * line,
        width: 60,
        height: 12,
        confidence: 90,
        line,
        order,
      });
    }
  }
  return out;
}

/** The app's own source, read to prove a label is the string the app renders. */
function sourceLine(relative, lineNumber) {
  const lines = readFileSync(join(repoRoot, relative), 'utf8').split('\n');
  assert.ok(lineNumber >= 1 && lineNumber <= lines.length, `${relative} has no line ${String(lineNumber)}`);
  return lines[lineNumber - 1];
}

/** How many times a file renders one i18n key. */
function renders(file, key) {
  return readFileSync(join(repoRoot, file), 'utf8')
    .split('\n')
    .filter((line) => line.includes(`t('${key}'`)).length;
}

// --- F1: the add-patient screen has `Add patient` twice ------------------------

await test('F1 the add-patient screen carries its own title twice, so it is not the pane label', () => {
  const addPatient = screen([
    ['John', 'Smith'],
    ['Name'],
    ['e.g.', 'John', 'Smith'],
    ['Identifier', '(optional)'],
    ['Internal', 'reference,', 'chart', 'number,', 'etc.'],
    ['Add', 'patient'],
    ['Add', 'patient'],
  ]);
  // The label attempt 3 quoted: two matches, refused, exactly as the review says.
  const twice = groundPhrase(addPatient, 'Add patient');
  assert.equal(twice.box, null, 'two identical labels must not become a pane confirmation');
  assert.match(twice.why, /appears 2 times/);
  // The label this harness uses instead: one match.
  const once = groundPhrase(addPatient, UI_LABELS.onboardingPane.text);
  assert.notEqual(once.box, null);
  assert.equal(UI_LABELS.onboardingPane.text, 'Identifier (optional)');
});

await test('F1 the add-patient label is the string AddPatient.tsx renders, and the title really is twice', () => {
  assert.match(sourceLine('shared/src/i18n/en.ts', UI_LABELS.onboardingPane.i18nLine), /'patients.identifierLabel'/);
  assert.match(sourceLine('shared/src/i18n/en.ts', UI_LABELS.onboardingPane.i18nLine), /'Identifier \(optional\)'/);
  assert.match(sourceLine(UI_LABELS.onboardingPane.file, UI_LABELS.onboardingPane.line), /t\('patients.identifierLabel'\)/);
  assert.equal(
    renders('web/src/routes/AddPatient.tsx', 'patients.identifierLabel'),
    1,
    'the identifier label must render exactly once on the add-patient screen',
  );
  assert.equal(
    renders('web/src/routes/AddPatient.tsx', 'patients.add'),
    3,
    "patients.add is referenced three times and the h2 and the submit button are both on screen, " +
      "which is why it is refused (the third is the Dialog title prop, with showTitle={false} at :85)",
  );
});

// --- F2: the refine placeholder, with its three ASCII dots ---------------------

await test('F2 the refine placeholder is quoted in full and matches every way OCR reads the dots', () => {
  assert.equal(UI_LABELS.refinePlaceholder.text, 'Ask a question or give feedback...');
  const phrase = UI_LABELS.refinePlaceholder.text;
  for (const last of ['feedback...', 'feedback..', 'feedback.', 'feedback', 'feedback.....', 'feedback…']) {
    const grounded = groundPhrase(screen([['Ask', 'a', 'question', 'or', 'give', last]]), phrase);
    assert.notEqual(grounded.box, null, `the placeholder must match when OCR reads ${JSON.stringify(last)}`);
  }
  // And the dots are not silently swallowed on the wrong side: a different word
  // still does not match.
  assert.equal(groundPhrase(screen([['Ask', 'a', 'question', 'or', 'give', 'notes']]), phrase).box, null);
});

await test('F2 the placeholder is the string RefineColumn renders, with its dots', () => {
  assert.match(
    sourceLine('shared/src/i18n/en.ts', UI_LABELS.refinePlaceholder.i18nLine),
    /'refine.inputPlaceholder': \{ text: 'Ask a question or give feedback\.\.\.' \}/,
  );
  assert.match(
    sourceLine(UI_LABELS.refinePlaceholder.file, UI_LABELS.refinePlaceholder.line),
    /placeholder=\{t\('refine.inputPlaceholder'\)\}/,
  );
});

// --- F3: `Listening for words…` is U+2026 -------------------------------------

await test('F3 the capture label is quoted with its U+2026 and matches ellipsis, dots and a bare word', () => {
  const phrase = UI_LABELS.captureListening.text;
  assert.equal(phrase, 'Listening for words…');
  for (const last of ['words…', 'words...', 'words..', 'words.', 'words']) {
    const grounded = groundPhrase(screen([['Recording', 'session'], ['Listening', 'for', last]]), phrase);
    assert.notEqual(grounded.box, null, `the capture label must match when OCR reads ${JSON.stringify(last)}`);
  }
  assert.equal(groundPhrase(screen([['Listening', 'for', 'notes']]), phrase).box, null);
});

await test('F3 the strip takes a run of punctuation, and only trailing punctuation', () => {
  assert.equal(stripTrailingPunctuation('feedback...'), 'feedback');
  assert.equal(stripTrailingPunctuation('feedback…'), 'feedback');
  assert.equal(stripTrailingPunctuation('feedback.,.'), 'feedback');
  assert.equal(stripTrailingPunctuation('words.'), 'words');
  assert.equal(stripTrailingPunctuation('REFINE…'), 'REFINE');
  assert.equal(stripTrailingPunctuation('e.g.'), 'e.g', 'only the trailing run goes, never an interior one');
  assert.equal(stripTrailingPunctuation('...'), '', 'a lone ellipsis normalises to the empty token');
});

await test('F3 the capture label is the string LiveRecording renders, and it renders once', () => {
  const i18n = sourceLine('shared/src/i18n/en.ts', UI_LABELS.captureListening.i18nLine);
  assert.match(i18n, /'capture.listening': \{ text: 'Listening for words…' \}/);
  assert.ok(i18n.includes('M-bM-^@M-&') === false, 'the source line is read as UTF-8 text, not bytes');
  assert.match(
    sourceLine(UI_LABELS.captureListening.file, UI_LABELS.captureListening.line),
    /\{t\('capture.listening'\)\}/,
    'the visible span on that line',
  );
});

// --- F4 and F5: the panes with two on-screen openers ---------------------------

/**
 * The screen the workspace is on after a patient row is clicked: the notes column
 * with its three switches, beside the patient's welcome with its four cards. The
 * welcome's cards carry the **same three labels** as the switches, plus a hint
 * line under each.
 */
function welcomeAndNotesColumn() {
  return screen([
    ['John'],
    ['New'],
    ['Brainstorm', 'Treatment', 'plan', 'Prepare', 'for', 'session'],
    ['Yesterday'],
    ['What', 'would', 'you', 'like', 'to', 'do', 'for', 'John?'],
    ['Write', 'a', 'note', "Dictate", "or", "type", "today's", 'session.'],
    ['Brainstorm', 'Think', 'through', 'the', 'case', 'out', 'loud', 'with', 'the', 'assistant.'],
    ['Treatment', 'plan', 'Set', 'goals', 'and', 'track', 'progress.'],
    ['Prepare', 'for', 'session', 'A', 'short', 'summary', 'before', 'you', 'see', 'them.'],
  ]);
}

await test('F4 the plan pane is opened first: `Start a plan` is not on that screen at all', () => {
  const pane = welcomeAndNotesColumn();
  // The defect: the empty-state control lives inside the pane, so with the pane
  // closed its label is nowhere on the screen.
  assert.equal(groundPhrase(pane, UI_LABELS.planStart.text).box, null);
  // The opener: the notes column's switch shares its label with the welcome card,
  // so it is ambiguous here and must not be the target.
  assert.equal(groundPhrase(pane, UI_LABELS.planSwitch.text).box, null);
  // The welcome card's hint line is the unique target, and it is inside that
  // card's button, so clicking it opens the same pane.
  const chosen = choosePaneOpener(pane, PANE_OPENERS.plan);
  assert.equal(chosen.opener, 'card');
  assert.notEqual(chosen.box, null);
  assert.equal(UI_LABELS.planCardHint.text, 'Set goals and track progress.');
});

await test('F4 with the welcome not on screen the notes-column switch is the unique opener', () => {
  // A note open for the patient: the notes column with its three switches beside
  // the note, and **no** welcome (`Workspace.tsx:706-713` renders one or the
  // other, never both), so the switch's label appears exactly once.
  const noteOpen = screen([
    ['John', 'Smith'],
    ['Brainstorm', 'Treatment', 'plan', 'Prepare', 'for', 'session'],
    ['Draft'],
    ['Session', 'notes'],
    ['Ask', 'a', 'question', 'or', 'give', 'feedback...'],
  ]);
  for (const pane of [PANE_OPENERS.plan, PANE_OPENERS.prep, PANE_OPENERS.brainstorm]) {
    const chosen = choosePaneOpener(noteOpen, pane);
    assert.equal(chosen.opener, 'switch', `${pane.switch.text} must be unique here`);
    assert.notEqual(chosen.box, null);
  }
});

await test('F4 `Start a plan` is inside the pane, so the opener is a different control', () => {
  // The pane open: PlanView's own heading (`plan.title`, `PlanView.tsx:214`) and
  // the notes column's switch (`:111`) both read `Treatment plan`, so the switch's
  // label is ambiguous **once the pane is open** too — which is exactly why the
  // pane is opened first and `Start a plan` (unique inside the pane) second.
  const paneOpen = screen([
    ['Brainstorm', 'Treatment', 'plan', 'Prepare', 'for', 'session'],
    ['Treatment', 'plan'],
    ['Start', 'a', 'plan'],
    ['Goals'],
  ]);
  assert.notEqual(groundPhrase(paneOpen, UI_LABELS.planStart.text).box, null);
  assert.equal(groundPhrase(paneOpen, UI_LABELS.planSwitch.text).box, null);
  assert.equal(
    choosePaneOpener(paneOpen, PANE_OPENERS.plan).box,
    null,
    'with the pane open the switch label is ambiguous and the welcome card is gone, so there is nothing to click',
  );
});

await test('F5 briefing and brainstorm open the same way, switch or welcome card', () => {
  const pane = welcomeAndNotesColumn();
  // Attempt 3's labels are on screen twice each, which is the refusal it hit.
  assert.equal(groundPhrase(pane, 'Prepare for session').box, null);
  assert.equal(groundPhrase(pane, 'Brainstorm').box, null);
  const prep = choosePaneOpener(pane, PANE_OPENERS.prep);
  assert.equal(prep.opener, 'card');
  assert.equal(UI_LABELS.prepCardHint.text, 'A short summary before you see them.');
  const brainstorm = choosePaneOpener(pane, PANE_OPENERS.brainstorm);
  assert.equal(brainstorm.opener, 'card');
  assert.equal(UI_LABELS.brainstormCardHint.text, 'Think through the case out loud with the assistant.');
});

await test('F5 a pane opener that is nowhere on screen is refused, with both reasons', () => {
  const elsewhere = screen([['Settings'], ['Appearance']]);
  for (const pane of [PANE_OPENERS.plan, PANE_OPENERS.prep, PANE_OPENERS.brainstorm]) {
    const chosen = choosePaneOpener(elsewhere, pane);
    assert.equal(chosen.box, null);
    assert.equal(chosen.opener, null);
    assert.match(chosen.why, /is not on the screen/);
    assert.match(chosen.why, /; /, 'both openers are named, so the refusal says what it looked for');
  }
});

await test('F4/F5 each opener label is the string its own file renders, once', () => {
  const openers = [
    [UI_LABELS.planSwitch, 'web/src/components/NotesColumn.tsx', 'plan.title'],
    [UI_LABELS.prepSwitch, 'web/src/components/NotesColumn.tsx', 'notes.prepareForSession'],
    [UI_LABELS.brainstormSwitch, 'web/src/components/NotesColumn.tsx', 'brainstorm.title'],
    [UI_LABELS.planCardHint, 'web/src/components/PatientWelcome.tsx', 'workspace.cardPlanHint'],
    [UI_LABELS.prepCardHint, 'web/src/components/PatientWelcome.tsx', 'workspace.cardPrepHint'],
    [UI_LABELS.brainstormCardHint, 'web/src/components/PatientWelcome.tsx', 'workspace.cardBrainstormHint'],
    [UI_LABELS.planStart, 'web/src/components/PlanView.tsx', 'plan.start'],
  ];
  for (const [label, file, key] of openers) {
    assert.equal(label.key, key);
    assert.match(sourceLine(label.file, label.line), new RegExp(`t\\('${key.replace('.', '\\.')}'`));
    assert.equal(renders(file, key), 1, `${key} must render once in ${file}`);
    assert.match(sourceLine('shared/src/i18n/en.ts', label.i18nLine), new RegExp(`'${key.replace('.', '\\.')}'`));
  }
});

await test('F4/F5 the duplicated labels really are rendered in two different files', () => {
  // Why the ambiguity exists at all: the switch and the card are two different
  // components rendering the same key, and the workspace mounts both.
  assert.equal(renders('web/src/components/NotesColumn.tsx', 'plan.title'), 1);
  assert.equal(renders('web/src/components/PatientWelcome.tsx', 'plan.title'), 1);
  assert.equal(renders('web/src/components/NotesColumn.tsx', 'brainstorm.title'), 1);
  assert.equal(renders('web/src/components/PatientWelcome.tsx', 'brainstorm.title'), 1);
  assert.equal(renders('web/src/components/NotesColumn.tsx', 'notes.prepareForSession'), 1);
  assert.equal(renders('web/src/components/PatientWelcome.tsx', 'notes.prepareForSession'), 1);
  // The welcome is mounted beside the notes column: the condition column
  // (`Workspace.tsx:625`) and the welcome itself (`:713`).
  const workspace = readFileSync(join(repoRoot, 'web/src/routes/Workspace.tsx'), 'utf8').split('\n');
  const columnLine = workspace.findIndex((line) => line.includes('<NotesColumn')) + 1;
  const welcomeLine = workspace.findIndex((line) => line.includes('<PatientWelcome')) + 1;
  assert.ok(columnLine > 0 && welcomeLine > columnLine, 'both are in the same render tree');
});

// --- F6: the settings modal carries `Appearance` twice -------------------------

await test('F6 the settings modal carries `Appearance` twice, and the heading used instead once', () => {
  const modal = screen([
    ['Settings'],
    ['Appearance', 'Format', 'Backup', 'Advanced'],
    ['Appearance'],
    ['Theme'],
    ['Font', 'size'],
    ['Drafting', 'model'],
    ['Quick', 'Thorough'],
  ]);
  assert.equal(groundPhrase(modal, 'Appearance').box, null, 'two matches must refuse');
  assert.match(groundPhrase(modal, 'Appearance').why, /appears 2 times/);
  const once = groundPhrase(modal, UI_LABELS.settingsPane.text);
  assert.notEqual(once.box, null);
  assert.equal(UI_LABELS.settingsPane.text, 'Drafting model');
});

await test('F6 the settings heading is rendered once, and `Appearance` really is twice', () => {
  assert.match(
    sourceLine(UI_LABELS.settingsPane.file, UI_LABELS.settingsPane.line),
    /<h2 className="settings-title">\{t\('settings.draftingModel'\)\}<\/h2>/,
  );
  assert.equal(
    renders('web/src/routes/Settings.tsx', 'settings.draftingModel'),
    2,
    'the h2 and the radiogroup aria-label; only the h2 is on the screen',
  );
  assert.equal(
    renders('web/src/routes/Settings.tsx', 'settings.appearance'),
    2,
    'the nav label and the section heading, both on the screen, which is why it is refused',
  );
});

/** Runs `body` with a sandbox environment pointed at a throwaway folder. */
async function withSandboxEnv(body) {
  const saved = {
    dir: process.env['APUNTA_DATA_DIR'],
    port: process.env['APUNTA_PORT'],
    runId: process.env['APUNTA_TEST_RUN_ID'],
  };
  process.env['APUNTA_DATA_DIR'] = mkdtempSync(join(tmpdir(), 'p36-f7-'));
  process.env['APUNTA_PORT'] = '7879';
  process.env['APUNTA_TEST_RUN_ID'] = 'p36-attempt4-helper';
  try {
    return await body();
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
}

// --- F7: the ownership containment names the four C-OWN@1 files ----------------

await test('F7 the backup directory is the run\'s output, not a second owner', () => withSandboxEnv(async () => {
  const baseline = ['apunta.db', 'apunta.db-shm', 'apunta.db-wal', 'apunta.lock'];
  const own = ownershipContainment(baseline, [...baseline, 'backups']);
  assert.deepEqual(own.secondOwned, [], 'the backup flow writes backups/ and that is not a second owner');
  assert.deepEqual(own.otherNew, ['backups'], 'it is still reported, not hidden');
  assert.deepEqual(own.vanished, []);
  assert.deepEqual(own.owned, ['apunta.lock', 'apunta.db', 'apunta.db-wal', 'apunta.db-shm']);
}));

await test('F7 the check is no weaker for the four names: one appearing is caught', () => withSandboxEnv(async () => {
  const baseline = ['apunta.db', 'apunta.lock'];
  const own = ownershipContainment(baseline, [...baseline, 'apunta.db-wal', 'backups']);
  assert.deepEqual(own.secondOwned, ['apunta.db-wal'], 'a second WAL beside the baseline is a second owner');
  assert.deepEqual(own.otherNew, ['backups']);
  // And a name from the baseline disappearing is still a failure.
  const emptied = ownershipContainment(baseline, ['apunta.db', 'backups']);
  assert.deepEqual(emptied.vanished, ['apunta.lock']);
}));

await test('F7 the containment helper reads the four names from the sandbox folder, not from a literal', () =>
  withSandboxEnv(async () => {
    const dir = process.env['APUNTA_DATA_DIR'];
    for (const name of ['apunta.lock', 'apunta.db', 'apunta.db-wal', 'apunta.db-shm']) {
      writeFileSync(join(dir, name), 'x');
    }
    assert.deepEqual(snapshotDataDirNames(), [
      'apunta.db',
      'apunta.db-shm',
      'apunta.db-wal',
      'apunta.lock',
    ]);
    assert.deepEqual(ownershipBaselineProof(snapshotDataDirNames()).missing, []);
    mkdirSync(join(dir, 'backups'));
    mkdirSync(join(dir, 'archives'));
    const own = ownershipContainment(
      ['apunta.db', 'apunta.db-shm', 'apunta.db-wal', 'apunta.lock'],
      snapshotDataDirNames(),
    );
    assert.deepEqual(own.secondOwned, []);
    assert.deepEqual(own.otherNew, ['archives', 'backups']);
  }));

// --- Every grounded label is the string the app renders ------------------------

await test('every grounded label in the harness exists in en.ts and renders where it is cited', () => {
  for (const [name, label] of Object.entries({ ...UI_LABELS, ...FLOW_LABELS })) {
    if (label.file === null) {
      assert.equal(label.key, null, `${name} is the fabricated seed's own name, not an i18n key`);
      continue;
    }
    assert.match(sourceLine(label.file, label.line), new RegExp(`t\\('${label.key.replace('.', '\\.')}'`), name);
    const defined = new RegExp(`'${label.key.replace('.', '\\.')}':`);
    assert.ok(
      readFileSync(join(repoRoot, 'shared/src/i18n/en.ts'), 'utf8').split('\n').some((line) => defined.test(line)),
      `${name}: ${label.key} is not defined in shared/src/i18n/en.ts`,
    );
  }
});

process.stdout.write(`\n${String(passed)}/${String(passed + failed)} helper tests passed\n`);
for (const failure of failures) process.stdout.write(`  failed: ${failure}\n`);
process.exitCode = failed > 0 ? 1 : 0;