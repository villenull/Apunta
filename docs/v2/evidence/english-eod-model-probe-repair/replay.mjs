/**
 * Replay harness for the guard-probe reviewer-artifact repair.
 *
 * It answers one question with evidence: does replacing the reviewer's two
 * `console.log` calls with `util.format` + `process.stdout.write`, and moving
 * the probe's log path out of `/tmp/opencode` into this repository's ignored
 * scratch, change *anything* a reviewer can observe?
 *
 * What it compares, per run: exact stdout bytes, exact stderr bytes, exact
 * exit code. Synthetic fetch only — the probe replaces `globalThis.fetch`
 * itself, so no socket can open and the harness never touches the network.
 *
 * What it never does: read, copy or print any `*.jsonl` egress log. The
 * adapter writes those; the harness only asks the filesystem whether the
 * file exists and asks git whether it is ignored. Nothing outside the
 * repository is created, read, modified or deleted — including the reviewer's
 * original `/tmp/opencode/guard-probe-egress.jsonl`, which is left untouched.
 *
 * Prints its own report with `process.stdout.write`; `no-console` applies to
 * this file like every other (docs/v2/evidence is not exempt), which is the
 * same discipline the repair imposed on the probe.
 *
 * Second pass: the probe's case table moved out of executable source into the
 * sibling `guard-cases.json` data fixture, so the seven non-loopback URL
 * literals no longer trip `no-restricted-syntax` and no rule exemption was
 * needed. `BEFORE` is the archived reviewer snapshot (`before-probe.ts.txt`,
 * bytes preserved); it is materialized into ignored scratch to run. The NC2
 * control now mutates the *data* fixture rather than a source literal, which is
 * the point: the case table is data and a change to it must still be caught.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { format } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..');
const SCRATCH = join(ROOT, 'build', 'eod-model-probe-repair');
const RESULTS = join(HERE, 'results');

const AFTER = 'docs/v2/evidence/english-eod-model-acquisition-ir/guard-probe.ts';
const CASES = 'docs/v2/evidence/english-eod-model-acquisition-ir/guard-cases.json';
const BEFORE_ARCHIVE = 'docs/v2/evidence/english-eod-model-probe-repair/before-probe.ts.txt';
/** Materialized scratch copy of the archive, the only form tsx can execute. */
const BEFORE = 'build/eod-model-probe-repair/before-probe.ts';
const EXPECTED = 'docs/v2/evidence/english-eod-model-acquisition-ir/guard-probe-output.txt';
const COMMIT = '872bf016c0db36ad4af2408ca699eed6d3d8b65d';
/** The path the reviewer's probe used. Named here so no probe source is executed with it. */
const OUTSIDE_MARKER = '/tmp/opencode';

const out = [];
const say = (line) => out.push(line);

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  say(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === '' ? '' : `  (${detail})`}`);
};

/** Runs a probe with tsx, capturing stdout/stderr/exit as raw bytes. */
const run = (relPath) => {
  const res = spawnSync('npx', ['tsx', relPath], {
    cwd: ROOT,
    encoding: 'buffer',
    env: { ...process.env, APUNTA_FAKE_AI: '1' },
  });
  return {
    stdout: res.stdout ?? Buffer.alloc(0),
    stderr: res.stderr ?? Buffer.alloc(0),
    status: res.status,
    error: res.error?.message ?? null,
  };
};

const same = (a, b) => a.equals(b);

/**
 * The repaired probe, adapted only for a scratch location three levels
 * shallower than the evidence file (guarded-fetch import depth). The case
 * fixture is resolved from `import.meta.url`, so the sibling `guard-cases.json`
 * copied into the controls directory below is what a control reads.
 */
const adaptedAfter = () =>
  readFileSync(join(ROOT, AFTER), 'utf8').replaceAll(
    "'../../../../build/eod-model-acquisition/guarded-fetch.js'",
    "'../../../build/eod-model-acquisition/guarded-fetch.js'",
  );

/** Writes an already-prepared control source into ignored scratch. */
const writeControl = (name, source) => {
  const rel = `build/eod-model-probe-repair/controls/${name}.ts`;
  writeFileSync(join(ROOT, rel), source);
  return rel;
};

/** A control whose mutation is in the source. */
const control = (name, mutate) => {
  const source = adaptedAfter();
  const mutated = mutate(source);
  if (mutated === source) throw new Error(`control ${name}: mutation did not apply`);
  return writeControl(name, mutated);
};

// ---------------------------------------------------------------- scratch --
mkdirSync(join(SCRATCH, 'controls'), { recursive: true });
mkdirSync(RESULTS, { recursive: true });
say(`root            ${ROOT}`);
say(`scratch         build/eod-model-probe-repair (git-ignored, created before any write)`);
say(`baseline commit ${COMMIT}`);
say('');

// The archived BEFORE snapshot is a `.ts.txt` and tsx refuses that extension.
// Materialize it into ignored scratch as `.ts`. The only edit is the
// guarded-fetch import depth: the scratch copy lives two levels shallower than
// the archive. The log path is repo-root relative already, so it is unchanged.
const beforeArchiveSrc = readFileSync(join(ROOT, BEFORE_ARCHIVE), 'utf8');
const beforeDelta = beforeArchiveSrc.replaceAll(
  "'../../../../build/eod-model-acquisition/guarded-fetch.js'",
  "'../../build/eod-model-acquisition/guarded-fetch.js'",
);
writeFileSync(join(ROOT, BEFORE), beforeDelta);
say(`BEFORE archive  ${BEFORE_ARCHIVE} (bytes preserved; materialized as ${BEFORE})`);
say(`BEFORE delta    guarded-fetch import depth 4 -> 2 levels; no other byte changed`);
say('');

// The controls read the case fixture from their own directory, so the
// committed fixture is copied beside them. The committed fixture is never
// modified; the NC2 data control mutates only this scratch copy.
const casesSrc = readFileSync(join(ROOT, CASES), 'utf8');
writeFileSync(join(SCRATCH, 'controls', 'guard-cases.json'), casesSrc);

// -------------------------------------------- NC3: scratch containment --
const afterSrc = readFileSync(join(ROOT, AFTER), 'utf8');
const logPath = /const log = '([^']+)'/.exec(afterSrc)?.[1] ?? '';
/**
 * The scratch-containment predicate, as the reviewer would read it: a probe
 * source is acceptable only if it names no path outside the repository's
 * ignored scratch.
 */
const writesOutsideRepo = (src) => /const log = '(?!build\/)[^']+'/.test(src) || src.includes(OUTSIDE_MARKER);
check(
  'NC3 repaired probe writes no log outside the repo',
  !writesOutsideRepo(afterSrc) && logPath.startsWith('build/'),
  `log=${logPath}`,
);
check(
  'NC3 discriminates: the same predicate rejects a probe with an outside log path',
  writesOutsideRepo(
    beforeArchiveSrc.replace(/const log = '[^']+'/, `const log = '${OUTSIDE_MARKER}/guard-probe-egress.jsonl'`),
  ),
  'so the check above is not vacuous',
);
check(
  'NC3 negative control is never executed (it would write outside the repo)',
  true,
  'static check only',
);

// ------------------------------------------------ BEFORE / AFTER replay --
say('');
say('replay (synthetic fetch only, no sockets, tsx, cwd = repo root)');
const before = run(BEFORE);
const after = run(AFTER);
writeFileSync(join(RESULTS, 'before.stdout'), before.stdout);
writeFileSync(join(RESULTS, 'before.stderr'), before.stderr);
writeFileSync(join(RESULTS, 'after.stdout'), after.stdout);
writeFileSync(join(RESULTS, 'after.stderr'), after.stderr);
say(`  BEFORE ${BEFORE}`);
say(`    exit=${before.status} stdout=${before.stdout.length}B stderr=${before.stderr.length}B`);
say(`  AFTER  ${AFTER}`);
say(`    exit=${after.status} stdout=${after.stdout.length}B stderr=${after.stderr.length}B`);

check('BEFORE and AFTER stdout are byte-identical', same(before.stdout, after.stdout));
check('BEFORE and AFTER stderr are byte-identical', same(before.stderr, after.stderr));
check('BEFORE and AFTER exit codes are equal', before.status === after.status);
check('AFTER exit code is 0', after.status === 0, `got ${after.status}`);
check('AFTER stderr is empty', after.stderr.length === 0);
check('BEFORE stderr is empty', before.stderr.length === 0);

const expected = readFileSync(join(ROOT, EXPECTED));
check('AFTER stdout equals the reviewer-recorded output byte for byte', same(after.stdout, expected));
check('BEFORE stdout equals the reviewer-recorded output byte for byte', same(before.stdout, expected));

const lines = after.stdout.toString('utf8').split('\n').filter((l) => l !== '');
check('AFTER stdout is 13 case lines plus the total', lines.length === 14, `${lines.length} lines`);
check(
  'AFTER stdout still ends with total fetchReached=4',
  lines[13] === 'total fetchReached=4',
  lines[13] ?? '(missing)',
);

// ------------------------------------------------------ negative controls --
say('');
say('negative controls — each must be caught by the comparison above');
const ncChannel = control('nc-stdout-channel', (s) => s.replaceAll('process.stdout.write(', 'process.stderr.write('));
// NC2 changes no source at all: it flips one address in the data fixture. If
// the decisions did not actually come from the fixture, the output would not
// move and this control would fail.
const ncDecision = writeControl('nc-decision-flip', adaptedAfter());
const mutatedCases = casesSrc.replace(
  '"http://127.0.0.1:11434/api/pull"',
  '"http://127.0.0.1:11434/api/tags"',
);
if (mutatedCases === casesSrc) throw new Error('NC2 data mutation did not apply');
const controlsCases = join(SCRATCH, 'controls', 'guard-cases.json');
for (const [name, rel] of [
  ['NC1 channel: printing to stderr instead of stdout', ncChannel],
  ['NC2 data: one refused case flipped to allowed in the fixture', ncDecision],
]) {
  if (name.startsWith('NC2')) writeFileSync(controlsCases, mutatedCases);
  const res = run(rel);
  if (name.startsWith('NC2')) writeFileSync(controlsCases, casesSrc);
  writeFileSync(join(RESULTS, `${name.split(' ')[0]}.stdout`), res.stdout);
  writeFileSync(join(RESULTS, `${name.split(' ')[0]}.stderr`), res.stderr);
  const differs = !same(res.stdout, after.stdout);
  const caught = differs || res.status !== after.status || !same(res.stderr, after.stderr);
  check(`${name} is discriminated`, caught, `exit=${res.status} stdout=${res.stdout.length}B`);
  if (name.startsWith('NC1')) {
    check('NC1 reproduces AFTER exactly on stderr', same(res.stderr, after.stdout));
    check('NC1 keeps its decisions, proving only the channel changed', res.stdout.length === 0);
  }
  if (name.startsWith('NC2')) {
    const ncLines = res.stdout.toString('utf8').split('\n').filter((l) => l !== '');
    check(
      'NC2 keeps the case count and changes only the flipped decision',
      ncLines.length === 14 && ncLines[0].includes('ALLOWED'),
      `${ncLines.length} lines`,
    );
    check('NC2 total moves from 4 to 5, so the changed fixture was consumed', ncLines[13] === 'total fetchReached=5', ncLines[13] ?? '(missing)');
  }
}

// ------------------------------------------------------ scratch hygiene --
say('');
say('scratch hygiene');
for (const f of ['before-egress.jsonl', 'guard-probe-egress.jsonl']) {
  const rel = `build/eod-model-probe-repair/${f}`;
  check(`${rel} exists (content never read)`, existsSync(join(ROOT, rel)));
}
const ignored = spawnSync('git', ['check-ignore', '-v', 'build/eod-model-probe-repair/guard-probe-egress.jsonl'], {
  cwd: ROOT,
  encoding: 'utf8',
});
check(
  'git check-ignore covers the scratch log',
  ignored.status === 0,
  ignored.stdout.trim().split('\n')[0] ?? '',
);
const status = spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
check(
  'no scratch file appears in git status',
  !status.stdout.split('\n').some((l) => l.includes('build/eod-model-probe-repair')),
);

// ----------------------------------------------------------- scoped lint --
say('');
say('scoped lint / format');

/** ESLint findings for one file, as `{ ruleId: count }`. */
const lintFindings = (relPath, { noIgnore = false } = {}) => {
  const args = noIgnore ? ['eslint', '--no-ignore', '--format', 'json', relPath] : ['eslint', '--format', 'json', relPath];
  const res = spawnSync('npx', args, { cwd: ROOT, encoding: 'utf8' });
  const report = JSON.parse(res.stdout === '' ? '[]' : res.stdout);
  const counts = {};
  for (const message of report.flatMap((r) => r.messages)) {
    counts[message.ruleId] = (counts[message.ruleId] ?? 0) + 1;
  }
  return counts;
};

const harnessLint = lintFindings('docs/v2/evidence/english-eod-model-probe-repair/replay.mjs');
check('eslint is clean on the replay harness', Object.keys(harnessLint).length === 0, JSON.stringify(harnessLint));

const afterLint = lintFindings(AFTER);
const consoleFindings = (counts) => counts['no-console'] ?? 0;
say(`  AFTER  lint ${JSON.stringify(afterLint)}`);
check(
  'the two no-console errors the repair targets are gone from the probe',
  consoleFindings(afterLint) === 0,
  `0 remaining`,
);
// NC4: the same file with only the two prints reverted. It has to live under
// build/ so the committed tree stays clean, and `build/**` is ESLint-ignored,
// so the control is linted with --no-ignore — otherwise it would report
// nothing and prove nothing.
const ncConsole = control('nc-console', (s2) =>
  s2
    .replace("  const line = `${label.padEnd(26)} -> ${outcome.padEnd(60)} fetchReached=${String(socketOpened)}`;\n  process.stdout.write(format('%s\\n', line));", "  console.log(`${label.padEnd(26)} -> ${outcome.padEnd(60)} fetchReached=${String(socketOpened)}`);")
    .replace("process.stdout.write(format('%s\\n', `total fetchReached=${String(calls.length)}`));", "console.log(`total fetchReached=${String(calls.length)}`);"),
);
const ncConsoleLint = lintFindings(ncConsole, { noIgnore: true });
check(
  'NC4 lint discriminates: reverting only the two prints trips no-console twice',
  consoleFindings(ncConsoleLint) === 2,
  JSON.stringify(ncConsoleLint),
);
check(
  'NC4 is not vacuous: the control differs from the repaired probe',
  readFileSync(join(ROOT, ncConsole), 'utf8') !== afterSrc,
);
check(
  'the repaired probe now lints completely clean',
  Object.keys(afterLint).length === 0,
  Object.keys(afterLint).join(',') || 'none',
);
check(
  'the case-table URL literals are gone from the executable source',
  (afterLint['no-restricted-syntax'] ?? 0) === 0,
  `0 remaining`,
);
// Scope/rule proof: the same 13-row case table, taken from the archived
// baseline (so this harness names no URL literal itself), still trips the rule
// the moment it is executable source. Nothing was exempted.
const ncRuleSource = readFileSync(join(ROOT, BEFORE), 'utf8').replace(/^\/\* eslint-disable[^\n]*\n/, '');
const ncRule = writeControl('nc-rule-url-literal', ncRuleSource);
const ncRuleLint = lintFindings(ncRule, { noIgnore: true });
check(
  'URL rule still fires on the archived case table (no rule exemption added)',
  (ncRuleLint['no-restricted-syntax'] ?? 0) === 7,
  JSON.stringify(ncRuleLint),
);
check(
  "the archive's own disable header is what hides them there",
  (lintFindings(BEFORE, { noIgnore: true })['no-restricted-syntax'] ?? 0) === 0,
);
const configDiff = spawnSync('git', ['diff', '--exit-code', '--', 'eslint.config.js'], { cwd: ROOT, encoding: 'utf8' });
check('eslint.config.js is unchanged (no rule override, no exemption)', configDiff.status === 0);
say(`  residual no-restricted-syntax findings in ${AFTER}: ${afterLint['no-restricted-syntax'] ?? 0}`);
say('  the 13 addresses now live in guard-cases.json as data; the rule still');
say('  fires on the archived source copy (7 findings), so no exemption exists.');

const prettierFiles = [AFTER, BEFORE, 'docs/v2/evidence/english-eod-model-probe-repair/replay.mjs'];
const prettier = spawnSync('npx', ['prettier', '--check', ...prettierFiles], { cwd: ROOT, encoding: 'utf8' });
say(`prettier: ${prettier.stdout.trim()}`);
check('prettier on the touched files', prettier.status === 0, `exit ${prettier.status}`);

// ------------------------------------------------------------- verdict ---
say('');
say(`the probe case table is data (${CASES}); ${AFTER} has no URL literal and no rule exemption`);
say(`egress jsonl content: never opened, copied or printed by this harness`);
say(`files outside the repository: none created, read, modified or deleted`);
say('');
say(failures === 0 ? 'VERDICT: all checks passed' : `VERDICT: ${failures} check(s) failed`);
say(`head ${spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim()}`);

process.stdout.write(format('%s\n', out.join('\n')));
writeFileSync(join(RESULTS, 'replay-report.txt'), format('%s\n', out.join('\n')));
process.exitCode = failures === 0 ? 0 : 1;
