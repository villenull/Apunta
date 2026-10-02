// Tests for docs/v2/tools/check-plan.mjs.
//
// Run: node --test docs/v2/tools/check-plan.test.mjs
//
// The assertion under test is the cell-count one. A verification row with an
// unescaped pipe inside a command or an expected cell splits into more than three
// cells; `parseCard` keeps the first three and drops the rest, so a parent's
// inherited command once ended mid-word with the negative control's `exit $rc`
// discarded — and every other assertion in the tool still passed, which is why
// the failure mode had to become a build failure rather than a quiet truncation.
//
// Every test runs against a synthetic plan in a temp directory. Nothing in the
// repository's own plan is written, and no assertion here depends on the state of
// the real cards — a test that fails when an unrelated card is mid-repair is a
// test nobody keeps.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const toolDir = dirname(fileURLToPath(import.meta.url));
const realPlan = join(toolDir, '..');
const NODE = process.execPath;

const FINDINGS = Array.from({ length: 20 }, (_, i) => `R${String(i + 1).padStart(2, '0')}`).join(', ');

/** A one-card plan directory that satisfies every other rule check-plan makes. */
function makePlan(row) {
  const dir = mkdtempSync(join(tmpdir(), 'apunta-plan-'));
  cpSync(join(realPlan, 'templates'), join(dir, 'templates'), { recursive: true });
  mkdirSync(join(dir, 'cards'), { recursive: true });
  writeFileSync(join(dir, 'CONTRACTS.md'), '# Contracts\n');
  writeFileSync(join(dir, 'MILESTONES.md'), '# Milestones\n\n| T0.R | T0 | Test review | L2 | extra |\n');
  writeFileSync(
    join(dir, 'TRACEABILITY.md'),
    `# Traceability\n\n| ID | Where |\n| --- | --- |\n${FINDINGS.split(', ')
      .map((r) => `| ${r} | T1 |`)
      .join('\n')}\n`,
  );
  writeFileSync(
    join(dir, 'cards', 'T1.md'),
    `# T1 Test card

| Field | Value |
| --- | --- |
| Parent | T0 |
| Role | IMPLEMENTATION |
| Level | L1 |
| Contracts | none |
| Depends | none |
| Findings | ${FINDINGS} |
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
${row}
`,
  );
  return dir;
}

function check(planDir) {
  return spawnSync(NODE, [join(toolDir, 'check-plan.mjs'), '--no-write'], {
    encoding: 'utf8',
    env: { ...process.env, APUNTA_V2_PLAN_DIR: planDir },
  });
}

test('a row whose command carries an unescaped pipe is an error, not a truncation', () => {
  // D1 part 2. This is the shape of P3.7-V3: three unescaped pipes in the command,
  // six cells parsed, the parser keeping `wc -l); …` and discarding `exit 1; exit
  // $rc` — the whole half of the negative control that makes it a control.
  const planDir = makePlan(
    '| V3 | `m=$(find "$b/assets" -type f | wc -l); (cd "$b" && sha256sum -c "$c/before.sha") || exit 1; exit $rc` | exit 1 — a failing exit code is this row\'s pass |',
  );
  const run = check(planDir);
  assert.equal(run.status, 1, run.stdout);
  assert.match(run.stderr, /error: T1 V3: the row parses as 6 cells, not 3/);
  assert.match(run.stderr, /written \\\|/);
  assert.match(run.stderr, /1 error\(s\)/);
});

test('the same row with its pipes escaped passes', () => {
  const planDir = makePlan(
    '| V3 | `m=$(find "$b/assets" -type f \\| wc -l); (cd "$b" && sha256sum -c "$c/before.sha") \\|\\| exit 1; exit $rc` | exit 1 — a failing exit code is this row\'s pass |',
  );
  const run = check(planDir);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Plan consistent: 1 cards, 1 parent reviews, 0 contracts/);
});

test('an unescaped pipe in an expected cell is caught as well as one in a command', () => {
  // The expected column is read by the reviewer exactly as the command is, so a
  // pipe there truncates the pass condition the same way.
  const planDir = makePlan(
    '| V1 | `npm run lint` | exit 0 — the row passes, or the shell reads \\| as a literal |',
  );
  assert.equal(check(planDir).status, 0);

  const broken = makePlan('| V1 | `npm run lint` | exit 0 — reads | as a literal |');
  const run = check(broken);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /error: T1 V1: the row parses as 4 cells, not 3/);
});

test('a BRE alternation written \\| in a card is a well-formed row', () => {
  // The escaping the check demands is also the escaping that keeps an alternation
  // an alternation: neither an unescaped pipe nor a doubled backslash.
  const planDir = makePlan(
    '| V1 | `grep -rn "invoke_handler\\|withGlobalTauri\\": true" src-tauri` | no matches; exit 1 from the grep is the pass |',
  );
  const run = check(planDir);
  assert.equal(run.status, 0, run.stderr);
});
