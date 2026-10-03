// F2 AFTER — an adapted copy of docs/v2/evidence/P3.4/proposal-ir6/observation-wait.mjs.
//
// The original probe's fixtures were self-shaped instant queues with a
// synchronous `nextFact`, so they could not represent the hook's 250 ms
// change-only publication. This adapted copy models a page that publishes on its
// own tick and injects the scheduler that drives those ticks. It shows:
//   (a) a pointer observation published one tick after the move is WAITED for
//       and succeeds (the original refused it on a single read);
//   (b) a landing published one tick after the click is WAITED for and succeeds;
//   (c) a pointermove that never reaches the page ends at the immutable deadline.
//
// Every execution is synthetic. Imports the model read-only.
import { fileURLToPath } from 'node:url';

const modelPath =
  process.env.APUNTA_P34_MODEL ??
  fileURLToPath(new URL('../../../../../build/p3.4-spec-v5-repair2/model.mjs', import.meta.url));
const {
  createBatchReader, createClock, createTargetDeadline, runFlow,
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

function makePage({ deliver = () => true, landing = 'patient-href' } = {}) {
  const clock = createClock(0);
  const deadline = createTargetDeadline(0, 30_000);
  const live = {
    ptrN: 0, ptrCX: Number.NaN, ptrCY: Number.NaN,
    clickN: 0, clickCX: Number.NaN, clickCY: Number.NaN,
    tag: '', testId: '', text: '', href: 'http://127.0.0.1:7717/', scriptText: 'false',
    landingPending: false,
  };
  const state = { last: null, moves: 0, ticks: 0 };
  const observed = (p) => ({ x: Math.round((p.x - 26) / 1.5), y: Math.round((p.y - 31) / 1.5) });
  const snapshot = () => ({
    [VIEWPORT.w]: '1280', [VIEWPORT.h]: '800',
    [POINTER.counter]: String(live.ptrN), [POINTER.clientX]: String(live.ptrCX), [POINTER.clientY]: String(live.ptrCY),
    [CLICK.counter]: String(live.clickN),
    [CLICK.clientX]: String(live.clickCX), [CLICK.clientY]: String(live.clickCY),
    [CLICK.tag]: live.tag, [CLICK.testId]: live.testId, [CLICK.text]: live.text,
    href: live.href, scriptText: live.scriptText,
  });
  let published = snapshot();
  let dirty = false;
  const tick = () => {
    state.ticks += 1;
    if (live.landingPending) {
      if (landing === 'patient-href') live.href = 'http://127.0.0.1:7717/?patient=p1';
      else if (landing === 'script-text') live.scriptText = 'true';
      live.landingPending = false;
      dirty = true;
    }
    if (dirty) { published = snapshot(); dirty = false; }
  };
  const schedule = (ms) => { clock.advance(ms); tick(); return Promise.resolve(); };
  const ops = {
    windowGeometry: () => ({ code: 0, signal: null, stdout: '', stderr: '', id: 4711, x: 60, y: 70, w: 1280, h: 860, pid: 4242 }),
    move: (point) => {
      state.moves += 1;
      state.last = point;
      if (deliver(state.moves)) {
        const seen = observed(point);
        live.ptrCX = seen.x; live.ptrCY = seen.y; live.ptrN += 1; dirty = true;
      }
      return { code: 0, signal: null, stdout: '', stderr: '' };
    },
    read: () => ({ code: 0, signal: null, stdout: '', stderr: '', X: String(state.last.x), Y: String(state.last.y), WINDOW: '4711', PID: '4242' }),
    click: () => {
      live.clickN += 1;
      live.clickCX = CENTRE.x; live.clickCY = CENTRE.y;
      live.tag = RECT.t; live.testId = RECT.d; live.text = RECT.l;
      live.landingPending = landing !== 'none';
      dirty = true;
      return { code: 0, signal: null, stdout: '', stderr: '' };
    },
    nextFact: () => published,
  };
  return { clock, deadline, schedule, ops, state };
}

const run = async (page) => runFlow({
  deadline: page.deadline, clock: page.clock, schedule: page.schedule,
  frame: frame(), wanted: WANTED, expected: { kind: 'patient-href' }, ops: page.ops,
});

{
  const page = makePage();
  const result = await run(page);
  process.stdout.write(`(a) delayed pointer observation: ok=${result.ok} ticks=${String(page.state.ticks)} reason=${result.reason}\n`);
}
{
  const page = makePage();
  const result = await run(page);
  process.stdout.write(`(b) delayed landing observation: ok=${result.ok} ticks=${String(page.state.ticks)} reason=${result.reason}\n`);
}
{
  const page = makePage({ deliver: () => false });
  const result = await run(page);
  process.stdout.write(`(c) never-delivered pointermove: ok=${result.ok} clicked=${result.dispatched.includes('click')} reason=${result.reason}\n`);
}
process.exit(0);
