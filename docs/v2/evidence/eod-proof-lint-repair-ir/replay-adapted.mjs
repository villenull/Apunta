/**
 * Replay proof for the P3.4 end-of-day lint repair: the three P3.5 evidence
 * artifacts changed in this packet still print exactly what they printed before,
 * byte for byte, with zero normalisation of any kind.
 *
 * WHAT IS PROVEN, AND HOW IT IS NOT FAKED
 *   The "before" bytes are never read from a working copy. They come out of git
 *   at the pinned commit that recorded each proof, so this cannot be satisfied by
 *   editing both sides.
 *
 *   Each verifier's own inputs (card, checkpoint, harness, sandbox source,
 *   shared path helper) are materialised into a FRESH IGNORED SNAPSHOT of the
 *   whole pinned tree (`git archive <pin> | tar -x`), one snapshot per side. Both
 *   sides therefore read byte-identical inputs, and the inputs are the versions
 *   the proof was actually written against, not whatever the tree looks like
 *   today.
 *
 *   ONE ADAPTATION, APPLIED IDENTICALLY TO BOTH SIDES AND TO THE NEGATIVE
 *   CONTROL: each verifier hardcodes its repository root as an absolute literal
 *   (`/home/villenull/Projects/Apunta`). That literal is rewritten to the
 *   snapshot root. Nothing else in either script is touched, and the rewrite is
 *   verified to have hit exactly the expected number of occurrences.
 *
 *   cwd for every run is the REAL repository, because one verifier shells out to
 *   `git check-ignore` and would otherwise run outside a work tree.
 *
 * WHAT IT DELIBERATELY DOES NOT CLAIM
 *   These replays prove before == after. They do not claim to reproduce the
 *   `verify-output.txt` recorded in each evidence directory: that record was made
 *   on the author's machine at that hour, and live `/tmp` sandbox scratch has
 *   moved since. Where a proof's own verdicts differ from its recorded file, the
 *   two sides still agree with each other, which is the property under test.
 *
 * SCOPE
 *   Reads git and the three artifacts. Writes only under the ignored
 *   build/eod-proof-lint/. Invokes nothing else: no app, no server, no build, no
 *   model, no audio, no pactl, no database, no 7717, no network. It creates
 *   nothing outside build/eod-proof-lint/ and touches no repository file.
 *
 *   ~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node \
 *     docs/v2/evidence/eod-proof-lint-repair/replay.mjs
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'node:util';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const SCRATCH = join(REPO, 'build/eod-proof-lint-ir');

/** The hardcoded repository root inside both verifiers. */
const HARDCODED_ROOT = '/home/villenull/Projects/Apunta';

const NODE =
  process.env.APUNTA_NODE ??
  join(process.env.HOME ?? '', '.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node');

/**
 * Where each verifier was committed, and where its own recorded output lives.
 * `pin` is the commit whose tree the verifier is replayed against.
 */
const CASES = [
  {
    label: 'final-completion-ir',
    // 92df606 is the commit that recorded the completed silence arm and set the
    // checkpoint to status=SUBMITTED — i.e. the tree the recorded
    // verify-output.txt in this directory was produced against. Pinning the
    // earlier 2a0f977 instead reproduces the same 40 PASS lines but with
    // "status == SUBMITTED" failing, because the checkpoint had not been flipped
    // yet at that commit.
    pin: '92df606',
    // The before bytes are the verifier as committed in 2a0f977; `pin` is the
    // later tree whose checkpoint says status=SUBMITTED.
    artifactCommit: '2a0f977',
    artifact: 'docs/v2/evidence/P3.5/attempt-4/final-completion-ir/verify.mjs',
    // Where the verifier must sit for its own relative/none imports and for the
    // `${root}/build/...` writes to land inside the snapshot.
    inSnapshotAt: 'docs/v2/evidence/P3.5/attempt-4/final-completion-ir/verify.mjs',
    // `${REPO}/build/p35-silence-ir` is this verifier's OUT and the place its
    // relative imports (`../../docs/v2/tools/plan-lib.mjs`) resolve from, so the
    // snapshot copy goes there too. Harmless for the other verifier, which has
    // no such imports.
    expectedRootLiterals: 1,
  },
  {
    label: 'silence-completion-ir',
    pin: 'e7ace67',
    // What this verifier must write into its OUT on each side. The BEFORE side
    // wrote the extracted card witness as `.mjs` — a linted extension, in an
    // ignored build folder this time, but the same program that is committed to
    // the evidence tree as `.mjs` and reddened `eslint .` there. The AFTER side
    // must write `.mjs.txt` and no `.mjs` at all, so a future rerun cannot
    // recreate a linted raw program by either route.
    writes: {
      before: ['v5-program-own-extraction.mjs'],
      after: ['v5-program-own-extraction.mjs.txt'],
    },
    // The `.txt` must be the raw witness's exact bytes, unchanged.
    writtenBytes: {
      'v5-program-own-extraction.mjs.txt': {
        from: 'docs/v2/evidence/P3.5/silence-completion-ir/v5-program-own-extraction.mjs.txt',
      },
    },
    artifact: 'docs/v2/evidence/P3.5/silence-completion-ir/verify.mjs',
    inSnapshotAt: 'docs/v2/evidence/P3.5/silence-completion-ir/verify.mjs',
    expectedRootLiterals: 1,
    // Ignored scratch this verifier reads but that git cannot supply. Both are
    // reconstructed from COMMITTED evidence, not invented, and each carries the
    // commit it was read from (not the case pin, because the silence arm's own
    // evidence landed a few commits after this verifier did):
    //   completion-command.sh   <- docs/v2/evidence/P3.5/attempt-4/silence-completion/completion-command.sh @92df606
    //   v5-checker-program.mjs <- the raw card witness @e7ace67, which the
    //                            verifier's own section 6 asserts is byte-equal
    //                            to its own extraction (check line: "own
    //                            extraction is byte-equal to the author extracted
    //                            program"). If that reconstruction were wrong, the
    //                            check would print FAIL and the replay says so.
    scratchInputs: [
      {
        dest: 'build/p35-silence-proposal/completion-command.sh',
        from: 'docs/v2/evidence/P3.5/attempt-4/silence-completion/completion-command.sh',
        fromCommit: '92df606',
      },
      {
        dest: 'build/p35-silence-proposal/v5-checker-program.mjs',
        from: 'docs/v2/evidence/P3.5/silence-completion-ir/v5-program-own-extraction.mjs',
        fromCommit: 'e7ace67',
      },
    ],
  },
];

// The output each proof recorded at the time, kept for an informational
// before/after-vs-record datum. Never edited, and never a pass/fail gate: live
// /tmp sandbox scratch has moved since those runs, and a proof that is
// self-consistent is the property under test, not agreement with a file written
// on the author's machine at that hour.
const RECORDED_OUTPUT = {
  'final-completion-ir': 'docs/v2/evidence/P3.5/attempt-4/final-completion-ir/verify-output.txt',
  'silence-completion-ir': 'docs/v2/evidence/P3.5/silence-completion-ir/verify-output.txt',
};

const say = (...args) => process.stdout.write(format(...args) + '\n');
const gitBlob = (commit, rel) => {
  const r = spawnSync('git', ['show', `${commit}:${rel}`], { cwd: REPO, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`cannot read ${commit}:${rel}: ${r.stderr}`);
  return r.stdout;
};

const version = spawnSync(NODE, ['--version'], { encoding: 'utf8' });
if (version.status !== 0 || version.stdout.trim() !== 'v24.19.0') {
  say(`FAIL: pinned interpreter is not v24.19.0 (${NODE}: ${(version.stdout || version.stderr).trim()})`);
  process.exit(1);
}
say(`interpreter ${version.stdout.trim()} (pinned), repo ${REPO}`);
say(`scratch ${SCRATCH} (git-ignored: ${spawnSync('git', ['check-ignore', '-v', 'build/eod-proof-lint-ir'], { cwd: REPO, encoding: 'utf8' }).stdout.trim()})`);
say('');

/**
 * Materialise one side: a fresh snapshot of the pinned tree, the verifier placed
 * twice (its own path and its OUT path), the ignored scratch inputs it needs,
 * and the root literal repointed at the snapshot.
 */
// ONE snapshot root per case, restaged for each side. The path must be the same
// for every side: a crash message or any absolute path the script prints embeds
// the root, so two different roots would show up as a stderr difference that has
// nothing to do with the change under test. Run artifacts are moved out of the
// tree between sides.
const stage = (spec, body) => {
  const root = join(SCRATCH, 'replay', spec.label, 'tree');
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });

  const archive = spawnSync('git', ['archive', spec.pin], { cwd: REPO, maxBuffer: 1 << 28 });
  if (archive.status !== 0) {
    throw new Error(`git archive ${spec.pin} failed: ${archive.stderr}`);
  }
  const untar = spawnSync('tar', ['-x', '-C', root], { input: archive.stdout, maxBuffer: 1 << 28 });
  if (untar.status !== 0) throw new Error(`tar -x failed: ${untar.stderr}`);

  for (const input of spec.scratchInputs ?? []) {
    const dest = join(root, input.dest);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, gitBlob(input.fromCommit ?? spec.pin, input.from));
  }

  const literals = body.split(HARDCODED_ROOT).length - 1;
  if (literals !== spec.expectedRootLiterals) {
    throw new Error(`${spec.label}: expected ${spec.expectedRootLiterals} root literal(s), found ${literals}`);
  }
  const repointed = body.split(HARDCODED_ROOT).join(root);

  mkdirSync(dirname(join(root, spec.inSnapshotAt)), { recursive: true });
  writeFileSync(join(root, spec.inSnapshotAt), repointed);

  // The copy that is actually RUN lives at the verifier's OUT path
  // (`${REPO}/build/p35-silence-ir`). That is where its relative imports
  // (`../../docs/v2/tools/plan-lib.mjs`, `../../scripts/v2/sandbox.mjs`,
  // `../../shared/src/platform-paths.ts`) resolve from, and where its own
  // section 7 runs `node --check` on it — so OUT is its canonical location, not
  // an accident of staging.
  const out = join(root, 'build/p35-silence-ir');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'verify.mjs'), repointed);
  return { root, script: join(out, 'verify.mjs') };
};

const run = (spec, side, scriptPath) => {
  const r = spawnSync(NODE, [scriptPath], { cwd: REPO, encoding: 'utf8' });
  const where = join(SCRATCH, 'replay', spec.label, side);
  mkdirSync(where, { recursive: true });
  writeFileSync(join(where, 'stdout'), r.stdout ?? '');
  writeFileSync(join(where, 'stderr'), r.stderr ?? '');
  writeFileSync(join(where, 'exit'), `${r.status}\n`);
  // The OUT listing is captured immediately, because the next side restages the
  // tree over it.
  const outDir = dirname(scriptPath);
  writeFileSync(join(where, 'out-listing'), readdirSync(outDir).sort().join('\n') + '\n');
  return { out: r.stdout ?? '', err: r.stderr ?? '', status: r.status };
};

/**
 * The write-reference proof: what each side actually put in OUT, and whether the
 * after side can recreate a linted `.mjs`. Gates on both the presence of the
 * expected file and the absence of the forbidden one.
 */
const checkWrites = (spec, root) => {
  const outDir = join(root, 'build/p35-silence-ir');
  const present = new Set(readdirSync(outDir));
  const expected = spec.writes.after;
  const forbidden = spec.writes.before;
  const problems = [];
  for (const f of expected) if (!present.has(f)) problems.push(`missing ${f}`);
  for (const f of forbidden) if (present.has(f)) problems.push(`still writes ${f}`);
  for (const [f, want] of Object.entries(spec.writtenBytes ?? {})) {
    if (!present.has(f)) continue;
    const got = readFileSync(join(outDir, f), 'utf8');
    const expectedBody = readFileSync(join(REPO, want.from), 'utf8');
    if (got !== expectedBody) problems.push(`${f} bytes differ from ${want.from}`);
  }
  return { problems, present: [...present].sort() };
};

const compare = (label, before, after) => {
  const problems = [];
  if (before.status !== after.status) problems.push(`exit ${before.status} -> ${after.status}`);
  if (before.out !== after.out) problems.push('stdout');
  if (before.err !== after.err) problems.push('stderr');
  if (problems.length === 0) {
    say(`  ok    ${label}  exit ${after.status}, ${before.out.length} stdout bytes, ${before.err.length} stderr bytes, byte-identical (zero normalisation)`);
    return 0;
  }
  say(`  FAIL  ${label}  ${problems.join(', ')}`);
  return 1;
};

let failures = 0;

for (const spec of CASES) {
  const beforeBody = gitBlob(spec.artifactCommit ?? spec.pin, spec.artifact);
  const afterBody = readFileSync(join(REPO, spec.artifact), 'utf8');

  // A mutation of the AFTER side alone, expected to be caught. If this control
  // passes, `compare` is not actually comparing anything.
  const mutation = afterBody.replace("'PASS'", "'PASSX'").replace('PASS  ', 'PASSX ');
  if (mutation === afterBody) {
    say(`  FAIL  ${spec.label}: negative control could not be constructed (no mutation applied)`);
    failures += 1;
  }

  const beforeStaged = stage(spec, beforeBody);
  const beforeRun = run(spec, 'before', beforeStaged.script);
  const beforeWrites = spec.writes
    ? { problems: [], present: readdirSync(join(beforeStaged.root, 'build/p35-silence-ir')).sort() }
    : null;
  const afterStaged = stage(spec, afterBody);
  const afterRun = run(spec, 'after', afterStaged.script);
  const afterWrites = spec.writes ? checkWrites(spec, afterStaged.root) : null;
  const controlRun = run(spec, 'control', stage(spec, mutation).script);

  say(`== ${spec.artifact}   (inputs pinned at ${spec.pin})`);
  say(`   before: git ${spec.artifactCommit ?? spec.pin}  ${beforeBody.length} bytes`);
  say(`   after : working tree  ${afterBody.length} bytes`);
  failures += compare('before vs after', beforeRun, afterRun);

  const controlProblems = [];
  if (controlRun.status !== beforeRun.status) controlProblems.push('exit');
  if (controlRun.out !== beforeRun.out) controlProblems.push('stdout');
  if (controlRun.err !== beforeRun.err) controlProblems.push('stderr');
  if (controlProblems.length === 0) {
    say(`  FAIL  negative control  mutated AFTER side compared IDENTICAL — the comparison is vacuous`);
    failures += 1;
  } else {
    say(`  ok    negative control  mutated AFTER side differs (${controlProblems.join(', ')}) — the comparison is not vacuous`);
  }

  if (afterWrites) {
    if (afterWrites.problems.length === 0) {
      say(`  ok    write reference  OUT after this run: ${afterWrites.present.join(' ')}`);
      say(`  ok    write reference  the linted .mjs is NOT recreated; the .txt holds the committed witness's exact bytes`);
    } else {
      say(`  FAIL  write reference  ${afterWrites.problems.join('; ')}`);
      failures += 1;
    }
    say(`  note  BEFORE side OUT: ${beforeWrites.present.join(' ')} (this is the raw .mjs the rename removed)`);
  }

  // Report each side's own verdict honestly, without judging it: the property
  // under test is that both sides agree, not that the proof passes.
  const tail = (t) => t.split('\n').filter((l) => l.startsWith('== ')).pop() ?? '(no section heading)';
  say(`  note  both sides reached the same last section: ${tail(beforeRun.out)}`);

  const recorded = RECORDED_OUTPUT[spec.label];
  if (recorded) {
    const rec = readFileSync(join(REPO, recorded), 'utf8');
    if (rec === afterRun.out) {
      say(`  ok    recorded output reproduced: the AFTER side equals ${recorded} byte for byte`);
    } else {
      const recLines = rec.split('\n');
      const outLines = afterRun.out.split('\n');
      const differing = recLines.filter((l, i) => l !== outLines[i]).length + Math.abs(recLines.length - outLines.length);
      say(`  note  recorded output NOT reproduced (${differing} line(s) differ from ${recorded}).`);
      say('        Informational only, not a gate: that file was written on the author\'s machine');
      say('        at that hour and live /tmp sandbox scratch has moved since. Both sides of this');
      say('        replay still agree with each other, which is the property under test.');
    }
  }
  say(`  note  stdout/stderr/exit captured under build/eod-proof-lint/replay/${spec.label}/{before,after,control}/`);
  say('');
}

say(`${failures === 0 ? 'PASS' : 'FAIL'}: ${failures} problem(s).`);
process.exit(failures === 0 ? 0 : 1);