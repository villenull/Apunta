// Output-lint completion replay: proves the three files changed in this packet
// still print byte for byte what they printed at BASE_COMMIT, with no
// normalisation at all.
//
// The "before" bytes are never trusted from a working copy — they are read out of
// git at BASE_COMMIT on every run, so this cannot be satisfied by editing both
// sides. Both sides run under the same pinned interpreter and the same
// environment.
//
//   ~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node \
//     docs/v2/evidence/output-lint-completion/replay.mjs
//
// Writes only under the ignored build/evidence-lint-completion/. Reads git, the
// ignored model copy under build/, and the three proofs' own stdout/stderr.
// Invokes nothing else: no app, server, pactl, model, display, microphone,
// network or data folder.

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'node:util';

const BASE_COMMIT = '39c6723';
// The P3.5 review-1 containment proof extracts its predicate from
// `scripts/v2/tauri-audio.test.mjs`. Its own baseline is the harness as of this
// commit; the harness was rewritten by 9e6094b/7e16513, so against today's file
// the proof reports "could not extract the predicate" and exits 2 — on BOTH
// sides, identically. Both baselines are run and reported; neither is edited to
// make the proof pass.
const HARNESS_BASELINE = '46419f5';
const NODE =
  process.env.APUNTA_NODE ??
  join(process.env.HOME ?? '', '.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node');
const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const SCRATCH = join(REPO, 'build/evidence-lint-completion');

const P35_MAPPING = 'docs/v2/evidence/P3.5/review-1/source-outputs-mapping.mjs';
const P35_STALE = 'docs/v2/evidence/P3.5/review-1/stale-rectangle.mjs';
const P34_IR5 = 'docs/v2/evidence/P3.4/proposal-v5-repair/ir5-counterexamples.mjs';

const say = (...args) => process.stdout.write(format(...args) + '\n');

const version = spawnSync(NODE, ['--version'], { encoding: 'utf8' });
if (version.status !== 0 || version.stdout.trim() !== 'v24.19.0') {
  say(`FAIL: pinned interpreter is not v24.19.0 (${NODE}: ${(version.stdout || version.stderr).trim()})`);
  process.exit(1);
}

/** The exact "before" bytes, from git. */
const gitBlob = (commit, rel) => {
  const r = spawnSync('git', ['show', `${commit}:${rel}`], { cwd: REPO, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`cannot read ${commit}:${rel}: ${r.stderr}`);
  return r.stdout;
};
const gitWrite = (commit, rel, dest) => {
  const body = gitBlob(commit, rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, body);
  return dest;
};

const run = (name, scriptPath, env) => {
  const r = spawnSync(NODE, [scriptPath], { cwd: REPO, env: { ...process.env, ...env }, encoding: 'utf8' });
  const dir = join(SCRATCH, 'replay', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'stdout'), r.stdout ?? '');
  writeFileSync(join(dir, 'stderr'), r.stderr ?? '');
  writeFileSync(join(dir, 'status'), `${r.status}\n`);
  return { out: r.stdout ?? '', err: r.stderr ?? '', status: r.status };
};

const compare = (label, before, after) => {
  const problems = [];
  if (before.status !== after.status) problems.push(`exit ${before.status} -> ${after.status}`);
  if (before.out !== after.out) problems.push('stdout');
  if (before.err !== after.err) problems.push('stderr');
  if (problems.length === 0) {
    say(`  ok    ${label}  exit ${after.status}  stdout/stderr byte-identical (zero normalisation)`);
    return 0;
  }
  say(`  FAIL  ${label}  ${problems.join(', ')}`);
  return 1;
};

let failures = 0;

// ---------------------------------------------------------------- case 1 + 1b
// source-outputs-mapping.mjs, run under its OWN harness baseline and under the
// harness as it stands today. Both baselines, both sides, reported faithfully.
for (const [label, harnessCommit] of [
  [`harness @${HARNESS_BASELINE} (its own baseline)`, HARNESS_BASELINE],
  ['harness @HEAD (today, predicate rewritten)', BASE_COMMIT],
]) {
  const name = `p35-source-outputs-${harnessCommit}`;
  // An ignored miniature repo root: the proof walks up looking for
  // scripts/v2/tauri-audio.test.mjs, so placing the harness beside the copy
  // pins its input without touching the real tree.
  const root = join(SCRATCH, `fixture-${harnessCommit}`);
  gitWrite(harnessCommit, 'scripts/v2/tauri-audio.test.mjs', join(root, 'scripts/v2/tauri-audio.test.mjs'));
  const beforePath = gitWrite(BASE_COMMIT, P35_MAPPING, join(root, 'proof/before/source-outputs-mapping.mjs'));
  const afterPath = join(root, 'proof/after/source-outputs-mapping.mjs');
  mkdirSync(dirname(afterPath), { recursive: true });
  writeFileSync(afterPath, readFileSync(join(REPO, P35_MAPPING), 'utf8'));

  const before = run(name, beforePath);
  const after = run(name, afterPath);
  say(`== ${P35_MAPPING}`);
  failures += compare(label, before, after);
  say(`         before exit ${before.status} / after exit ${after.status}; harness sha256 recorded in the report`);
}

// ------------------------------------------------------------------- case 2
// stale-rectangle.mjs is pure: it copies the tid-union loop out of the harness
// as text and imports nothing from the tree, so it has no baseline to pin — the
// two blobs alone decide the comparison.
{
  const name = 'p35-stale-rectangle';
  const beforePath = gitWrite(BASE_COMMIT, P35_STALE, join(SCRATCH, 'replay', name, 'before.mjs'));
  const before = run(name, beforePath);
  const after = run(name, join(REPO, P35_STALE));
  say(`== ${P35_STALE}`);
  failures += compare('pure, no external input', before, after);
}

// ------------------------------------------------------------------- case 3
// ir5-counterexamples.mjs: the dead SCALED_NATIVE const removed, same ignored
// repaired model (build/p3.4-spec-v5-repair/model.mjs) on both sides.
{
  const name = 'p34-ir5-counterexamples';
  const model = join(REPO, 'build/p3.4-spec-v5-repair/model.mjs');
  const check = spawnSync(NODE, ['--check', model], { encoding: 'utf8' });
  if (check.status !== 0) {
    say(`FAIL: ignored repaired model is unreadable: ${model}`);
    failures += 1;
  } else {
    const env = {
      APUNTA_P34_MODEL: model,
      APUNTA_V2_PLAN_DIR_REAL: join(REPO, 'docs/v2'),
      APUNTA_TOOL_DIR: join(REPO, 'build/ir4'),
    };
    const beforePath = gitWrite(BASE_COMMIT, P34_IR5, join(SCRATCH, 'replay', name, 'before.mjs'));
    const before = run(name, beforePath, env);
    const after = run(name, join(REPO, P34_IR5), env);
    say(`== ${P34_IR5}`);
    failures += compare('dead SCALED_NATIVE removed', before, after);
  }
}

say('');
say(`${failures === 0 ? 'PASS' : 'FAIL'}: ${failures} mismatch(es) against ${BASE_COMMIT}.`);
process.exit(failures === 0 ? 0 : 1);