// F1 (DEFECT, model vs contract): runFlow never classifies the
// `xdotool getwindowgeometry --shell` command outcome. A geometry command that
// exited non-zero, was killed by a signal, or printed XError is accepted as
// long as the raw fields are numeric, and the flow proceeds to a click.
//
// Proposal §F.1: "Fail closed on every command. ... Any signal, any non-zero
// status, or XError in either stream is an immediate failure naming the
// command, the status and the line — before the click is dispatched."
//
// Every execution here is synthetic: no application, display, input, network,
// server or data folder is touched. Imports the repaired model read-only.
import { fileURLToPath } from 'node:url';

const modelPath =
  process.env.APUNTA_P34_MODEL ??
  fileURLToPath(new URL('../../../../../build/p3.4-spec-v5-repair/model.mjs', import.meta.url));
const {
  createBatchReader, createClock, createTargetDeadline, runFlow,
  MARKER_PATH, POINTER, CLICK, VIEWPORT,
} = await import(modelPath);

const WINDOW = { id: 4711, x: 60, y: 70, w: 1280, h: 860 };
const APP_PID = 4242;
const RECT = { l: 'John Smith', t: 'span', d: 'patient-open' };
const WANTED = { label: 'John Smith', tag: 'span' };
const CENTRE = { x: 400, y: 414 };

function frame() {
  const r = createBatchReader();
  r.observe(`${MARKER_PATH}?rects=1&batch=0&epoch=1&i0_x=300&i0_y=400&i0_w=200&i0_h=28&i0_l=${encodeURIComponent('John Smith')}&i0_t=span&i0_d=patient-open`);
  return r.frame();
}

function flowOps(geometry) {
  const state = { ptrN: 0, ptrCX: NaN, ptrCY: NaN, clicked: false, last: null };
  const observed = (p) => ({ x: Math.round((p.x - 26) / 1.5), y: Math.round((p.y - 31) / 1.5) });
  const snapshot = () => ({
    [VIEWPORT.w]: '1280', [VIEWPORT.h]: '800',
    [POINTER.counter]: String(state.ptrN), [POINTER.clientX]: String(state.ptrCX), [POINTER.clientY]: String(state.ptrCY),
    [CLICK.counter]: String(state.clicked ? 1 : 0),
    ...(state.clicked
      ? { [CLICK.clientX]: String(CENTRE.x), [CLICK.clientY]: String(CENTRE.y), [CLICK.tag]: RECT.t, [CLICK.testId]: RECT.d, [CLICK.text]: RECT.l, href: 'http://127.0.0.1:7717/?patient=p1', scriptText: 'false' }
      : { href: 'http://127.0.0.1:7717/', scriptText: 'false' }),
  });
  return {
    state,
    ops: {
      windowGeometry: () => geometry,
      move: (point) => {
        state.last = point;
        const seen = observed(point); state.ptrCX = seen.x; state.ptrCY = seen.y; state.ptrN += 1;
        return { code: 0, signal: null, stdout: '', stderr: '' };
      },
      read: () => ({ code: 0, signal: null, stdout: '', stderr: '', X: String(state.last.x), Y: String(state.last.y), WINDOW: String(WINDOW.id), PID: String(APP_PID) }),
      click: () => { state.clicked = true; return { code: 0, signal: null, stdout: '', stderr: '' }; },
      nextFact: () => snapshot(),
    },
  };
}

const run = async (geometry, label) => {
  const f = flowOps(geometry);
  const result = await runFlow({
    deadline: createTargetDeadline(0, 30_000), clock: createClock(0),
    frame: frame(), wanted: WANTED, expected: { kind: 'patient-href' }, ops: f.ops,
  });
  console.log(`${label}: ok=${result.ok} clicked=${f.state.clicked} reason=${result.reason}`);
};

await run({ id: WINDOW.id, x: 60, y: 70, w: 1280, h: 860, pid: APP_PID }, 'healthy geometry (code 0)');
await run({ code: 1, signal: null, stdout: '', stderr: 'xdotool: BadWindow', id: WINDOW.id, x: 60, y: 70, w: 1280, h: 860, pid: APP_PID }, 'geometry code=1 + stderr');
await run({ code: 0, signal: null, stdout: 'XError: BadValue', stderr: '', id: WINDOW.id, x: 60, y: 70, w: 1280, h: 860, pid: APP_PID }, 'geometry XError on stdout');
await run({ code: null, signal: 'SIGKILL', stdout: '', stderr: '', id: WINDOW.id, x: 60, y: 70, w: 1280, h: 860, pid: APP_PID }, 'geometry signal SIGKILL');
process.exit(0);
