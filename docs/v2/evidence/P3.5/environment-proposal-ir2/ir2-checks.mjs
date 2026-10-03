// P3.5 environment-proposal IR-2 — independent read-only checks.
//
// process.stdout.write only: docs/v2/evidence is linted with `no-console` on.
// No app, server, build, database, model, audio, microphone, input, display,
// network, download, install or port 7717 is used. The only subprocesses are
// `bash` parsing/running short read-only snippets and `gst-inspect-1.0`, which
// reads the installed plugin registry; nothing is written and nothing is built.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

const out = (line) => process.stdout.write(line + '\n');
let failures = 0;
const check = (label, ok, detail = '') => {
  out(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures += 1;
};

const proposal = readFileSync('docs/v2/state/P3.5-ENVIRONMENT-PROPOSAL.md', 'utf8');
const proposalLines = proposal.split('\n');
const proposalCount = proposalLines.length - (proposal.endsWith('\n') ? 1 : 0);
const flat = proposal.replace(/\*/g, '').replace(/\s+/g, ' ');

// ---------------------------------------------------------------------------
// 1. Length: the repair claims the proposal is within the requested <= 250.
// ---------------------------------------------------------------------------
check('proposal is within the requested 250 lines', proposalCount <= 250, `${proposalCount} lines`);

// ---------------------------------------------------------------------------
// 2. The proposed A03 *Source* cell, read out of the proposal (not restated):
//    keeps Ubuntu, adds a narrow Arch/pacman case, names the three packages,
//    and does not widen to a general prerequisite clause or a doc citation.
// ---------------------------------------------------------------------------
const a03Start = proposalLines.findIndex((l) => l.trim().startsWith('> Ubuntu archive via'));
let a03 = '';
if (a03Start >= 0) {
  for (let i = a03Start; i < proposalLines.length && proposalLines[i].trim().startsWith('>'); i += 1) {
    a03 += proposalLines[i].replace(/^>\s?/, '') + ' ';
  }
}
a03 = a03.trim();
check('A03 proposed cell found in the proposal', a03.length > 0, a03.slice(0, 60));
check('A03 keeps Ubuntu archive via apt', a03.includes('Ubuntu archive via `apt`'));
check('A03 adds Arch repositories via pacman', a03.includes('official Arch') && a03.includes('`pacman`'));
check('A03 names gst-plugins-base', a03.includes('`gst-plugins-base`'));
check('A03 names gst-plugins-good', a03.includes('`gst-plugins-good`'));
check('A03 names patchelf explicitly', a03.includes('`patchelf`'));
check('A03 has no general "Tauri Linux prerequisites" clause', !/Tauri Linux (prerequisites|system packages)/i.test(a03));
check('A03 cites no INSTALL.md / archlinux.org', !/INSTALL\.md|archlinux\.org/i.test(a03));
check('A03 stays "this Arch host only"', a03.includes('on this Arch host only'));

// ---------------------------------------------------------------------------
// 3. A10 Decision 2: exactly the nine observed names, the observed host, and
//    no key values. Read the names from both the proposal and the acquisition
//    record so the two must agree; a tenth name or a value is a failure.
// ---------------------------------------------------------------------------
const namesPart = flat.slice(flat.indexOf('parameter names:'), flat.indexOf("A10's Allowed query keys"));
const proposalNames = [...namesPart.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
const acq = readFileSync('docs/v2/evidence/P3.5/acquisitions.md', 'utf8');
const acqUrlLine = acq.split('\n').find((l) => l.includes('location: https://us.aws.cdn.hf.co')) ?? '';
const acqNames = acqUrlLine
  .slice(acqUrlLine.indexOf('?') + 1)
  .split('&')
  .map((p) => p.split('=')[0])
  .filter(Boolean);
check('proposal lists exactly nine A10 names', proposalNames.length === 9, proposalNames.join(', '));
check('A10 names match the acquisition record exactly', JSON.stringify(proposalNames) === JSON.stringify(acqNames));
check('A10 does not include response-content-type (A07-only tenth name)', !proposalNames.includes('response-content-type'));
check('A10 redirect host names us.aws.cdn.hf.co', proposal.includes('us.aws.cdn.hf.co'));
check('A10 amendment writes no key values', !/Signature=/.test(proposal) && !/Policy=/.test(proposal));
check('A10 claims no retroactive grant', /No retroactive authorisation is claimed/i.test(flat));
check('A10 proposes no redownload', /no redownload is proposed/i.test(flat));

// ---------------------------------------------------------------------------
// 4. Config: both variants differ from today by exactly the one supported key.
// ---------------------------------------------------------------------------
const base = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const test = JSON.parse(readFileSync('src-tauri/tauri.test.conf.json', 'utf8'));
check('base bundle has no linux key today', base.bundle.linux === undefined);
check('test overlay has no bundle key today', test.bundle === undefined);
const variantA = structuredClone(base);
variantA.bundle.linux = { appimage: { bundleMediaFramework: true } };
const variantB = structuredClone(test);
variantB.bundle = { linux: { appimage: { bundleMediaFramework: true } } };
check('option A delta is exactly the one key', JSON.stringify(variantA.bundle.linux) === '{"appimage":{"bundleMediaFramework":true}}');
check('option B delta is exactly the one key', JSON.stringify(variantB.bundle) === '{"linux":{"appimage":{"bundleMediaFramework":true}}}');

// ---------------------------------------------------------------------------
// 5. Scanner: the supported helpers override is the script's own documented
//    input, the host scanner exists, and the hook path is the prepared target.
// ---------------------------------------------------------------------------
const pluginScript = join(homedir(), '.cache', 'tauri', 'linuxdeploy-plugin-gstreamer.sh');
check('cached linuxdeploy-plugin-gstreamer.sh present', existsSync(pluginScript), pluginScript);
if (existsSync(pluginScript)) {
  const script = readFileSync(pluginScript, 'utf8');
  check('script documents GSTREAMER_HELPERS_DIR', script.includes('GSTREAMER_HELPERS_DIR'));
  check('script copies helpers from $helpers_dir', script.includes('for i in "$helpers_dir"/*'));
  check('script patchelf-sets the helpers rpath', script.includes("patchelf --set-rpath '$ORIGIN/../..'"));
  check('hook scanner path is the prepared Arch target', script.includes('${APPDIR}/usr/lib/gstreamer1.0/gstreamer-1.0/gst-plugin-scanner'));
}
const hostScanner = '/usr/lib/gstreamer-1.0/gst-plugin-scanner';
check('host scanner exists', existsSync(hostScanner), hostScanner);
if (existsSync(hostScanner)) {
  check('host scanner is executable', (statSync(hostScanner).mode & 0o111) !== 0);
}
check('proposal points GSTREAMER_HELPERS_DIR at a scratch dir', proposal.includes('build/p3.5-env-repair/gst-helpers'));
check('proposal says the scratch dir holds only the scanner', /holding \*\*only\*\* the copied scanner/.test(proposal));
check('proposal marks the helpers-env inheritance as unproven', /pass\s+GSTREAMER_HELPERS_DIR\s+to the plugin script was not observed/.test(proposal.replace(/\n/g, ' ')) || /was not observed \(no build\)/.test(proposal));

// ---------------------------------------------------------------------------
// 6. The preflight defect: the prepared step-0 "prereq read" is fail-open. The
//    proposal's own step-0 acceptance is "command -v patchelf exits 0; four
//    separate gst-inspect-1.0 each exit 0; the scanner exists". Run the exact
//    prepared snippet out of verify.mjs against today's host (patchelf absent,
//    three elements 255) and show it still exits 0; then run the fail-closed
//    form the acceptance requires and show it exits non-zero.
// ---------------------------------------------------------------------------
const verify = readFileSync('docs/v2/evidence/P3.5/environment-proposal-repair/verify.mjs', 'utf8');
const key = "'step 0 prereq read': `";
const keyAt = verify.indexOf(key);
let step0 = '';
if (keyAt >= 0) {
  const bodyStart = keyAt + key.length;
  step0 = verify.slice(bodyStart, verify.indexOf('`', bodyStart));
}
check('prepared step-0 snippet found in verify.mjs', step0.length > 0);
if (step0.length > 0) {
  const r = spawnSync('bash', [], { input: step0, encoding: 'utf8' });
  const printedFail = /FAIL: patchelf absent|MISSING /.test(r.stdout ?? '');
  out('--- prepared step-0 snippet output (verbatim) ---');
  out((r.stdout ?? '').trimEnd());
  out(`prepared step-0 exit=${r.status} (printed a prerequisite failure: ${printedFail})`);
  check('DEFECT confirmed: prepared step-0 exits 0 while prerequisites are absent', r.status === 0 && printedFail);
}

const failClosed = `set -e
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH"
command -v patchelf >/dev/null 2>&1 || { echo "FAIL: patchelf absent"; exit 1; }
for e in appsink autoaudiosrc alsasrc pulsesrc; do
  gst-inspect-1.0 "$e" >/dev/null 2>&1 || { echo "FAIL: $e not visible"; exit 1; }
done
test -x /usr/lib/gstreamer-1.0/gst-plugin-scanner`;
const fc = spawnSync('bash', [], { input: failClosed, encoding: 'utf8' });
out(`--- fail-closed form the acceptance requires ---`);
out((fc.stdout ?? '').trimEnd());
out(`fail-closed exit=${fc.status}`);
check('fail-closed form exits non-zero on this host, as the acceptance demands', fc.status !== 0);

out(failures === 0 ? 'ALL CHECKS PASS' : `${failures} CHECK(S) FAILED`);
process.exitCode = failures === 0 ? 0 : 1;
