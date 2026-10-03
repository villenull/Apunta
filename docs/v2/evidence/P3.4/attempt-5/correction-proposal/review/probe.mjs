// Independent non-vacuity probe (my own, scratch, ignored). Drives the ACTUAL
// shipped functions of two scratch copies through synthetic IO only:
//   shipped-proof.mjs  = b19e59f byte-identical + a proof-only export footer
//   patched-proof.mjs = shipped + the proposed 02-patch.diff, same footer
// No app, server, database, model runtime, audio, input, display, download,
// install or network. The only real children are local `node -e` sleepers.
//
// Proves, each FAIL on shipped / PASS on patched:
//   (A) O3: a delayed label + the flow share ONE deadline; the row ends with
//       NO click. Shipped: a second budget lets the flow click past the budget.
//   (B) O2: the cleanup kill fires for a PREFIXED deadline reason. Shipped:
//       inert. Plus a control: an EXACT reason (hung geometry) fires even on
//       shipped, so the branch is not dead code — the string match is the bug.
//   (C) an untracked/foreign process is never killed by the cleanup.
//   (D) static §E text checks on the actual file bytes.

import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { format } from 'node:util';
import * as shipped from './shipped-proof.mjs';
import * as patched from './patched-proof.mjs';

const { MARKER_PATH, createBatchReader, frameFrom, DEADLINE_EXPIRED } = patched;

let failures = 0;
// The repo's eslint allows console.warn/error only, and this durable file lives
// in docs/, so every line below is printed with util.format + stdout.write.
// Exactness: no printed string contains a format placeholder, so format(s) === s for every
// string printed here and the emitted bytes are unchanged. `say` keeps its
// undefined return (a block body, not emit's boolean).
const emit = (...args) => {
  process.stdout.write(`${format(...args)}\n`);
};
const say = (s) => {
  emit(s);
};
const verdict = (ok, name, detail = '') => {
  if (!ok) failures += 1;
  emit(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
};

// ------------------------------------------------------------ synthetic IO --
const batchLine = ({ epoch, batch, total, entries }) => {
  const q = new URLSearchParams();
  q.set('rects', String(total));
  q.set('batch', String(batch));
  q.set('epoch', String(epoch));
  for (const e of entries) {
    q.set(`i${e.index}_x`, String(e.x));
    q.set(`i${e.index}_y`, String(e.y));
    q.set(`i${e.index}_w`, String(e.w));
    q.set(`i${e.index}_h`, String(e.h));
    q.set(`i${e.index}_l`, e.label);
    q.set(`i${e.index}_t`, e.tag);
    q.set(`i${e.index}_d`, e.testId ?? '');
  }
  return `${MARKER_PATH}?${q.toString()}`;
};
const PATIENT_BATCH = batchLine({
  epoch: 5,
  batch: 0,
  total: 1,
  entries: [{ index: 0, label: 'John Smith', tag: 'TR', testId: 'patient-open', x: 10, y: 20, w: 200, h: 28 }],
});
const frameOf = () => {
  const r = createBatchReader();
  r.observe(PATIENT_BATCH);
  return r.frame();
};

const realSchedule = (ms) => new Promise((done) => setTimeout(done, ms));
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// My own scale: 800 ms stands in for TARGET_BUDGET_MS = 30_000 (1/37.5);
// 250 ms poll is the REAL OBSERVATION_POLL_MS; 150 ms per move stands in for
// unmeasured xdotool latency. What is proved is WHICH deadline object governs
// each await and the click, not absolute timing.
const BUDGET = 800;
const MOVE_MS = 150;

function makeOps({ hangOnMove = 0, hangGeometry = false } = {}) {
  const state = {
    href: 'http://127.0.0.1/app',
    vpW: 1000,
    vpH: 800,
    ptrN: 0,
    ptrCX: 0,
    ptrCY: 0,
    clickN: 0,
    clickCX: 0,
    clickCY: 0,
    clickTag: '',
    clickTestId: '',
    clickText: '',
    scriptText: 'false',
  };
  const native = { x: 0, y: 0 };
  const dispatched = [];
  let moves = 0;
  return {
    dispatched,
    ops: {
      windowGeometry: async () => {
        if (hangGeometry) return new Promise(() => {});
        return { code: 0, signal: null, stdout: '', stderr: '', id: '4242', x: '100', y: '50', w: '800', h: '600', pid: '777' };
      },
      move: async (point) => {
        moves += 1;
        dispatched.push(`move:${point.x},${point.y}`);
        await sleep(MOVE_MS);
        if (hangOnMove !== 0 && moves === hangOnMove) return new Promise(() => {});
        native.x = point.x;
        native.y = point.y;
        state.ptrN += 1;
        state.ptrCX = Math.round(point.x / 2);
        state.ptrCY = Math.round(point.y / 2);
        return { code: 0, signal: null, stdout: '', stderr: '' };
      },
      read: async () => ({ code: 0, signal: null, stdout: '', stderr: '', X: String(native.x), Y: String(native.y), WINDOW: '4242', PID: '777' }),
      click: async () => {
        dispatched.push('click');
        state.clickN += 1;
        state.clickCX = Math.round(native.x / 2);
        state.clickCY = Math.round(native.y / 2);
        state.clickTag = 'TR';
        state.clickTestId = 'patient-open';
        state.clickText = 'John Smith';
        state.href = 'http://127.0.0.1/patients/1';
        return { code: 0, signal: null, stdout: '', stderr: '' };
      },
      nextFact: () => ({ ...state }),
    },
  };
}

// ------------------------------------------- (A) O3: one shared deadline ----
// Mirrors of each copy's OWN (d)-handler call convention, same synthetic inputs.
async function budgetScenario(mod, which, labelAtMs) {
  const lines = [];
  const stderrSource = () => lines.join('\n');
  const clock = mod.createRealClock();
  const started = clock.now();
  setTimeout(() => lines.push(PATIENT_BATCH), labelAtMs);
  const harness = makeOps();

  let result;
  let tag;
  if (which === 'patched') {
    const patientDeadline = mod.createTargetDeadline(clock.now(), BUDGET);
    tag = await mod.waitForLabel(stderrSource, 'John Smith', patientDeadline, clock, realSchedule);
    result = tag.ok
      ? await mod.runFlowGuarded({
          deadline: patientDeadline,
          clock,
          schedule: realSchedule,
          frame: frameFrom(stderrSource),
          wanted: { label: 'John Smith', tag: tag.tag },
          expected: { kind: 'patient-href' },
          ops: harness.ops,
        })
      : { ok: false, reason: tag.reason };
  } else {
    tag = await mod.waitForLabel(stderrSource, 'John Smith', BUDGET);
    result =
      tag === null
        ? { ok: false, reason: 'no unique rectangle' }
        : await mod.runFlowGuarded({
            deadline: mod.createTargetDeadline(clock.now(), BUDGET),
            clock,
            schedule: realSchedule,
            frame: frameFrom(stderrSource),
            wanted: { label: 'John Smith', tag },
            expected: { kind: 'patient-href' },
            ops: harness.ops,
          });
  }
  return {
    result,
    elapsed: clock.now() - started,
    tag,
    clicks: harness.dispatched.filter((d) => d === 'click').length,
  };
}

say('== (A) O3: delayed label + flow must share ONE deadline ==');
const aShip = await budgetScenario(shipped, 'shipped', 400);
const aPat = await budgetScenario(patched, 'patched', 400);
emit(`  SHIPPED: tag=${aShip.tag === null ? 'null' : aShip.tag}, ok=${aShip.result.ok}, clicks=${aShip.clicks}, wall=${aShip.elapsed}ms of ${BUDGET}ms`);
emit(`           reason: ${aShip.result.reason}`);
emit(`  PATCHED: tag=${aPat.tag?.ok === false ? 'not-ok' : JSON.stringify(aPat.tag?.tag)}, ok=${aPat.result.ok}, clicks=${aPat.clicks}, wall=${aPat.elapsed}ms of ${BUDGET}ms`);
emit(`           reason: ${aPat.result.reason}`);
verdict(aShip.result.ok === true && aShip.clicks === 1, 'defect on shipped: a SECOND budget let the flow click after label discovery spent the first');
verdict(aShip.elapsed > BUDGET, 'defect on shipped: the (d) half spent MORE than one target budget', `${aShip.elapsed}ms > ${BUDGET}ms — 30 s + 30 s per target as shipped`);
verdict(aPat.result.ok === false && aPat.clicks === 0, 'patched: the row ends at the ONE deadline with no click');
verdict(aPat.elapsed <= BUDGET + 200, 'patched: wall clock bounded by the one budget', `${aPat.elapsed}ms <= ${BUDGET + 200}ms`);
const aEarly = await budgetScenario(patched, 'patched', 100);
verdict(aEarly.result.ok === true && aEarly.clicks === 1, 'patched positive path: an in-time label still returns the tag and the flow clicks', `wall=${aEarly.elapsed}ms`);
verdict(aEarly.elapsed <= BUDGET + 200, 'patched positive path: inside the one budget', `${aEarly.elapsed}ms`);
say('');

// ------------------------------------------- (B) O2: prefixed-reason kill ----
async function cleanupScenario(mod, which, { hangOnMove = 0, hangGeometry = false } = {}) {
  // A tracked child (registered through the harness's OWN spawnAsync) and an
  // untracked foreign child (bare spawn, never registered).
  const tracked = mod.spawnAsync(process.execPath, ['-e', 'setTimeout(()=>{},600000)']);
  let trackedClosed = false;
  tracked.then(() => { trackedClosed = true; });
  const foreign = spawn(process.execPath, ['-e', 'setTimeout(()=>{},600000)'], { stdio: 'ignore' });
  let foreignClosed = false;
  foreign.on('close', () => { foreignClosed = true; });
  await sleep(150);

  const harness = makeOps({ hangOnMove, hangGeometry });
  const clock = mod.createRealClock();
  const deadline = mod.createTargetDeadline(clock.now(), 1000);
  const result = await mod.runFlowGuarded({
    deadline,
    clock,
    schedule: realSchedule,
    frame: frameOf(),
    wanted: { label: 'John Smith', tag: 'TR' },
    expected: { kind: 'patient-href' },
    ops: harness.ops,
  });
  await sleep(250); // SIGKILL + reap window
  const out = {
    which,
    ok: result.ok,
    reason: result.reason,
    exact: result.reason === DEADLINE_EXPIRED,
    clicks: harness.dispatched.filter((d) => d === 'click').length,
    trackedKilled: trackedClosed,
    foreignSurvived: !foreignClosed,
    deadlineExpired: deadline.expired(clock.now()),
  };
  if (!trackedClosed) tracked.then(() => {}, () => {});
  try { process.kill(foreign.pid, 'SIGKILL'); } catch { /* already gone */ }
  await sleep(100);
  return out;
}

say('== (B) O2: the cleanup kill must fire for a PREFIXED deadline reason ==');
const bShip = await cleanupScenario(shipped, 'shipped', { hangOnMove: 3 });
const bPat = await cleanupScenario(patched, 'patched', { hangOnMove: 3 });
for (const r of [bShip, bPat]) {
  emit(`  ${r.which.toUpperCase()}: ok=${r.ok}, clicks=${r.clicks}, reason exactly DEADLINE_EXPIRED=${r.exact} (contains: ${r.reason.includes(DEADLINE_EXPIRED)}), deadline.expired=${r.deadlineExpired}, tracked killed=${r.trackedKilled}, foreign survived=${r.foreignSurvived}`);
  emit(`           reason: ${r.reason}`);
}
verdict(bShip.exact === false && bShip.reason.includes(DEADLINE_EXPIRED), 'defect on shipped: the hung target warp fails with a PREFIXED reason');
verdict(bShip.trackedKilled === false, 'defect on shipped: the cleanup branch is inert — tracked child survives runFlowGuarded');
verdict(bPat.trackedKilled === true, 'patched: the tracked hung command is killed by pid at the deadline');
verdict(bPat.foreignSurvived === true, 'patched: an untracked/foreign process is never killed');
verdict(bShip.foreignSurvived === true, 'shipped: an untracked/foreign process is never killed either');
verdict(bPat.clicks === 0 && bPat.deadlineExpired === true, 'patched: no click, and the deadline really is expired at cleanup');
say('');

say('== (B2) control: an EXACT reason fires the branch even on shipped ==');
const b2Ship = await cleanupScenario(shipped, 'shipped', { hangGeometry: true });
const b2Pat = await cleanupScenario(patched, 'patched', { hangGeometry: true });
for (const r of [b2Ship, b2Pat]) {
  emit(`  ${r.which.toUpperCase()}: ok=${r.ok}, reason exactly DEADLINE_EXPIRED=${r.exact}, tracked killed=${r.trackedKilled}, foreign survived=${r.foreignSurvived}`);
}
verdict(b2Ship.exact === true && b2Ship.trackedKilled === true, 'control: hung geometry yields the EXACT reason and the branch fires even on shipped — the branch is not dead code, the string match is the bug');
verdict(b2Pat.trackedKilled === true && b2Pat.foreignSurvived === true, 'control: patched also kills tracked, spares foreign');
say('');

// ------------------------------------------- (D) static §E text checks ----
say('== (D) static §E checks on the ACTUAL file text ==');
function staticE(file) {
  const text = readFileSync(file, 'utf8');
  const problems = [];
  const fn = text.slice(text.indexOf('async function assertInjectedNoteInert'));
  for (const [label, id] of [['patient', 'patientDeadline'], ['note', 'noteDeadline']]) {
    const create = fn.indexOf(`const ${id} = createTargetDeadline(clock.now())`);
    const wait = fn.indexOf(`waitForLabel(stderrSource, ${label === 'patient' ? 'PATIENT_LABEL' : 'NOTE_LABEL'}`);
    if (create < 0) problems.push(`${label}: no ${id} taken`);
    if (wait < 0) problems.push(`${label}: no label discovery`);
    if (create >= 0 && wait >= 0 && create > wait) problems.push(`${label}: deadline taken AFTER label discovery`);
    const call = fn.slice(wait, wait + 220);
    if (/\b30_000\b/.test(call)) problems.push(`${label}: label discovery carries its own 30_000 ms budget`);
    if (!new RegExp(`${id},\\s*clock`).test(call)) problems.push(`${label}: label discovery does not receive ${id}`);
    const flow = fn.slice(wait, wait + 800);
    if (!new RegExp(`deadline: ${id}\\b`).test(flow)) problems.push(`${label}: the flow does not receive the SAME object`);
  }
  const wfl = text.slice(text.indexOf('async function waitForLabel'), text.indexOf('async function waitForLabel') + 1000);
  if (/timeoutMs/.test(wfl)) problems.push('waitForLabel still takes a private timeoutMs');
  if (/Date\.now\(\) \+ /.test(wfl)) problems.push('waitForLabel still builds its own wall-clock deadline');
  if (!/pollObservation\(/.test(wfl)) problems.push('waitForLabel does not use the shared pollObservation');
  const rfg = text.slice(text.indexOf('async function runFlowGuarded'), text.indexOf('async function runFlowGuarded') + 700);
  if (/result\.reason === DEADLINE_EXPIRED/.test(rfg)) problems.push('runFlowGuarded still matches the reason by string equality');
  if (!/deadline\.expired\(/.test(rfg)) problems.push('runFlowGuarded does not test the deadline itself');
  if (!/const TARGET_BUDGET_MS = 30_000;/.test(text)) problems.push('TARGET_BUDGET_MS moved off 30_000');
  return problems;
}
const dShip = staticE('shipped-proof.mjs');
const dPat = staticE('patched-proof.mjs');
say(`  SHIPPED problems (${dShip.length}):`);
for (const p of dShip) say(`    - ${p}`);
say(`  PATCHED problems (${dPat.length}):`);
for (const p of dPat) say(`    - ${p}`);
verdict(dShip.length === 13, 'the static checker is non-vacuous on the shipped file (13 defects)', String(dShip.length));
verdict(dPat.length === 0, 'the static checker finds nothing on the patched file');
say('');

emit(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
