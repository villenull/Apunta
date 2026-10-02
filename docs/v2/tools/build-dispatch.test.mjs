// Tests for docs/v2/tools/build-dispatch.mjs.
//
// Run: node --test docs/v2/tools/build-dispatch.test.mjs
//
// The parent-review copy path is the thing under test: a parent's command cells
// are machine-copied from its children's cards, so a lossy copy is invisible to
// a child's implementer and fatal to the parent's reviewer. Every test here runs
// against a synthetic plan in a temp directory; no card, dispatch or state file
// in the repository is read for content or written.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  escapeCell,
  findUnfilledPorts,
  findUnsubstitutedTokens,
  parseCells,
  substituteTokens,
} from './build-dispatch.mjs';

const toolDir = dirname(fileURLToPath(import.meta.url));
const realPlan = join(toolDir, '..');
const NODE = process.execPath;

/*
 * The commands a card's verification cell can legitimately hold: shell pipes, a
 * BRE alternation, a path with a backslash in it, backticks, quotes, and nested
 * command substitutions. None of them may change by one byte on the way through
 * the table.
 */
const REPRESENTATIVE = [
  'npm run lint',
  'grep -rn "invoke_handler\\|withGlobalTauri\\": true" src-tauri/src',
  'grep -rn "VITE_APUNTA_TEST_IDENTITY\\|p3.4-observe" src-tauri',
  'm=$(find "$b/assets" -type f \\| wc -l)',
  'for w in a b; do echo "$w" \\| tr -d "\\\\"; done',
  'echo `date -u +%Y-%m-%d` and $(printf "%s" "$HOME")',
  'test "$(printf "a\\"b")" = "a\\"b"',
  'node -e "console.log(/a\\nb/.test(\'x\'))"',
  'tr -d "\\\\" <<< "$x"',
  'grep -c -e module-null-sink -e module-remap-source pactl',
  "git diff --name-only HEAD -- 'src/**'",
];

/** Runs the generator against a temp plan directory and returns its result. */
function makePlan(cardText, reviewRow = '| T0.R | T0 | Test review | L2 | extra checks |') {
  const dir = mkdtempSync(join(tmpdir(), 'apunta-dispatch-'));
  for (const f of ['CONTRACTS.md', 'HARD-STOPS.md', 'RUN-CONFIG.md']) cpSync(join(realPlan, f), join(dir, f));
  cpSync(join(realPlan, 'templates'), join(dir, 'templates'), { recursive: true });
  mkdirSync(join(dir, 'cards'), { recursive: true });
  writeFileSync(join(dir, 'CONTRACTS.md'), '# Contracts\n');
  writeFileSync(join(dir, 'HARD-STOPS.md'), '# Hard stops\n\nHS-1 no network.\n');
  writeFileSync(join(dir, 'RUN-CONFIG.md'), '# Run config\n\n## 2 L1 checks\n');
  writeFileSync(join(dir, 'MILESTONES.md'), `# Milestones\n\n${reviewRow}\n`);
  mkdirSync(join(dir, 'state'), { recursive: true });
  writeFileSync(join(dir, 'state', 'PROGRESS.json'), JSON.stringify({ cards: { T1: 'APPROVED' } }));
  writeFileSync(join(dir, 'cards', 'T1.md'), cardText);
  return dir;
}

const card = (command, expected) => `# T1 Test card

| Field | Value |
| --- | --- |
| Parent | T0 |
| Role | IMPLEMENTATION |
| Level | L1 |
| Contracts | none |
| Depends | none |
| Findings | none |
| Confidence | high |

## Objective

Say one thing.

## Read

Nothing.

## May edit

Nothing.

## Must not edit

Everything else.

## Verification

| ID | Command (cwd: repo root) | Expected |
| --- | --- | --- |
| V1 | \`${command}\` | ${expected} |
`;

function generate(planDir, args) {
  return spawnSync(NODE, [join(toolDir, 'build-dispatch.mjs'), ...args], {
    encoding: 'utf8',
    env: { ...process.env, APUNTA_V2_PLAN_DIR: planDir },
  });
}

/** The borrowed row for T1-V1 out of a generated parent dispatch. */
function borrowedRow(stdout) {
  const line = stdout.split('\n').find((l) => l.startsWith('| T1-V1 |'));
  assert.ok(line, `no borrowed row in the generated dispatch:\n${stdout.slice(0, 400)}`);
  return parseCells(line);
}

test('emit then parse returns byte-identical command text', () => {
  for (const command of REPRESENTATIVE) {
    const line = `| T1-V1 | ${escapeCell(command)} | ok |`;
    const cells = parseCells(line);
    assert.equal(cells.length, 3, `expected 3 cells for ${command}`);
    assert.equal(cells[1], command, `round trip changed ${JSON.stringify(command)}`);
  }
});

test('an already-escaped pipe neither gains nor loses a backslash', () => {
  // D4: the old emit was an unconditional `replaceAll('|', '\\|')`, so a command
  // that already carried a BRE alternation came back with an extra backslash and
  // split into four cells on the way in.
  const alternation = 'grep -rn "invoke_handler\\|withGlobalTauri\\": true" src-tauri/src';
  const oldEmit = alternation.replaceAll('|', '\\|');
  assert.equal(parseCells(`| T1-V1 | ${oldEmit} | ok |`).length, 4, 'the old emit is the defect');
  assert.equal(parseCells(`| T1-V1 | ${escapeCell(alternation)} | ok |`)[1], alternation);
  const emitted = escapeCell(alternation);
  assert.equal(emitted.split(/(?<!\\)\|/).length, 1, 'every pipe in the emitted cell is escaped');
});

test("an emitted cell is byte-identical to the child's own cell", () => {
  // The property a parent review actually depends on: the cell a parent inherits
  // is the cell the child wrote, byte for byte, backslash escapes included. A
  // codec that doubled every backslash would pass a `\|` and quietly corrupt the
  // `\"` in the same command (41 such backslashes exist across the plan's rows).
  for (const cell of [
    'grep -rn "invoke_handler\\|withGlobalTauri\\": true" src-tauri/src',
    'node -e "console.log(/a\\nb/.test(\'x\'))"',
    'm=$(find "$b/assets" -type f \\| wc -l)',
    'tr -d "\\" <<< "$x"',
  ]) {
    assert.equal(escapeCell(parseCells(`| a | ${cell} | ok |`)[1]), cell);
  }
});

test('a BRE alternation is still an alternation after the round trip', () => {
  const pattern = 'invoke_handler\\|withGlobalTauri": true';
  const command = `grep -rn "${pattern}" src-tauri`;
  const cells = parseCells(`| T1-V1 | ${escapeCell(command)} | ok |`);
  assert.equal(cells[1], command);
  assert.match(cells[1], /\\\|/, 'the alternation pipe is still escaped after the round trip');

  // And it is an alternation to grep, not a literal: prove it against a fixture
  // holding the forbidden text, the way the guard would.
  const dir = mkdtempSync(join(tmpdir(), 'apunta-bre-'));
  const file = join(dir, 'conf.json');
  writeFileSync(file, 'capabilities: { invoke_handler\\|withGlobalTauri": true }\n');
  const run = (p) => spawnSync('grep', ['-rn', p, file], { encoding: 'utf8' });
  if (run(pattern).error) return; // no grep on this machine: the string shape is asserted above
  assert.equal(run(pattern).status, 0, 'the round-tripped pattern matches the forbidden text');
  assert.equal(run('invoke_handler|withGlobalTauri": true').status, 1, 'a bare pipe is a literal in BRE');
});

test('fill() reaches a borrowed body: no {{…}} survives a generated dispatch', () => {
  // D5: fill() used to be applied to the return template only, so {{BASE}} in a
  // child's Expected cell reached the parent literally and `git diff` against it
  // answered `fatal: bad revision`, exit 128.
  const planDir = makePlan(
    card(
      'git diff --name-only {{BASE}}...HEAD -- src-tauri',
      'exit 0; the diff names no path, and the base is the dispatch base, never a literal {{BASE}}',
    ),
  );
  const run = generate(planDir, [
    'T0.R',
    '--review',
    '--base',
    'abc1234',
    '--head',
    'def5678',
    '--port',
    '7841',
    '--print',
  ]);
  assert.equal(run.status, 0, run.stderr);
  assert.ok(!run.stdout.includes('{{'), 'no unsubstituted token survives the whole document');
  assert.equal(findUnsubstitutedTokens(run.stdout).length, 0);
  const cells = borrowedRow(run.stdout);
  assert.equal(cells[1], '`git diff --name-only abc1234...HEAD -- src-tauri`');
  assert.ok(cells[2].includes('abc1234'), 'the Expected cell is filled too');
  assert.equal(cells[2].includes('{{'), false);
});

test('a borrowed row whose cell carries an unescaped pipe is refused, not truncated', () => {
  // D1 part 1: this row parsed into six cells, so the copy kept the first three
  // and discarded the rest — including the control's `exit $rc`.
  const planDir = makePlan(
    card(
      'm=$(find "$b/assets" -type f | wc -l); echo "restored=$m"; (cd "$b" && sha256sum -c "$c/before.sha") || exit 1; exit $rc',
      "exit 1 — a failing exit code is this row's pass",
    ),
  );
  const run = generate(planDir, [
    'T0.R',
    '--review',
    '--base',
    'abc1234',
    '--head',
    'def5678',
    '--port',
    '7841',
    '--print',
  ]);
  assert.equal(run.status, 4, run.stderr);
  assert.match(run.stderr, /T1-V1: its source row parses as 6 cells, not 3/);
  assert.equal(run.stdout, '', 'nothing is emitted when generation refuses');
});

test('a port placeholder nothing substitutes fails generation loudly', () => {
  // D2: only `--port <p>` is substituted, so `APUNTA_P31_PORT=<p>` reached the
  // shell, where `<p` parses as an input redirect from a file called p.
  const bad = makePlan(card('APUNTA_P31_PORT=<p> bash scripts/v2/x.test.sh', 'exit 0'));
  const run = generate(bad, ['T1', '--base', 'abc1234', '--port', '7841', '--print']);
  assert.equal(run.status, 4, run.stderr);
  assert.match(run.stderr, /V1: <p>/);
  assert.match(run.stderr, /--port <p>/);
  assert.equal(run.stdout, '');

  // The same card spelled the way the tool substitutes succeeds.
  const good = makePlan(card('node scripts/v2/sandbox.mjs run --port <p> -- npm test', 'exit 0'));
  const ok = generate(good, ['T1', '--base', 'abc1234', '--port', '7841', '--print']);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /sandbox\.mjs run --port 7841 -- npm test/);
});

test('findUnfilledPorts reads command cells only, never prose', () => {
  const prose = 'Use `<p>` for the sandbox port; it is filled under COORDINATOR §6.\n';
  assert.deepEqual(findUnfilledPorts(prose), []);
  const row = '| T1-V1 | `run --port <p2> -- x` | the port is <p2> |\n';
  assert.deepEqual(findUnfilledPorts(row), ['T1-V1: <p2>']);
});

test('--print writes nothing; without it the dispatch is written', () => {
  const planDir = makePlan(card('npm run lint', 'exit 0'));
  const printed = generate(planDir, ['T1', '--base', 'abc1234', '--port', '7841', '--print']);
  assert.equal(printed.status, 0, printed.stderr);
  assert.throws(() => readFileSync(join(planDir, 'state', 'dispatch', 'T1.md')), 'nothing written');

  const written = generate(planDir, ['T1', '--base', 'abc1234', '--port', '7841']);
  assert.equal(written.status, 0, written.stderr);
  const text = readFileSync(join(planDir, 'state', 'dispatch', 'T1.md'), 'utf8');
  assert.match(text, /# Dispatch: T1 Test card/);
  assert.deepEqual(findUnsubstitutedTokens(text), []);
});

test('substituteTokens fills every token it claims and leaves the rest alone', () => {
  const values = {
    CARD_ID: 'T1',
    CARD_TITLE: 'Test card',
    BASE: 'abc1234',
    HEAD: 'def5678',
    ATTEMPT: '2',
  };
  const out = substituteTokens('{{CARD_ID}} {{CARD_TITLE}} {{BASE}} {{HEAD}} {{ATTEMPT}}', values);
  assert.equal(out, 'T1 Test card abc1234 def5678 2');
  assert.equal(substituteTokens('{{NOPE}}', values), '{{NOPE}}');
  assert.deepEqual(findUnsubstitutedTokens('{{CARD_ID}} {{BASE}}'), ['{{CARD_ID}}', '{{BASE}}']);
  // Text that is *about* tokens, and another packet's tokens, are not this
  // tool's claim and must not stop a dispatch.
  assert.deepEqual(findUnsubstitutedTokens('write {{…}} and {{S32_PORT}} here'), []);
});
