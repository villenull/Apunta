// P3.5 environment-proposal IR-3 — independent checks of candidate 408e1bb.
//
// This file is independent of the author's `repair2/ir2-01-checks.mjs`: it
// extracts the prepared step-0 command from the two `verify.mjs` sources with
// its own parser and runs it over its own synthetic branches, with a stricter
// `PATH` (the branch `bin` only, no `/usr/bin` leak). It also re-derives the
// proposal's step-0 clause and the two owner choices from the proposal text.
//
// process.stdout.write only (docs/v2/evidence is linted with `no-console` on).
// No app, server, build, database, model, audio, microphone, input, display,
// network, download, install or port 7717 is used. The only subprocesses are
// `bash` on the extracted snippets, `chmod` on scratch files, and the stub
// `gst-inspect-1.0` / `patchelf` shims written into git-ignored scratch.
import { readFileSync, mkdirSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const SCRATCH = 'build/p3.5-env-ir3/fakepath';
const REPAIRED = 'docs/v2/evidence/P3.5/environment-proposal-repair2/verify.mjs';
const PREPARED = 'docs/v2/evidence/P3.5/environment-proposal-repair/verify.mjs';
const PROPOSAL = 'docs/v2/state/P3.5-ENVIRONMENT-PROPOSAL.md';
const SCANNER = '/usr/lib/gstreamer-1.0/gst-plugin-scanner';
const ELEMENTS = ['appsink', 'autoaudiosrc', 'alsasrc', 'pulsesrc'];

const out = (line) => process.stdout.write(line + '\n');
let failures = 0;
const check = (label, ok, detail = '') => {
  out(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures += 1;
};

out(`node ${process.versions.node}`);

// ---------------------------------------------------------------------------
// 1. Extract the step-0 command from the prepared sources (not restated).
// ---------------------------------------------------------------------------
const extractStep0 = (source) => {
  const key = "'step 0 prereq read': `";
  const at = source.indexOf(key);
  if (at < 0) return '';
  const start = at + key.length;
  return source.slice(start, source.indexOf('`', start));
};

const repairedSource = readFileSync(REPAIRED, 'utf8');
const preparedSource = readFileSync(PREPARED, 'utf8');
const repaired = extractStep0(repairedSource);
const prepared = extractStep0(preparedSource);

check('repaired step-0 extracted from repair2/verify.mjs', repaired.length > 0);
check('prepared step-0 extracted from repair/verify.mjs', prepared.length > 0);
check(
  'prepared command was fail-open (`command -v patchelf || echo`)',
  prepared.includes('command -v patchelf || echo'),
);
check(
  'repaired command asserts patchelf with exit 1',
  repaired.includes('command -v patchelf >/dev/null 2>&1 || { echo "FAIL: patchelf absent"; exit 1; }'),
);
check(
  'repaired command asserts each element with exit 1',
  repaired.includes('gst-inspect-1.0 "$e" >/dev/null 2>&1 || { echo "FAIL: $e not visible"; exit 1; }'),
);
check('repaired command asserts scanner with test -x', repaired.includes(`test -x ${SCANNER} || {`));

// The scanner literal must occur exactly once so the branch substitution is a
// single-token swap and the rest runs byte-for-byte as prepared.
const occurrences = (text, needle) => text.split(needle).length - 1;
check('host scanner literal occurs exactly once in repaired command', occurrences(repaired, SCANNER) === 1);
check('host scanner literal occurs exactly once in prepared command', occurrences(prepared, SCANNER) === 1);

// Independent normalisation: strip the leading comment block (before `import {`)
// and the step-0 snippet, and require the remainder of the two files to match.
const normalise = (source) => {
  let body = source.slice(source.indexOf('import {'));
  const note = body.indexOf('// IR2-01: fail-closed.');
  if (note >= 0) body = body.slice(0, note) + body.slice(body.indexOf("'step 0 prereq read'", note));
  const at = body.indexOf("'step 0 prereq read': `");
  const start = body.indexOf('`', at) + 1;
  return body.slice(0, at) + "'step 0 prereq read': `SNIPPET`" + body.slice(body.indexOf('`', start));
};
check(
  'repair2/verify.mjs equals repair/verify.mjs outside the header comment and step-0 snippet',
  normalise(repairedSource) === normalise(preparedSource),
);

// ---------------------------------------------------------------------------
// 2. Synthetic branches, strict PATH = stub bin only.
// ---------------------------------------------------------------------------
const INSPECT_STUB = `#!/bin/sh
printf '%s\\n' "$1" >> "$GST_STUB_LOG"
case ",$GST_STUB_VISIBLE," in *",$1,"*) exit 0 ;; esac
exit 255
`;
const PATCHELF_STUB = '#!/bin/sh\nexit 0\n';

const branches = [
  { id: 'healthy', visible: ELEMENTS, patchelf: true, scanner: 0o755, zero: true },
  { id: 'patchelf-absent', visible: ELEMENTS, patchelf: false, scanner: 0o755, zero: false },
  ...ELEMENTS.map((element) => ({
    id: `${element}-absent`,
    visible: ELEMENTS.filter((e) => e !== element),
    patchelf: true,
    scanner: 0o755,
    zero: false,
  })),
  { id: 'scanner-absent', visible: ELEMENTS, patchelf: true, scanner: null, zero: false },
  { id: 'scanner-not-executable', visible: ELEMENTS, patchelf: true, scanner: 0o644, zero: false },
];
check('all eight branches are exercised', branches.length === 8, `${branches.length}`);

rmSync(SCRATCH, { recursive: true, force: true });
mkdirSync(SCRATCH, { recursive: true });

const makeSandbox = (branch) => {
  const dir = join(SCRATCH, branch.id);
  const bin = join(dir, 'bin');
  mkdirSync(bin, { recursive: true });
  const log = join(dir, 'gst-inspect.log');
  writeFileSync(log, '');
  writeFileSync(join(bin, 'gst-inspect-1.0'), INSPECT_STUB, { mode: 0o755 });
  if (branch.patchelf) writeFileSync(join(bin, 'patchelf'), PATCHELF_STUB, { mode: 0o755 });
  const scanner = join(dir, 'gst-plugin-scanner');
  if (branch.scanner !== null) {
    writeFileSync(scanner, '#!/bin/sh\nexit 0\n', { mode: branch.scanner });
    chmodSync(scanner, branch.scanner);
  }
  const env = {
    ...process.env,
    PATH: bin,
    GST_STUB_LOG: log,
    GST_STUB_VISIBLE: branch.visible.join(','),
  };
  return { env, log, scanner };
};

const run = (text, scannerPath, env) => {
  const input = text.replace(SCANNER, scannerPath);
  return spawnSync('/bin/bash', [], { input, encoding: 'utf8', env });
};

for (const branch of branches) {
  const { env, log, scanner } = makeSandbox(branch);
  const repairedRun = run(repaired, scanner, env);
  const calls = readFileSync(log, 'utf8').split('\n').filter(Boolean);
  writeFileSync(log, '');
  const preparedRun = run(prepared, scanner, env);
  out(`--- ${branch.id}: repaired exit=${repairedRun.status}, prepared exit=${preparedRun.status} ---`);

  if (branch.zero) {
    check(`[${branch.id}] repaired exits 0`, repairedRun.status === 0, `exit=${repairedRun.status}`);
    check(`[${branch.id}] repaired prints the PASS marker`, (repairedRun.stdout ?? '').includes('STEP-0 PASS'));
    check(
      `[${branch.id}] exactly four gst-inspect-1.0 calls, one per element, in order`,
      JSON.stringify(calls) === JSON.stringify(ELEMENTS),
      calls.join(' '),
    );
    check(`[${branch.id}] prepared also exits 0 on the healthy branch`, preparedRun.status === 0);
  } else {
    check(`[${branch.id}] repaired exits non-zero`, repairedRun.status !== 0, `exit=${repairedRun.status}`);
    const expected =
      branch.id === 'patchelf-absent'
        ? 'FAIL: patchelf absent'
        : branch.id === 'scanner-absent' || branch.id === 'scanner-not-executable'
          ? 'FAIL: scanner missing or not executable'
          : `FAIL: ${branch.id.replace('-absent', '')} not visible`;
    check(
      `[${branch.id}] the stopping failure names the missing prerequisite`,
      (repairedRun.stdout ?? '').includes(expected),
      expected,
    );
    if (branch.id === 'patchelf-absent') {
      check(
        `[${branch.id}] prepared printed FAIL: patchelf absent, ran on, and exited 0 (the defect)`,
        preparedRun.status === 0 &&
          (preparedRun.stdout ?? '').includes('FAIL: patchelf absent') &&
          ELEMENTS.every((e) => (preparedRun.stdout ?? '').includes(`OK ${e}`)),
      );
    } else if (branch.id === 'scanner-absent') {
      check(
        `[${branch.id}] prepared ran all four elements before its last test -f failed`,
        ELEMENTS.every((e) => (preparedRun.stdout ?? '').includes(`OK ${e}`)),
      );
    } else if (branch.id === 'scanner-not-executable') {
      check(
        `[${branch.id}] prepared exits 0 (test -f read a non-executable scanner as present)`,
        preparedRun.status === 0,
        `exit=${preparedRun.status}`,
      );
    } else {
      const missing = branch.id.replace('-absent', '');
      check(
        `[${branch.id}] prepared printed MISSING ${missing}, ran on, and exited 0 (the defect)`,
        preparedRun.status === 0 &&
          (preparedRun.stdout ?? '').includes(`MISSING ${missing}`) &&
          ELEMENTS.filter((e) => e !== missing).every((e) => (preparedRun.stdout ?? '').includes(`OK ${e}`)),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 3. The proposal: length, two choices, step-0 clause, no widened scope.
// ---------------------------------------------------------------------------
const proposal = readFileSync(PROPOSAL, 'utf8');
const lines = proposal.split('\n').length - (proposal.endsWith('\n') ? 1 : 0);
check('proposal is within 250 lines', lines <= 250, `${lines}`);
check('proposal holds exactly two recommended choices', (proposal.match(/\(Recommended\)/g) ?? []).length === 2);

const flat = proposal.replace(/\s+/g, ' ');
const s0 = flat.indexOf('0. **Prerequisite read');
const s1 = flat.indexOf('1. **One rebuild**');
const step0 = flat.slice(s0, s1);
check('proposal step 0 is found before step 1', s0 >= 0 && s1 > s0);
check('step 0 says the read is fail-closed', /fail-closed/.test(step0));
check('step 0 says it stops the run', /stops the run/.test(step0));
check('step 0 keeps the patchelf assertion', step0.includes('`command -v patchelf` exits 0'));
check('step 0 keeps four separate element reads', step0.includes('four separate `gst-inspect-1.0 appsink|autoaudiosrc|alsasrc|pulsesrc` each exit 0'));
check('step 0 keeps the scanner assertion', step0.includes('the scanner exists (`test -x`)'));
check('step 0 keeps the expected-now failure', step0.includes('Expected now') && /non-zero/.test(step0));
check('step 0 requires the same read re-run after the install', /after the install the same read/.test(step0));
check('step 0 requires exit 0 (PASS) before step 1', /must exit 0 \(PASS\) before step 1/.test(step0));
check('step 0 changes no duration or threshold', !/dictation|ffprobe|stream_loop|>10 s/.test(step0));

check('A03 names gst-plugins-base and gst-plugins-good and patchelf', proposal.includes('gst-plugins-base') && proposal.includes('gst-plugins-good') && proposal.includes('patchelf'));
check('A03 stays this-Arch-host-only', proposal.includes('on this Arch host only'));
check('A03 keeps Ubuntu archive via apt', proposal.includes('Ubuntu archive via `apt`'));
const a03Cell = proposal.match(/> Ubuntu archive via[\s\S]*?0\.19\.1-1\)\./);
check('A03 replacement cell is found', a03Cell !== null);
check(
  'A03 replacement cell has no INSTALL.md/archlinux.org citation',
  a03Cell !== null && !/INSTALL\.md|archlinux\.org/.test(a03Cell[0]),
);

const a10 = ['user_id', 'response-content-disposition', 'xip', 'X-Xet-Cas-Uid', 'Expires', 'Policy', 'Signature', 'Key-Pair-Id', 'Hash-Algorithm'];
check('A10 names all nine observed query keys', a10.every((name) => proposal.includes(name)));
check('A10 does not admit A07\'s tenth name', !proposal.includes('response-content-type'));
check('A10 names the redirect host', proposal.includes('us.aws.cdn.hf.co'));
check('A10 claims no redownload', /no redownload/i.test(proposal));
check('no owner question is raised (still preparation only)', /before any owner question/.test(proposal) && /preparation only/.test(proposal));
check('proposal points at the repair2 evidence', proposal.includes('environment-proposal-repair2/'));

out(failures === 0 ? 'ALL CHECKS PASS' : `${failures} CHECK(S) FAILED`);
process.exitCode = failures === 0 ? 0 : 1;
