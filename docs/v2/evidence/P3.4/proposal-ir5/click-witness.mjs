// ir5 reproduction — click-run findings against the author's pure model.
//
// P3: runClick gates on a PRE-move witness at the target; on a realistic run
//     (pointer left at the last calibration point) it fails with no move and
//     no click, although the contract requires only a witness AFTER the warp.
// P4: ptrN monotonicity (contract D.5) is never checked; a post-move fact whose
//     ptrN never advances still passes and clicks.
// P5: selection key is the (label, tag, testId) triple, not root's
//     "unique label/tag pair".
// P6: the model exports no calibration flow at all.
//
// Pure synthetic strings/numbers only. Imports the author's model read-only.
import { fileURLToPath } from 'node:url';
import { format } from 'node:util';

const modelPath =
  process.env.APUNTA_P34_MODEL ??
  fileURLToPath(new URL('../../../../../build/p3.4-spec-v5/model.mjs', import.meta.url));
const {
  MARKER_PATH, createBatchReader, solveTransform, createClock, createTargetDeadline,
  runClick, selectTarget,
} = await import(modelPath);

const WINDOW = { id: 4711, x: 60, y: 70, w: 1280, h: 860 };
const APP_PID = 4242;
const CLIENT_TARGET = { x: 700, y: 500 };
// 1.5x scale with a titlebar-sized offset; native target = (1076, 781).
const SCALED = solveTransform([
  { cx: 500, cy: 400, sx: 776, sy: 631 },
  { cx: 600, cy: 430, sx: 926, sy: 676 },
]);

// ---- P3 -------------------------------------------------------------------
{
  const dispatched = [];
  const calibrationFact = { ptrCX: 800, ptrCY: 430, clickN: 0, href: 'x' };
  const targetFact = { ptrCX: CLIENT_TARGET.x, ptrCY: CLIENT_TARGET.y, clickN: 0, href: 'x' };
  const afterClick = { clickN: 1, clickCX: 700, clickCY: 500, clickEl: 'span.name', href: 'y' };
  const ops = {
    move: () => { dispatched.push('mousemove'); return { code: 0, signal: null, stdout: '', stderr: '' }; },
    read: () => { dispatched.push('getmouselocation'); return { code: 0, signal: null, stdout: '', stderr: '', X: '1076', Y: '781', WINDOW: '4711' }; },
    click: () => { dispatched.push('click'); return { code: 0, signal: null, stdout: '', stderr: '' }; },
    nextFact: () => (dispatched.includes('getmouselocation') ? (dispatched.includes('click') ? afterClick : targetFact) : calibrationFact),
  };
  const clock = createClock(0);
  const deadline = createTargetDeadline(0, 30_000);
  const result = await runClick({
    deadline, clock, transform: SCALED, window: WINDOW, appPid: APP_PID,
    target: CLIENT_TARGET, expected: { el: 'span.name', kind: 'patient-href' }, ops,
  });
  process.stdout.write(format(`P3 ok=${result.ok} dispatched=${JSON.stringify(dispatched)} reason=${result.reason}`) + '\n');
}

// ---- P4 -------------------------------------------------------------------
{
  const dispatched = [];
  const facts = [
    { ptrN: 9, ptrCX: 700, ptrCY: 500, clickN: 0, href: 'x' },
    { ptrN: 9, ptrCX: 700, ptrCY: 500, clickN: 0, href: 'x' }, // ptrN did NOT advance
    { ptrN: 9, ptrCX: 700, ptrCY: 500, clickN: 0, href: 'x' },
    { ptrN: 9, clickN: 1, clickCX: 700, clickCY: 500, clickEl: 'span.name', href: 'y' },
  ];
  let i = 0;
  const ops = {
    move: () => { dispatched.push('mousemove'); return { code: 0, signal: null, stdout: '', stderr: '' }; },
    read: () => { dispatched.push('getmouselocation'); return { code: 0, signal: null, stdout: '', stderr: '', X: '1076', Y: '781', WINDOW: '4711' }; },
    click: () => { dispatched.push('click'); return { code: 0, signal: null, stdout: '', stderr: '' }; },
    nextFact: () => facts[Math.min(i++, facts.length - 1)],
  };
  const clock = createClock(0);
  const deadline = createTargetDeadline(0, 30_000);
  const result = await runClick({
    deadline, clock, transform: SCALED, window: WINDOW, appPid: APP_PID,
    target: CLIENT_TARGET, expected: { el: 'span.name', kind: 'patient-href' }, ops,
  });
  process.stdout.write(format(`P4 (ptrN never advances) ok=${result.ok} dispatched=${JSON.stringify(dispatched)} reason=${result.reason}`) + '\n');
}

// ---- P5 -------------------------------------------------------------------
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
  const pair = selectTarget(reader.frame(), { label: 'Open', tag: 'button', testId: '' });
  const triple = selectTarget(reader.frame(), { label: 'Open', tag: 'button', testId: 'script-open' });
  process.stdout.write(format(`P5 same label+tag, distinct testId: pair-key ok=${pair.ok} reason=${pair.reason}`) + '\n');
  process.stdout.write(format(`P5                                  triple ok=${triple.ok} index=${triple.index}`) + '\n');
}

// ---- P6 -------------------------------------------------------------------
process.stdout.write(format(`P6 model exports calibrate()? ${String(typeof (await import(modelPath)).calibrate)}`) + '\n');
