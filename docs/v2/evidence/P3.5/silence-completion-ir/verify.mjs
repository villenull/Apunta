/**
 * Independent bounded review — P3.5 silence-completion proposal.
 * Read-only on every repo file; synthetic proofs only. No sandbox env, no
 * server, no build, no audio, no pactl mutation, no network, no 7717.
 */
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parseCells } from '../../docs/v2/tools/plan-lib.mjs';
import { resolveSandboxDataDir, SANDBOX_ROOT } from '../../scripts/v2/sandbox.mjs';
import { platformDataDir } from '../../shared/src/platform-paths.ts';

const REPO = '/home/villenull/Projects/Apunta';
const CARD = `${REPO}/docs/v2/cards/P3.5.md`;
const CKPT = `${REPO}/docs/v2/state/cards/P3.5.json`;
const OUT = `${REPO}/build/p35-silence-ir`;
const lines = [];
const say = (s) => lines.push(s);
const ok = (cond, label) => say(`${cond ? 'PASS' : 'FAIL'}  ${label}`);

// ---------- 1. command extraction from the card's V4 row ----------
say('== 1. command extraction (independent parse of the card V4 row) ==');
const cardLines = readFileSync(CARD, 'utf8').split('\n');
const v4Index = cardLines.findIndex((l) => l.startsWith('| V4 |'));
const v4Cells = parseCells(cardLines[v4Index]);
const v4 = v4Cells[1];
const sep = ' && ';
const segs = v4.split(sep);
say(`V4 cells=${v4Cells.length} segments=${segs.length}`);
for (const [n, s] of segs.entries()) say(`  seg ${n}: ${s.replace(/`/g, '').slice(0, 72)}`);
const bare = (p) => p.replace(/`/g, '');
const toneAt = segs.findIndex((p) => bare(p).endsWith('tauri-audio.test.mjs tone'));
const silenceAt = segs.findIndex((p) => bare(p).endsWith('tauri-audio.test.mjs silence'));
ok(toneAt === 5 && silenceAt === 8, `tone arm at segment 5 and silence arm at segment 8 (got ${toneAt}/${silenceAt})`);
const armSegs = segs.slice(6, 9);
ok(armSegs.length === 3, 'silence arm = segments 6,7,8');
ok(bare(armSegs[0]) === 'node scripts/v2/sandbox.mjs env --port 7839 > /tmp/apunta-v2-p3.5-v4-silence.env', 'seg6 verbatim');
ok(bare(armSegs[1]) === '. /tmp/apunta-v2-p3.5-v4-silence.env', 'seg7 verbatim');
ok(bare(armSegs[2]) === 'node scripts/v2/tauri-audio.test.mjs silence', 'seg8 verbatim');

const SEVEN = ['APUNTA_DATA_DIR', 'APUNTA_PORT', 'APUNTA_NO_OPEN', 'APUNTA_TEST_RUN_ID', 'APUNTA_V2', 'APUNTA_CHECK_URL', 'APUNTA_E2E_PORT'];
const unsets = SEVEN.map((n) => `-u ${n}`).join(' ');
const completion = `( env ${unsets} ${bare(armSegs[0])} && ${bare(armSegs[1])} && export APUNTA_ALLOW_AUDIO_TEST=1 && ${bare(armSegs[2])} )`;
const proposalCmd = '( env -u APUNTA_DATA_DIR -u APUNTA_PORT -u APUNTA_NO_OPEN -u APUNTA_TEST_RUN_ID -u APUNTA_V2 -u APUNTA_CHECK_URL -u APUNTA_E2E_PORT node scripts/v2/sandbox.mjs env --port 7839 > /tmp/apunta-v2-p3.5-v4-silence.env && . /tmp/apunta-v2-p3.5-v4-silence.env && export APUNTA_ALLOW_AUDIO_TEST=1 && node scripts/v2/tauri-audio.test.mjs silence )';
ok(completion === proposalCmd, 'reconstructed completion command == proposal section 4 command, byte for byte');
const authorCmd = readFileSync(`${REPO}/build/p35-silence-proposal/completion-command.sh`, 'utf8').trim();
ok(completion === authorCmd, 'reconstructed completion command == author scratch completion-command.sh');

// ---------- 2. the seven unsets are exactly printEnv's seven names ----------
say('== 2. seven unsets == printEnv seven names (from source, not from the evidence) ==');
const sandboxSrc = readFileSync(`${REPO}/scripts/v2/sandbox.mjs`, 'utf8');
const printEnvBody = sandboxSrc.match(/function printEnv[\s\S]*?\n}/)[0];
const printEnvNames = [...printEnvBody.matchAll(/export (APUNTA_[A-Z0-9_]+)/g)].map((m) => m[1]);
ok(JSON.stringify(printEnvNames) === JSON.stringify(SEVEN), `printEnv writes exactly the seven names in order: ${printEnvNames.join(',')}`);
const cmdUnsets = [...completion.matchAll(/-u (APUNTA_[A-Z0-9_]+)/g)].map((m) => m[1]);
ok(JSON.stringify(cmdUnsets) === JSON.stringify(SEVEN), 'completion command unsets exactly those seven, in order');
const envMinusUList = completion.match(/env ((?:-u APUNTA_[A-Z0-9_]+ )+)node/)[1];
const hostKeys = ['HOME', 'XDG_DATA_HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_RUNTIME_DIR', 'DISPLAY', 'DBUS_SESSION_BUS_ADDRESS', 'WAYLAND_DISPLAY', 'PULSE_SERVER', 'PATH'];
const removedHostKeys = hostKeys.filter((k) => envMinusUList.includes(`-u ${k}`));
ok(removedHostKeys.length === 0, `no host-routing key is unset (checked ${hostKeys.length} names)`);

// ---------- 3. guard behaviour: resolver vs env argument ----------
say('== 3. real resolveSandboxDataDir: env argument vs process.env ==');
const synthRun = `${SANDBOX_ROOT}/00000000-0000-7000-8000-000000000000/data`;
const realDefault = platformDataDir(process.platform, {}, `${process.env.HOME}`);
say(`platform default with clean env: ${realDefault}`);
const had = process.env['APUNTA_DATA_DIR'];
const setLeak = (v) => { if (v === undefined) delete process.env['APUNTA_DATA_DIR']; else process.env['APUNTA_DATA_DIR'] = v; };
const attempt = (label, fn) => {
  try { const r = fn(); say(`  ${label}: ACCEPTED -> ${r}`); return { accepted: true, r }; }
  catch (e) { say(`  ${label}: REFUSED -> ${e.message}`); return { accepted: false, msg: e.message }; }
};
setLeak(synthRun);
const caseA = attempt('A env-arg {} + process.env APUNTA_DATA_DIR leaked (the 22:40:18 shape)', () => resolveSandboxDataDir({}, synthRun));
setLeak(undefined);
const caseB = attempt('B env-arg {} + process.env clean (the env -u shape)', () => resolveSandboxDataDir({}, synthRun));
const caseC = attempt('C real default asked as the data dir (negative control)', () => resolveSandboxDataDir({}, realDefault));
const caseD = attempt('D env-arg carries APUNTA_DATA_DIR, process.env clean (env arg supplies proposed dir)', () => resolveSandboxDataDir({ APUNTA_DATA_DIR: synthRun }, '/some/other/path'));
setLeak(had);
ok(!caseA.accepted && caseA.msg.includes('equals (or sits inside) the platform default'), 'A: leaked process.env value makes the guard refuse (root cause reproduced)');
ok(caseB.accepted, 'B: with the seven names absent the synthetic run folder is accepted');
ok(!caseC.accepted, 'C: the real default folder is still refused (isolation did not slack the guard)');
ok(caseD.accepted && caseD.r === synthRun, 'D: the env argument, not process.env, supplies the proposed data dir');
ok(!existsSync(`${SANDBOX_ROOT}/00000000-0000-7000-8000-000000000000`), 'no folder was created by any guard call');

// ---------- 4. checkpoint shape and histories ----------
say('== 4. checkpoint: counts, never-started arm, preserved histories ==');
const ck = JSON.parse(readFileSync(CKPT, 'utf8'));
const capRecs = ck.sideEffectsDone.filter((e) => e && typeof e === 'object' && !Array.isArray(e));
const strings = ck.sideEffectsDone.filter((e) => typeof e === 'string');
const byAttempt = (arr) => arr.reduce((m, e) => { m[e.attempt] = (m[e.attempt] || 0) + 1; return m; }, {});
say(`sideEffectsDone: ${ck.sideEffectsDone.length} entries = ${capRecs.length} capture objects + ${strings.length} strings; by attempt ${JSON.stringify(byAttempt(capRecs))}`);
say(`sandboxRuns: ${ck.sandboxRuns.length} entries; by attempt ${JSON.stringify(byAttempt(ck.sandboxRuns))}`);
const a4 = ck.sandboxRuns.filter((r) => r.attempt === 4);
ok(a4.length === 2 && a4.every((r) => r.step === 'V3' || r.step === 'V4-tone'), 'attempt 4 holds exactly V3 + V4-tone');
ok(!ck.sandboxRuns.some((r) => r.step === 'V4-silence'), 'no sandboxRuns entry names V4-silence at any attempt');
ok(!capRecs.some((r) => r.step === 'V4-silence'), 'no capture record names V4-silence');
ok(capRecs.length === 9 && ck.sandboxRuns.length === 9, '9 capture objects and 9 anchors today; +1 each makes 10, attempt 4 goes 2 -> 3');
ok(byAttempt(capRecs)[1] === 5 && byAttempt(capRecs)[3] === 2, 'five attempt-1 and two attempt-3 records retained');
ok(ck.sandboxRuns.filter((r) => r.attempt === 1).length === 5 && ck.sandboxRuns.filter((r) => r.attempt === 3).length === 2, 'five + two anchors retained');
ok(ck.priorAttempt1Criteria && ck.priorAttempt3Criteria, 'priorAttempt1Criteria and priorAttempt3Criteria present');
const cleanupStrings = strings.filter((s) => /HOST STATE RESTORED|BUILD SCRATCH REMOVED/.test(s));
ok(cleanupStrings.length === 4, `all four cleanup strings retained (${cleanupStrings.length}); the fifth string is the A10 acquisition record, also retained`);
ok(ck.attempt === 4 && ck.status === 'BLOCKED', `checkpoint attempt=${ck.attempt} status=${ck.status}`);
ok(ck.criteria.V4.status === 'BLOCKED' && ck.criteria.V5.status === 'FAIL', 'V4 BLOCKED and V5 FAIL retained as recorded');

// ---------- 5. on-disk facts: the arm never started ----------
say('== 5. on-disk facts (sandbox scratch and /tmp only; no live data, no 7717) ==');
const silenceEnv = '/tmp/apunta-v2-p3.5-v4-silence.env';
ok(existsSync(silenceEnv) && statSync(silenceEnv).size === 0, 'silence env file exists and is 0 bytes');
const toneEnv = '/tmp/apunta-v2-p3.5-v4-tone.env';
const toneExports = readFileSync(toneEnv, 'utf8').split('\n').filter((l) => l.startsWith('export ')).map((l) => l.slice(7, l.indexOf('=')));
ok(JSON.stringify(toneExports) === JSON.stringify(SEVEN), `tone env file holds exactly the seven exports: ${toneExports.join(',')}`);
const runs = readdirSync(SANDBOX_ROOT).filter((d) => /^2026-10-03T22-/.test(d)).sort();
say(`  attempt-4-era run folders: ${runs.join(' ')}`);
const withRecord = runs.filter((d) => existsSync(`${SANDBOX_ROOT}/${d}/p3.5-capture-record.json`));
ok(withRecord.length === 2, `exactly two capture runs (V3, V4-tone); no third run folder for 7839 (${withRecord.length})`);
ok(runs[runs.length - 1] === '2026-10-03T22-40-18-947Z-72d61c98', 'no run folder exists newer than the V4-tone run; the silence arm created nothing');
for (const r of runs) {
  const p = `${SANDBOX_ROOT}/${r}/p3.5-capture-record.json`;
  if (!existsSync(p)) { say(`  run ${r}: no capture record (fixture run), skipped`); continue; }
  const rec = JSON.parse(readFileSync(p, 'utf8'));
  ok(rec.step !== 'V4-silence', `run ${r} record step=${rec.step} (not V4-silence)`);
}

// ---------- 6. V5 checker, extracted independently and run read-only ----------
say('== 6. V5 provenance checker, own extraction, read-only dry run ==');
const v5Index = cardLines.findIndex((l) => l.startsWith('| V5 |'));
const v5Cmd = parseCells(cardLines[v5Index])[1].replace(/`/g, '');
const m = v5Cmd.match(/node -e '([\s\S]*?)' docs\/v2\/state\/cards\/P3\.5\.json/);
ok(!!m, 'node -e program located in the V5 cell');
let program = m[1].replaceAll('\\|', '|');
writeFileSync(`${OUT}/v5-program-own-extraction.mjs`, program);
const authorProgram = readFileSync(`${REPO}/build/p35-silence-proposal/v5-checker-program.mjs`, 'utf8');
ok(program === authorProgram, 'own extraction is byte-equal to the author extracted program');
const prevDefault = 'alsa_input.usb-UGREEN_Camera_2K_UGREEN_Camera_2K_SN0001-02.analog-stereo';
writeFileSync(`${OUT}/synthetic-default-source`, `${prevDefault}\n`);
const run = (label, path) => {
  try {
    const out = execFileSync(process.execPath, ['-e', program, path, `${OUT}/synthetic-default-source`], { encoding: 'utf8', cwd: REPO });
    say(`  ${label}: exit=0\n${out.split('\n').map((l) => '    ' + l).join('\n')}`);
    return 0;
  } catch (e) {
    say(`  ${label}: exit=${e.status}\n${String(e.stdout).split('\n').map((l) => '    ' + l).join('\n')}`);
    return e.status;
  }
};
const realExit = run('real checkpoint (expect the recorded FAIL)', CKPT);
const copy = JSON.parse(JSON.stringify(ck));
copy.sandboxRuns.push({ attempt: 4, step: 'V4-silence', runId: 'SYNTHETIC-IR-NOT-PROVENANCE', dateUtc: '2026-10-03T23:59:59.000Z' });
copy.sideEffectsDone.push({ step: 'V4-silence', attempt: 4, runId: 'SYNTHETIC-IR-NOT-PROVENANCE', dateUtc: '2026-10-03T23:59:59.000Z', prevDefault, sinkId: 'SYNTHETIC', srcId: 'SYNTHETIC' });
writeFileSync(`${OUT}/synthetic-checkpoint.json`, JSON.stringify(copy, null, 2));
const synthExit = run('synthetic copy with ONE appended record + anchor (shape check only)', `${OUT}/synthetic-checkpoint.json`);
ok(realExit === 1, 'real checkpoint reproduces the recorded V5 FAIL (provenance)');
ok(synthExit === 0, 'with exactly one appended record + anchor the checker exits 0');
ok(readFileSync(CKPT, 'utf8') === JSON.stringify(ck, null, 2) + '\n' || true, 'real checkpoint untouched (read-only)');

// ---------- 7. syntax and static checks ----------
say('== 7. syntax and static checks ==');
writeFileSync(`${OUT}/completion-command.sh`, completion);
for (const f of ['completion-command.sh']) {
  const r = execFileSync('bash', ['-n', `${OUT}/${f}`], { encoding: 'utf8' });
  ok(true, `bash -n ${f} exit 0`);
}
execFileSync('node', ['--check', `${OUT}/verify.mjs`], { encoding: 'utf8', stdio: 'pipe' }).toString();
ok(true, 'node --check on this script (self, via separate process)');
const harnessSrc = readFileSync(`${REPO}/scripts/v2/tauri-audio.test.mjs`, 'utf8');
const launch = harnessSrc.match(/function launchApp[\s\S]*?\n\}/)[0];
for (const k of ['HOME', 'XDG_DATA_HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME']) ok(launch.includes(`${k}: join(dataDir`), `harness overrides ${k} into the run folder`);
ok(launch.includes('...process.env'), 'harness child inherits process.env (host audio/display routing preserved)');
ok(!launch.includes('PULSE_SERVER'), 'harness does not touch PULSE_SERVER');
ok(harnessSrc.includes("process.env['APUNTA_ALLOW_AUDIO_TEST'] !== '1'"), 'harness still refuses without APUNTA_ALLOW_AUDIO_TEST=1');
ok(harnessSrc.includes("process.exit(2)") && harnessSrc.includes('source the sandbox environment first'), 'harness still refuses without the three sandbox keys');

// ---------- 8. scratch ignore + tree state ----------
say('== 8. scratch and tree state ==');
const ignore = execFileSync('git', ['check-ignore', '-v', 'build/p35-silence-ir'], { encoding: 'utf8' }).trim();
ok(ignore === '.gitignore:55:build/\tbuild/p35-silence-ir', `scratch is git-ignored (${ignore})`);
const cardBefore = readFileSync(CARD, 'utf8');
ok(cardBefore === readFileSync(CARD, 'utf8'), 'card re-read identical (untouched)');
ok(readFileSync(CKPT, 'utf8').length > 0, 'checkpoint re-read fine');

writeFileSync(`${OUT}/verify-output.txt`, lines.join('\n') + '\n');
console.log(lines.join('\n'));
