// Re-run of the ir5 counterexamples against the REPAIRED model, with the
// pointer counter the repaired contract requires the hook to publish.
//
// The ir5 fixtures themselves are preserved unmodified in
// docs/v2/evidence/P3.4/proposal-ir5/ and still fail against the repaired model
// — but for a different, contract-correct reason: their synthetic facts never
// carried `ptrN`, so the repaired model names a missing counter and issues no
// click. The cases below are the same scenarios with a compliant fact line, so
// the before/after outcome of every finding is visible in one run.
//
// Pure synthetic strings and numbers; no application, display, input, network,
// server or data folder is touched. Imports the repaired model read-only.
import { fileURLToPath } from 'node:url';
import { format } from 'node:util';

const modelPath =
  process.env.APUNTA_P34_MODEL ??
  fileURLToPath(new URL('../../../../../build/p3.4-spec-v5-repair/model.mjs', import.meta.url));
const { MARKER_PATH, CLICK, POINTER, createBatchReader, createClock, createTargetDeadline, runClick, solveTransform } =
  await import(modelPath);

const WINDOW = { id: 4711, x: 60, y: 70, w: 1280, h: 860 };
const APP_PID = 4242;
const CLIENT_TARGET = { x: 700, y: 500 };
const SCALED = solveTransform([
  { cx: 500, cy: 400, sx: 776, sy: 631 },
  { cx: 600, cy: 430, sx: 926, sy: 676 },
]);
const RECT = { l: 'John Smith', t: 'span', d: 'patient-open' };

/** ir5 P3's shape: the pointer is left at the last calibration point. */
function opsFor({ hangMove = false, pointerDelivered = true } = {}) {
  const state = { ptrN: 9, clientX: 800, clientY: 430, clicked: false, asked: null };
  const dispatched = [];
  return {
    dispatched,
    state,
    ops: {
      move: (point) => {
        dispatched.push('mousemove');
        state.asked = point;
        if (hangMove) return new Promise(() => {});
        return { code: 0, signal: null, stdout: '', stderr: '' };
      },
      read: () => {
        dispatched.push('getmouselocation');
        return {
          code: 0, signal: null, stdout: '', stderr: '',
          X: String(state.asked?.x ?? 0), Y: String(state.asked?.y ?? 0), WINDOW: String(WINDOW.id),
        };
      },
      click: () => {
        dispatched.push('click');
        state.clicked = true;
        return { code: 0, signal: null, stdout: '', stderr: '' };
      },
      nextFact: () => ({
        [POINTER.counter]: String(state.ptrN),
        [POINTER.clientX]: String(state.clientX),
        [POINTER.clientY]: String(state.clientY),
        [CLICK.counter]: String(state.clicked ? 1 : 0),
        ...(state.clicked
          ? {
              [CLICK.clientX]: String(CLIENT_TARGET.x),
              [CLICK.clientY]: String(CLIENT_TARGET.y),
              [CLICK.tag]: RECT.t, [CLICK.testId]: RECT.d, [CLICK.text]: RECT.l,
              href: 'http://127.0.0.1:7717/?patient=p1',
            }
          : { href: 'http://127.0.0.1:7717/' }),
      }),
      // The page observes the warp only when a pointermove is delivered.
      noteDelivery: () => {
        if (pointerDelivered) {
          state.ptrN += 1;
          state.clientX = CLIENT_TARGET.x;
          state.clientY = CLIENT_TARGET.y;
        }
      },
    },
  };
}

const run = (fixture, extra = {}) =>
  runClick({
    deadline: extra.deadline ?? createTargetDeadline(0, 30_000),
    clock: extra.clock ?? createClock(0),
    transform: SCALED, window: WINDOW, appPid: APP_PID, target: CLIENT_TARGET,
    rect: RECT, expected: { kind: 'patient-href' }, ops: fixture.ops,
  });

// ---- P3 (B1): the pre-warp witness gate is gone ----------------------------
{
  const fixture = opsFor();
  const originalMove = fixture.ops.move;
  fixture.ops.move = (point) => {
    const out = originalMove(point);
    fixture.ops.noteDelivery();
    return out;
  };
  const result = await run(fixture);
  process.stdout.write(format(`P3 ok=${result.ok} dispatched=${JSON.stringify(result.dispatched)} reason=${result.reason}`) + '\n');
}

// ---- P4 (D1): ptrN must advance, or there is no click ----------------------
{
  const fixture = opsFor();
  const result = await run(fixture); // noteDelivery is never wired: ptrN stays 9
  process.stdout.write(format(`P4 (ptrN never advances) ok=${result.ok} dispatched=${JSON.stringify(result.dispatched)} reason=${result.reason}`) + '\n');
}

// ---- B2: a hung dispatch ends at the deadline -----------------------------
{
  const clock = createClock(0);
  const deadline = createTargetDeadline(0, 30_000);
  const fixture = opsFor({ hangMove: true });
  const pending = run(fixture, { clock, deadline });
  await clock.settle();
  clock.advance(60_000);
  const result = await Promise.race([
    pending,
    new Promise((resolve) => setTimeout(() => resolve({ ok: 'DID NOT RESOLVE' }), 300)),
  ]);
  process.stdout.write(format(`B2 hung-move ok=${result.ok} reason=${result.reason} deadlineAt=${String(deadline.at)}`) + '\n');
}

// ---- P5 (D7): the pair key, not the triple --------------------------------
{
  const reader = createBatchReader();
  const entries = [
    { index: 0, label: 'Open', tag: 'button', testId: 'note-open', x: 10, y: 20, w: 40, h: 20 },
    { index: 1, label: 'Open', tag: 'button', testId: 'script-open', x: 60, y: 20, w: 40, h: 20 },
  ];
  const q = new URLSearchParams();
  q.set('rects', '2'); q.set('batch', '0'); q.set('epoch', '1');
  for (const e of entries) {
    q.set(`i${e.index}_x`, String(e.x)); q.set(`i${e.index}_y`, String(e.y));
    q.set(`i${e.index}_w`, String(e.w)); q.set(`i${e.index}_h`, String(e.h));
    q.set(`i${e.index}_l`, e.label); q.set(`i${e.index}_t`, e.tag); q.set(`i${e.index}_d`, e.testId);
  }
  reader.observe(`${MARKER_PATH}?${q.toString()}`);
  const { selectTarget } = await import(modelPath);
  const pair = selectTarget(reader.frame(), { label: 'Open', tag: 'button' });
  process.stdout.write(format(`P5 same label+tag, distinct testId: pair-key ok=${pair.ok} reason=${pair.reason}`) + '\n');
  process.stdout.write(format(`P5 exported orchestration present? runFlow=${String(typeof (await import(modelPath)).runFlow)}`) + '\n');
}

// ---- P2 (B3): a valid newer header forbids the older complete frame -------
{
  const reader = createBatchReader();
  const good = new URLSearchParams();
  good.set('rects', '1'); good.set('batch', '0'); good.set('epoch', '5');
  good.set('i0_x', '1'); good.set('i0_y', '2'); good.set('i0_w', '3');
  good.set('i0_h', '4'); good.set('i0_l', 'A'); good.set('i0_t', 'span'); good.set('i0_d', '');
  reader.observe(`${MARKER_PATH}?${good.toString()}`);
  const outcome = reader.observe(`${MARKER_PATH}?rects=1&batch=0&epoch=6&i0_x=1&i0_y=2`);
  const after = reader.frame();
  process.stdout.write(format(`P2 newer header (epoch=6) truncated -> kind=${outcome.kind} header=${String(outcome.header)} highestSeenAfter=${reader.highestSeenEpoch}`) + '\n');
  process.stdout.write(format(`P2 after: frame.ok=${after.ok} reason=${after.reason}`) + '\n');
}
process.exit(0);