// Negative controls for the two checks in this directory, so a reviewer does not
// have to take the green on trust.
//
//   1. replay: mutating one byte of the "after" blob (a verdict word) must make
//      the stdout comparison fail. The mutated copy is written under the ignored
//      build/ only; the real proof files are never touched.
//   2. dead-binding-verify: a synthetic file in which the same names ARE read
//      must be rejected, and one whose initialiser is impure must be rejected.
//
// Exits non-zero if a control fails to fail, i.e. if a check is vacuous.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'node:util';

const NODE =
  process.env.APUNTA_NODE ??
  join(process.env.HOME ?? '', '.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node');
const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const HERE = join(REPO, 'docs/v2/evidence/output-lint-completion');
const SCRATCH = join(REPO, 'build/evidence-lint-completion/control');
const P35_MAPPING = 'docs/v2/evidence/P3.5/review-1/source-outputs-mapping.mjs';
const HARNESS_BASELINE = '46419f5';

const say = (...args) => process.stdout.write(format(...args) + '\n');
let failures = 0;

// ------------------------------------------------------------------ control 1
// Same fixture layout as replay.mjs, but the "after" blob has one word changed.
{
  const name = 'control-replay';
  const root = join(SCRATCH, name);
  const harness = spawnSync('git', ['show', `${HARNESS_BASELINE}:scripts/v2/tauri-audio.test.mjs`], {
    cwd: REPO,
    encoding: 'utf8',
  });
  mkdirSync(join(root, 'scripts/v2'), { recursive: true });
  writeFileSync(join(root, 'scripts/v2/tauri-audio.test.mjs'), harness.stdout);

  const before = spawnSync('git', ['show', `39c6723:${P35_MAPPING}`], { cwd: REPO, encoding: 'utf8' }).stdout;
  const mutated = readFileSync(join(REPO, P35_MAPPING), 'utf8').replace('DEFECTIVE (defect reproduced)', 'SOUND (no defect)');
  if (mutated === readFileSync(join(REPO, P35_MAPPING), 'utf8')) {
    say('  FAIL  control could not be built: the verdict string was not found to mutate');
    failures += 1;
  } else {
    const bp = join(root, 'proof/before/source-outputs-mapping.mjs');
    const ap = join(root, 'proof/after/source-outputs-mapping.mjs');
    mkdirSync(dirname(bp), { recursive: true });
    mkdirSync(dirname(ap), { recursive: true });
    writeFileSync(bp, before);
    writeFileSync(ap, mutated);
    const run = (p) => spawnSync(NODE, [p], { cwd: REPO, encoding: 'utf8' });
    const b = run(bp);
    const a = run(ap);
    if (b.stdout === a.stdout) {
      say('  FAIL  control replay: mutated stdout still compares equal — the check is vacuous');
      failures += 1;
    } else {
      say(`  ok    control replay: one changed word in the after blob is caught (exit ${b.status} vs ${a.status}, stdout differs)`);
    }
  }
}

// ------------------------------------------------------------------ control 2
// The verifier is pointed at synthetic copies whose bindings are live / impure,
// via the same file:line targets it checks for real. It must reject both.
{
  const cases = [
    {
      label: 'binding is read elsewhere',
      expect: 'reference(s) outside the declarator',
      stub: "const SINK_NAME = 'apunta_p35';\nprocess.stdout.write(SINK_NAME + '\\n');\n",
    },
    {
      label: 'binding is read elsewhere (P3.4 target)',
      expect: 'reference(s) outside the declarator',
      stub: "const CLIENT_TARGET = { x: 700, y: 500 };\nconst SCALED_NATIVE = CLIENT_TARGET;\nprocess.stdout.write(JSON.stringify(SCALED_NATIVE) + '\\n');\n",
    },
    {
      label: 'initialiser is impure (P3.4 target)',
      expect: 'not provably pure',
      stub: "const CLIENT_TARGET = { x: 700, y: 500 };\nconst SCALED_NATIVE = { x: mutate(CLIENT_TARGET.x) };\nprocess.stdout.write('' + '\\n');\n",
    },
  ];

  const tmp = mkdtempSync(join(SCRATCH, 'verifier-'));
  mkdirSync(tmp, { recursive: true });
  const targets = [
    ['docs/v2/evidence/P3.5/review-1/source-outputs-mapping.mjs', 'SINK_NAME'],
    ['docs/v2/evidence/P3.4/proposal-v5-repair/ir5-counterexamples.mjs', 'SCALED_NATIVE'],
  ];

  for (const [i, c] of cases.entries()) {
    const [realRel] = targets[i === 0 ? 0 : 1];
    // A scratch tree mirroring the repository layout, so the verifier's own
    // REPO-relative paths resolve without the real files being edited. The
    // targeted file is the stub alone — the control exercises the verifier's
    // accept/reject logic, not the real proof — and its sibling is the real
    // current bytes, which the verifier is expected to find already cleared.
    const fakeRepo = join(tmp, `case${i}`);
    mkdirSync(fakeRepo, { recursive: true });
    for (const [j, [rel, name]] of targets.entries()) {
      const dest = join(fakeRepo, rel);
      mkdirSync(dirname(dest), { recursive: true });
      const targeted = rel === realRel;
      writeFileSync(dest, targeted ? c.stub : readFileSync(join(REPO, rel), 'utf8'));
      void name;
      void j;
    }
    // `absent` mode: the sibling must be cleared, while the targeted binding —
    // present, but live or impure — must still be rejected.
    const r = spawnSync(NODE, [join(HERE, 'dead-binding-verify.mjs'), 'absent'], {
      cwd: fakeRepo,
      encoding: 'utf8',
      env: { ...process.env, APUNTA_VERIFIER_ROOT: fakeRepo },
    });
    const combined = `${r.stdout}${r.stderr}`;
    if (r.status === 0 || !combined.includes(c.expect)) {
      say(`  FAIL  control verifier (${c.label}): expected a rejection containing "${c.expect}", got exit ${r.status}`);
      failures += 1;
    } else {
      say(`  ok    control verifier (${c.label}): rejected, exit ${r.status}, reported "${c.expect}"`);
    }
  }
}

say('');
say(`${failures === 0 ? 'PASS' : 'FAIL'}: ${failures} vacuous control(s).`);
process.exit(failures === 0 ? 0 : 1);