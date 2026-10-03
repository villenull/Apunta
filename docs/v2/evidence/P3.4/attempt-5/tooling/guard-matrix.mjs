#!/usr/bin/env node
// Replays the keyed attempt-budget guard of docs/v2/tools/build-dispatch.mjs
// over the whole matrix AM-189 has an opinion about, and prints what it observed.
//
//   node docs/v2/evidence/P3.4/attempt-5/tooling/guard-matrix.mjs   # exit 0 on agreement
//
// Read-only and synthetic: every case runs against a throwaway plan directory in
// the system temp dir with --print, so no dispatch in the repository is written,
// no card, checkpoint or manifest is read for content beyond the shape the
// generator needs, and no server, database, model, audio, network or build is
// touched. It is the standalone form of the 14 colocated cases in
// docs/v2/tools/build-dispatch.test.mjs ("T1"…"extra: the three shipped
// attempt-4 dispatch lines…"); the two are kept in step, and this one adds a
// printed matrix so a reviewer can read the guard's behaviour without reading
// the assertions.
//
// The row that matters most is the last column: for every card and every mode,
// which attempts are refused. `>= 6` must read REFUSED in every row — the grant
// is a keyed exception, not a raised ceiling.

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// docs/v2/evidence/P3.4/attempt-5/tooling -> docs/v2, four levels up.
const realPlan = join(here, '..', '..', '..', '..');
const toolDir = join(realPlan, 'tools');
const NODE = process.execPath;
const FIFTH_ATTEMPT_CARD = 'P3.4';

const card = (id, { depends = 'none' } = {}) => `# ${id} Test card

| Field | Value |
| --- | --- |
| Parent | T0 |
| Role | IMPLEMENTATION |
| Level | L1 |
| Contracts | none |
| Depends | ${depends} |
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
| V1 | \`npm run lint\` | exit 0 |
`;

/**
 * A temp plan holding one card. `progress` maps dependency card id to status, so
 * a case can put the dependency gate at APPROVED or absent and observe which exit
 * it stops at — the grant is about the attempt counter, and exit 3 has to keep
 * winning over exit 0 for a card whose dependency is not APPROVED.
 */
function makePlan(id, { reviewRow = '| T0.R | T0 | Test review | L2 | extra checks |', depends, approved = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'apunta-p34-a5-'));
  for (const f of ['CONTRACTS.md', 'HARD-STOPS.md', 'RUN-CONFIG.md']) cpSync(join(realPlan, f), join(dir, f));
  cpSync(join(realPlan, 'templates'), join(dir, 'templates'), { recursive: true });
  mkdirSync(join(dir, 'cards'), { recursive: true });
  writeFileSync(join(dir, 'CONTRACTS.md'), '# Contracts\n');
  writeFileSync(join(dir, 'HARD-STOPS.md'), '# Hard stops\n\nHS-1 no network.\n');
  writeFileSync(join(dir, 'RUN-CONFIG.md'), '# Run config\n\n## 2 L1 checks\n');
  writeFileSync(join(dir, 'MILESTONES.md'), `# Milestones\n\n${reviewRow}\n`);
  mkdirSync(join(dir, 'state'), { recursive: true });
  writeFileSync(
    join(dir, 'state', 'PROGRESS.json'),
    JSON.stringify({ cards: approved ? { [id]: 'APPROVED' } : {} }),
  );
  writeFileSync(join(dir, 'cards', `${id}.md`), card(id, depends === undefined ? {} : { depends }));
  return dir;
}

function generate(planDir, args) {
  return spawnSync(NODE, [join(toolDir, 'build-dispatch.mjs'), ...args], {
    encoding: 'utf8',
    env: { ...process.env, APUNTA_V2_PLAN_DIR: planDir },
  });
}

const MODE_ARGS = {
  implement: [],
  review: ['--review', '--head', 'deadbeef'],
  ir: ['--ir'],
};

/** One case: a card, an attempt, an exception, a mode. Returns what happened. */
function probe(id, attempt, exception, mode = 'implement') {
  const dir = makePlan(id);
  const args = [
    id,
    '--base',
    'deadbeef',
    '--port',
    '7841',
    '--attempt',
    String(attempt),
    '--print',
    ...MODE_ARGS[mode],
  ];
  if (exception !== null) args.push('--attempt-exception', exception);
  const r = generate(dir, args);
  const line = r.stdout.split('\n').find((l) => l.startsWith('- Attempt ')) ?? '';
  return { status: r.status, stderr: r.stderr.trim(), line };
}

const rows = [];
let disagreements = 0;

const record = (id, attempt, exception, mode, expect) => {
  const got = probe(id, attempt, exception, mode);
  const want = expect === 'GENERATED' ? 0 : expect;
  const agree = got.status === want;
  if (!agree) disagreements += 1;
  rows.push(
    [
      agree ? 'ok' : 'MISMATCH',
      `${id}`,
      `${attempt}`,
      exception === null ? '(none)' : exception,
      mode,
      got.status === 0 ? 'GENERATED' : `exit ${got.status}`,
      want === 0 ? 'GENERATED' : `exit ${want}`,
      got.line.replace(/^- Attempt (\d) of (.*)\. Checkpoint.*$/, '$1 of $2'),
    ].join(' | '),
  );
};

// Attempts 1-3 unchanged for every card: no exception needed, none refused.
for (const id of ['T1', 'P3.4', 'S3.2']) for (const a of [1, 2, 3]) record(id, a, null, 'implement', 'GENERATED');

// Attempt 4: keyed exactly as before, for every card including P3.4.
for (const id of ['T1', 'P3.4', 'S3.2']) {
  record(id, 4, null, 'implement', 2);
  record(id, 4, 'AM-138', 'implement', 'GENERATED');
}

// Attempt 5: only P3.4, and only with a well-formed AM-nnn.
for (const id of ['T1', 'S3.2', 'S3.3a', 'P3.5', 'T0.R']) {
  record(id, 5, null, 'implement', 2);
  record(id, 5, 'AM-189', 'implement', 2);
  record(id, 5, 'AM-189', 'review', 2);
  record(id, 5, 'AM-189', 'ir', 2);
}
record(FIFTH_ATTEMPT_CARD, 5, 'AM-189', 'implement', 'GENERATED');
record(FIFTH_ATTEMPT_CARD, 5, 'AM-189', 'review', 'GENERATED');
record(FIFTH_ATTEMPT_CARD, 5, 'AM-189', 'ir', 'GENERATED');
for (const bad of ['AM-18', 'am-189', 'AM-1890', 'X-189', 'AM-189 ']) {
  record(FIFTH_ATTEMPT_CARD, 5, bad, 'implement', 2);
}

// >= 6 refused for every card, in every mode, exception or not.
for (const id of ['T1', 'P3.4', 'S3.2', 'S3.3a', 'P3.5', 'T0.R']) {
  for (const a of [6, 7, 12, 999]) {
    record(id, a, 'AM-189', 'implement', 2);
    record(id, a, null, 'implement', 2);
  }
  record(id, 6, 'AM-189', 'review', 2);
  record(id, 6, 'AM-189', 'ir', 2);
}

// Non-integers and out-of-range values never reach generation either.
for (const a of ['0', '-1', '4.5', 'x', '']) record('P3.4', a, 'AM-189', 'implement', 2);

// The dependency gate is untouched: P3.4 attempt 5 with an unapproved
// dependency stops at exit 3, not at exit 0.
{
  const dir = makePlan('P3.4', { depends: 'S2.5', approved: false });
  const r = generate(dir, [
    'P3.4',
    '--base',
    'deadbeef',
    '--port',
    '7841',
    '--attempt',
    '5',
    '--attempt-exception',
    'AM-189',
    '--print',
  ]);
  const agree = r.status === 3;
  if (!agree) disagreements += 1;
  rows.push(
    [
      agree ? 'ok' : 'MISMATCH',
      'P3.4',
      '5',
      'AM-189',
      'implement',
      `exit ${r.status}`,
      'exit 3',
      'dependency gate still wins',
    ].join(' | '),
  );
}

// The attempt-4 sentence in the three shipped dispatches, regenerated.
for (const f of ['S2.5.md', 'P3.4.md', 'P4.1.md', 'P4.1-ir.md']) {
  const path = join(realPlan, 'state', 'dispatch', f);
  if (!existsSync(path)) {
    rows.push(`skip | ${f} | (no shipped dispatch at this base)`);
    continue;
  }
  const line = readFileSync(path, 'utf8').split('\n').find((l) => l.startsWith('- Attempt 4 of '));
  const m =
    /^- Attempt 4 of 3, plus one corrective attempt the owner authorised by (AM-\d{3}) — there is no attempt 5\. Checkpoint: `docs\/v2\/state\/cards\/(.*?)\.json`\.$/.exec(
      line ?? '',
    );
  if (!m) {
    disagreements += 1;
    rows.push(`MISMATCH | ${f} | shipped attempt-4 line has an unexpected shape: ${line}`);
    continue;
  }
  const got = probe(m[2], 4, m[1]);
  const agree = got.status === 0 && got.line === m[0];
  if (!agree) disagreements += 1;
  rows.push(
    [
      agree ? 'ok' : 'MISMATCH',
      `${f} (${m[2]}, ${m[1]})`,
      '4',
      m[1],
      'implement',
      got.status === 0 ? 'GENERATED' : `exit ${got.status}`,
      'GENERATED',
      agree ? 'byte-identical to the shipped line' : `regenerated: ${got.line}`,
    ].join(' | '),
  );
}

// process.stdout.write rather than console.log: the repository's lint rule allows
// console.warn and console.error only, and an evidence script that cannot be
// linted is an evidence script that stops being maintained.
const out = (line) => process.stdout.write(`${line}\n`);
out(['result | card | attempt | exception | mode | observed | expected | note'].join('\n'));
out(rows.join('\n'));
out('');
out(`${rows.length - disagreements}/${rows.length} rows as expected; ${disagreements} mismatches.`);

process.exit(disagreements === 0 ? 0 : 1);