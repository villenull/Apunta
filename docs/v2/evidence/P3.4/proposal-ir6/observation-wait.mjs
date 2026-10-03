// F2 (DEFECT, coverage): there is no deadline-raced observation poll anywhere.
// Every fact read is a single synchronous nextFact() call (or one one-shot call
// wrapped in awaitGuarded). A healthy observation that lands one read later is
// refused immediately, and no fixture can make an observation wait consume the
// immutable deadline or show a late observation failing to dispatch the next
// operation.
//
// Root (P3.4-committee-resolution.md): the model "must cover ... interrupted or
// late awaits". Proposal §D.4: "record ptrN, dispatch, then require a fact line
// whose ptrN is strictly greater". §D.8: the patient-open step "requires a fact
// line published after the click whose href differs".
//
// Every execution here is synthetic. Imports the repaired model read-only.
import { fileURLToPath } from 'node:url';
import { format } from 'node:util';

const modelPath =
  process.env.APUNTA_P34_MODEL ??
  fileURLToPath(new URL('../../../../../build/p3.4-spec-v5-repair/model.mjs', import.meta.url));
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

// ---- (a) a pointer observation that lands one read after the move ----------
function delayedPointerOps() {
  const state = { ptrN: 0, ptrCX: NaN, ptrCY: NaN, pending: false, queued: null, last: null, reads: 0 };
  const observed = (p) => ({ x: Math.round((p.x - 26) / 1.5), y: Math.round((p.y - 31) / 1.5) });
  const snap = () => ({
    [VIEWPORT.w]: '1280', [VIEWPORT.h]: '800',
    [POINTER.counter]: String(state.ptrN), [POINTER.clientX]: String(state.ptrCX), [POINTER.clientY]: String(state.ptrCY),
    [CLICK.counter]: '0', href: 'http://127.0.0.1:7717/',
  });
  return {
    state,
    ops: {
      windowGeometry: () => ({ id: 4711, x: 60, y: 70, w: 1280, h: 860, pid: 4242 }),
      move: (point) => {
        state.last = point;
        state.queued = observed(point);
        state.pending = true; // the page has not published this yet
        return { code: 0, signal: null, stdout: '', stderr: '' };
      },
      read: () => ({ code: 0, signal: null, stdout: '', stderr: '', X: String(state.last.x), Y: String(state.last.y), WINDOW: '4711', PID: '4242' }),
      click: () => ({ code: 0, signal: null, stdout: '', stderr: '' }),
      nextFact: () => {
        state.reads += 1;
        if (state.pending) { state.pending = false; return snap(); } // first read: stale
        if (state.queued) { state.ptrCX = state.queued.x; state.ptrCY = state.queued.y; state.ptrN += 1; state.queued = null; }
        return snap();
      },
    },
  };
}

// ---- (b) a landing fact that lands one read after the click ----------------
function delayedLandingOps() {
  const state = { ptrN: 0, ptrCX: NaN, ptrCY: NaN, clicked: false, last: null, readsAfterClick: 0 };
  const observed = (p) => ({ x: Math.round((p.x - 26) / 1.5), y: Math.round((p.y - 31) / 1.5) });
  const snap = (landed) => ({
    [VIEWPORT.w]: '1280', [VIEWPORT.h]: '800',
    [POINTER.counter]: String(state.ptrN), [POINTER.clientX]: String(state.ptrCX), [POINTER.clientY]: String(state.ptrCY),
    [CLICK.counter]: String(state.clicked ? 1 : 0),
    ...(state.clicked
      ? { [CLICK.clientX]: String(CENTRE.x), [CLICK.clientY]: String(CENTRE.y), [CLICK.tag]: RECT.t, [CLICK.testId]: RECT.d, [CLICK.text]: RECT.l, scriptText: 'false',
          href: landed ? 'http://127.0.0.1:7717/?patient=p1' : 'http://127.0.0.1:7717/' }
      : { href: 'http://127.0.0.1:7717/', scriptText: 'false' }),
  });
  return {
    state,
    ops: {
      windowGeometry: () => ({ id: 4711, x: 60, y: 70, w: 1280, h: 860, pid: 4242 }),
      move: (point) => {
        state.last = point;
        const seen = observed(point); state.ptrCX = seen.x; state.ptrCY = seen.y; state.ptrN += 1;
        return { code: 0, signal: null, stdout: '', stderr: '' };
      },
      read: () => ({ code: 0, signal: null, stdout: '', stderr: '', X: String(state.last.x), Y: String(state.last.y), WINDOW: '4711', PID: '4242' }),
      click: () => { state.clicked = true; return { code: 0, signal: null, stdout: '', stderr: '' }; },
      nextFact: () => {
        if (state.clicked) { state.readsAfterClick += 1; return snap(state.readsAfterClick >= 2); }
        return snap(false);
      },
    },
  };
}

const run = async (ops) =>
  runFlow({ deadline: createTargetDeadline(0, 30_000), clock: createClock(0), frame: frame(), wanted: WANTED, expected: { kind: 'patient-href' }, ops });

{
  const f = delayedPointerOps();
  const result = await run(f.ops);
  process.stdout.write(format(`(a) delayed pointer observation: ok=${result.ok} nextFactCalls=${f.state.reads} reason=${result.reason}`) + '\n');
}
{
  const f = delayedLandingOps();
  const result = await run(f.ops);
  process.stdout.write(format(`(b) delayed landing observation: ok=${result.ok} readsAfterClick=${f.state.readsAfterClick} reason=${result.reason}`) + '\n');
}
process.exit(0);
