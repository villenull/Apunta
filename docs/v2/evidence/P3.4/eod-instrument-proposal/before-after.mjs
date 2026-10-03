// P3.4 EOD instrument correction — synthetic before/after proof (ignored build).
//
// Imports the ACTUAL shipped harness exports from two copies:
//   - baseline/  : byte-identical to scripts/v2/tauri-security.test.mjs @ 865ccab3
//   - candidate/ : the candidate.patch applied (the corrected identity instrument)
//
// Nothing here launches, builds, contacts a port, touches a display, reads a
// real data folder or uses the network. Every fixture is synthetic numbers.

import assert from 'node:assert/strict';

import * as base from './baseline/tauri-security.test.mjs';
import * as cand from './candidate/tauri-security.test.mjs';

const WINDOW = { id: 4711, x: 60, y: 70, w: 1280, h: 860 };
const APP_PID = 4242;
const INSIDE = { x: 700, y: 500 }; // inside WINDOW
const TARGET = { x: 700, y: 500 };
const RECT = { t: 'span', d: 'patient-open', l: 'John Smith' };
const APP_HREF = 'http://127.0.0.1:7717/';

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) {
    pass += 1;
    process.stdout.write(`PASS ${name}\n`);
  } else {
    fail += 1;
    process.stdout.write(`FAIL ${name}${detail === '' ? '' : ` — ${detail}`}\n`);
  }
};

// ---------------------------------------------------------------- part A ----
// checkReadback: the exact attempt-5 measured shape is WINDOW=0 with no PID
// field (xdotool emits no PID). Baseline rejects it; candidate accepts it only
// because the measured point is inside the owned rectangle, and the fresh page
// witness (part B) is still required afterwards.

const attempt5Shape = { X: '700', Y: '500', WINDOW: '0' };

{
  const r = base.checkReadback(INSIDE, attempt5Shape, WINDOW, APP_PID);
  check('BEFORE rejects the real attempt-5 shape (WINDOW=0, no PID)', r.ok === false, r.reason);
}
{
  const r = cand.checkReadback(INSIDE, attempt5Shape, WINDOW, APP_PID);
  check('AFTER accepts the real attempt-5 shape', r.ok === true, r.reason);
}
{
  const r = cand.checkReadback(INSIDE, { X: '700', Y: '500' }, WINDOW, APP_PID);
  check('AFTER accepts a read-back with no WINDOW key at all', r.ok === true, r.reason);
}
{
  const outside = { x: 50, y: 500 }; // 50 is left of WINDOW.x = 60
  const r = cand.checkReadback(outside, { X: '50', Y: '500', WINDOW: '0' }, WINDOW, APP_PID);
  check(
    'AFTER fails closed when the measured point is outside the owned rectangle',
    r.ok === false && /outside the owned app window rectangle/.test(r.reason),
    r.reason,
  );
}
{
  const r = cand.checkReadback(INSIDE, { X: '702', Y: '500', WINDOW: '0' }, WINDOW, APP_PID);
  check('AFTER fails closed at 2 px off', r.ok === false && /2,0 px/.test(r.reason), r.reason);
}
{
  const r = cand.checkReadback(INSIDE, { WINDOW: '0' }, WINDOW, APP_PID);
  check('AFTER fails closed with no usable X/Y', r.ok === false && /no usable X\/Y/.test(r.reason), r.reason);
}
{
  const r = cand.checkReadback(INSIDE, { X: '700', Y: '500', WINDOW: '999' }, WINDOW, APP_PID);
  check(
    'AFTER treats a foreign getmouselocation WINDOW as diagnostic, not a failure',
    r.ok === true && /diagnostic only/.test(r.reason),
    r.reason,
  );
}
{
  // The dead §D.4 arm: the baseline passes only when a synthetic PID is injected,
  // which the real command never emits. Recorded so the defect is visible.
  const r = base.checkReadback(INSIDE, { X: '700', Y: '500', PID: String(APP_PID) }, WINDOW, APP_PID);
  check('BEFORE passes only via the fabricated PID the real command never emits', r.ok === true, r.reason);
}

// ---------------------------------------------------------------- part B ----
// guardedMove through the ACTUAL shipped export. The only read-back shape is the
// real one (WINDOW=0). The fresh page pointer witness (ptrN strictly greater) is
// still required: with no advance, the move fails at the deadline with no click.

function moveOps({ readDelta = { x: 0, y: 0 }, deliver = true } = {}) {
  let ptrN = 0;
  let cx = 0;
  let cy = 0;
  let last = { x: 0, y: 0 };
  return {
    move: (point) => {
      last = point;
      if (deliver) {
        ptrN += 1;
        cx = point.x;
        cy = point.y;
      }
      return { code: 0, signal: null, stdout: '', stderr: '' };
    },
    read: () => ({
      code: 0,
      signal: null,
      stdout: '',
      stderr: '',
      X: String(last.x + readDelta.x),
      Y: String(last.y + readDelta.y),
      WINDOW: '0',
    }),
    nextFact: () => ({
      [cand.POINTER.counter]: String(ptrN),
      [cand.POINTER.clientX]: String(cx),
      [cand.POINTER.clientY]: String(cy),
    }),
  };
}

async function guarded(H, ops) {
  const clock = H.createClock(0);
  const deadline = H.createTargetDeadline(0, 30_000);
  const dispatched = [];
  const schedule = (ms) => {
    clock.advance(ms);
    return Promise.resolve();
  };
  const result = await H.guardedMove({
    deadline,
    clock,
    ops,
    window: WINDOW,
    appPid: APP_PID,
    point: INSIDE,
    wanted: 'synthetic bootstrap',
    tolerance: null,
    dispatched,
    schedule,
  });
  return { result, dispatched };
}

{
  const { result, dispatched } = await guarded(base, moveOps());
  check(
    'BEFORE the bootstrap move fails on the real shape (reproduces attempt-5)',
    result.ok === false && /not over the app/.test(result.reason),
    result.reason,
  );
  check('BEFORE it dispatched the move and the read only', dispatched.join(',') === 'mousemove,getmouselocation', dispatched.join(','));
}
{
  const { result, dispatched } = await guarded(cand, moveOps());
  check(
    'AFTER the bootstrap move passes on the same real shape',
    result.ok === true,
    result.reason,
  );
  check('AFTER it dispatched the move and the read only', dispatched.join(',') === 'mousemove,getmouselocation', dispatched.join(','));
}
{
  const { result } = await guarded(cand, moveOps({ deliver: false }));
  check(
    'AFTER a stale pointer (no fresh page witness) ends at the deadline with no click',
    result.ok === false && /deadline expired/.test(result.reason),
    result.reason,
  );
}
{
  const { result } = await guarded(cand, moveOps({ readDelta: { x: 2, y: 0 } }));
  check(
    'AFTER a read-back 2 px off fails closed',
    result.ok === false && /2,0 px/.test(result.reason),
    result.reason,
  );
}

// ---------------------------------------------------------------- part C ----
// runClick through the ACTUAL shipped export: exactly one click on the happy
// path (real WINDOW=0 shape), zero clicks when the read-back is off. runClick
// does not read the window pid; runFlow (part D) does.

function clickOps({ readDelta = { x: 0, y: 0 }, deliver = true } = {}) {
  let ptrN = 7;
  let cx = 800;
  let cy = 430;
  let last = { x: 0, y: 0 };
  const dispatched = [];
  return {
    dispatched,
    ops: {
      move: (point) => {
        dispatched.push('mousemove');
        last = point;
        if (deliver) {
          ptrN += 1;
          cx = point.x;
          cy = point.y;
        }
        return { code: 0, signal: null, stdout: '', stderr: '' };
      },
      read: () => {
        dispatched.push('getmouselocation');
        return {
          code: 0,
          signal: null,
          stdout: '',
          stderr: '',
          X: String(last.x + readDelta.x),
          Y: String(last.y + readDelta.y),
          WINDOW: '0',
        };
      },
      click: () => {
        dispatched.push('click');
        return { code: 0, signal: null, stdout: '', stderr: '' };
      },
      nextFact: () => {
        if (!dispatched.includes('click'))
          return {
            [cand.POINTER.counter]: String(ptrN),
            [cand.POINTER.clientX]: String(cx),
            [cand.POINTER.clientY]: String(cy),
            [cand.CLICK.counter]: '0',
            href: APP_HREF,
          };
        return {
          [cand.POINTER.counter]: String(ptrN),
          [cand.CLICK.counter]: '1',
          [cand.CLICK.clientX]: String(TARGET.x),
          [cand.CLICK.clientY]: String(TARGET.y),
          [cand.CLICK.tag]: RECT.t,
          [cand.CLICK.testId]: RECT.d,
          [cand.CLICK.text]: RECT.l,
          href: `${APP_HREF}?patient=p1`,
        };
      },
    },
  };
}

async function click(H, fixture) {
  const clock = H.createClock(0);
  const deadline = H.createTargetDeadline(0, 30_000);
  const schedule = (ms) => {
    clock.advance(ms);
    return Promise.resolve();
  };
  const identity = H.solveTransform([
    { cx: 1, cy: 1, sx: 1, sy: 1 },
    { cx: 2, cy: 2, sx: 2, sy: 2 },
  ]);
  assert.equal(identity.ok, true, identity.reason);
  const result = await H.runClick({
    deadline,
    clock,
    transform: identity,
    window: WINDOW,
    appPid: APP_PID,
    target: TARGET,
    rect: RECT,
    expected: { kind: 'patient-href' },
    ops: fixture.ops,
    schedule,
  });
  return { result, dispatched: fixture.dispatched };
}

{
  const f = clickOps();
  const { result, dispatched } = await click(cand, f);
  check(
    'AFTER the click stage lands on the real WINDOW=0 shape',
    result.ok === true,
    result.reason,
  );
  check(
    'AFTER exactly one click was dispatched',
    dispatched.filter((name) => name === 'click').length === 1,
    dispatched.join(','),
  );
}
{
  const f = clickOps({ readDelta: { x: 2, y: 0 } });
  const { result, dispatched } = await click(cand, f);
  check('AFTER an off-by-2 read-back means zero clicks', result.ok === false && !dispatched.includes('click'), result.reason);
}

// ---------------------------------------------------------------- part D ----
// runFlow: the NEW independent native ownership anchor. A foreign getwindowpid
// stops the flow immediately with no move; the app's own pid lets it proceed.

// The frame row below is at (300,400,200,28), so its centre is (400,414).
const FLOW_TARGET = { x: 400, y: 414 };

function flowOps({ ownerPid = APP_PID } = {}) {
  let ptrN = 0;
  let cx = 0;
  let cy = 0;
  let last = { x: 0, y: 0 };
  const dispatched = [];
  const live = { vpW: 1280, vpH: 860, clickN: 0, href: APP_HREF, scriptText: 'false' };
  return {
    dispatched,
    ops: {
      windowGeometry: () => {
        dispatched.push('getwindowgeometry');
        return {
          code: 0,
          signal: null,
          stdout: '',
          stderr: '',
          id: WINDOW.id,
          x: WINDOW.x,
          y: WINDOW.y,
          w: WINDOW.w,
          h: WINDOW.h,
          pid: APP_PID,
        };
      },
      windowPid: () => {
        dispatched.push('getwindowpid');
        return { code: 0, signal: null, stdout: `${String(ownerPid)}\n`, stderr: '' };
      },
      move: (point) => {
        dispatched.push('mousemove');
        last = point;
        ptrN += 1;
        cx = point.x;
        cy = point.y;
        return { code: 0, signal: null, stdout: '', stderr: '' };
      },
      read: () => {
        dispatched.push('getmouselocation');
        return {
          code: 0,
          signal: null,
          stdout: '',
          stderr: '',
          X: String(last.x),
          Y: String(last.y),
          WINDOW: '0',
        };
      },
      click: () => {
        dispatched.push('click');
        live.clickN += 1;
        return { code: 0, signal: null, stdout: '', stderr: '' };
      },
      nextFact: () => {
        const fact = {
          [cand.VIEWPORT.w]: String(live.vpW),
          [cand.VIEWPORT.h]: String(live.vpH),
          [cand.POINTER.counter]: String(ptrN),
          [cand.POINTER.clientX]: String(cx),
          [cand.POINTER.clientY]: String(cy),
          [cand.CLICK.counter]: String(live.clickN),
          href: live.href,
          scriptText: live.scriptText,
        };
        if (live.clickN > 0) {
          fact[cand.CLICK.clientX] = String(FLOW_TARGET.x);
          fact[cand.CLICK.clientY] = String(FLOW_TARGET.y);
          fact[cand.CLICK.tag] = RECT.t;
          fact[cand.CLICK.testId] = RECT.d;
          fact[cand.CLICK.text] = RECT.l;
          fact.href = `${APP_HREF}?patient=p1`;
        }
        return fact;
      },
    },
  };
}

function frameFor(label, tag) {
  const reader = cand.createBatchReader();
  const row = {
    index: 0,
    label,
    tag,
    testId: 'patient-open',
    x: 300,
    y: 400,
    w: 200,
    h: 28,
  };
  const query = new URLSearchParams();
  query.set('rects', '1');
  query.set('batch', '0');
  query.set('epoch', '1');
  for (const [field, value] of [
    ['x', row.x],
    ['y', row.y],
    ['w', row.w],
    ['h', row.h],
    ['l', row.label],
    ['t', row.tag],
    ['d', row.testId],
  ])
    query.set(`i0_${field}`, String(value));
  reader.observe(`/api/p3.4-observe?${query.toString()}`);
  return reader.frame();
}

async function flow(H, fixture) {
  const clock = H.createClock(0);
  const deadline = H.createTargetDeadline(0, 30_000);
  const schedule = (ms) => {
    clock.advance(ms);
    return Promise.resolve();
  };
  const result = await H.runFlow({
    deadline,
    clock,
    schedule,
    frame: frameFor('John Smith', 'span'),
    wanted: { label: 'John Smith', tag: 'span' },
    expected: { kind: 'patient-href' },
    ops: fixture.ops,
  });
  return { result, dispatched: fixture.dispatched };
}

{
  const f = flowOps({ ownerPid: 999999 });
  const { result, dispatched } = await flow(cand, f);
  check(
    'AFTER a foreign window owner stops runFlow before any move',
    result.ok === false && /not the app pid/.test(result.reason),
    result.reason,
  );
  check(
    'AFTER a foreign owner dispatches only the geometry and pid commands',
    dispatched.join(',') === 'getwindowgeometry,getwindowpid',
    dispatched.join(','),
  );
}
{
  const f = flowOps({ ownerPid: APP_PID });
  const { result, dispatched } = await flow(cand, f);
  check(
    'AFTER the app-owned window lets runFlow reach the landing and click exactly once',
    result.ok === true,
    result.reason,
  );
  check(
    'AFTER the owned window path dispatches getwindowpid then exactly one click',
    dispatched.includes('getwindowpid') && dispatched.filter((n) => n === 'click').length === 1,
    dispatched.join(','),
  );
}
{
  // The baseline has no windowPid op and no anchor: a foreign owner is invisible.
  const f = flowOps({ ownerPid: 999999 });
  let threw = false;
  let result = null;
  try {
    result = await flow(base, f);
  } catch {
    threw = true;
  }
  check(
    'BEFORE a foreign window owner is not even read (no getwindowpid dispatch)',
    !threw && result !== null && !result.dispatched.includes('getwindowpid'),
    threw ? 'baseline flow threw on the synthetic fixture' : result?.dispatched.join(','),
  );
}

process.stdout.write(`\n${String(pass)}/${String(pass + fail)} synthetic before/after checks passed\n`);
process.exitCode = fail === 0 ? 0 : 1;
