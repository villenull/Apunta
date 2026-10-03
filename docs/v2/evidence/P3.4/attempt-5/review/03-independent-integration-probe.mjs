// Independent integration probe (durable evidence). Exercises the SHIPPED
// harness functions with injected synthetic IO. No app, server, display, input,
// network or DB. Run: pinned node build/p3.4-impl5-ir/integration-check.mjs
import { format } from 'node:util';
import {
  MARKER_PATH,
  DEADLINE_EXPIRED,
  createRealClock,
  createTargetDeadline,
  createBatchReader,
  markerLinesOf,
  tagForLabel,
  runFlow,
  checkNoIpc,
  cascadeCause,
  firstFactGate,
  spawnAsync,
} from '../../../../../../scripts/v2/tauri-security.test.mjs';

let failures = 0;
const ok = (name, cond, detail = '') => {
  process.stdout.write(format('%s', `${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ` :: ${detail}` : ''}`) + '\n');
  if (!cond) failures += 1;
};

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
const stderrOf = (lines) => lines.map((l) => `apunta: ignoring a bridge line (Unreadable): GET ${l}`).join('\n');

// ---------------------------------------------------------------- gate/assert
ok('gate requires href AND ipcProbe', firstFactGate([{ href: 'x' }]) === null);
ok('gate passes when both present', firstFactGate([{ href: 'x', ipcProbe: 'pending' }]) !== null);
ok('assert pending FAILs', checkNoIpc({ ipcProbe: 'pending' }).ok === false);
ok('assert resolved FAILs', checkNoIpc({ ipcProbe: 'resolved' }).ok === false);
ok(
  'assert exact ACL denial PASSes',
  checkNoIpc({
    tauri: 'undefined',
    ipc: 'object',
    ipcInvoke: 'function',
    ipcProbe: 'rejected',
    ipcProbeMsg: `Command plugin:event|listen not allowed by ACL`,
  }).ok === true,
);
ok('assert a wrong rejection msg FAILs', checkNoIpc({
  tauri: 'undefined', ipc: 'object', ipcInvoke: 'function', ipcProbe: 'rejected', ipcProbeMsg: 'Command listen not found',
}).ok === false);
ok('cascade zero-lines arm', cascadeCause(0).arm === 'zero-lines');
ok('cascade lines arm', cascadeCause(6).arm === 'incomplete-fact-set');
ok('cascade has five rows', cascadeCause(0).rows.length === 5);

// ------------------------------------------------------ marker/frame adapters
const good = batchLine({ epoch: 5, batch: 0, total: 1, entries: [{ index: 0, label: 'John Smith', tag: 'TR', testId: 'patient-open', x: 10, y: 20, w: 200, h: 28 }] });
ok('markerLinesOf reads only marker lines', markerLinesOf(stderrOf([good, 'noise'])).length === 1);
ok('tagForLabel unique -> tag', tagForLabel(stderrOf([good]), 'John Smith') === 'TR');

// -------------------------------------------------------- success run (scale 2)
// Build synthetic ops. The page's fact line advances ptrN/clickN after each
// command, and href changes after the click.
function makeSyntheticOps({ scale = 2, offsetX = 0, offsetY = 0, hangMove = false, hangClick = false, windowId = '4242', pid = 777 } = {}) {
  const state = { href: 'http://127.0.0.1/app', vpW: 1000, vpH: 800, ptrN: 0, ptrCX: 0, ptrCY: 0, clickN: 0, clickCX: 0, clickCY: 0, clickTag: '', clickTestId: '', clickText: '', scriptText: 'false' };
  const native = { x: 0, y: 0 };
  const dispatched = [];
  const fact = () => ({ ...state });
  const ops = {
    windowGeometry: async () => ({ code: 0, signal: null, stdout: '', stderr: '', id: windowId, x: '100', y: '50', w: '800', h: '600', pid: String(pid) }),
    move: async (point) => {
      dispatched.push(`move:${point.x},${point.y}`);
      if (hangMove) return new Promise(() => {});
      native.x = point.x;
      native.y = point.y;
      // The page's client pointer is the native point transformed by 1/scale.
      state.ptrN += 1;
      state.ptrCX = Math.round((point.x - offsetX) / scale);
      state.ptrCY = Math.round((point.y - offsetY) / scale);
      return { code: 0, signal: null, stdout: '', stderr: '' };
    },
    read: async () => ({ code: 0, signal: null, stdout: '', stderr: '', X: String(native.x), Y: String(native.y), WINDOW: windowId, PID: String(pid) }),
    click: async () => {
      dispatched.push('click');
      if (hangClick) return new Promise(() => {});
      state.clickN += 1;
      state.clickCX = Math.round((native.x - offsetX) / scale);
      state.clickCY = Math.round((native.y - offsetY) / scale);
      state.clickTag = 'TR';
      state.clickTestId = 'patient-open';
      state.clickText = 'John Smith';
      state.href = 'http://127.0.0.1/patients/1';
      return { code: 0, signal: null, stdout: '', stderr: '' };
    },
    nextFact: () => fact(),
  };
  return { ops, state, dispatched };
}

// A frame whose John Smith row sits at client (100,200) size 120x24 -> centre (160,212).
const frame = createBatchReader();
frame.observe(good);
const frameObj = frame.frame();
ok('synthetic frame complete', frameObj.ok === true && frameObj.rects.size === 1);

const happy = makeSyntheticOps({ scale: 2 });
const clock = createRealClock();
const result = await runFlow({
  deadline: createTargetDeadline(clock.now()),
  clock,
  frame: frameObj,
  wanted: { label: 'John Smith', tag: 'TR' },
  expected: { kind: 'patient-href' },
  ops: happy.ops,
  schedule: (ms) => new Promise((d) => setTimeout(d, ms)),
});
ok('success run ok', result.ok === true, result.reason);
ok('success run dispatched exactly one click', happy.dispatched.filter((d) => d === 'click').length === 1, happy.dispatched.join(','));
ok('success run warps bootstrap1, bootstrap2 and the target (3 moves)', happy.dispatched.filter((d) => d.startsWith('move:')).length === 3, happy.dispatched.join(','));

// ------------------------------------------------------ hung target warp reason
const hung = makeSyntheticOps({ scale: 2, hangMove: false });
// Hang only the target warp: first two moves succeed, third hangs.
let moveCount = 0;
const origMove = hung.ops.move;
hung.ops.move = (p) => {
  moveCount += 1;
  if (moveCount === 3) return new Promise(() => {});
  return origMove(p);
};
const clock2 = createRealClock();
const hungResult = await runFlow({
  deadline: createTargetDeadline(clock2.now(), 120),
  clock: clock2,
  frame: frameObj,
  wanted: { label: 'John Smith', tag: 'TR' },
  expected: { kind: 'patient-href' },
  ops: hung.ops,
  schedule: (ms) => new Promise((d) => setTimeout(d, ms)),
});
ok('hung target warp fails', hungResult.ok === false, hungResult.reason);
ok('hung target warp issues no click', hung.dispatched.filter((d) => d === 'click').length === 0, hung.dispatched.join(','));
ok(
  'runFlow reason carries the deadline but is NOT exactly DEADLINE_EXPIRED',
  hungResult.reason !== DEADLINE_EXPIRED && hungResult.reason.includes(DEADLINE_EXPIRED),
  JSON.stringify(hungResult.reason),
);

// --------------------------------------------------------- spawnAsync shape
const shape = await spawnAsync(process.execPath, ['-e', "process.stdout.write('o');process.stderr.write('e')"]);
ok('spawnAsync returns the four-field shape', JSON.stringify(Object.keys(shape).sort()) === JSON.stringify(['code', 'signal', 'stderr', 'stdout']), JSON.stringify(shape));

process.stdout.write(format('%s', `\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`) + '\n');
process.exit(failures === 0 ? 0 : 1);
