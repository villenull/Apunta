/**
 * Independent control set for the offline guard probe (reviewer side).
 *
 * Scratch only, git-ignored, inside the repository. Nothing here trusts the
 * authors' harnesses: the fixture is re-derived from the reviewer-recorded
 * output, and every control is applied to my own scratch copies.
 *
 * Reads no *.jsonl egress log. Opens no socket (synthetic fetch recorder, and
 * one pass additionally inside an empty network namespace).
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
const TSX = join(ROOT, 'node_modules/.bin/tsx');

const PROBE_DIR = 'docs/v2/evidence/english-eod-model-acquisition-ir';
const PROBE = `${PROBE_DIR}/guard-probe.ts`;
const CASES = `${PROBE_DIR}/guard-cases.json`;
const RECORDED = `${PROBE_DIR}/guard-probe-output.txt`;
const ARCHIVE = 'docs/v2/evidence/english-eod-model-probe-repair/before-probe.ts.txt';
const COMMITTED_PROBE_COMMIT = 'e7889bc';

const out = [];
const say = (l) => out.push(l);
let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  say(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === '' ? '' : `  (${detail})`}`);
};

const run = (rel) => {
  const res = spawnSync(TSX, [rel], { cwd: ROOT, encoding: 'buffer', env: { ...process.env, APUNTA_FAKE_AI: '1' } });
  return { stdout: res.stdout ?? Buffer.alloc(0), stderr: res.stderr ?? Buffer.alloc(0), status: res.status };
};

/** A scratch probe whose guarded-fetch import depth fits the scratch location. */
const adaptedProbe = () =>
  readFileSync(join(ROOT, PROBE), 'utf8').replaceAll(
    "'../../../../build/eod-model-acquisition/guarded-fetch.js'",
    "'../../../build/eod-model-acquisition/guarded-fetch.js'",
  );

const mk = (name) => {
  const dir = join(SCRATCH, name);
  mkdirSync(dir, { recursive: true });
  return dir;
};

const casesSrc = readFileSync(join(ROOT, CASES), 'utf8');
const probeSrc = readFileSync(join(ROOT, PROBE), 'utf8');
const recorded = readFileSync(join(ROOT, RECORDED)).toString('utf8');
const recordedLines = recorded.split('\n').filter((l) => l !== '');
const base = run(PROBE);

// ---------------------------------------- fixture fidelity, re-derived ---
// Deliberately NOT from before-probe.ts.txt: this re-derives the case table from
// the reviewer-recorded output, which is the only pre-repair witness in-repo.
say('fixture fidelity re-derived from guard-probe-output.txt (not from the archive)');
const json = JSON.parse(casesSrc);
check('the fixture holds 13 pairs', json.length === 13, `${json.length}`);
const pad = (s, n) => s.padEnd(n);
let labelOrderOk = true;
let refusedUrlOk = true;
let decisionOk = true;
for (const [i, [label, url]] of json.entries()) {
  const line = recordedLines[i] ?? '';
  if (!line.startsWith(`${pad(label, 26)} -> `)) labelOrderOk = false;
  const allowed = line.includes('-> ALLOWED');
  const refused = /-> REFUSED \(refused \(([^)]*)\): (.*)\) fetchReached=/.exec(line);
  if (refused) {
    // safeUrl() drops user-info and the fragment, and the adapter redacts every
    // query value; mirror that to compare like with like.
    const shown = url.replace(/^([^:]+:\/\/)[^@/]*@/, '$1').split('#')[0].replace(url.split('?')[1] ? '?' + url.split('?')[1] : '$', url.includes('?') ? '?<redacted>' : '$');
    if (refused[2] !== shown) refusedUrlOk = false;
    if (allowed) decisionOk = false;
  } else if (!allowed) {
    decisionOk = false;
  }
  // the fixture's own decision must be re-derivable: 4 allowed, 9 refused
}
check('all 13 labels appear in the recorded output, in fixture order', labelOrderOk);
check('every refused case shows exactly the fixture URL (query redacted by the adapter)', refusedUrlOk);
check('every recorded line is ALLOWED or REFUSED, never both', decisionOk);
check('the recorded output has exactly 4 ALLOWED cases', recordedLines.filter((l) => l.includes('-> ALLOWED')).length === 4, `${recordedLines.filter((l) => l.includes('-> ALLOWED')).length}`);
check('the recorded output has exactly 9 REFUSED cases', recordedLines.filter((l) => l.includes('-> REFUSED')).length === 9);
check('fixture external (non-loopback) rows: 7', json.filter(([, u]) => !/^https?:\/\/(127\.0\.0\.1|localhost)/.test(u)).length === 7);
check('fixture loopback rows: 6', json.filter(([, u]) => /^https?:\/\/(127\.0\.0\.1|localhost)/.test(u)).length === 6);

// --------------------------------------------------------- NC1 channel ---
say('');
say('NC-A channel: stdout -> stderr, nothing else');
mk('nc-a');
const ncASrc = adaptedProbe();
check('NC-A mutation applied to the channel', ncASrc.replaceAll('process.stdout.write(', 'process.stderr.write(') !== ncASrc);
writeFileSync((SCRATCH + '/nc-a/probe.ts'), ncASrc.replaceAll('process.stdout.write(', 'process.stderr.write('));
writeFileSync((SCRATCH + '/nc-a/guard-cases.json'), casesSrc);
const ncARes = run(SCRATCH + '/nc-a/probe.ts');
check('NC-A stdout is 0 bytes', ncARes.stdout.length === 0, `${ncARes.stdout.length}B`);
check('NC-A stderr is byte-identical to the baseline stdout', ncARes.stderr.equals(base.stdout));
check('NC-A exit is still 0', ncARes.status === 0);

// ---------------------------------------------------------- NC-B data -----
// Flip one address in the DATA fixture only. The probe source is byte-identical
// to the committed one, so if the output moves, the decisions came from data.
say('');
say('NC-B data: one refused address flipped in the fixture, probe source untouched');
mk('nc-b');
const ncBSrc = adaptedProbe();
writeFileSync((SCRATCH + '/nc-b/probe.ts'), ncBSrc);
const flipped = casesSrc.replace('"http://127.0.0.1:11434/api/pull"', '"http://127.0.0.1:11434/api/tags"');
check('the fixture mutation applied', flipped !== casesSrc);
writeFileSync((SCRATCH + '/nc-b/guard-cases.json'), flipped);
const ncBRes = run(SCRATCH + '/nc-b/probe.ts');
const ncBLines = ncBRes.stdout.toString('utf8').split('\n').filter((l) => l !== '');
check('NC-B probe source is byte-identical to the committed probe (modulo import depth)', ncBSrc === adaptedProbe());
check('NC-B stdout differs from the baseline', !ncBRes.stdout.equals(base.stdout));
check('NC-B is 1581 bytes', ncBRes.stdout.length === 1581, `${ncBRes.stdout.length}B`);
check('NC-B still has 14 lines', ncBLines.length === 14, `${ncBLines.length}`);
check('NC-B first case is now ALLOWED', (ncBLines[0] ?? '').includes('ALLOWED'), ncBLines[0] ?? '(missing)');
check('NC-B total moves from 4 to 5', ncBLines[13] === 'total fetchReached=5', ncBLines[13] ?? '(missing)');
check('NC-B stderr is still empty and exit 0', ncBRes.stderr.length === 0 && ncBRes.status === 0);
// restore the scratch fixture so nothing stale is left behind
writeFileSync((SCRATCH + '/nc-b/guard-cases.json'), casesSrc);
const ncBRestored = run(SCRATCH + '/nc-b/probe.ts');
check('restoring the fixture restores the baseline bytes exactly', ncBRestored.stdout.equals(base.stdout));

// --------------------------------------------- NC-C fail-closed fixture ---
say('');
say('NC-C fail-closed: a fixture of the wrong shape must stop the probe');
for (const [name, body, expectPartial] of [
  ['empty-array', '[]', false],
  ['one-string-row', '["http://127.0.0.1:11434/api/tags"]', false],
  ['short-pair', '[["only a label"]]', false],
  ['non-string-url', '[["label", 42]]', false],
  ['not-an-array', '{"label":"url"}', false],
]) {
  mk(`nc-c-${name}`);
  writeFileSync(`${SCRATCH}/nc-c-${name}/probe.ts`, adaptedProbe());
  writeFileSync(`${SCRATCH}/nc-c-${name}/guard-cases.json`, body);
  const r = run(`${SCRATCH}/nc-c-${name}/probe.ts`);
  const outText = r.stdout.toString('utf8');
  check(`NC-C ${name}: non-zero exit`, r.status !== 0, `exit=${r.status}`);
  check(
    `NC-C ${name}: no case line is printed`,
    expectPartial ? true : !outText.includes('fetchReached='),
    `${outText.length}B stdout`,
  );
}
{
  mk('nc-c-malformed');
  writeFileSync((SCRATCH + '/nc-c-malformed/probe.ts'), adaptedProbe());
  writeFileSync((SCRATCH + '/nc-c-malformed/guard-cases.json'), '{ not json');
  const r = run(SCRATCH + '/nc-c-malformed/probe.ts');
  check('NC-C malformed JSON: non-zero exit', r.status !== 0, `exit=${r.status}`);
  check('NC-C malformed JSON: no case line is printed', !r.stdout.toString('utf8').includes('fetchReached='));
}
{
  mk('nc-c-missing');
  writeFileSync((SCRATCH + '/nc-c-missing/probe.ts'), adaptedProbe());
  const r = run(SCRATCH + '/nc-c-missing/probe.ts');
  check('NC-C missing fixture: non-zero exit', r.status !== 0, `exit=${r.status}`);
  check('NC-C missing fixture: no case line is printed', !r.stdout.toString('utf8').includes('fetchReached='));
}

// ------------------------------------------------------- NC-D lint rule ---
say('');
say('NC-D rule scope: the URL rule still fires on the archived case table');
const lint = (rel, noIgnore) => {
  const args = noIgnore ? ['--no-ignore', '--format', 'json', rel] : ['--format', 'json', rel];
  const res = spawnSync(join(ROOT, 'node_modules/.bin/eslint'), args, { cwd: ROOT, encoding: 'utf8' });
  const report = JSON.parse(res.stdout === '' ? '[]' : res.stdout);
  const counts = {};
  for (const m of report.flatMap((r) => r.messages)) counts[m.ruleId] = (counts[m.ruleId] ?? 0) + 1;
  return counts;
};
const archiveSrc = readFileSync(join(ROOT, ARCHIVE), 'utf8');
const stripped = archiveSrc.replace(/^\/\* eslint-disable[^\n]*\n/, '');
check('the archive does carry an eslint-disable header', stripped !== archiveSrc);
const ncD = SCRATCH + '/nc-d-archive-as-source.ts';
writeFileSync(ncD, stripped);
const strippedLint = lint(ncD, true);
check('archived case table as executable source: 7 no-restricted-syntax', (strippedLint['no-restricted-syntax'] ?? 0) === 7, JSON.stringify(strippedLint));
check('with the header, the same file reports 0', (lint(ncD, false)['no-restricted-syntax'] ?? 0) === 0 || (() => {
  writeFileSync(ncD, archiveSrc);
  const r = lint(ncD, true);
  return (r['no-restricted-syntax'] ?? 0) === 0;
})());
writeFileSync(ncD, archiveSrc);
check('the archive with its own disable header reports 0 no-restricted-syntax', (lint(ncD, true)['no-restricted-syntax'] ?? 0) === 0);
check('NC-D is stable on a second lint of the same file', (() => {
  writeFileSync(ncD, stripped);
  return (lint(ncD, true)['no-restricted-syntax'] ?? 0) === 7;
})());
const probeLint = lint(PROBE, false);
check('the committed probe lints completely clean', Object.keys(probeLint).length === 0, JSON.stringify(probeLint));
check('the probe source contains no http(s) URL literal', !/https?:\/\//.test(probeSrc));
check('the probe source contains no console call', !/\bconsole\.[a-z]+\(/.test(probeSrc));
const cfg = spawnSync('git', ['diff', '--exit-code', 'e7889bc~1', 'e7889bc', '--', 'eslint.config.js'], { cwd: ROOT, encoding: 'utf8' });
check('eslint.config.js unchanged across the repair commits', cfg.status === 0);
const ignoredDir = spawnSync('git', ['check-ignore', '-v', 'build/eod-model-probe-repair/guard-probe-egress.jsonl'], { cwd: ROOT, encoding: 'utf8' });
check('the probe scratch log path is git-ignored', ignoredDir.status === 0, ignoredDir.stdout.trim());
check('the probe names no path outside the repo for its log', /^const log = 'build\//m.test(probeSrc));
const HARNESSES = [
  'docs/v2/evidence/english-eod-model-probe-repair/replay.mjs',
  'docs/v2/evidence/english-eod-model-probe-fixtures/fixtures-replay.mjs',
];
const pathLiterals = (f) =>
  [...readFileSync(join(ROOT, f), 'utf8').matchAll(/'([^'\n]*)'/g)]
    .map((m) => m[1])
    .filter((s) => s.includes('/') || s.startsWith('.'))
    .filter((s) => s.startsWith('/') || s.startsWith('..') || s.includes('/tmp/') || s.includes('/etc/'));
const outside = HARNESSES.flatMap(pathLiterals).filter(
  (l) => l !== '/tmp/opencode' && !/^(\.\.\/)+build\//.test(l) && !/^\.\.?$/.test(l) && !/[(){}`'"|?[\]=$]/.test(l) && l !== '/',
);
say(`  harness literals that look like a path outside the repo: ${outside.length === 0 ? 'none' : outside.join(', ')}`);
say(`  '/tmp/opencode' appears only as the never-executed static marker: ${/const OUTSIDE_MARKER = '\/tmp\/opencode'/.test(readFileSync(join(ROOT, HARNESSES[0]), 'utf8'))}`);
check('neither harness reads or writes an absolute or parent-relative path', outside.length === 0);
check("the one absolute literal is the static OUTSIDE_MARKER, used only by the predicate that never executes it", /const OUTSIDE_MARKER = '\/tmp\/opencode'/.test(readFileSync(join(ROOT, HARNESSES[0]), 'utf8')) && !/run\(.*OUTSIDE_MARKER/.test(readFileSync(join(ROOT, HARNESSES[0]), 'utf8')));
check('neither harness reads, copies or prints a *.jsonl', HARNESSES.every((f) => !/readFileSync\([^)]*jsonl/.test(readFileSync(join(ROOT, f), 'utf8'))));
check('neither harness deletes anything', HARNESSES.every((f) => !/\b(rm|rmSync|unlink|unlinkSync|rmdirSync|truncate)\b/.test(readFileSync(join(ROOT, f), 'utf8'))));
check('neither harness spawns a network-capable command other than git, npx tsx and eslint', HARNESSES.every((f) => {
  const src = readFileSync(join(ROOT, f), 'utf8');
  return [...src.matchAll(/spawnSync\(\s*'([^']+)'/g)].every((m) => ['git', 'npx'].includes(m[1]));
}));

// ------------------------------------------- repair claim: output-only ------
say('');
say('the repair claim: console.log(x) === process.stdout.write(format("%s\\n", x))');
mk('fmt');
writeFileSync(
  (SCRATCH + '/fmt/fmt.ts'),
  [
    "import { format } from 'node:util';",
    'const payloads = [',
    "  'plain line',",
    "  'a line with %s and %d inside',",
    "  'https://host/x?a=1&b=%20space',",
    "  'percent 100% and %j and %o',",
    "  'ends with a percent %',",
    "  'a real case: https://127.0.0.1:11434/api/tags?token=secret',",
    '];',
    'for (const p of payloads) {',
    "  console.log(p);",
    `  process.stdout.write(format('%s\\n', p));`,
    '}',
  ].join('\n'),
);
const fmtRes = run(SCRATCH + '/fmt/fmt.ts');
const fmtLines = fmtRes.stdout.toString('utf8').split('\n');
const pairs = [];
for (let i = 0; i < fmtLines.length - 1; i += 2) pairs.push(fmtLines[i] === fmtLines[i + 1]);
check('console.log(x) and process.stdout.write(format("%s\\n", x)) emit identical bytes, % payloads included', pairs.every(Boolean) && fmtRes.status === 0 && pairs.length === 6, `${pairs.filter(Boolean).length}/${pairs.length} identical`);
check("format(x) omits the newline console.log adds; format('%s\\n', x) is what makes the bytes match", (() => {
  writeFileSync(
    (SCRATCH + '/fmt/bare.ts'),
    ["import { format } from 'node:util';", "const line = 'plain %s and %d';", "process.stdout.write(format(line));", "process.stdout.write(format('%s\\n', line));"].join('\n'),
  );
  const r = run(SCRATCH + '/fmt/bare.ts');
  const l = r.stdout.toString('utf8').split('\n');
  return l.length === 2 && l[1] === '' && l[0] === 'plain %s and %dplain %s and %d';
})());

// ------------------------------------------------------------- hygiene ----
say('');
say('hygiene');
check('the probe scratch egress log exists (existence only, content never read)', existsSync(join(ROOT, 'build/eod-model-probe-repair/guard-probe-egress.jsonl')));
const tracked = spawnSync('git', ['ls-files', '--error-unmatch', 'build/eod-model-probe-repair/guard-probe-egress.jsonl'], { cwd: ROOT, encoding: 'utf8' });
check('the scratch egress log is not tracked by git', tracked.status !== 0);
check('no acquisition egress log is tracked', (() => {
  const res = spawnSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
  return res.stdout.split('\n').filter((l) => /egress/i.test(l) && /\.jsonl$|\.ndjson$|^build\//.test(l)).length === 0;
})());
const cfgDiffNow = spawnSync('git', ['status', '--porcelain', '--', 'docs/v2/evidence/english-eod-model-acquisition-ir', 'docs/v2/evidence/english-eod-model-probe-repair', 'docs/v2/evidence/english-eod-model-probe-fixtures', 'eslint.config.js', 'installer'], { cwd: ROOT, encoding: 'utf8' });
check('no tracked artifact of this repair is modified in the working tree', cfgDiffNow.stdout.trim() === '', cfgDiffNow.stdout.trim() || 'clean');
check('the probe commit is an ancestor of HEAD', (() => {
  const res = spawnSync('git', ['merge-base', '--is-ancestor', COMMITTED_PROBE_COMMIT, 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  return res.status === 0;
})());

say('');
say(failures === 0 ? 'VERDICT: all checks passed' : `VERDICT: ${failures} check(s) failed`);
say(`head ${spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim()}`);
process.stdout.write(format('%s\n', out.join('\n')));
process.exitCode = failures === 0 ? 0 : 1;