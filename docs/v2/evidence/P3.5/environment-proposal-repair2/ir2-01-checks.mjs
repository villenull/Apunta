// P3.5 environment-proposal IR2-01 — fail-closed proof for the step-0
// prerequisite read.
//
// The finding is that the prepared step-0 command was fail-open
// (`command -v … || echo …`, `… && echo … || echo …`): its status was always 0,
// so a missing `patchelf` or a missing GStreamer element printed a failure and
// the run continued to step 1 (the build). This file proves the repair on
// synthetic branches, without touching a real prerequisite.
//
// process.stdout.write only: docs/v2/evidence is linted with `no-console` on.
// No app, server, build toolchain, database, model, audio, microphone, input,
// display, network, download, install or port 7717 is used. The only
// subprocesses are `bash` parsing/running the extracted snippet, `chmod` on a
// scratch file, and the stub `gst-inspect-1.0` / `patchelf` shims this file
// writes into git-ignored scratch. Every write lands under
// `build/p3.5-env-repair2/`; nothing tracked is written or modified.
import { readFileSync, mkdirSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const PINNED_NODE_DIR = '/home/villenull/.local/share/apunta-node/node-v24.19.0-linux-x64/bin';
const SCRATCH = 'build/p3.5-env-repair2/fakepath';
const REPAIRED = 'docs/v2/evidence/P3.5/environment-proposal-repair2/verify.mjs';
const PREPARED = 'docs/v2/evidence/P3.5/environment-proposal-repair/verify.mjs';
const PROPOSAL = 'docs/v2/state/P3.5-ENVIRONMENT-PROPOSAL.md';

const ELEMENTS = ['appsink', 'autoaudiosrc', 'alsasrc', 'pulsesrc'];
const SCANNER_LITERAL = '/usr/lib/gstreamer-1.0/gst-plugin-scanner';

const out = (line) => process.stdout.write(line + '\n');
let failures = 0;
const check = (label, ok, detail = '') => {
  out(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures += 1;
};
const record = (label, detail) => out(`     ${label}: ${detail}`);

out(`node ${process.versions.node}`);

// ---------------------------------------------------------------------------
// 1. The command under test is extracted from the prepared source, not restated
//    here: the text between the backticks of the `step 0 prereq read` key. The
//    same extraction is run against the first family's file, which is read-only
//    and byte-identical to what the author prepared.
// ---------------------------------------------------------------------------
const extract = (source) => {
  const key = "'step 0 prereq read': `";
  const at = source.indexOf(key);
  if (at < 0) return '';
  const start = at + key.length;
  return source.slice(start, source.indexOf('`', start));
};

const repairedSource = readFileSync(REPAIRED, 'utf8');
const preparedSource = readFileSync(PREPARED, 'utf8');
const repaired = extract(repairedSource);
const prepared = extract(preparedSource);
check('repaired step-0 snippet extracted from repair2/verify.mjs', repaired.length > 0);
check('prepared step-0 snippet extracted from repair/verify.mjs', prepared.length > 0);

const syntax = (text, label) => {
  const r = spawnSync('bash', ['-n'], { input: text, encoding: 'utf8' });
  check(`bash -n ${label}`, r.status === 0, r.status === 0 ? 'exit 0' : (r.stderr ?? '').trim());
};
syntax(repaired, 'repaired step-0 snippet');
syntax(prepared, 'prepared step-0 snippet');

// The two files differ only in the header comment this family adds and in the
// step-0 snippet with its note; assert that, so this proof cannot silently pass
// against a differently repaired command.
const withoutStep0 = (source) => {
  let body = source.slice(source.indexOf('import {'));
  const note = body.indexOf('// IR2-01: fail-closed.');
  if (note >= 0) {
    body = `${body.slice(0, note).trimEnd()}\n${body.slice(body.indexOf("\n  'step 0 prereq read'") + 1)}`;
  }
  const at = body.indexOf("'step 0 prereq read': `");
  const start = body.indexOf('`', at) + 1;
  return body.slice(0, at) + "'step 0 prereq read': `SNIPPET`" + body.slice(body.indexOf('`', start));
};
check(
  'repair2/verify.mjs differs from repair/verify.mjs only in the header note and the step-0 snippet',
  withoutStep0(repairedSource) === withoutStep0(preparedSource),
);

check(
  'repaired snippet asserts patchelf with exit 1',
  repaired.includes('command -v patchelf >/dev/null 2>&1 || { echo "FAIL: patchelf absent"; exit 1; }'),
);
check(
  'repaired snippet asserts each element with exit 1',
  repaired.includes('gst-inspect-1.0 "$e" >/dev/null 2>&1 || { echo "FAIL: $e not visible"; exit 1; }'),
);
check(
  'repaired snippet asserts the scanner executable with exit 1',
  repaired.includes(`test -x ${SCANNER_LITERAL} || {`),
);
check('prepared snippet was fail-open (recorded, not repaired here)', prepared.includes('command -v patchelf || echo'));

// ---------------------------------------------------------------------------
// 2. The proposal's step-0 clause. Read out of the proposal, not restated.
// ---------------------------------------------------------------------------
const proposal = readFileSync(PROPOSAL, 'utf8');
const proposalFlat = proposal.replace(/\s+/g, ' ');
const step0At = proposalFlat.indexOf('0. **Prerequisite read');
const step1At = proposalFlat.indexOf('1. **One rebuild**');
check('proposal step 0 found', step0At >= 0 && step1At > step0At);
const step0 = proposalFlat.slice(step0At, step1At);
check('proposal step 0 says the read is fail-closed', /fail-closed/.test(step0));
check('proposal step 0 says it stops at the first failure', /stops (the run|at the first failure)/.test(step0));
check('proposal step 0 keeps the patchelf assertion', step0.includes('`command -v patchelf` exits 0'));
check(
  'proposal step 0 keeps the four separate element reads',
  step0.includes('four separate `gst-inspect-1.0 appsink|autoaudiosrc|alsasrc|pulsesrc` each exit 0'),
);
check('proposal step 0 keeps "the scanner exists"', step0.includes('the scanner exists'));
check(
  'proposal step 0 keeps the expected-now failure',
  step0.includes('Expected now') && step0.includes('patchelf') && /non-zero/.test(step0),
);
check(
  'proposal step 0 requires the same read re-run after the install',
  /after the install the same read/.test(step0),
);
check('proposal step 0 requires exit 0 (PASS) before step 1', /must exit 0.*before step 1/.test(step0));
check('proposal has no duration, threshold or acceptance edit', !/dictation|ffprobe|stream_loop|>10 s/.test(step0));
check('proposal still holds exactly two owner choices', (proposal.match(/\(Recommended\)/g) ?? []).length === 2);
check('proposal points at the repair2 evidence', proposal.includes('environment-proposal-repair2/'));
check('proposal stays within 250 lines', proposal.split('\n').length - (proposal.endsWith('\n') ? 1 : 0) <= 250);

// ---------------------------------------------------------------------------
// 3. Synthetic branches. Each branch is a fresh scratch `PATH` holding stub
//    `gst-inspect-1.0` and `patchelf` shims, plus one fake scanner file. The
//    only edit to the extracted command is the absolute host scanner path,
//    replaced by the branch's fake path — asserted to be exactly one
//    occurrence, so the rest of the command runs byte-for-byte as prepared.
// ---------------------------------------------------------------------------
const scannerIn = (text, label) => {
  const count = text.split(SCANNER_LITERAL).length - 1;
  check(`${label}: host scanner path occurs exactly once`, count === 1, `${count} occurrence(s)`);
  return text.replace(SCANNER_LITERAL, '<SCANNER>');
};
const repairedTemplated = scannerIn(repaired, 'repaired');
const preparedTemplated = scannerIn(prepared, 'prepared');

const INSPECT_STUB = `#!/bin/sh
printf '%s\\n' "$1" >> "$GST_STUB_LOG"
case ",$GST_STUB_VISIBLE," in *",$1,"*) exit 0 ;; esac
exit 255
`;
const PATCHELF_STUB = '#!/bin/sh\nexit 0\n';

const branches = [
  { id: 'healthy', visible: ELEMENTS, patchelf: true, scanner: 0o755, expectZero: true },
  { id: 'patchelf-absent', visible: ELEMENTS, patchelf: false, scanner: 0o755, expectZero: false },
  ...ELEMENTS.map((element) => ({
    id: `${element}-absent`,
    visible: ELEMENTS.filter((e) => e !== element),
    patchelf: true,
    scanner: 0o755,
    expectZero: false,
  })),
  { id: 'scanner-absent', visible: ELEMENTS, patchelf: true, scanner: null, expectZero: false },
  { id: 'scanner-not-executable', visible: ELEMENTS, patchelf: true, scanner: 0o644, expectZero: false },
];

rmSync(SCRATCH, { recursive: true, force: true });
mkdirSync(SCRATCH, { recursive: true });

const sandbox = (branch) => {
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
    PATH: `${bin}:/usr/bin:/bin`,
    GST_STUB_LOG: log,
    GST_STUB_VISIBLE: branch.visible.join(','),
  };
  return { env, log, scanner };
};

const runBranch = (text, label, scannerPath, env) => {
  const input = text.replace('<SCANNER>', scannerPath);
  const r = spawnSync('bash', [], { input, encoding: 'utf8', env });
  out(`--- ${label}: stdout ---`);
  out((r.stdout ?? '').trimEnd());
  record(label, `exit=${r.status}`);
  return r;
};

for (const branch of branches) {
  const { env, log, scanner } = sandbox(branch);
  writeFileSync(log, '');
  const repairedRun = runBranch(repairedTemplated, `${branch.id} / repaired`, scanner, env);
  const inspected = readFileSync(log, 'utf8').split('\n').filter(Boolean);
  writeFileSync(log, '');
  const preparedRun = runBranch(preparedTemplated, `${branch.id} / prepared (first family, unchanged)`, scanner, env);

  if (branch.expectZero) {
    check(`[${branch.id}] repaired exits 0`, repairedRun.status === 0, `exit=${repairedRun.status}`);
    check(
      `[${branch.id}] repaired prints the PASS marker`,
      (repairedRun.stdout ?? '').includes('STEP-0 PASS'),
    );
    check(
      `[${branch.id}] four separate gst-inspect-1.0 invocations, one per element`,
      JSON.stringify(inspected) === JSON.stringify(ELEMENTS),
      inspected.join(' '),
    );
    record(`${branch.id} / prepared`, `exit=${preparedRun.status} (also 0: this branch is healthy for it too)`);
  } else {
    check(`[${branch.id}] repaired exits non-zero`, repairedRun.status !== 0, `exit=${repairedRun.status}`);
    const printed =
      branch.id === 'patchelf-absent'
        ? 'FAIL: patchelf absent'
        : branch.id === 'scanner-absent' || branch.id === 'scanner-not-executable'
          ? 'FAIL: scanner missing or not executable'
          : `FAIL: ${branch.id.replace('-absent', '')} not visible`;
    check(
      `[${branch.id}] the failure that stops it names the missing prerequisite`,
      (repairedRun.stdout ?? '').includes(printed),
      printed,
    );
    if (branch.id.endsWith('-absent') && branch.id !== 'scanner-absent') {
      check(
        `[${branch.id}] prepared exits 0 anyway — the defect this repair fixes`,
        preparedRun.status === 0,
        `exit=${preparedRun.status}`,
      );
    } else {
      record(`${branch.id} / prepared`, `exit=${preparedRun.status}`);
    }
    if (branch.id === 'scanner-absent' || branch.id === 'scanner-not-executable') {
      check(
        `[${branch.id}] prepared ran all four elements to the end without stopping`,
        ELEMENTS.every((e) => (preparedRun.stdout ?? '').includes(`OK ${e}`)),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 4. This host, unstubbed, verbatim extracted command: the missing prerequisite
//    is preserved as the expected FAIL. It stops at `command -v patchelf`, so
//    no gst-inspect-1.0 and no scanner read runs against the real system.
// ---------------------------------------------------------------------------
const hostRun = spawnSync('bash', [], {
  input: repaired,
  encoding: 'utf8',
  env: { ...process.env, PATH: `${PINNED_NODE_DIR}:${process.env.PATH ?? ''}` },
});
out('--- this host / repaired step-0, verbatim, unstubbed ---');
out((hostRun.stdout ?? '').trimEnd());
record('host / repaired', `exit=${hostRun.status}`);
check('host: repaired step-0 exits non-zero (expected FAIL preserved)', hostRun.status !== 0);
check('host: the failure names patchelf', (hostRun.stdout ?? '').includes('FAIL: patchelf absent'));
check('host: it stopped before any element read', !(hostRun.stdout ?? '').includes('OK appsink'));

out(failures === 0 ? 'ALL CHECKS PASS' : `${failures} CHECK(S) FAILED`);
process.exitCode = failures === 0 ? 0 : 1;