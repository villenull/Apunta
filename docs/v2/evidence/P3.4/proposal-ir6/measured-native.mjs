// F3 (DEFECT, model vs root): runFlow solves the affine map from the COMMANDED
// native point, not from the MEASURED native read-back it just required to be
// within 1 px.
//
// Root (P3.4-committee-resolution.md): "Calibrate with two distinct measured
// native/client points, solving the per-axis affine map."
//
// Two flows identical except the read-back differs by exactly 1 px (inside the
// allowed tolerance) ask for the SAME target native point, so the read-back is
// not what is solved. A contract-faithful solve would move the target by ~1 px.
//
// Every execution here is synthetic. Imports the repaired model read-only.
import { fileURLToPath } from 'node:url';

const modelPath =
  process.env.APUNTA_P34_MODEL ??
  fileURLToPath(new URL('../../../../../build/p3.4-spec-v5-repair/model.mjs', import.meta.url));
const {
  createBatchReader, createClock, createTargetDeadline, runFlow, solveTransform,
  MARKER_PATH, POINTER, CLICK, VIEWPORT,
} = await import(modelPath);

const RECT = { l: 'John Smith', t: 'span', d: 'patient-open' };
const WANTED = { label: 'John Smith', tag: 'span' };
const CENTRE = { x: 400, y: 414 };

function frame() {
  const r = createBatchReader();
  r.observe(`${MARKER_PATH}?rects=1&batch=0&epoch=1&i0_x=300&i0_y=400&i0_w=200&i0_h=28&i0_l=${encodeURIComponent('John Smith')}&i0_t=span&i0_d=patient-open`);
  return r.frame();
}

function flowOps(readDelta) {
  const state = { ptrN: 0, ptrCX: NaN, ptrCY: NaN, clicked: false, last: null, targetAsked: null, moves: 0 };
  const observed = (p) => ({ x: Math.round((p.x - 26) / 1.5), y: Math.round((p.y - 31) / 1.5) });
  const snap = () => ({
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
      windowGeometry: () => ({ id: 4711, x: 60, y: 70, w: 1280, h: 860, pid: 4242 }),
      move: (point) => {
        state.moves += 1; state.last = point;
        if (state.moves === 3) state.targetAsked = point;
        const seen = observed(point); state.ptrCX = seen.x; state.ptrCY = seen.y; state.ptrN += 1;
        return { code: 0, signal: null, stdout: '', stderr: '' };
      },
      read: () => ({ code: 0, signal: null, stdout: '', stderr: '', X: String(state.last.x + readDelta), Y: String(state.last.y), WINDOW: '4711', PID: '4242' }),
      click: () => { state.clicked = true; return { code: 0, signal: null, stdout: '', stderr: '' }; },
      nextFact: () => snap(),
    },
  };
}

const run = async (readDelta) => {
  const f = flowOps(readDelta);
  const result = await runFlow({ deadline: createTargetDeadline(0, 30_000), clock: createClock(0), frame: frame(), wanted: WANTED, expected: { kind: 'patient-href' }, ops: f.ops });
  return { asked: f.state.targetAsked, ok: result.ok };
};

const a = await run(0);
const b = await run(1);
// What a MEASURED solve would ask, for comparison (sx = commanded + 1 in x):
const measured = solveTransform([
  { cx: 449, cy: 293, sx: 701, sy: 470 },
  { cx: 663, cy: 346, sx: 1021, sy: 550 },
]);
console.log(`commanded solve: read-back delta 0 -> target asked ${JSON.stringify(a.asked)} (ok=${a.ok})`);
console.log(`commanded solve: read-back delta 1 -> target asked ${JSON.stringify(b.asked)} (ok=${b.ok})`);
console.log(`measured solve (sx = commanded + 1) would ask x=${String(Math.round(measured.toNative({ x: 400, y: 414 }).x))}`);
process.exit(0);
