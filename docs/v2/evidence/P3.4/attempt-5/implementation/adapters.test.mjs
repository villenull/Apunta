// Adapter fixtures for the P3.4 AM-188 harness real-IO seam.
//
// The ported-model.test.mjs proves the shipped logic matches the reviewed pure
// model. This file proves the harness-specific ADAPTERS around that logic: the
// real clock, the single-shape spawnAsync, and the child-stderr frame adapters
// (`markerLinesOf`, `frameFrom`, `tagForLabel`). Everything is synthetic: no
// patient data, no application, no server, no display, no pointer, no network.
//
// `spawnAsync` is exercised against a local `node -e` child only — no app, no
// server, no database, no audio, no display, no network, never port 7717.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MARKER_PATH,
  createRealClock,
  createTargetDeadline,
  dispatchGuarded,
  frameFrom,
  markerLinesOf,
  pollObservation,
  spawnAsync,
  tagForLabel,
} from '../../../../../../scripts/v2/tauri-security.test.mjs';

const batchLine = ({ epoch, batch, total, entries }) => {
  const query = new URLSearchParams();
  query.set('rects', String(total));
  query.set('batch', String(batch));
  query.set('epoch', String(epoch));
  for (const { index, label, tag, testId, x, y, w, h } of entries) {
    query.set(`i${String(index)}_x`, String(x));
    query.set(`i${String(index)}_y`, String(y));
    query.set(`i${String(index)}_w`, String(w));
    query.set(`i${String(index)}_h`, String(h));
    query.set(`i${String(index)}_l`, label);
    query.set(`i${String(index)}_t`, tag);
    query.set(`i${String(index)}_d`, testId);
  }
  return `${MARKER_PATH}?${query.toString()}`;
};

const factLine = (facts) =>
  `${MARKER_PATH}?${new URLSearchParams(Object.entries(facts).map(([k, v]) => [k, String(v)])).toString()}`;

test('A1 createRealClock: now advances, at fires, clear cancels', async () => {
  const clock = createRealClock();
  const start = clock.now();
  assert.equal(typeof start, 'number');
  assert.ok(start > 0);
  let fired = 0;
  const id = clock.at(clock.now() + 5, () => {
    fired += 1;
  });
  assert.equal(clock.pending(), 1);
  await new Promise((done) => setTimeout(done, 40));
  assert.equal(fired, 1);
  assert.equal(clock.pending(), 0);
  const id2 = clock.at(clock.now() + 1000, () => {
    fired += 1;
  });
  clock.clear(id2);
  assert.equal(clock.pending(), 0);
  assert.throws(() => clock.advance(1), /cannot be advanced/);
  assert.equal(typeof id, 'number');
});

test('A2 spawnAsync: one result shape, backward compatible', async () => {
  const result = await spawnAsync(process.execPath, [
    '-e',
    "process.stdout.write('out');process.stderr.write('err')",
  ]);
  assert.deepEqual(Object.keys(result).sort(), ['code', 'signal', 'stderr', 'stdout']);
  assert.equal(result.code, 0);
  assert.equal(result.signal, null);
  assert.equal(result.stdout, 'out');
  assert.equal(result.stderr, 'err');
});

test('A3 spawnAsync: a non-zero exit carries its code and streams', async () => {
  const result = await spawnAsync(process.execPath, ['-e', "process.stderr.write('boom');process.exit(3)"]);
  assert.equal(result.code, 3);
  assert.equal(result.signal, null);
  assert.equal(result.stderr, 'boom');
});

test('A4 markerLinesOf: only lines carrying the marker path, in order', () => {
  const stderr = [
    'apunta: ignoring a bridge line (Unreadable): GET ' + factLine({ href: 'x', ipcProbe: 'pending' }),
    'some unrelated stderr line',
    'apunta: ignoring a bridge line (Unreadable): GET ' + batchLine({ epoch: 1, batch: 0, total: 1, entries: [{ index: 0, label: 'Row 0', tag: 'span', testId: '', x: 1, y: 2, w: 3, h: 4 }] }),
  ].join('\n');
  const lines = markerLinesOf(stderr);
  assert.equal(lines.length, 2);
  assert.match(lines[0], /href=x/);
  assert.match(lines[1], /epoch=1/);
});

test('A5 frameFrom and tagForLabel: the row is selected before any tooltip', () => {
  const stderr = [
    batchLine({ epoch: 1, batch: 0, total: 2, entries: [
      { index: 0, label: 'John Smith', tag: 'TR', testId: 'patient-open', x: 10, y: 20, w: 200, h: 28 },
      { index: 1, label: 'John Smith', tag: 'DIV', testId: '', x: 400, y: 20, w: 180, h: 28 },
    ] }),
  ].join('\n');
  const frame = frameFrom(stderr);
  assert.equal(frame.ok, true);
  // Two rectangles carry the label; tagForLabel is deliberately null (not
  // unique) rather than first-match-wins.
  assert.equal(tagForLabel(stderr, 'John Smith'), null);
  // A frame with exactly one rectangle for the label yields its tag.
  const single = batchLine({ epoch: 1, batch: 0, total: 1, entries: [
    { index: 0, label: 'John Smith', tag: 'TR', testId: 'patient-open', x: 10, y: 20, w: 200, h: 28 },
  ] });
  assert.equal(tagForLabel(single, 'John Smith'), 'TR');
  assert.equal(tagForLabel(single, 'Nobody'), null);
});

test('A7 the real clock deadline ends a hung dispatch and a hung poll', async () => {
  const clock = createRealClock();
  const deadline = createTargetDeadline(clock.now(), 60);
  const started = Date.now();
  const hung = await dispatchGuarded(deadline, clock, 'xdotool mousemove --sync', () => new Promise(() => {}));
  const elapsed = Date.now() - started;
  assert.equal(hung.ok, false);
  assert.match(hung.reason, /deadline expired/);
  assert.ok(elapsed >= 40 && elapsed < 1000, `the 60 ms deadline fired at ${String(elapsed)} ms`);

  const clock2 = createRealClock();
  const deadline2 = createTargetDeadline(clock2.now(), 60);
  const poll = await pollObservation({
    deadline: deadline2,
    clock: clock2,
    currentFact: () => ({ stale: 'yes' }),
    classify: () => ({ ok: false, terminal: false }),
    schedule: (ms) => new Promise((done) => setTimeout(done, ms)),
  });
  assert.equal(poll.ok, false);
  assert.match(poll.reason, /deadline expired/);
});

test('A6 frameFrom: a truncated newer header forbids the older complete frame', () => {
  const good = batchLine({ epoch: 5, batch: 0, total: 1, entries: [
    { index: 0, label: 'A', tag: 'span', testId: '', x: 1, y: 2, w: 3, h: 4 },
  ] });
  const cut = `${MARKER_PATH}?rects=1&batch=0&epoch=6&i0_x=1&i0_y=2`;
  assert.equal(frameFrom(good).ok, true);
  const after = frameFrom(`${good}\n${cut}`);
  assert.equal(after.ok, false);
  assert.match(after.reason, /epoch 6 has a valid header but no complete batch/);
});
