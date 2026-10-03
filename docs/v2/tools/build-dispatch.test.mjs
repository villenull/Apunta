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

/**
 * Runs the generator against a temp plan directory and returns its result.
 *
 * The card id is a defaulted third parameter, and the card's own H1 follows it
 * (`card()` below): `plan-lib.mjs` keys a card by file name and throws
 * `file name must be <id>.md` when the two disagree, so a fixture written as
 * `P3.4.md` whose H1 still reads `# T1 Test card` never reaches the guard being
 * tested — it exits non-zero for a reason that has nothing to do with the guard.
 * Every call that does not pass an id is unchanged.
 */
function makePlan(cardText, reviewRow = '| T0.R | T0 | Test review | L2 | extra checks |', id = 'T1') {
  const dir = mkdtempSync(join(tmpdir(), 'apunta-dispatch-'));
  for (const f of ['CONTRACTS.md', 'HARD-STOPS.md', 'RUN-CONFIG.md']) cpSync(join(realPlan, f), join(dir, f));
  cpSync(join(realPlan, 'templates'), join(dir, 'templates'), { recursive: true });
  mkdirSync(join(dir, 'cards'), { recursive: true });
  writeFileSync(join(dir, 'CONTRACTS.md'), '# Contracts\n');
  writeFileSync(join(dir, 'HARD-STOPS.md'), '# Hard stops\n\nHS-1 no network.\n');
  writeFileSync(join(dir, 'RUN-CONFIG.md'), '# Run config\n\n## 2 L1 checks\n');
  writeFileSync(join(dir, 'MILESTONES.md'), `# Milestones\n\n${reviewRow}\n`);
  mkdirSync(join(dir, 'state'), { recursive: true });
  writeFileSync(join(dir, 'state', 'PROGRESS.json'), JSON.stringify({ cards: { [id]: 'APPROVED' } }));
  writeFileSync(join(dir, 'cards', `${id}.md`), cardText);
  return dir;
}

const card = (command, expected, id = 'T1') => `# ${id} Test card

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

test('the refusal advice names only spellings that survive the pipeline', () => {
  // A message that recommends a spelling the codec cannot carry is worse than no
  // message: it sends the author to the defect. So the advice is not asserted as
  // text — every backslash-pipe spelling it contains is extracted and run through
  // the codec, and each must parse to three cells and re-emit itself byte for
  // byte. This is the assertion that stops the message rotting back into the trap.
  const planDir = makePlan(card('grep -rn "a\\\\|b" f', 'exit 0'));
  const run = generate(planDir, ['T1', '--base', 'abc1234', '--port', '7841', '--print']);
  assert.equal(run.status, 4, run.stderr);
  const advice = [...run.stderr.matchAll(/\\+\|/g)].map((m) => m[0]);
  assert.deepEqual(advice, ['\\|', '\\\\\\|'], `the message advises ${JSON.stringify(advice)}`);
  for (const spelling of advice) {
    const cells = parseCells(`| V1 | ${spelling} | ok |`);
    assert.equal(cells.length, 3, `${JSON.stringify(spelling)} is advised but not representable`);
    assert.equal(escapeCell(cells[1]), spelling, `${JSON.stringify(spelling)} does not survive`);
  }
  // Not merely well-formed: the one-backslash form is the pipe a shell pipe is,
  // and the three-backslash form is the one that reaches grep as an alternation.
  assert.equal(parseCells(`| V1 | ${advice[0]} | ok |`)[1], '|');
  assert.equal(parseCells(`| V1 | ${advice[1]} | ok |`)[1], '\\|');
});

test('a card may write a BRE alternation, and the guard still fires after the copy', () => {
  // The trap, closed end to end. A card that needs grep to read `a\|b` as an
  // alternation writes `a\\\|b`; the parsed command is `a\|b`; the parent row is
  // byte-identical to the card's own row; and the guard fires against a fixture
  // holding the forbidden text. The bare form still does not fire — in a BRE a
  // bare `|` is an ordinary character, so the same guard written that way matches
  // nothing and passes always.
  const planDir = makePlan(card('grep -rn "invoke_handler\\\\\\|withGlobalTauri" conf.json', 'exit 1'));
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
  const cells = borrowedRow(run.stdout);
  const pattern = /grep -rn "([^"]*)"/.exec(cells[1])[1];
  assert.equal(pattern, 'invoke_handler\\|withGlobalTauri', `the alternation did not survive: ${pattern}`);

  const dir = mkdtempSync(join(tmpdir(), 'apunta-guard-'));
  // The forbidden text is a JSON string carrying an escaped pipe, so the two
  // patterns differ: an alternation reads `\|` in the file as the pipe it stands
  // for, while a bare `|` pattern asks for a literal pipe the file does not have.
  const file = join(dir, 'conf.json');
  writeFileSync(file, 'capabilities: { invoke_handler\\|withGlobalTauri: true }\n');
  const grep = (p) => spawnSync('grep', ['-rn', p, file], { encoding: 'utf8' });
  if (grep(pattern).error) return; // no grep on this machine: the string shape is asserted above
  assert.equal(grep(pattern).status, 0, 'the guard fires against the forbidden text');
  assert.equal(grep('invoke_handler|withGlobalTauri').status, 1, 'a bare pipe is a literal in BRE');
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

/*
 * The attempt-budget guard, keyed by the owner amendment that authorised each
 * exception.
 *
 * The budget is three attempts (COORDINATOR.md §4). Attempts 4 and 5 are not a
 * raised ceiling: each is reachable only by naming the amendment that authorised
 * it, and attempt 5 additionally only for the one card the owner named. What
 * these cases exist to prevent is the failure mode of an exception guard: a
 * guard that passes whenever any exception is supplied, or that grows the ceiling
 * for every card because one card needed it. So each refusal is asserted with its
 * exact exit status *and* the message that says why, the permitted case is
 * asserted with the amendment name appearing in the generated dispatch, and the
 * three attempt-4 dispatches already shipped are regenerated and compared byte
 * for byte — that last one is what would catch an "arithmetic" rewrite of the
 * attempt line, which spells `one` as `1` and changes a reviewed dispatch by one
 * character.
 *
 * Ported from the independently reviewed probe
 * `docs/v2/evidence/P3.4/proposal-ir4/tooling-guard.test.mjs` (14 cases), which
 * ran against an ignored patched copy of this tool because the grant did not yet
 * exist; the cases and their names are that file's, so the two suites stay
 * comparable, and they run here against the shipped tool. Only the fixture
 * plumbing differs: the probe took its tool directory from APUNTA_TOOL_DIR and
 * resolved the real plan directory by walking up, both of which were only needed
 * while the tool lived in a scratch copy.
 */

/** Generates `id` at `attempt`, optionally with an exception, and returns the run. */
const runAttempt = (id, attempt, extra = []) => {
  const dir = makePlan(card('npm run lint', 'ok', id), undefined, id);
  return generate(dir, [
    id,
    '--base',
    'deadbeef',
    '--port',
    '7841',
    '--attempt',
    String(attempt),
    '--print',
    ...extra,
  ]);
};

test('T1: --attempt 5 with no exception is refused', () => {
  const r = runAttempt('T1', 5);
  assert.equal(r.status, 2, r.stdout);
  assert.match(r.stderr, /--attempt-exception/);
});

test('T2: --attempt 5 with a well-formed AM-nnn for another card is refused, naming no attempt 6', () => {
  const r = runAttempt('T1', 5, ['--attempt-exception', 'AM-999']);
  assert.equal(r.status, 2, r.stdout);
  assert.match(r.stderr, /refused/);
  assert.match(r.stderr, /no attempt 6/);
  assert.match(r.stderr, /only P3\.4 may carry it/);
});

test('T3: --attempt 5 with AM-nnn for card P3.4 succeeds with exactly status 0', () => {
  const r = runAttempt('P3.4', 5, ['--attempt-exception', 'AM-999']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /AM-999/);
  assert.match(r.stdout, /there is no attempt 6/);
  assert.match(r.stdout, /# P3\.4 Test card/);
});

test('T4: --attempt 6 with AM-nnn for card P3.4 succeeds with exactly status 0', () => {
  const r = runAttempt('P3.4', 6, ['--attempt-exception', 'AM-999']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /AM-999/);
  assert.match(r.stdout, /there is no attempt 7/);
  assert.match(r.stdout, /# P3\.4 Test card/);
});

test('T4b: --attempt 6 with a well-formed AM-nnn for another card is refused, naming no attempt 7', () => {
  const r = runAttempt('T1', 6, ['--attempt-exception', 'AM-999']);
  assert.equal(r.status, 2, r.stdout);
  assert.match(r.stderr, /refused/);
  assert.match(r.stderr, /no attempt 7/);
  assert.match(r.stderr, /only P3\.4 may carry it/);
});

test('T4c: --attempt 6 with no exception is refused', () => {
  const r = runAttempt('P3.4', 6);
  assert.equal(r.status, 2, r.stdout);
  assert.match(r.stderr, /--attempt-exception/);
});

test('T5: attempt 4 line is byte-identical to the shipped literal', () => {
  const r = runAttempt('T1', 4, ['--attempt-exception', 'AM-049']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const want =
    '- Attempt 4 of 3, plus one corrective attempt the owner authorised by AM-049 — there is no attempt 5. Checkpoint: `docs/v2/state/cards/T1.json`.';
  assert.ok(r.stdout.includes(want), 'attempt-4 literal drifted');
});

test('T5b: attempt 4 failure message is byte-identical to the shipped one', () => {
  const r = runAttempt('T1', 4);
  assert.equal(r.status, 2);
  assert.equal(
    r.stderr.trim(),
    '--attempt 4 requires --attempt-exception <AM-nnn> naming the owner amendment that authorised it',
  );
});

test('extra: attempt 5 line reads as the AM-049 parallel sentence', () => {
  const r = runAttempt('P3.4', 5, ['--attempt-exception', 'AM-190']);
  assert.ok(
    r.stdout.includes(
      '- Attempt 5 of 3, plus two corrective attempts the owner authorised by AM-190 — there is no attempt 6. Checkpoint: `docs/v2/state/cards/P3.4.json`.',
    ),
    r.stdout.split('\n').find((l) => l.includes('Attempt 5')),
  );
});

test('extra: attempt 6 line reads as the AM-049 parallel sentence', () => {
  const r = runAttempt('P3.4', 6, ['--attempt-exception', 'AM-195']);
  assert.ok(
    r.stdout.includes(
      '- Attempt 6 of 3, plus three corrective attempts the owner authorised by AM-195 — there is no attempt 7. Checkpoint: `docs/v2/state/cards/P3.4.json`.',
    ),
    r.stdout.split('\n').find((l) => l.includes('Attempt 6')),
  );
});

test('extra: attempts 1-3 unchanged', () => {
  for (const a of [1, 2, 3]) {
    const r = runAttempt('T1', a);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(r.stdout.includes(`- Attempt ${a} of 3. Checkpoint: \`docs/v2/state/cards/T1.json\`.`));
  }
});

test('extra: --attempt 7+ refused; --attempt 0 / nan refused', () => {
  for (const a of [7, 12]) {
    const r = runAttempt('P3.4', a, ['--attempt-exception', 'AM-999']);
    assert.equal(r.status, 2, `attempt ${a} reached generation`);
  }
  for (const a of ['0', 'x', '-1', '4.5']) {
    const r = runAttempt('P3.4', a, ['--attempt-exception', 'AM-999']);
    assert.equal(r.status, 2, `attempt ${a} reached generation`);
  }
});

test('extra: --attempt 5 in --review mode: same keyed refusal, same single permitted id', () => {
  // --review is a mode of the same generator and its dispatch carries the same
  // attempt line, so an exception honoured in one mode and not the other would be
  // an attempt the implementer reads about in a brief it was never given.
  const dirA = makePlan(card('npm run lint', 'ok', 'T1'), '| T0.R | T1 | Impl review | L2 | extra |', 'T1');
  const a = generate(dirA, [
    'T0.R',
    '--base',
    'deadbeef',
    '--port',
    '7841',
    '--attempt',
    '5',
    '--attempt-exception',
    'AM-999',
    '--print',
    '--review',
    '--head',
    'deadbeef',
  ]);
  assert.equal(a.status, 2, a.stdout + a.stderr);
  assert.match(a.stderr, /only P3\.4 may carry it/);
  const dirB = makePlan(
    card('npm run lint', 'ok', 'P3.4'),
    '| T0.R | P3.4 | Impl review | L2 | extra |',
    'P3.4',
  );
  const b = generate(dirB, [
    'P3.4',
    '--base',
    'deadbeef',
    '--port',
    '7841',
    '--attempt',
    '5',
    '--attempt-exception',
    'AM-999',
    '--print',
    '--review',
    '--head',
    'deadbeef',
  ]);
  assert.equal(b.status, 0, b.stdout + b.stderr);
  const c = generate(dirB, [
    'P3.4',
    '--base',
    'deadbeef',
    '--port',
    '7841',
    '--attempt',
    '6',
    '--attempt-exception',
    'AM-999',
    '--print',
    '--review',
    '--head',
    'deadbeef',
  ]);
  assert.equal(c.status, 0, c.stdout + c.stderr);
  assert.match(c.stdout, /there is no attempt 7/);
  const d = generate(dirA, [
    'T0.R',
    '--base',
    'deadbeef',
    '--port',
    '7841',
    '--attempt',
    '6',
    '--attempt-exception',
    'AM-999',
    '--print',
    '--review',
    '--head',
    'deadbeef',
  ]);
  assert.equal(d.status, 2, d.stdout + d.stderr);
  assert.match(d.stderr, /only P3\.4 may carry it/);
});

test('extra: --attempt 5 in --ir mode is refused for another card and permitted for P3.4', () => {
  const dirA = makePlan(card('npm run lint', 'ok', 'T1'), undefined, 'T1');
  const a = generate(dirA, [
    'T1',
    '--base',
    'deadbeef',
    '--attempt',
    '5',
    '--attempt-exception',
    'AM-999',
    '--print',
    '--ir',
  ]);
  assert.equal(a.status, 2);
  const dirB = makePlan(card('npm run lint', 'ok', 'P3.4'), undefined, 'P3.4');
  const b = generate(dirB, [
    'P3.4',
    '--base',
    'deadbeef',
    '--attempt',
    '5',
    '--attempt-exception',
    'AM-999',
    '--print',
    '--ir',
  ]);
  assert.equal(b.status, 0, b.stdout + b.stderr);
});

test('extra: attempt 5 is refused for P3.4 when the exception is malformed', () => {
  for (const e of ['AM-99', 'am-999', 'AM-9999', 'X-999']) {
    const r = runAttempt('P3.4', 5, ['--attempt-exception', e]);
    assert.equal(r.status, 2, `${e} was accepted`);
  }
});

test('extra: dependency gate still exits 3 after the grant (no PASS on exit 3)', () => {
  // The grant is about the attempt counter only. A P3.4 whose dependency S2.5 is
  // not APPROVED must still stop at exit 3 — a keyed attempt exception that also
  // opened the dependency gate would let an unreviewed card start work.
  const dir = mkdtempSync(join(tmpdir(), 'apunta-dep-'));
  for (const f of ['CONTRACTS.md', 'HARD-STOPS.md', 'RUN-CONFIG.md']) cpSync(join(realPlan, f), join(dir, f));
  cpSync(join(realPlan, 'templates'), join(dir, 'templates'), { recursive: true });
  mkdirSync(join(dir, 'cards'), { recursive: true });
  writeFileSync(join(dir, 'CONTRACTS.md'), '# Contracts\n');
  writeFileSync(join(dir, 'HARD-STOPS.md'), '# Hard stops\n');
  writeFileSync(join(dir, 'RUN-CONFIG.md'), '# Run config\n');
  writeFileSync(join(dir, 'MILESTONES.md'), '# Milestones\n');
  mkdirSync(join(dir, 'state'), { recursive: true });
  writeFileSync(join(dir, 'state', 'PROGRESS.json'), JSON.stringify({ cards: {} }));
  writeFileSync(
    join(dir, 'cards', 'P3.4.md'),
    card('npm run lint', 'ok', 'P3.4').replace('| Depends | none |', '| Depends | S2.5 |'),
  );
  const r = generate(dir, [
    'P3.4',
    '--base',
    'deadbeef',
    '--port',
    '7841',
    '--attempt',
    '5',
    '--attempt-exception',
    'AM-999',
    '--print',
  ]);
  assert.equal(r.status, 3, r.stdout + r.stderr);
});

test('extra: the three shipped attempt-4 dispatch lines are reproduced byte for byte', () => {
  // The three dispatched attempt-4 sentences, read from the committed dispatches
  // themselves rather than from a constant in this file: the amendment id and the
  // card id are extracted from the shipped line and fed back through the
  // generator, so the test fails if the generator's wording drifts by one
  // character from a dispatch a reviewer already accepted.
  //
  // P3.4.md is deliberately NOT in this set: the owner-authorised attempt-5
  // dispatch (AM-189) regenerated it, so it no longer carries an attempt-4 line
  // and the assertion below would fail on a file that was never wrong. The set is
  // exactly the shipped dispatches that still carry the line.
  for (const f of ['S2.5.md', 'P4.1.md', 'P4.1-ir.md']) {
    const line = readFileSync(join(realPlan, 'state', 'dispatch', f), 'utf8')
      .split('\n')
      .find((l) => l.startsWith('- Attempt 4 of '));
    assert.ok(line, `no attempt-4 line in ${f}`);
    const m =
      /^- Attempt 4 of 3, plus one corrective attempt the owner authorised by (AM-\d{3}) — there is no attempt 5\. Checkpoint: `docs\/v2\/state\/cards\/(.*?)\.json`\.$/.exec(
        line,
      );
    assert.ok(m, `shipped line in ${f} has an unexpected shape: ${line}`);
    const r = runAttempt(m[2], 4, ['--attempt-exception', m[1]]);
    assert.equal(r.status, 0, `${f}: ` + r.stdout + r.stderr);
    assert.ok(r.stdout.includes(m[0]), `regenerated line differs for ${f}: ${m[0]}`);
  }
});
