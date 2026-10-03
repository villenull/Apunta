// ir5 reproduction — contract E ("a hung command ends at the deadline")
// against the author's pure model.
//
// dispatchGuarded checks expiry only BEFORE running; it does not race the
// dispatched operation against the deadline. A hung `xdotool mousemove` (or
// click) therefore never resolves, even after the injected clock passes the
// deadline. The suite tests only a hung AWAIT (J5), never a hung dispatch.
//
// Pure synthetic strings/numbers only. Imports the author's model read-only.
import { fileURLToPath } from 'node:url';

const modelPath =
  process.env.APUNTA_P34_MODEL ??
  fileURLToPath(new URL('../../../../../build/p3.4-spec-v5/model.mjs', import.meta.url));
const { solveTransform, createClock, createTargetDeadline, runClick } = await import(modelPath);

const CLIENT_TARGET = { x: 700, y: 500 };
const SCALED = solveTransform([
  { cx: 500, cy: 400, sx: 776, sy: 631 },
  { cx: 600, cy: 430, sx: 926, sy: 676 },
]);
const WINDOW = { id: 4711, x: 60, y: 70, w: 1280, h: 860 };
const dispatched = [];
const ops = {
  move: () => { dispatched.push('mousemove'); return new Promise(() => {}); }, // hung
  read: () => ({ code: 0, signal: null, stdout: '', stderr: '', X: '1076', Y: '781', WINDOW: '4711' }),
  click: () => { dispatched.push('click'); return { code: 0, signal: null, stdout: '', stderr: '' }; },
  nextFact: () => ({ ptrCX: 700, ptrCY: 500, clickN: 0, href: 'x' }),
};
const clock = createClock(0);
const deadline = createTargetDeadline(0, 30_000);
const run = runClick({
  deadline, clock, transform: SCALED, window: WINDOW, appPid: 4242,
  target: CLIENT_TARGET, expected: { el: 'span.name', kind: 'patient-href' }, ops,
});
clock.advance(60_000); // 30 s past the deadline
await clock.settle();

const verdict = await Promise.race([
  run.then((r) => `resolved ok=${r.ok} reason=${r.reason}`),
  new Promise((res) => setTimeout(() => res('DID NOT RESOLVE after the deadline advanced'), 300)),
]);
console.log(`hung-move: ${verdict}; dispatched=${JSON.stringify(dispatched)}`);
process.exit(0);
