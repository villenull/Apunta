// Output-lint repair check: proves the P3.4 reproduction scripts print byte for
// byte what they printed before the `console.log` -> `process.stdout.write` swap.
//
// The "before" bytes are not trusted from any working copy. They are read out of
// git at ORIGIN_COMMIT, so this check cannot be satisfied by editing both sides.
//
//   APUNTA_NODE=~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node \
//     node docs/v2/evidence/P3.4/output-lint-repair/replay-check.mjs
//
// Prints one line per case and exits non-zero if any case differs beyond the
// three normalisations named in NORMALISED below. Reads nothing but git, the
// ignored model copies under build/, and stdout/stderr of the scripts; writes
// only under build/evidence-output-lint/.

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'node:util';

const ORIGIN_COMMIT = '3bd142f';
const NODE =
  process.env.APUNTA_NODE ??
  join(process.env.HOME ?? '', '.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node');
const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const SCRATCH = join(REPO, 'build', 'evidence-output-lint');
const ORIGINALS = join(SCRATCH, 'originals');

const CASES = [
  // [name, repo-relative path, which ignored model to import, node --test?]
  ['ir4-attempt-line-identity', 'docs/v2/evidence/P3.4/proposal-ir4/attempt-line-identity.mjs', 'v5', false],
  ['ir4-frame-identity', 'docs/v2/evidence/P3.4/proposal-ir4/frame-identity-adversarial.mjs', 'v5', false],
  ['ir4-plan-fixture-filename', 'docs/v2/evidence/P3.4/proposal-ir4/plan-fixture-filename-id.mjs', 'v5', false],
  ['ir4-tooling-guard', 'docs/v2/evidence/P3.4/proposal-ir4/tooling-guard.test.mjs', 'v5', true],
  ['ir5-reader-epoch', 'docs/v2/evidence/P3.4/proposal-ir5/reader-epoch.mjs', 'v5', false],
  ['ir5-click-witness', 'docs/v2/evidence/P3.4/proposal-ir5/click-witness.mjs', 'v5', false],
  ['ir5-hung-dispatch', 'docs/v2/evidence/P3.4/proposal-ir5/hung-dispatch.mjs', 'v5', false],
  ['ir6-geometry-command', 'docs/v2/evidence/P3.4/proposal-ir6/geometry-command.mjs', 'repair', false],
  ['ir6-observation-wait', 'docs/v2/evidence/P3.4/proposal-ir6/observation-wait.mjs', 'repair', false],
  ['ir6-measured-native', 'docs/v2/evidence/P3.4/proposal-ir6/measured-native.mjs', 'repair', false],
  ['ir6-reordered-duplicate', 'docs/v2/evidence/P3.4/proposal-ir6/reordered-duplicate.mjs', 'repair', false],
  ['repair2-ir5-counterex', 'docs/v2/evidence/P3.4/proposal-v5-repair/ir5-counterexamples.mjs', 'repair', false],
];

const MODELS = {
  v5: join(REPO, 'build/p3.4-spec-v5/model.mjs'),
  repair: join(REPO, 'build/p3.4-spec-v5-repair/model.mjs'),
};

/**
 * The only three differences this check tolerates, each for a stated reason:
 *  1. `(12.345ms)` / `ℹ duration_ms N` — the node test reporter's own timings.
 *  2. The test file's own path — the original runs from a scratch copy, so its
 *     path necessarily differs from the repaired file's.
 *  3. `tooling-guard.test.mjs:<line>` — the repaired file carries exactly one
 *     added line (the `node:util` import), so stack-trace line numbers below it
 *     are shifted by exactly 1. Line *content* is still compared.
 */
const NORMALISED = [
  [/\(\d+(\.\d+)?ms\)/g, '(TIME)'],
  [/^ℹ duration_ms .*$/gm, 'ℹ duration_ms TIME'],
  [/[^ \n]*tooling-guard\.test\.mjs/g, '<TESTFILE>'],
  [/tooling-guard\.test\.mjs:\d+/g, 'tooling-guard.test.mjs:N'],
];
const normalise = (text) => NORMALISED.reduce((acc, [re, to]) => acc.replace(re, to), text);

const say = (...args) => process.stdout.write(format(...args) + '\n');

const version = spawnSync(NODE, ['--version'], { encoding: 'utf8' });
if (version.status !== 0 || version.stdout.trim() !== 'v24.19.0') {
  say(`FAIL: pinned interpreter is not v24.19.0 (${NODE}: ${(version.stdout || version.stderr).trim()})`);
  process.exit(1);
}
for (const [key, path] of Object.entries(MODELS)) {
  const r = spawnSync(NODE, ['--check', path], { encoding: 'utf8' });
  if (r.status !== 0) { say(`FAIL: ignored model copy '${key}' is unreadable: ${path}`); process.exit(1); }
}

const env = {
  ...process.env,
  APUNTA_V2_PLAN_DIR_REAL: join(REPO, 'docs/v2'),
  APUNTA_TOOL_DIR: join(REPO, 'build/ir4'),
};

const run = (name, scriptPath, modelKey, asTest, outDir) => {
  mkdirSync(outDir, { recursive: true });
  const r = spawnSync(NODE, [...(asTest ? ['--test'] : []), scriptPath], {
    cwd: REPO,
    env: { ...env, APUNTA_P34_MODEL: MODELS[modelKey] },
    encoding: 'utf8',
  });
  writeFileSync(join(outDir, `${name}.out`), r.stdout ?? '');
  writeFileSync(join(outDir, `${name}.err`), r.stderr ?? '');
  writeFileSync(join(outDir, `${name}.status`), `${r.status}\n`);
  return { out: r.stdout ?? '', err: r.stderr ?? '', status: r.status };
};

let failures = 0;
for (const [name, rel, modelKey, asTest] of CASES) {
  // Rebuild the "before" tree straight from git, every time.
  const blob = spawnSync('git', ['show', `${ORIGIN_COMMIT}:${rel}`], { cwd: REPO, encoding: 'utf8' });
  if (blob.status !== 0) { say(`FAIL ${name}: cannot read ${ORIGIN_COMMIT}:${rel}`); failures += 1; continue; }
  const beforePath = join(ORIGINALS, rel);
  mkdirSync(dirname(beforePath), { recursive: true });
  writeFileSync(beforePath, blob.stdout);

  const before = run(name, beforePath, modelKey, asTest, join(SCRATCH, 'replay', 'original'));
  const after = run(name, join(REPO, rel), modelKey, asTest, join(SCRATCH, 'replay', 'new'));

  const problems = [];
  if (before.status !== after.status) problems.push(`exit ${before.status} -> ${after.status}`);
  if (normalise(before.out) !== normalise(after.out)) problems.push('stdout');
  if (normalise(before.err) !== normalise(after.err)) problems.push('stderr');

  if (problems.length === 0) {
    say(`  ok    ${name.padEnd(26)} exit ${after.status}  stdout/stderr byte-identical`);
  } else {
    failures += 1;
    say(`  FAIL  ${name.padEnd(26)} ${problems.join(', ')}`);
  }
}

say('');
say(`${CASES.length} case(s) replayed against ${ORIGIN_COMMIT}; ${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);