/**
 * Fixture-extraction proof for the English EOD guard probe.
 *
 * The probe's 13 `[label, url]` cases moved out of executable source into
 * `guard-cases.json` so the seven non-loopback addresses stop tripping
 * `no-restricted-syntax` — with no rule override, suppression or config change.
 * This harness answers the two questions that repair has to answer:
 *
 *   1. Is the JSON fixture byte-for-byte the case table the reviewer ran? It
 *      reads the archived reviewer snapshot (`before-probe.ts.txt`, bytes
 *      preserved) and compares the pairs directly.
 *   2. Did the move change anything observable? It re-runs the probe and
 *      compares stdout, stderr and exit against the reviewer-recorded output,
 *      then checks the probe lints clean and the URL rule still fires on the
 *      archived source copy (so no exemption exists).
 *
 * It reads no `*.jsonl` egress log and writes only inside the repository:
 * `build/eod-model-probe-fixtures/` (git-ignored) and this directory.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'node:util';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..');
const SCRATCH = join(ROOT, 'build', 'eod-model-probe-fixtures');

const CASES = 'docs/v2/evidence/english-eod-model-acquisition-ir/guard-cases.json';
const PROBE = 'docs/v2/evidence/english-eod-model-acquisition-ir/guard-probe.ts';
const ARCHIVE = 'docs/v2/evidence/english-eod-model-probe-repair/before-probe.ts.txt';
const OUTPUT = 'docs/v2/evidence/english-eod-model-acquisition-ir/guard-probe-output.txt';

const out = [];
const say = (line) => out.push(line);
let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  say(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === '' ? '' : `  (${detail})`}`);
};

mkdirSync(SCRATCH, { recursive: true });
say(`root    ${ROOT}`);
say(`scratch build/eod-model-probe-fixtures (git-ignored, created before any write)`);
say('');

// ------------------------------------------------ fixture byte-exactness --
const json = JSON.parse(readFileSync(join(ROOT, CASES), 'utf8'));
const archiveSrc = readFileSync(join(ROOT, ARCHIVE), 'utf8');
/** Every `['label', 'url']` row in the archived reviewer probe. */
const archivePairs = [...archiveSrc.matchAll(/\['([^']*)', '([^']*)'\]/g)].map((m) => [m[1], m[2]]);

say('fixture extraction');
check('guard-cases.json is an array', Array.isArray(json));
check('guard-cases.json holds exactly 13 pairs', json.length === 13, `${json.length}`);
check('the archived case table holds exactly 13 pairs', archivePairs.length === 13, `${archivePairs.length}`);
check(
  'the fixture equals the archived case table byte for byte, same order',
  JSON.stringify(json) === JSON.stringify(archivePairs),
);
check(
  'every pair is two non-empty strings',
  json.every(
    (p) => Array.isArray(p) && p.length === 2 && typeof p[0] === 'string' && typeof p[1] === 'string' && p[0] !== '' && p[1] !== '',
  ),
);
const isLoopback = (url) => /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(?![\w.-])/.test(url);
const external = json.filter(([, url]) => !isLoopback(url));
check('all 7 external/malicious literals are preserved', external.length === 7, `${external.length}`);
check('all 6 loopback cases are preserved', json.length - external.length === 6, `${json.length - external.length}`);

// ------------------------------------------------------ source is URL-free --
const probeSrc = readFileSync(join(ROOT, PROBE), 'utf8');
say('');
say('source / rule scope');
check('the probe source names no http(s) URL at all', !/https?:\/\//.test(probeSrc));
check(
  'the case table is data, read from the sibling fixture',
  probeSrc.includes("'guard-cases.json'") && probeSrc.includes('readFileSync'),
);

/** ESLint findings for one file, as `{ ruleId: count }`. */
const lintFindings = (relPath, { noIgnore = false } = {}) => {
  const args = noIgnore ? ['eslint', '--no-ignore', '--format', 'json', relPath] : ['eslint', '--format', 'json', relPath];
  const res = spawnSync('npx', args, { cwd: ROOT, encoding: 'utf8' });
  const report = JSON.parse(res.stdout === '' ? '[]' : res.stdout);
  const counts = {};
  for (const message of report.flatMap((r) => r.messages)) counts[message.ruleId] = (counts[message.ruleId] ?? 0) + 1;
  return counts;
};

const probeLint = lintFindings(PROBE);
check('eslint is clean on the repaired probe', Object.keys(probeLint).length === 0, JSON.stringify(probeLint));

// A scratch copy of the archived case table, with its disable header removed,
// is executable source again: the rule must fire 7 times, proving nothing was
// exempted. The harness itself names no URL literal.
const ruleControl = readFileSync(join(ROOT, ARCHIVE), 'utf8').replace(/^\/\* eslint-disable[^\n]*\n/, '');
const ruleControlRel = 'build/eod-model-probe-fixtures/nc-rule-url-literal.ts';
writeFileSync(join(ROOT, ruleControlRel), ruleControl);
const ruleLint = lintFindings(ruleControlRel, { noIgnore: true });
check(
  'the URL rule still fires on the archived case table (no exemption)',
  (ruleLint['no-restricted-syntax'] ?? 0) === 7,
  JSON.stringify(ruleLint),
);
const configDiff = spawnSync('git', ['diff', '--exit-code', '--', 'eslint.config.js'], { cwd: ROOT, encoding: 'utf8' });
check('eslint.config.js is unchanged', configDiff.status === 0);

// -------------------------------------------------------- runtime replay --
say('');
say('runtime replay (synthetic fetch only, no sockets, tsx, cwd = repo root)');
const res = spawnSync('npx', ['tsx', PROBE], {
  cwd: ROOT,
  encoding: 'buffer',
  env: { ...process.env, APUNTA_FAKE_AI: '1' },
});
const stdout = res.stdout ?? Buffer.alloc(0);
const stderr = res.stderr ?? Buffer.alloc(0);
const expected = readFileSync(join(ROOT, OUTPUT));
writeFileSync(join(SCRATCH, 'probe.stdout'), stdout);
writeFileSync(join(SCRATCH, 'probe.stderr'), stderr);
say(`  exit=${res.status} stdout=${stdout.length}B stderr=${stderr.length}B`);
check('probe exit code is 0', res.status === 0, `got ${res.status}`);
check('probe stderr is empty', stderr.length === 0);
check('probe stdout equals the reviewer-recorded output byte for byte', stdout.equals(expected));
const lines = stdout.toString('utf8').split('\n').filter((l) => l !== '');
check('probe stdout is 13 case lines plus the total', lines.length === 14, `${lines.length} lines`);
check('probe stdout still ends total fetchReached=4', lines[13] === 'total fetchReached=4', lines[13] ?? '(missing)');

say('');
say('egress jsonl content: never opened, copied or printed');
say('files outside the repository: none created, read, modified or deleted');
say('');
say(failures === 0 ? 'VERDICT: all checks passed' : `VERDICT: ${failures} check(s) failed`);

process.stdout.write(format('%s\n', out.join('\n')));
writeFileSync(join(HERE, 'fixtures-replay.txt'), format('%s\n', out.join('\n')));
process.exitCode = failures === 0 ? 0 : 1;
