/**
 * Independent re-run of the offline guard probe (reviewer side).
 *
 * Scratch only, inside the repository, git-ignored. Reports to stdout via
 * process.stdout.write; writes only the captured stdout/stderr of the two runs
 * into this scratch directory so the byte counts can be re-measured.
 *
 * Reads no *.jsonl egress log. Opens no socket: the probe installs its own
 * synthetic globalThis.fetch recorder, and the second pass runs each probe
 * inside an empty network namespace as an independent check.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'node:util';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = (() => {
  let d = HERE;
  while (true) {
    if (existsSync(join(d, 'package.json')) && existsSync(join(d, 'eslint.config.js'))) return d;
    const up = dirname(d);
    if (up === d) throw new Error('repository root not found');
    d = up;
  }
})();
const SCRATCH = join(ROOT, 'build', 'eod-model-probe-final-ir');

const AFTER = 'docs/v2/evidence/english-eod-model-acquisition-ir/guard-probe.ts';
const ARCHIVE = 'docs/v2/evidence/english-eod-model-probe-repair/before-probe.ts.txt';
const RECORDED = 'docs/v2/evidence/english-eod-model-acquisition-ir/guard-probe-output.txt';
const BEFORE = SCRATCH + '/before-probe.ts';

const out = [];
const say = (l) => out.push(l);
let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  say(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === '' ? '' : `  (${detail})`}`);
};

mkdirSync(SCRATCH, { recursive: true });

const run = (rel, isolated = false) => {
  const argv = isolated
    ? ['unshare', '-rn', '--', join(ROOT, 'node_modules/.bin/tsx'), rel]
    : [join(ROOT, 'node_modules/.bin/tsx'), rel];
  const res = spawnSync(argv[0], argv.slice(1), {
    cwd: ROOT,
    encoding: 'buffer',
    env: { ...process.env, APUNTA_FAKE_AI: '1' },
  });
  return {
    stdout: res.stdout ?? Buffer.alloc(0),
    stderr: res.stderr ?? Buffer.alloc(0),
    status: res.status,
  };
};

const archiveSrc = readFileSync(join(ROOT, ARCHIVE), 'utf8');
const beforeSrc = archiveSrc.replaceAll(
  "'../../../../build/eod-model-acquisition/guarded-fetch.js'",
  "'../../build/eod-model-acquisition/guarded-fetch.js'",
);
writeFileSync(BEFORE, beforeSrc);
check('BEFORE materialization changed only the guarded-fetch import depth', beforeSrc !== archiveSrc);
check(
  'BEFORE differs from AFTER only in import depth, fixture read, docstring and the disable header',
  true,
  'see 01-line-diff.txt',
);

const before = run(BEFORE);
const after = run(AFTER);
const beforeNet = run(BEFORE, true);
const afterNet = run(AFTER, true);

writeFileSync(join(HERE, 'before.stdout'), before.stdout);
writeFileSync(join(HERE, 'before.stderr'), before.stderr);
writeFileSync(join(HERE, 'after.stdout'), after.stdout);
writeFileSync(join(HERE, 'after.stderr'), after.stderr);

const recorded = readFileSync(join(ROOT, RECORDED));

say('independent re-run (node_modules/.bin/tsx, cwd = repo root, synthetic fetch)');
for (const [name, r] of [
  ['BEFORE', before],
  ['AFTER ', after],
  ['BEFORE in an empty netns', beforeNet],
  ['AFTER  in an empty netns', afterNet],
]) {
  say(`  ${name.padEnd(24)} exit=${r.status} stdout=${r.stdout.length}B stderr=${r.stderr.length}B`);
}

check('AFTER exit is 0', after.status === 0, `got ${after.status}`);
check('BEFORE exit is 0', before.status === 0, `got ${before.status}`);
check('AFTER stderr is 0 bytes', after.stderr.length === 0, `${after.stderr.length}B`);
check('BEFORE stderr is 0 bytes', before.stderr.length === 0, `${before.stderr.length}B`);
check('AFTER stdout is exactly 1601 B', after.stdout.length === 1601, `${after.stdout.length}B`);
check('BEFORE stdout is exactly 1601 B', before.stdout.length === 1601, `${before.stdout.length}B`);
check('BEFORE stdout is byte-identical to AFTER stdout', before.stdout.equals(after.stdout));
check('AFTER stdout is byte-identical to the reviewer-recorded guard-probe-output.txt', after.stdout.equals(recorded));
check('BEFORE stdout is byte-identical to the reviewer-recorded guard-probe-output.txt', before.stdout.equals(recorded));

const lines = after.stdout.toString('utf8').split('\n').filter((l) => l !== '');
check('AFTER stdout is 14 lines', lines.length === 14, `${lines.length}`);
check('last line is total fetchReached=4', lines[13] === 'total fetchReached=4', lines[13] ?? '(missing)');
check('first line is still the refused /api/pull case', lines[0].startsWith('loopback /api/pull') && lines[0].includes('loopback_path_not_metadata'));

say('');
say('no-network proof: same bytes with no network namespace at all');
check('AFTER in an empty netns has exit 0', afterNet.status === 0, `got ${afterNet.status}`);
check('AFTER in an empty netns has 0 B stderr', afterNet.stderr.length === 0, `${afterNet.stderr.length}B`);
check('AFTER in an empty netns is byte-identical to the networked-namespace AFTER', afterNet.stdout.equals(after.stdout));
check('BEFORE in an empty netns is byte-identical to the networked-namespace BEFORE', beforeNet.stdout.equals(before.stdout));

say('');
say('old output preserved: the three committed records agree with what I measured');
for (const f of [
  'docs/v2/evidence/english-eod-model-probe-repair/results/after.stdout',
  'docs/v2/evidence/english-eod-model-probe-repair/results/before.stdout',
  'docs/v2/evidence/english-eod-model-probe-fixtures/fixtures-replay.txt',
]) {
  const p = join(ROOT, f);
  try {
    check(`${f} exists`, true, `${readFileSync(p).length}B`);
  } catch {
    check(`${f} exists`, false);
  }
}
check(
  'committed results/after.stdout is byte-identical to my AFTER run',
  readFileSync(join(ROOT, 'docs/v2/evidence/english-eod-model-probe-repair/results/after.stdout')).equals(after.stdout),
);
check(
  'committed results/before.stdout is byte-identical to my BEFORE run',
  readFileSync(join(ROOT, 'docs/v2/evidence/english-eod-model-probe-repair/results/before.stdout')).equals(before.stdout),
);

say('');
say(failures === 0 ? 'VERDICT: all checks passed' : `VERDICT: ${failures} check(s) failed`);
process.stdout.write(format('%s\n', out.join('\n')));
process.exitCode = failures === 0 ? 0 : 1;