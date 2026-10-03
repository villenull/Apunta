// Independent adversarial check of the proposal's §T: run §T.2's five tests plus
// extras against a copy of docs/v2/tools/build-dispatch.mjs with §T.1 applied.
//
// The patched tool is not committed (it is the proposal's patch applied to a
// copy), so run it against the ignored scratch copy:
//
//   git show 8783181:docs/v2/tools/build-dispatch.mjs > build/ir4/build-dispatch.mjs
//   git show 8783181:docs/v2/tools/plan-lib.mjs        > build/ir4/plan-lib.mjs
//   # ... apply §T.1(a) and §T.1(b) to build/ir4/build-dispatch.mjs ...
//   APUNTA_TOOL_DIR=$PWD/build/ir4 node --test \
//     docs/v2/evidence/P3.4/proposal-ir4/tooling-guard.test.mjs
//
// Result recorded in docs/v2/state/reviews/P3.4-owner-proposal-ir4.md: 14/14 pass
// once the fixture H1 follows the parameterised id; 3 of them fail against §T.2
// exactly as written.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const toolDir = process.env['APUNTA_TOOL_DIR'] ?? dirname(fileURLToPath(import.meta.url));
// Locates docs/v2 by walking up from this file, so the reproduction runs from
// either the committed evidence path or the ignored build/ scratch copy.
const here = dirname(fileURLToPath(import.meta.url));
let realPlan = process.env['APUNTA_V2_PLAN_DIR_REAL'];
if (realPlan === undefined) {
  let dir = here;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, 'docs', 'v2', 'templates'))) { realPlan = join(dir, 'docs', 'v2'); break; }
    dir = dirname(dir);
  }
}
if (realPlan === undefined) throw new Error('docs/v2 not found; set APUNTA_V2_PLAN_DIR_REAL');
const NODE = process.execPath;

// §T.2's exact parameterisation.
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

const card = (command = 'npm run lint', expected = 'ok', id = 'T1') => `# ${id} Test card

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
const run = (id, attempt, extra = []) => {
  const dir = makePlan(card('npm run lint', 'ok', id), undefined, id);
  const r = generate(dir, [id, '--base', 'deadbeef', '--port', '7841', '--attempt', String(attempt), '--print', ...extra]);
  return r;
};

test('T1: --attempt 5 with no exception is refused', () => {
  const r = run('T1', 5);
  assert.equal(r.status, 2, r.stdout);
  assert.match(r.stderr, /--attempt-exception/);
});

test('T2: --attempt 5 with a well-formed AM-nnn for another card is refused, naming no attempt 6', () => {
  const r = run('T1', 5, ['--attempt-exception', 'AM-999']);
  assert.equal(r.status, 2, r.stdout);
  assert.match(r.stderr, /refused/);
  assert.match(r.stderr, /no attempt 6/);
  assert.match(r.stderr, /only P3\.4 may carry it/);
});

test('T3: --attempt 5 with AM-nnn for card P3.4 succeeds with exactly status 0', () => {
  const r = run('P3.4', 5, ['--attempt-exception', 'AM-999']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /AM-999/);
  assert.match(r.stdout, /there is no attempt 6/);
  assert.match(r.stdout, /# P3\.4 Test card/);
});

test('T4: --attempt 6 is refused for P3.4 itself', () => {
  const r = run('P3.4', 6, ['--attempt-exception', 'AM-999']);
  assert.equal(r.status, 2, r.stdout);
  assert.match(r.stderr, /beyond any authorised budget/);
});

test('T5: attempt 4 line is byte-identical to the shipped literal', () => {
  const r = run('T1', 4, ['--attempt-exception', 'AM-049']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const want = '- Attempt 4 of 3, plus one corrective attempt the owner authorised by AM-049 — there is no attempt 5. Checkpoint: `docs/v2/state/cards/T1.json`.';
  assert.ok(r.stdout.includes(want), 'attempt-4 literal drifted');
});

test('T5b: attempt 4 failure message is byte-identical to the shipped one', () => {
  const r = run('T1', 4);
  assert.equal(r.status, 2);
  assert.equal(
    r.stderr.trim(),
    '--attempt 4 requires --attempt-exception <AM-nnn> naming the owner amendment that authorised it',
  );
});

test('extra: attempt 5 line reads as the AM-049 parallel sentence', () => {
  const r = run('P3.4', 5, ['--attempt-exception', 'AM-190']);
  assert.ok(
    r.stdout.includes('- Attempt 5 of 3, plus two corrective attempts the owner authorised by AM-190 — there is no attempt 6. Checkpoint: `docs/v2/state/cards/P3.4.json`.'),
    r.stdout.split('\n').find((l) => l.includes('Attempt 5')),
  );
});

test('extra: attempts 1-3 unchanged', () => {
  for (const a of [1, 2, 3]) {
    const r = run('T1', a);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(r.stdout.includes(`- Attempt ${a} of 3. Checkpoint: \`docs/v2/state/cards/T1.json\`.`));
  }
});

test('extra: --attempt 7+ refused; --attempt 0 / nan refused', () => {
  for (const a of [7, 12]) {
    const r = run('P3.4', a, ['--attempt-exception', 'AM-999']);
    assert.equal(r.status, 2, `attempt ${a} reached generation`);
  }
  for (const a of ['0', 'x', '-1', '4.5']) {
    const r = run('P3.4', a, ['--attempt-exception', 'AM-999']);
    assert.equal(r.status, 2, `attempt ${a} reached generation`);
  }
});

test('extra: --attempt 5 in --review mode: same keyed refusal, same single permitted id', () => {
  const dirA = makePlan(card('npm run lint', 'ok', 'T1'), '| T0.R | T1 | Impl review | L2 | extra |', 'T1');
  const a = generate(dirA, ['T0.R', '--base', 'deadbeef', '--port', '7841', '--attempt', '5', '--attempt-exception', 'AM-999', '--print', '--review', '--head', 'deadbeef']);
  assert.equal(a.status, 2, a.stdout + a.stderr);
  assert.match(a.stderr, /only P3\.4 may carry it/);
  const dirB = makePlan(card('npm run lint', 'ok', 'P3.4'), '| T0.R | P3.4 | Impl review | L2 | extra |', 'P3.4');
  const b = generate(dirB, ['P3.4', '--base', 'deadbeef', '--port', '7841', '--attempt', '5', '--attempt-exception', 'AM-999', '--print', '--review', '--head', 'deadbeef']);
  assert.equal(b.status, 0, b.stdout + b.stderr);
  const c = generate(dirB, ['P3.4', '--base', 'deadbeef', '--port', '7841', '--attempt', '6', '--attempt-exception', 'AM-999', '--print', '--review', '--head', 'deadbeef']);
  assert.equal(c.status, 2, c.stdout + c.stderr);
});

test('extra: --attempt 5 in --ir mode is refused for another card and permitted for P3.4', () => {
  const dirA = makePlan(card('npm run lint','ok','T1'), undefined, 'T1');
  const a = generate(dirA, ['T1', '--base', 'deadbeef', '--attempt', '5', '--attempt-exception', 'AM-999', '--print', '--ir']);
  assert.equal(a.status, 2);
  const dirB = makePlan(card('npm run lint','ok','P3.4'), undefined, 'P3.4');
  const b = generate(dirB, ['P3.4', '--base', 'deadbeef', '--attempt', '5', '--attempt-exception', 'AM-999', '--print', '--ir']);
  assert.equal(b.status, 0, b.stdout + b.stderr);
});

test('extra: attempt 5 is refused for P3.4 when the exception is malformed', () => {
  for (const e of ['AM-99', 'am-999', 'AM-9999', 'X-999']) {
    const r = run('P3.4', 5, ['--attempt-exception', e]);
    assert.equal(r.status, 2, `${e} was accepted`);
  }
});

test('extra: dependency gate still exits 3 after the grant (no PASS on exit 3)', () => {
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
  writeFileSync(join(dir, 'cards', 'P3.4.md'), card('npm run lint', 'ok', 'P3.4').replace('| Depends | none |', '| Depends | S2.5 |'));
  const r = generate(dir, ['P3.4', '--base', 'deadbeef', '--port', '7841', '--attempt', '5', '--attempt-exception', 'AM-999', '--print']);
  assert.equal(r.status, 3, r.stdout + r.stderr);
});

test('extra: the three shipped attempt-4 dispatch lines are reproduced byte for byte', () => {
  for (const f of ['S2.5.md', 'P3.4.md', 'P4.1.md', 'P4.1-ir.md']) {
    const line = readFileSync(join(realPlan, 'state', 'dispatch', f), 'utf8')
      .split('\n')
      .find((l) => l.startsWith('- Attempt 4 of '));
    assert.ok(line, `no attempt-4 line in ${f}`);
    const m = /^- Attempt 4 of 3, plus one corrective attempt the owner authorised by (AM-\d{3}) — there is no attempt 5\. Checkpoint: `docs\/v2\/state\/cards\/(.*?)\.json`\.$/.exec(line);
    assert.ok(m, `shipped line in ${f} has an unexpected shape: ${line}`);
    const r = run(m[2], 4, ['--attempt-exception', m[1]]);
    if (r.status !== 0) { console.log('DEBUG', f, m[0], r.status, r.stderr.slice(0,300)); }
    assert.equal(r.status, 0, `${f}: ` + r.stdout + r.stderr);
    assert.ok(r.stdout.includes(m[0]), `regenerated line differs for ${f}: ${m[0]}`);
  }
});
