// Port-fidelity fixtures for the P3.4 AM-188 implementation.
//
// These are the reviewed pure model's own adversarial cases
// (`build/p3.4-spec-v5-repair2/model.test.mjs`, IR7 CLEAR, 73/73), re-pointed at
// the ACTUAL shipped harness functions in `scripts/v2/tauri-security.test.mjs`.
// The model and the harness functions have the same names and signatures, so
// every case below is the model's, unchanged except for the import: a pass here
// is evidence that the shipped port behaves identically to the reviewed model.
// No executable model is imported — only the shipped harness.
//
// Every case here is synthetic: no patient data, no application, no server, no
// display, no pointer, no network, no repository state. Fixtures are built from
// synthetic names and numbers only. Nothing here launches, builds or contacts
// anything; every run is `node --test` over these fixtures.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACL_DENIAL,
  BATCH_SIZE,
  CASCADE_ROWS,
  CLICK,
  MARKER_PATH,
  OBSERVATION_POLL_MS,
  POINTER,
  VIEWPORT,
  awaitGuarded,
  calibrationTargets,
  cascadeCause,
  checkCommand,
  checkNoIpc,
  checkReadback,
  compareDescriptor,
  containedInWindow,
  createBatchReader,
  createClock,
  createTargetDeadline,
  dispatchGuarded,
  firstFactGate,
  landingFact,
  pollObservation,
  rectSignature,
  runClick,
  runFlow,
  selectTarget,
  solveTransform,
  targetCentre,
} from '../../../../../../scripts/v2/tauri-security.test.mjs';

// ------------------------------------------------------------ fixtures ----

/** One synthetic leaf: label, tag, testId, rectangle. */
const leaf = (index, label, tag = 'span', testId = '') => ({
  index,
  label,
  tag,
  testId,
  x: 100 + index * 30,
  y: 200 + index * 12,
  w: 120,
  h: 24,
});

/** One batch marker line, exactly as the hook's URLSearchParams would encode it. */
function batchLine({ epoch, batch, total, entries, extra = {} }) {
  const query = new URLSearchParams();
  query.set('rects', String(total));
  query.set('batch', String(batch));
  query.set('epoch', String(epoch));
  for (const [key, value] of Object.entries(extra)) query.set(key, String(value));
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
}

const factLine = (facts) =>
  `${MARKER_PATH}?${new URLSearchParams(Object.entries(facts).map(([k, v]) => [k, String(v)])).toString()}`;

/** The common 2-point calibration, in client and native pixels. */
const pair = (kx, ky, ox, oy, dx = 100, dy = 30) => [
  { cx: 500, cy: 400, sx: Math.round(kx * 500 + ox), sy: Math.round(ky * 400 + oy) },
  { cx: 500 + dx, cy: 400 + dy, sx: Math.round(kx * (500 + dx) + ox), sy: Math.round(ky * (400 + dy) + oy) },
];

const WINDOW = { id: 4711, x: 60, y: 70, w: 1280, h: 860 };
const APP_PID = 4242;
const CLIENT_TARGET = { x: 700, y: 500 };
/** A 1.5x scale with a titlebar-sized offset, so native and client differ. */
const SCALED = solveTransform(pair(1.5, 1.5, 26, 31));
const SCALED_NATIVE = { x: Math.round(1.5 * CLIENT_TARGET.x + 26), y: Math.round(1.5 * CLIENT_TARGET.y + 31) };
/** The selected rectangle's three descriptor fields, as the hook published them. */
const RECT = { l: 'John Smith', t: 'span', d: 'patient-open' };

// --------------------------------------------------------------- clock ----

test('C1 the deadline is immutable: no reset, no extension, no per-step cap', () => {
  const deadline = createTargetDeadline(1000, 30_000);
  assert.equal(deadline.at, 31_000);
  assert.equal(deadline.remaining(1000), 30_000);
  assert.equal(deadline.expired(30_999), false);
  assert.equal(deadline.expired(31_000), true);
  // Reading it does not move it; there is no mutating method at all.
  deadline.remaining(31_000);
  assert.equal(deadline.at, 31_000);
  assert.equal('reset' in deadline, false);
  assert.equal('extend' in deadline, false);
});

test('C2 a hung await ends at the deadline, terminal, with no work after it', async () => {
  const clock = createClock(0);
  const deadline = createTargetDeadline(0, 30_000);
  const pending = awaitGuarded(deadline, clock, () => new Promise(() => {}));
  clock.advance(29_999);
  await clock.settle();
  clock.advance(1);
  const result = await pending;
  assert.equal(result.ok, false);
  assert.match(result.reason, /deadline expired/);
  let ran = false;
  const late = await dispatchGuarded(deadline, clock, 'click', () => {
    ran = true;
  });
  assert.equal(late.ok, false);
  assert.equal(ran, false);
});

test('C3 an await that resolves after the deadline is a failure, not a success', async () => {
  const clock = createClock(0);
  const deadline = createTargetDeadline(0, 30_000);
  const result = await awaitGuarded(deadline, clock, () => {
    clock.advance(40_000);
    return Promise.resolve('the answer arrived too late');
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /deadline expired/);
});

test('C4 a rejected io is terminal and fail closed', async () => {
  const clock = createClock(0);
  const deadline = createTargetDeadline(0, 30_000);
  const result = await awaitGuarded(deadline, clock, () => Promise.reject(new Error('spawn ENOENT')));
  assert.equal(result.ok, false);
  assert.match(result.reason, /spawn ENOENT/);
});

test('C5 a hung DISPATCH ends at the deadline too, with the same budget (ir5 B2)', async () => {
  for (const name of ['xdotool mousemove --sync', 'xdotool click 1']) {
    const clock = createClock(0);
    const deadline = createTargetDeadline(0, 30_000);
    const pending = dispatchGuarded(deadline, clock, name, () => new Promise(() => {}));
    clock.advance(29_999);
    await clock.settle();
    clock.advance(1);
    const result = await pending;
    assert.equal(result.ok, false, name);
    assert.equal(result.reason, 'the target deadline expired', name);
    assert.equal(deadline.at, 30_000, name); // no phase timer, no new budget
  }
});

// -------------------------------------------------------------- affine ----

test('D1 each scale 1, 1.5 and 2 solves and maps the target exactly', () => {
  for (const [kx, ky] of [[1, 1], [1.5, 1.5], [2, 2], [1, 2], [2, 1]]) {
    const transform = solveTransform(pair(kx, ky, 26, 31));
    assert.equal(transform.ok, true, `${String(kx)}x${String(ky)} should solve`);
    const target = { x: 640, y: 400 };
    const native = transform.toNative(target);
    assert.equal(Math.round(native.x), Math.round(kx * 640 + 26));
    assert.equal(Math.round(native.y), Math.round(ky * 400 + 31));
  }
});

test('D2 the two points must differ in BOTH client axes, or the run ends with no click', () => {
  const verticalOnly = solveTransform([
    { cx: 640, cy: 300, sx: 700, sy: 320 },
    { cx: 640, cy: 420, sx: 700, sy: 460 },
  ]);
  assert.equal(verticalOnly.ok, false);
  assert.equal(verticalOnly.click, false);
  assert.match(verticalOnly.reason, /client x/);

  const horizontalOnly = solveTransform([
    { cx: 300, cy: 400, sx: 320, sy: 420 },
    { cx: 500, cy: 400, sx: 560, sy: 420 },
  ]);
  assert.equal(horizontalOnly.ok, false);
  assert.equal(horizontalOnly.click, false);
  assert.match(horizontalOnly.reason, /client y/);
});

test('D3 a non-finite measurement ends the solve before any conversion', () => {
  for (const bad of [
    { cx: 500, cy: 400, sx: Number.NaN, sy: 500 },
    { cx: 500, cy: 400, sx: 500, sy: Number.POSITIVE_INFINITY },
    { cx: 500, cy: 400, sx: '500', sy: 500 },
  ]) {
    const solved = solveTransform([bad, { cx: 600, cy: 500, sx: 700, sy: 600 }]);
    assert.equal(solved.ok, false);
    assert.equal(solved.click, false);
    assert.equal('toNative' in solved, false);
  }
});

test('D4 the per-axis bound is checked before use, in both directions', () => {
  assert.equal(solveTransform(pair(1, 1, 0, 0)).ok, true);
  assert.equal(solveTransform(pair(4, 4, 0, 0)).ok, true);
  assert.match(solveTransform(pair(4.5, 4.5, 0, 0)).reason, /above the bound/);
  assert.match(solveTransform(pair(-1, 1, 0, 0)).reason, /outside 0 < k/);
  assert.match(solveTransform(pair(0, 1, 0, 0)).reason, /outside 0 < k/);
  assert.match(solveTransform(pair(1.5, 5, 0, 0)).reason, /k_y/);
});

test('D5 one point is not a solve', () => {
  assert.match(solveTransform([{ cx: 1, cy: 2, sx: 3, sy: 4 }]).reason, /two measured points/);
  assert.match(solveTransform([]).reason, /two measured points/);
  assert.match(solveTransform(null).reason, /two measured points/);
});

test('D6 native containment rejects an off-screen point, so no move is issued', () => {
  assert.equal(containedInWindow({ x: 60, y: 70 }, WINDOW), true);
  assert.equal(containedInWindow({ x: 1339, y: 929 }, WINDOW), true);
  assert.equal(containedInWindow({ x: 1340, y: 70 }, WINDOW), false);
  assert.equal(containedInWindow({ x: 60, y: 930 }, WINDOW), false);
  assert.equal(containedInWindow({ x: 59, y: 70 }, WINDOW), false);
});

test('D7 native read-back needs 1 px, the app window or the app pid', () => {
  assert.equal(checkReadback({ x: 700, y: 500 }, { X: '700', Y: '500', WINDOW: '4711' }, WINDOW, APP_PID).ok, true);
  assert.equal(checkReadback({ x: 700, y: 500 }, { X: '701', Y: '500', WINDOW: '4711' }, WINDOW, APP_PID).ok, true);
  assert.match(checkReadback({ x: 700, y: 500 }, { X: '702', Y: '500', WINDOW: '4711' }, WINDOW, APP_PID).reason, /2,0 px/);
  assert.equal(checkReadback({ x: 700, y: 500 }, { X: '700', Y: '500', PID: String(APP_PID) }, WINDOW, APP_PID).ok, true);
  // Under the corrected instrument the getmouselocation WINDOW/PID fields are
  // diagnostic text only, so a foreign or absent one no longer decides the
  // result. What must still fail closed is the MEASURED point leaving the
  // rectangle read once from getwindowgeometry, whose owner runFlow has already
  // confirmed with getwindowpid. Both directions are asserted here.
  assert.equal(checkReadback({ x: 700, y: 500 }, { X: '700', Y: '500', PID: '-1' }, WINDOW, APP_PID).ok, true);
  assert.equal(checkReadback({ x: 700, y: 500 }, { X: '700', Y: '500', WINDOW: '999' }, WINDOW, APP_PID).ok, true);
  assert.match(checkReadback({ x: 50, y: 500 }, { X: '50', Y: '500', WINDOW: '999' }, WINDOW, APP_PID).reason, /outside the owned app window/);
  assert.match(checkReadback({ x: 700, y: 500 }, { WINDOW: '4711' }, WINDOW, APP_PID).reason, /no usable X\/Y/);
});

test('D8 the calibration targets are derived from the viewport, never hard-coded', () => {
  assert.deepEqual(calibrationTargets(1280, 800), [
    { name: 'bootstrap 1', cx: 640, cy: 400 },
    { name: 'bootstrap 2', cx: 960, cy: 480 },
  ]);
  const [a, b] = calibrationTargets(1000, 600);
  assert.notDeepEqual([a.cx, a.cy], [b.cx, b.cy]); // differ in BOTH axes, always
  assert.ok(a.cy > 0 && a.cx > 0 && b.cx < 1000 && b.cy < 600);
});

// ----------------------------------------------------------- commands ----

test('F1 every command outcome is read: status, signal and both streams', () => {
  assert.equal(checkCommand('mousemove', { code: 0, signal: null, stdout: '', stderr: '' }).ok, true);
  assert.match(checkCommand('click', { code: 1, stdout: '', stderr: 'no such window' }).reason, /exited 1/);
  assert.match(checkCommand('click', { code: null, signal: 'SIGKILL', stdout: '', stderr: '' }).reason, /SIGKILL/);
  assert.match(checkCommand('mousemove', { code: 0, signal: null, stdout: 'XError: BadValue', stderr: '' }).reason, /XError/);
  assert.equal(checkCommand('click', undefined).ok, false);
});

// ------------------------------------------------------------- reader ----

test('G1 one complete publication installs and selects every global index', () => {
  const reader = createBatchReader();
  const total = 45;
  const entries = Array.from({ length: total }, (_, i) => leaf(i, `Row ${String(i)}`));
  for (let batch = 0; batch * BATCH_SIZE < total; batch += 1) {
    const slice = entries.slice(batch * BATCH_SIZE, (batch + 1) * BATCH_SIZE);
    reader.observe(batchLine({ epoch: 3, batch, total, entries: slice }));
  }
  const frame = reader.frame();
  assert.equal(frame.ok, true);
  assert.equal(frame.epoch, 3);
  assert.equal(frame.total, 45);
  assert.equal(frame.rects.size, 45);
  assert.deepEqual([...frame.rects.keys()].sort((a, b) => a - b), Array.from({ length: 45 }, (_, i) => i));
  // batch 1 carries global indices 40..44, not 0..4: the identity defect is gone.
  assert.equal(frame.rects.get(40).l, 'Row 40');
});

test('G2 a mid-arrival read is incomplete, and the wait restarts rather than reporting an absence', () => {
  const reader = createBatchReader();
  const total = 200;
  const entries = Array.from({ length: total }, (_, i) => leaf(i, `Row ${String(i)}`));
  reader.observe(batchLine({ epoch: 5, batch: 0, total, entries: entries.slice(0, 40) }));
  assert.match(reader.frame().reason, /incomplete epoch 5: 1 of 5 batches \(missing 1, 2, 3, 4\)/);
  for (let batch = 1; batch < 5; batch += 1)
    reader.observe(batchLine({ epoch: 5, batch, total, entries: entries.slice(batch * 40, batch * 40 + 40) }));
  assert.equal(reader.frame().ok, true);
});

test('G3 a newer complete epoch, still incomplete, forbids falling back to an older one', () => {
  const reader = createBatchReader();
  const a = Array.from({ length: 2 }, (_, i) => leaf(i, `Row ${String(i)}`));
  reader.observe(batchLine({ epoch: 4, batch: 0, total: 2, entries: a }));
  assert.equal(reader.frame().ok, true);
  reader.observe(
    batchLine({ epoch: 5, batch: 0, total: 200, entries: Array.from({ length: 40 }, (_, i) => leaf(i, `Row ${String(i)}`)) }),
  );
  const after = reader.frame();
  assert.equal(after.ok, false);
  assert.equal(after.click, false);
  assert.match(after.reason, /incomplete epoch 5/);
});

test('G4 a VALID header with a TRUNCATED body is discarded whole (ir5 B4)', () => {
  const reader = createBatchReader();
  const good = Array.from({ length: 3 }, (_, i) => leaf(i, `Row ${String(i)}`));
  reader.observe(batchLine({ epoch: 7, batch: 0, total: 3, entries: good }));

  // batch 0 of a total=6 publication, cut inside the i2 parameter list: the
  // header (rects, batch, epoch) is intact and in range, the body is not.
  const six = Array.from({ length: 6 }, (_, i) => leaf(i, `Row ${String(i)}`));
  const full = batchLine({ epoch: 8, batch: 0, total: 6, entries: six });
  const cutAt = full.indexOf('&i2_h');
  const truncated = full.slice(0, cutAt + 4); // ends "&i2_": a half-written parameter

  const reader2 = createBatchReader();
  reader2.observe(batchLine({ epoch: 7, batch: 0, total: 3, entries: good }));
  const outcome = reader2.observe(truncated);
  assert.equal(outcome.kind, 'malformed');
  assert.equal(outcome.header, true, 'the header was valid');
  assert.match(outcome.reason, /index 2 is missing field h/);
  assert.equal(reader2.discarded, 1);
  assert.equal(reader2.conflict, null);
  assert.equal(reader2.installed.size, 1);
  // The good publication is untouched: not merged with, not overwritten.
  assert.equal(reader2.installed.get('8:0'), undefined);
  // And the valid header raised the epoch, so the older complete frame is no
  // longer selectable while epoch 8 is incomplete.
  assert.equal(reader2.highestSeenEpoch, 8);
  assert.equal(reader2.frame().ok, false);
  assert.match(reader2.frame().reason, /epoch 8 has a valid header but no complete batch/);
  // A later complete publication still installs and selects normally.
  const later = Array.from({ length: 6 }, (_, i) => leaf(i, `Row ${String(i)}`));
  reader2.observe(batchLine({ epoch: 9, batch: 0, total: 6, entries: later }));
  assert.equal(reader2.frame().ok, true);
  assert.equal(reader2.frame().total, 6);
});

test('G4b the OLD G4 fixture is preserved as a counterexample: it was never truncated (ir5 B4)', () => {
  // The revision-5 G4 fixture was batch 1 of total=6 sliced to 120 chars. With
  // total=6, ceil(6/40)=1, so batch 1 is out of range and the line was discarded
  // by the batch-index rule; the untruncated line is malformed for the same
  // reason. It is kept here, labelled, so the correction is auditable.
  const good = Array.from({ length: 3 }, (_, i) => leaf(i, `Row ${String(i)}`));
  const full = batchLine({ epoch: 7, batch: 1, total: 6, entries: good });
  const truncated = full.slice(0, 120);
  assert.equal(createBatchReader().observe(full).kind, 'malformed');
  assert.equal(createBatchReader().observe(full).reason, 'batch 1 is outside 0..0');
  const cut = createBatchReader().observe(truncated);
  assert.equal(cut.kind, 'malformed');
  assert.equal(cut.reason, 'batch 1 is outside 0..0');
  assert.equal(cut.header, false, 'an INVALID header raises nothing');
});

test('G5 an identical complete duplicate is idempotent; a differing one FAILs', () => {
  const reader = createBatchReader();
  const entries = [leaf(0, 'Row 0')];
  const line = batchLine({ epoch: 2, batch: 0, total: 1, entries });
  reader.observe(line);
  assert.equal(reader.observe(line).kind, 'idempotent-duplicate');
  assert.equal(reader.conflict, null);
  const moved = batchLine({ epoch: 2, batch: 0, total: 1, entries: [leaf(0, 'Row 0 elsewhere')] });
  assert.equal(reader.observe(moved).kind, 'conflict');
  assert.match(reader.conflict.reason, /two complete sightings of epoch 2 batch 0 differ/);
  assert.equal(reader.frame().ok, false);
});

test('G5b a truncated body is never a conflict, however it differs from the good batch', () => {
  const reader = createBatchReader();
  const entries = [leaf(0, 'Row 0')];
  reader.observe(batchLine({ epoch: 2, batch: 0, total: 1, entries }));
  const cut = `${MARKER_PATH}?rects=1&batch=0&epoch=2&i0_x=1`;
  const outcome = reader.observe(cut);
  assert.equal(outcome.kind, 'malformed');
  assert.equal(reader.conflict, null);
  assert.equal(reader.frame().ok, true, 'the good batch survives');
  assert.equal(reader.frame().rects.get(0).l, 'Row 0');
});

test('G6 a batch whose field set is incomplete is malformed, not partially installed', () => {
  for (const [name, entries] of [
    ['missing field', [{ index: 0, label: 'Row 0', tag: 'span', testId: '', x: 1, y: 2, w: 3 }]], // no h
    ['index beyond rects', [leaf(0, 'Row 0'), leaf(9, 'Row 9')]], // rects says 1
  ]) {
    const reader = createBatchReader();
    const total = name === 'index beyond rects' ? 1 : 2;
    const outcome = reader.observe(batchLine({ epoch: 1, batch: 0, total, entries }));
    assert.equal(outcome.kind, 'malformed', name);
    assert.equal(reader.installed.size, 0, name);
    // ir5 B3 correction: the header of this line is valid, so the epoch rises
    // (it did not before) and the row must wait for the rest of epoch 1 rather
    // than fall back. The frame is still refused, and nothing is installed.
    assert.equal(reader.highestSeenEpoch, 1, name);
    assert.equal(reader.frame().ok, false, name);
    assert.equal(reader.frame().click, false, name);
  }
  // A missing field the URL never carried: truncated mid-parameter list.
  const reader = createBatchReader();
  const outcome = reader.observe(`${MARKER_PATH}?rects=2&batch=0&epoch=1&i0_x=1&i0_y=2&i0_w=3&i0_l=Row%200`);
  assert.equal(outcome.kind, 'malformed');
  assert.equal(outcome.header, true);
  assert.equal(reader.installed.size, 0);
  assert.equal(reader.highestSeenEpoch, 1);
  assert.equal(reader.frame().ok, false);
});

test('G7 a malformed epoch never raises the highest seen epoch, and never wraps it', () => {
  const reader = createBatchReader();
  const entries = [leaf(0, 'Row 0')];
  reader.observe(batchLine({ epoch: 9, batch: 0, total: 1, entries }));
  assert.equal(reader.highestSeenEpoch, 9);
  for (const epoch of ['0', '-1', '1.5', '01', '9007199254740993', 'NaN', '1e3', '']) {
    const outcome = reader.observe(batchLine({ epoch, batch: 0, total: 1, entries }));
    assert.equal(outcome.kind, 'malformed', `epoch ${JSON.stringify(epoch)}`);
    assert.equal(outcome.header, false, `epoch ${JSON.stringify(epoch)}`);
  }
  assert.equal(reader.highestSeenEpoch, 9);
  assert.equal(reader.frame().ok, true);
});

test('G8 out-of-order and growing/shrinking publications are read, not refused as duplicates', () => {
  const reader = createBatchReader();
  const small = Array.from({ length: 3 }, (_, i) => leaf(i, `Row ${String(i)}`));
  const grown = Array.from({ length: 81 }, (_, i) => leaf(i, `Row ${String(i)}`));
  reader.observe(batchLine({ epoch: 3, batch: 0, total: 3, entries: small }));
  reader.observe(batchLine({ epoch: 2, batch: 0, total: 3, entries: small })); // older, ignored
  assert.equal(reader.frame().epoch, 3);
  assert.equal(reader.frame().total, 3);
  for (let batch = 0; batch * 40 < 81; batch += 1)
    reader.observe(batchLine({ epoch: 4, batch, total: 81, entries: grown.slice(batch * 40, batch * 40 + 40) }));
  assert.equal(reader.frame().epoch, 4);
  assert.equal(reader.frame().total, 81);
  reader.observe(batchLine({ epoch: 5, batch: 0, total: 1, entries: [leaf(0, 'Row 0')] }));
  assert.equal(reader.frame().total, 1);
});

test('G9 A-B-A is three distinct epochs, and the third is selected', () => {
  const reader = createBatchReader();
  const a = [leaf(0, 'Row A')];
  const b = [leaf(0, 'Row B')];
  reader.observe(batchLine({ epoch: 1, batch: 0, total: 1, entries: a }));
  reader.observe(batchLine({ epoch: 2, batch: 0, total: 1, entries: b }));
  reader.observe(batchLine({ epoch: 3, batch: 0, total: 1, entries: a }));
  const frame = reader.frame();
  assert.equal(frame.epoch, 3);
  assert.equal(frame.rects.get(0).l, 'Row A');
  assert.equal(reader.conflict, null);
});

test('G10 one epoch mixing two declared totals is not a frame', () => {
  const reader = createBatchReader();
  reader.observe(batchLine({ epoch: 2, batch: 0, total: 40, entries: Array.from({ length: 40 }, (_, i) => leaf(i, `Row ${String(i)}`)) }));
  reader.observe(
    batchLine({ epoch: 2, batch: 1, total: 80, entries: Array.from({ length: 40 }, (_, i) => leaf(i + 40, `Row ${String(i + 40)}`)) }),
  );
  assert.match(reader.frame().reason, /mixes declared totals 40, 80/);
});

test('G11 a fact line is not a batch line, and the hook emits no line for an empty page', () => {
  const reader = createBatchReader();
  assert.equal(reader.observe(factLine({ href: 'http://127.0.0.1:7717/', attempt: '4' })).kind, 'fact');
  assert.equal(reader.factLines, 1);
  assert.match(reader.frame().reason, /no batch header/);
  assert.equal(reader.observe('some unrelated stderr line').kind, 'not-a-marker');
  // A publication of zero rectangles emits no batch line at all, so a page with
  // no leaves has no frame: the absence is reported as an absence, not as a
  // complete empty publication.
  const empty = createBatchReader();
  const outcome = empty.observe(batchLine({ epoch: 1, batch: 0, total: 0, entries: [] }));
  assert.equal(outcome.kind, 'malformed');
  assert.equal(outcome.header, false);
  assert.equal(empty.highestSeenEpoch, 0);
  assert.equal(empty.frame().ok, false);
  assert.equal(selectTarget(empty.frame(), { label: 'Row 0', tag: 'span' }).ok, false);
});

test('G12 a batch installs as a whole map: no key is carried over from any earlier sighting', () => {
  const reader = createBatchReader();
  const forty = Array.from({ length: 40 }, (_, i) => leaf(i, `Row ${String(i)}`));
  reader.observe(batchLine({ epoch: 1, batch: 0, total: 40, entries: forty }));
  const installed = reader.installed.get('1:0');
  assert.equal(installed.rects.size, 40);
  assert.deepEqual([...installed.rects.keys()].sort((a, b) => a - b), Array.from({ length: 40 }, (_, i) => i));
  // Nothing a truncated sighting carried survives beside it (G4), and a second
  // complete sighting of the same batch is judged, never merged (G5).
  assert.equal(reader.conflict, null);
  assert.equal(reader.frame().rects.size, 40);
});

test('G13 a valid NEWER header with a truncated body forbids the older complete frame (ir5 B3)', () => {
  const reader = createBatchReader();
  reader.observe(batchLine({ epoch: 5, batch: 0, total: 1, entries: [leaf(0, 'A')] }));
  const before = reader.frame();
  assert.equal(before.ok, true);
  assert.equal(before.epoch, 5);
  // epoch=6, rects=1, batch=0 all parse and the batch index is in range; the
  // body is cut after two fields. Before the repair this raised nothing and the
  // reader fell back to epoch 5 with ok=true.
  const outcome = reader.observe(`${MARKER_PATH}?rects=1&batch=0&epoch=6&i0_x=1&i0_y=2`);
  assert.equal(outcome.kind, 'malformed');
  assert.equal(outcome.header, true);
  assert.equal(reader.highestSeenEpoch, 6);
  const after = reader.frame();
  assert.equal(after.ok, false);
  assert.equal(after.click, false);
  assert.match(after.reason, /epoch 6 has a valid header but no complete batch/);
});

// ---------------------------------------------------------- selection ----

test('H1 the unique label/tag PAIR picks the row and never the tooltip', () => {
  const reader = createBatchReader();
  const row = { ...leaf(0, 'John Smith', 'span', ''), x: 120, y: 300, w: 200, h: 28 };
  const tip = { ...leaf(1, 'John Smith', 'div', ''), x: 400, y: 300, w: 180, h: 28 };
  reader.observe(batchLine({ epoch: 1, batch: 0, total: 2, entries: [row, tip] }));
  const frame = reader.frame();
  assert.equal(frame.rects.size, 2);
  const chosen = selectTarget(frame, { label: 'John Smith', tag: 'span' });
  assert.equal(chosen.ok, true);
  assert.equal(chosen.index, 0);
  assert.deepEqual(chosen.centre, targetCentre(row));
  const wrongTag = selectTarget(frame, { label: 'John Smith', tag: 'a' });
  assert.equal(wrongTag.ok, false);
  assert.match(wrongTag.reason, /no rectangle carries the label\/tag pair/);
});

test('H2 the same label twice with the same tag is ambiguous, and never first-match-wins', () => {
  const reader = createBatchReader();
  const entries = [leaf(0, 'John Smith', 'span', ''), leaf(1, 'John Smith', 'span', '')];
  reader.observe(batchLine({ epoch: 1, batch: 0, total: 2, entries }));
  const chosen = selectTarget(reader.frame(), { label: 'John Smith', tag: 'span' });
  assert.equal(chosen.ok, false);
  assert.equal(chosen.click, false);
  assert.match(chosen.reason, /ambiguous: 2 rectangles at global indices 0, 1/);
});

test('H3 the OLD testId-tie-break fixture is preserved as a counterexample (ir5 D7)', () => {
  // Under revision 5 the key was the (label, tag, testId) triple, so these two
  // leaves were told apart by testId and index 1 was chosen. Root's key is the
  // (label, tag) pair: they are now ambiguous, and testId is compared after the
  // click against the descriptor (H4) rather than used to break the tie.
  const reader = createBatchReader();
  const entries = [
    { ...leaf(0, 'Open', 'button', 'note-open'), x: 10, y: 20, w: 40, h: 20 },
    { ...leaf(1, 'Open', 'button', 'script-open'), x: 60, y: 20, w: 40, h: 20 },
  ];
  reader.observe(batchLine({ epoch: 1, batch: 0, total: 2, entries }));
  const chosen = selectTarget(reader.frame(), { label: 'Open', tag: 'button' });
  assert.equal(chosen.ok, false);
  assert.match(chosen.reason, /ambiguous: 2 rectangles at global indices 0, 1/);
});

test('H4 the pair picks the right leaf when the tags differ, and testId is compared after the click', () => {
  const reader = createBatchReader();
  const entries = [
    { ...leaf(0, 'Open', 'button', 'note-open'), x: 10, y: 20, w: 40, h: 20 },
    { ...leaf(1, 'Open', 'a', 'script-open'), x: 60, y: 20, w: 40, h: 20 },
  ];
  reader.observe(batchLine({ epoch: 1, batch: 0, total: 2, entries }));
  const chosen = selectTarget(reader.frame(), { label: 'Open', tag: 'a' });
  assert.equal(chosen.ok, true);
  assert.equal(chosen.index, 1);
  assert.deepEqual(chosen.centre, { x: 80, y: 30 });
  assert.equal(compareDescriptor({ [CLICK.tag]: 'a', [CLICK.testId]: 'script-open', [CLICK.text]: 'Open' }, chosen.rect).ok, true);
  assert.match(
    compareDescriptor({ [CLICK.tag]: 'a', [CLICK.testId]: 'note-open', [CLICK.text]: 'Open' }, chosen.rect).reason,
    /clickTestId/,
  );
});

// ------------------------------------------------------------- (a) ----

test('I1 the gate is presence of href and ipcProbe, nothing else', () => {
  assert.equal(firstFactGate([{ href: 'x', tauri: 'undefined' }]), null);
  assert.equal(firstFactGate([{ ipcProbe: 'pending' }]), null);
  const settled = firstFactGate([{ href: 'x', ipcProbe: 'pending' }]);
  assert.notEqual(settled, null);
  assert.equal(settled.ipcProbe, 'pending');
});

test('I2 exact ACL denial with all conjuncts is the only pass', () => {
  const good = { href: 'x', tauri: 'undefined', ipc: 'object', ipcInvoke: 'function', ipcProbe: 'rejected', ipcProbeMsg: ACL_DENIAL };
  assert.equal(checkNoIpc(good).ok, true);
  for (const [name, fact] of [
    ['pending at the deadline', { ...good, ipcProbe: 'pending' }],
    ['resolved', { ...good, ipcProbe: 'resolved', ipcProbeMsg: '' }],
    ['wrong rejection', { ...good, ipcProbeMsg: 'Command listen not found' }],
    ['prefixed not-found string', { ...good, ipcProbeMsg: 'Command plugin:event|listen not found' }],
    ['tauri present', { ...good, tauri: 'object' }],
    ['door absent', { ...good, ipc: 'undefined' }],
    ['invoke absent', { ...good, ipcInvoke: 'undefined' }],
  ]) {
    const result = checkNoIpc(fact, { expired: fact.ipcProbe === 'pending' });
    assert.equal(result.ok, false, name);
    assert.equal(result.title, CASCADE_ROWS[0]);
  }
  assert.equal(checkNoIpc(null).ok, false);
});

test('I3 the cascade is exactly five rows in both arms, with the cause that fits the count', () => {
  const zero = cascadeCause(0);
  assert.equal(zero.rows.length, 5);
  assert.deepEqual(zero.rows, CASCADE_ROWS);
  assert.equal(zero.arm, 'zero-lines');
  const degraded = cascadeCause(7);
  assert.deepEqual(degraded.rows, CASCADE_ROWS);
  assert.equal(degraded.arm, 'incomplete-fact-set');
  assert.match(degraded.cause, /7 marker line\(s\) appeared and none carried href and ipcProbe together/);
  for (const row of [zero, degraded]) assert.equal(row.outcome, 'NOT RUN');
});

// ---------------------------------------------------------- the click ----

/**
 * The IO the click run drives, entirely synthetic: three published fact
 * snapshots (before the move, after the read-back, after the click) and three
 * command results. `read` reports the pointer at `at`, which a test may offset.
 *
 * `preMove` is the pointer observation left by the last CALIBRATION move. It is
 * deliberately not on the target: the target has not been warped to yet.
 */
function clickOps({ preMove, postMove, postClick, at, read, move, click, hungRead = false, hungClick = false, rect = RECT }) {
  const dispatched = [];
  const stage = () => {
    if (!dispatched.includes('getmouselocation')) return preMove;
    return dispatched.includes('click') ? postClick : postMove;
  };
  return {
    dispatched,
    rect,
    ops: {
      move: (point) => {
        dispatched.push('mousemove');
        return move ? move(point) : { code: 0, signal: null, stdout: '', stderr: '' };
      },
      read: () => {
        dispatched.push('getmouselocation');
        if (hungRead) return new Promise(() => {});
        return read ? read() : { code: 0, signal: null, stdout: '', stderr: '', X: String(at.x), Y: String(at.y), WINDOW: String(WINDOW.id) };
      },
      click: () => {
        dispatched.push('click');
        if (hungClick) return new Promise(() => {});
        return click ? click() : { code: 0, signal: null, stdout: '', stderr: '' };
      },
      nextFact: () => stage() ?? null,
    },
  };
}

/** The pointer left at the second bootstrap point — not the target (ir5 B1). */
const CALIBRATION_FACT = { [POINTER.counter]: 7, [POINTER.clientX]: 800, [POINTER.clientY]: 430, [CLICK.counter]: 0, href: 'http://127.0.0.1:7717/' };
const FACT_BEFORE = { ...CALIBRATION_FACT };
const FACT_WITNESSED = { [POINTER.counter]: 8, [POINTER.clientX]: CLIENT_TARGET.x - 1, [POINTER.clientY]: CLIENT_TARGET.y + 1, [CLICK.counter]: 0, href: 'http://127.0.0.1:7717/' };
const FACT_AFTER = {
  [POINTER.counter]: 8,
  [CLICK.counter]: 1,
  [CLICK.clientX]: CLIENT_TARGET.x,
  [CLICK.clientY]: CLIENT_TARGET.y,
  [CLICK.tag]: RECT.t,
  [CLICK.testId]: RECT.d,
  [CLICK.text]: RECT.l,
  href: 'http://127.0.0.1:7717/?patient=p1',
  scriptText: 'false',
};

const clickArgs = (fixture, extra = {}) => {
  const clock = extra.clock ?? createClock(0);
  return {
    deadline: extra.deadline ?? createTargetDeadline(0, 30_000),
    clock,
    // A pending observation poll waits through this injected scheduler. The
    // stage fixture above hands back the right fact on the first read, so most
    // click cases never wait; the two that do end at the deadline.
    schedule: extra.schedule ?? ((ms) => {
      clock.advance(ms);
      return Promise.resolve();
    }),
    transform: extra.transform ?? SCALED,
    window: extra.window ?? WINDOW,
    appPid: APP_PID,
    target: extra.target ?? CLIENT_TARGET,
    rect: extra.rect ?? fixture.rect,
    expected: extra.expected ?? { kind: 'patient-href' },
    ops: fixture.ops,
  };
};

/**
 * Drain the microtask chain until an injected IO promise (a hung dispatch or a
 * hung read) has actually been issued. The poll waits add microtask hops, so a
 * fixed settle count is not enough; this only pumps microtasks, never the clock.
 */
const pump = async (clock, times = 40) => {
  for (let i = 0; i < times; i += 1) await clock.settle();
};

test('J1 the pointer left at calibration still clicks: the witness is taken AFTER the warp (ir5 B1)', async () => {
  const fixture = clickOps({ preMove: FACT_BEFORE, postMove: FACT_WITNESSED, postClick: FACT_AFTER, at: SCALED_NATIVE });
  // The pre-warp observation is 100,70 px from the target. Revision 5 ended the
  // row here with no move and no click; the contract requires the witness only
  // after the warp.
  assert.ok(Math.abs(CALIBRATION_FACT[POINTER.clientX] - CLIENT_TARGET.x) > 2);
  const result = await runClick(clickArgs(fixture));
  assert.equal(result.ok, true, result.reason);
  assert.deepEqual(result.dispatched, ['mousemove', 'getmouselocation', 'click']);
  assert.match(result.reason, /href transitioned/);
  assert.match(result.reason, new RegExp(`${POINTER.counter} 7 -> 8`));
});

test('J2 a stale witness beyond 2 px means no click, after the move that produced it', async () => {
  const fixture = clickOps({
    preMove: { [POINTER.counter]: 7, [POINTER.clientX]: 640, [POINTER.clientY]: 400, [CLICK.counter]: 0, href: 'x' },
    postMove: { [POINTER.counter]: 8, [POINTER.clientX]: 640, [POINTER.clientY]: 400, [CLICK.counter]: 0, href: 'x' },
    postClick: FACT_AFTER,
    at: SCALED_NATIVE,
  });
  const result = await runClick(clickArgs(fixture));
  assert.equal(result.ok, false);
  assert.match(result.reason, /60,100 px from the centre/);
  // Before the repair this was refused before any dispatch at all.
  assert.deepEqual(result.dispatched, ['mousemove', 'getmouselocation']);
});

test('J3 an off-screen target is refused before the move', async () => {
  const identity = solveTransform(pair(1, 1, 0, 0));
  const offscreen = { x: 5000, y: 10 };
  const fixture = clickOps({ preMove: null, postMove: null, postClick: FACT_AFTER, at: offscreen });
  const result = await runClick(clickArgs(fixture, { transform: identity, target: offscreen }));
  assert.equal(result.ok, false);
  assert.match(result.reason, /outside the window rectangle/);
  assert.deepEqual(result.dispatched, []);
});

test('J4 a native read-back miss fails closed after the move and before the click', async () => {
  const fixture = clickOps({
    preMove: FACT_BEFORE, postMove: FACT_WITNESSED, postClick: FACT_AFTER, at: SCALED_NATIVE,
    read: () => ({
      code: 0, signal: null, stdout: '', stderr: '',
      X: String(SCALED_NATIVE.x + 6), Y: String(SCALED_NATIVE.y), WINDOW: String(WINDOW.id),
    }),
  });
  const result = await runClick(clickArgs(fixture));
  assert.equal(result.ok, false);
  assert.match(result.reason, /6,0 px from the point asked for/);
  assert.equal(result.dispatched.includes('click'), false);
});

test('J5 a hung read-back ends at the deadline with no click', async () => {
  const clock = createClock(0);
  const deadline = createTargetDeadline(0, 30_000);
  const fixture = clickOps({ preMove: FACT_BEFORE, postMove: FACT_WITNESSED, postClick: FACT_AFTER, at: SCALED_NATIVE, hungRead: true });
  const pending = runClick(clickArgs(fixture, { clock, deadline }));
  clock.advance(30_000);
  const result = await pending;
  assert.equal(result.ok, false);
  assert.match(result.reason, /deadline expired/);
  assert.equal(result.dispatched.includes('click'), false);
});

test('J5b a hung CLICK dispatch ends at the deadline and never clicks twice (ir5 B2)', async () => {
  const clock = createClock(0);
  const deadline = createTargetDeadline(0, 30_000);
  const fixture = clickOps({ preMove: FACT_BEFORE, postMove: FACT_WITNESSED, postClick: FACT_AFTER, at: SCALED_NATIVE, hungClick: true });
  const pending = runClick(clickArgs(fixture, { clock, deadline }));
  await pump(clock);
  assert.equal(fixture.dispatched.filter((n) => n === 'click').length, 1);
  clock.advance(29_999);
  await clock.settle();
  assert.equal(fixture.dispatched.filter((n) => n === 'click').length, 1);
  clock.advance(1);
  const result = await pending;
  assert.equal(result.ok, false);
  assert.match(result.reason, /deadline expired/);
  assert.equal(deadline.at, 30_000);
  assert.equal(fixture.dispatched.filter((n) => n === 'click').length, 1);
  // No continuation ran after the deadline: nothing followed the click.
  assert.deepEqual(result.dispatched, ['mousemove', 'getmouselocation', 'click']);
});

test('J5c a hung MOVE dispatch ends at the deadline with no click (ir5 B2)', async () => {
  const clock = createClock(0);
  const deadline = createTargetDeadline(0, 30_000);
  const fixture = clickOps({
    preMove: FACT_BEFORE, postMove: FACT_WITNESSED, postClick: FACT_AFTER, at: SCALED_NATIVE,
    move: () => new Promise(() => {}),
  });
  const pending = runClick(clickArgs(fixture, { clock, deadline }));
  clock.advance(30_000);
  const result = await pending;
  assert.equal(result.ok, false);
  assert.match(result.reason, /deadline expired/);
  assert.equal(result.dispatched.includes('getmouselocation'), false);
  assert.equal(result.dispatched.includes('click'), false);
});

test('J6 a deadline already spent refuses the dispatch', async () => {
  const fixture = clickOps({ preMove: FACT_BEFORE, postMove: FACT_WITNESSED, postClick: FACT_AFTER, at: SCALED_NATIVE });
  const result = await runClick(clickArgs(fixture, { clock: createClock(40_000), deadline: createTargetDeadline(0, 30_000) }));
  assert.equal(result.ok, false);
  assert.deepEqual(result.dispatched, []);
});

test('J6b each descriptor field is compared on its own (ir5 D1)', async () => {
  for (const [name, over] of [
    ['tag', { [CLICK.tag]: 'div.project-tip' }],
    ['testId', { [CLICK.testId]: 'tooltip-open' }],
    ['text', { [CLICK.text]: 'Jane Doe' }],
  ]) {
    const fixture = clickOps({
      preMove: FACT_BEFORE, postMove: FACT_WITNESSED,
      postClick: { ...FACT_AFTER, ...over }, at: SCALED_NATIVE,
    });
    const result = await runClick(clickArgs(fixture));
    assert.equal(result.ok, false, name);
    assert.equal(result.dispatched.includes('click'), true, name);
    assert.match(result.reason, new RegExp(`click(Tag|TestId|Text)`), name);
  }
});

test('J6c a click the page never observed is a failure (ir6 F2: a bounded wait to the deadline)', async () => {
  const fixture = clickOps({ preMove: FACT_BEFORE, postMove: FACT_WITNESSED, postClick: { ...FACT_AFTER, [CLICK.counter]: 0 }, at: SCALED_NATIVE });
  const result = await runClick(clickArgs(fixture));
  assert.equal(result.ok, false);
  // "require a fact line whose clickN advanced" is a WAIT. A page that never
  // publishes the fresh clickN now ends at the immutable deadline instead of
  // failing on a single synchronous read.
  assert.match(result.reason, /deadline expired/);
  assert.equal(result.dispatched.includes('click'), true);
});

test('J6d a non-zero exit status on the move is fail closed before any click', async () => {
  const fixture = clickOps({
    preMove: FACT_BEFORE, postMove: FACT_WITNESSED, postClick: FACT_AFTER, at: SCALED_NATIVE,
    move: () => ({ code: 1, signal: null, stdout: '', stderr: 'XError: BadWindow' }),
  });
  const result = await runClick(clickArgs(fixture));
  assert.equal(result.ok, false);
  assert.match(result.reason, /mousemove exited 1/);
  assert.equal(result.dispatched.includes('click'), false);
});

test('J6e a pointer counter that does not advance means no click (ir6 F2: a bounded wait)', async () => {
  const fixture = clickOps({
    preMove: FACT_BEFORE,
    postMove: { ...FACT_WITNESSED, [POINTER.counter]: 7 }, // did NOT advance
    postClick: FACT_AFTER,
    at: SCALED_NATIVE,
  });
  const result = await runClick(clickArgs(fixture));
  assert.equal(result.ok, false);
  // A stale counter waits for the next hook tick; one that never advances ends
  // at the deadline. No click is ever issued.
  assert.match(result.reason, /deadline expired/);
  assert.equal(result.dispatched.includes('click'), false);
});

test('J7 a click the page never observed is a failure, and a descriptor mismatch names both', () => {
  const before = { clickN: 4, href: 'x' };
  const notAdvanced = landingFact(before, { clickN: 4, href: 'y' }, { kind: 'patient-href' });
  assert.equal(notAdvanced.ok, true); // href is the landing fact; clickN is checked in runClick
  const same = landingFact(before, { clickN: 5, href: 'x' }, { kind: 'patient-href' });
  assert.equal(same.ok, false);
  assert.match(same.reason, /href did not change/);
  assert.equal(landingFact(before, { clickN: 5, href: 'y', scriptText: 'true' }, { kind: 'script-text' }).ok, true);
  assert.match(landingFact(before, { clickN: 5, scriptText: 'false' }, { kind: 'script-text' }).reason, /scriptText read "false"/);
  assert.match(landingFact(before, { clickN: 5, href: 'y' }, { kind: 'nope' }).reason, /unknown landing kind/);
});

test('J8 the rectangle signature is diagnostic text and is never a landing fact', () => {
  const reader = createBatchReader();
  reader.observe(batchLine({ epoch: 1, batch: 0, total: 1, entries: [leaf(0, 'Row 0')] }));
  const first = rectSignature(reader.frame());
  reader.observe(batchLine({ epoch: 2, batch: 0, total: 1, entries: [leaf(0, 'Row 0 moved')] }));
  assert.notEqual(first, rectSignature(reader.frame()));
  assert.equal(landingFact({ href: 'x' }, { href: 'x' }, { kind: 'patient-href' }).ok, false);
  // A null or partial read is a snapshot before the next hook tick: it waits.
  assert.equal(landingFact({ href: 'x' }, null, { kind: 'patient-href' }).pending, true);
  assert.equal(landingFact({ href: 'x' }, {}, { kind: 'patient-href' }).pending, true);
  assert.equal(rectSignature({ ok: false }), '');
});

// -------------------------------------------------------- the whole flow ----

/**
 * The IO the whole flow drives, modelled as a page whose hook publishes on its
 * own change-only 250 ms poll. `live` is the page's current state; `published`
 * is the last fact line the hook emitted. A move or click updates `live` and
 * marks it dirty, and only the next `tick()` publishes it — the exact staleness
 * the reader must now wait through. The pointer is observed through the TRUE
 * mapping when `deliver` says a warp-driven pointermove reached the page, which
 * is precisely the thing this model cannot prove.
 */
function flowOps({
  window = WINDOW,
  appPid = APP_PID,
  vpW = 1280,
  vpH = 800,
  kx = 1.5,
  ky = 1.5,
  ox = 26,
  oy = 31,
  readDelta = { x: 0, y: 0 },
  deliver = () => true,
  hang = null,
  geometry = null,
  descriptor = { tag: RECT.t, testId: RECT.d, text: RECT.l },
  landing = 'patient-href',
  landingDelayTicks = 1,
  centre = { x: 400, y: 414 },
  partialStart = false,
  viewportMissing = false,
  baselineMissing = false,
  collapseX = false,
  malformedClick = false,
} = {}) {
  const live = {
    vpW,
    vpH,
    ptrN: 0,
    ptrCX: Number.NaN,
    ptrCY: Number.NaN,
    clickN: 0,
    clickCX: Number.NaN,
    clickCY: Number.NaN,
    tag: '',
    testId: '',
    text: '',
    href: 'http://127.0.0.1:7717/',
    scriptText: 'false',
    landingPending: false,
    landingTicks: 0,
  };
  const state = { moves: 0, last: null, ticks: 0, targetAsked: null };
  const observed = (point) => {
    const seen = { x: Math.round((point.x - ox) / kx), y: Math.round((point.y - oy) / ky) };
    if (collapseX) seen.x = 500;
    return seen;
  };
  const snapshot = () => {
    const fact = {
      [VIEWPORT.w]: String(live.vpW),
      [VIEWPORT.h]: String(live.vpH),
      [POINTER.counter]: String(live.ptrN),
      [POINTER.clientX]: String(live.ptrCX),
      [POINTER.clientY]: String(live.ptrCY),
      [CLICK.counter]: String(live.clickN),
      [CLICK.clientX]: String(live.clickCX),
      [CLICK.clientY]: String(live.clickCY),
      [CLICK.tag]: live.tag,
      [CLICK.testId]: live.testId,
      [CLICK.text]: live.text,
      href: live.href,
      scriptText: live.scriptText,
    };
    if (viewportMissing) {
      delete fact[VIEWPORT.w];
      delete fact[VIEWPORT.h];
    }
    if (baselineMissing) delete fact[POINTER.counter];
    return fact;
  };
  const partial = () => {
    const fact = snapshot();
    delete fact[VIEWPORT.w];
    delete fact[VIEWPORT.h];
    delete fact[POINTER.counter];
    return fact;
  };
  let published = partialStart ? partial() : snapshot();
  let dirty = partialStart;
  const tick = () => {
    state.ticks += 1;
    if (live.landingPending) {
      live.landingTicks += 1;
      if (live.landingTicks > landingDelayTicks) {
        if (landing === 'patient-href') live.href = 'http://127.0.0.1:7717/?patient=p1';
        else if (landing === 'script-text') live.scriptText = 'true';
        live.landingPending = false;
        dirty = true;
      }
    }
    if (dirty) {
      published = snapshot();
      dirty = false;
    }
  };
  return {
    state,
    tick,
    ops: {
      windowGeometry: () => geometry ?? {
        code: 0, signal: null, stdout: '', stderr: '',
        id: window.id, x: window.x, y: window.y, w: window.w, h: window.h, pid: appPid,
      },
      windowPid: () => ({ code: 0, signal: null, stdout: `${String(appPid)}\n`, stderr: '' }),
      move: (point) => {
        state.moves += 1;
        state.last = point;
        if (state.moves === 3) state.targetAsked = point;
        if (hang === 'move') return new Promise(() => {});
        if (deliver(state.moves)) {
          const seen = observed(point);
          live.ptrCX = seen.x;
          live.ptrCY = seen.y;
          live.ptrN += 1;
          dirty = true;
        }
        return { code: 0, signal: null, stdout: '', stderr: '' };
      },
      read: () => {
        if (hang === 'read') return new Promise(() => {});
        return {
          code: 0, signal: null, stdout: '', stderr: '',
          X: String((state.last?.x ?? 0) + readDelta.x),
          Y: String((state.last?.y ?? 0) + readDelta.y),
          WINDOW: String(window.id),
          PID: String(appPid),
        };
      },
      click: () => {
        if (hang === 'click') return new Promise(() => {});
        live.clickN += 1;
        live.clickCX = malformedClick ? Number.NaN : centre.x;
        live.clickCY = malformedClick ? Number.NaN : centre.y;
        live.tag = descriptor.tag;
        live.testId = descriptor.testId;
        live.text = descriptor.text;
        live.landingPending = landing !== 'none';
        live.landingTicks = 0;
        dirty = true;
        return { code: 0, signal: null, stdout: '', stderr: '' };
      },
      nextFact: () => published,
    },
  };
}

/** The frame the flow selects from: one row, plus a same-label tooltip. */
function flowFrame() {
  const reader = createBatchReader();
  const row = { ...leaf(0, 'John Smith', 'span', 'patient-open'), x: 300, y: 400, w: 200, h: 28 };
  const tip = { ...leaf(1, 'John Smith', 'div', ''), x: 700, y: 100, w: 180, h: 28 };
  reader.observe(batchLine({ epoch: 1, batch: 0, total: 2, entries: [row, tip] }));
  return reader.frame();
}

const FLOW_WANTED = { label: 'John Smith', tag: 'span' };

/**
 * A flow harness: one fake clock, one immutable deadline, the page fixture and
 * the injected scheduler that advances the clock and ticks the page. This is the
 * fixture interface change ir6 F2 requires — the model now polls, so a fixture
 * must say when the page publishes rather than force an instant queue.
 */
function flowHarness(extra = {}) {
  const clock = extra.clock ?? createClock(0);
  const deadline = extra.deadline ?? createTargetDeadline(0, 30_000);
  const fixture = flowOps(extra);
  const schedule = extra.schedule ?? ((ms) => {
    clock.advance(ms);
    fixture.tick();
    return Promise.resolve();
  });
  return {
    clock,
    deadline,
    fixture,
    args: {
      deadline,
      clock,
      schedule,
      frame: extra.frame ?? flowFrame(),
      wanted: FLOW_WANTED,
      expected: extra.expected ?? { kind: 'patient-href' },
      ops: fixture.ops,
    },
  };
}

/** The target a MEASURED solve must ask for, computed independently of the model. */
function expectedMeasuredTarget({ kx, ky, ox, oy, readDelta, vpW = 1280, vpH = 800, window = WINDOW, centre = { x: 400, y: 414 } }) {
  const [first, second] = calibrationTargets(vpW, vpH);
  const naive = { x: window.x + first.cx, y: window.y + first.cy };
  const displacement = { x: naive.x + (second.cx - first.cx), y: naive.y + (second.cy - first.cy) };
  const observed = (point) => ({ x: Math.round((point.x - ox) / kx), y: Math.round((point.y - oy) / ky) });
  const transform = solveTransform([
    { cx: observed(naive).x, cy: observed(naive).y, sx: naive.x + readDelta.x, sy: naive.y + readDelta.y },
    { cx: observed(displacement).x, cy: observed(displacement).y, sx: displacement.x + readDelta.x, sy: displacement.y + readDelta.y },
  ]);
  assert.equal(transform.ok, true, transform.reason);
  return { x: Math.round(transform.toNative(centre).x), y: Math.round(transform.toNative(centre).y) };
}

test('F1-g the getwindowgeometry command is classified before its fields are consumed (ir6 F1)', async () => {
  // A healthy geometry command, carrying the full command protocol, still runs
  // the whole flow: the fix is classification, not an early missing-field refusal.
  const healthy = flowHarness();
  const healthyResult = await runFlow(healthy.args);
  assert.equal(healthyResult.ok, true, healthyResult.reason);
  assert.equal(healthyResult.dispatched.includes('click'), true);

  for (const [name, geometry, pattern] of [
    ['non-zero status', { code: 1, signal: null, stdout: '', stderr: 'xdotool: BadWindow', id: WINDOW.id, x: 60, y: 70, w: 1280, h: 860, pid: APP_PID }, /getwindowgeometry exited 1/],
    ['XError on stdout', { code: 0, signal: null, stdout: 'XError: BadValue', stderr: '', id: WINDOW.id, x: 60, y: 70, w: 1280, h: 860, pid: APP_PID }, /getwindowgeometry reported XError/],
    ['killed by signal', { code: null, signal: 'SIGKILL', stdout: '', stderr: '', id: WINDOW.id, x: 60, y: 70, w: 1280, h: 860, pid: APP_PID }, /killed by signal SIGKILL/],
  ]) {
    const h = flowHarness({ geometry });
    const result = await runFlow(h.args);
    assert.equal(result.ok, false, name);
    assert.match(result.reason, pattern, name);
    assert.deepEqual(result.dispatched, ['getwindowgeometry'], name);
    assert.equal(h.fixture.state.moves, 0, name);
  }
});

test('F2 the exported flow calibrates, then warps to the target, then clicks once, then lands', async () => {
  const h = flowHarness();
  const result = await runFlow(h.args);
  assert.equal(result.ok, true, result.reason);
  assert.deepEqual(result.dispatched, [
    'getwindowgeometry', 'getwindowpid', 'mousemove', 'getmouselocation', // bootstrap 1
    'mousemove', 'getmouselocation',                     // bootstrap 2
    'mousemove', 'getmouselocation',                     // target
    'click',
  ]);
  assert.equal(h.fixture.state.moves, 3);
  // The solve recovered the true mapping, so the target native point is what the
  // truth implies: 1.5 * (400, 414) + (26, 31).
  assert.match(result.reason, /href transitioned/);
  assert.match(result.reason, new RegExp(`clickTag, ${CLICK.testId} and trimmed`));
});

test('F2-a a delayed viewport and pointer baseline are waited for, not refused (ir6 F2)', async () => {
  const h = flowHarness({ partialStart: true });
  const result = await runFlow(h.args);
  assert.equal(result.ok, true, result.reason);
  assert.ok(h.fixture.state.ticks >= 1, 'the poll waited for the first publication');
});

test('F2-b every warp observation waits for the hook tick, then clicks once (ir6 F2)', async () => {
  const h = flowHarness();
  const result = await runFlow(h.args);
  assert.equal(result.ok, true, result.reason);
  // Five waits: three warp witnesses, the fresh clickN and the landing.
  assert.ok(h.fixture.state.ticks >= 5, `ticks=${String(h.fixture.state.ticks)}`);
  assert.equal(result.dispatched.filter((name) => name === 'click').length, 1);
});

test('F2-c a landing published on a later tick is waited for, then succeeds (ir6 F2)', async () => {
  const h = flowHarness({ landingDelayTicks: 3 });
  const result = await runFlow(h.args);
  assert.equal(result.ok, true, result.reason);
  assert.match(result.reason, /href transitioned/);
});

test('F2-d a viewport or a pointer baseline that never appears ends at the deadline (ir6 F2)', async () => {
  const noViewport = flowHarness({ viewportMissing: true });
  const a = await runFlow(noViewport.args);
  assert.equal(a.ok, false);
  assert.match(a.reason, /deadline expired/);
  assert.deepEqual(a.dispatched, ['getwindowgeometry', 'getwindowpid']);
  assert.equal(noViewport.fixture.state.moves, 0);

  const noBaseline = flowHarness({ baselineMissing: true });
  const b = await runFlow(noBaseline.args);
  assert.equal(b.ok, false);
  assert.match(b.reason, /deadline expired/);
  assert.equal(b.dispatched.includes('click'), false);
  assert.equal(noBaseline.fixture.state.moves, 0);
});

test('F2-e a landing that never arrives ends at the deadline, and no late publication resurrects it (ir6 F2)', async () => {
  const h = flowHarness({ landing: 'none' });
  const result = await runFlow(h.args);
  assert.equal(result.ok, false);
  assert.match(result.reason, /deadline expired/);
  assert.equal(h.deadline.at, 30_000);
  assert.equal(result.dispatched.includes('click'), true);
});

test('F2-f an interrupted observation read ends at the deadline with no click (ir6 F2)', async () => {
  const h = flowHarness({ hang: 'read' });
  const pending = runFlow(h.args);
  await pump(h.clock);
  h.clock.advance(30_000);
  const result = await pending;
  assert.equal(result.ok, false);
  assert.match(result.reason, /deadline expired/);
  assert.equal(result.dispatched.includes('click'), false);
});

test('F2-g a fresh but malformed click fact fails closed (ir6 F2)', async () => {
  const h = flowHarness({ malformedClick: true });
  const result = await runFlow(h.args);
  assert.equal(result.ok, false);
  assert.match(result.reason, /the click was observed at NaN,NaN px from the target centre/);
  assert.equal(result.dispatched.includes('click'), true);
});

test('F2-h the observation predicate is fail closed when it throws (ir6 F2)', async () => {
  const clock = createClock(0);
  const deadline = createTargetDeadline(0, 30_000);
  const result = await pollObservation({
    deadline,
    clock,
    currentFact: () => ({ [POINTER.counter]: '1' }),
    classify: () => {
      throw new Error('bad predicate');
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /predicate threw: Error: bad predicate/);
  assert.equal(OBSERVATION_POLL_MS, 250);
});

test('F2-i a hung observation poll ends at the deadline, not by a phase timer (ir6 F2)', async () => {
  const clock = createClock(0);
  const deadline = createTargetDeadline(0, 30_000);
  const pending = pollObservation({
    deadline,
    clock,
    currentFact: () => ({ stale: 'yes' }),
    classify: () => ({ ok: false, terminal: false }),
    schedule: () => new Promise(() => {}), // a scheduler that never resolves
  });
  clock.advance(30_000);
  const result = await pending;
  assert.equal(result.ok, false);
  assert.match(result.reason, /deadline expired/);
  assert.equal(deadline.at, 30_000);
});

test('F3 both bootstrap points are containment-checked BEFORE their warp, with no exemption', async () => {
  // A CSS viewport wider than the native window is exactly the case the
  // revision-5 bootstrap exemption waved through. A 600 px window refuses the
  // first naive point; an 800 px window refuses the second displacement.
  const first = flowHarness({ window: { id: WINDOW.id, x: 60, y: 70, w: 600, h: 860 } });
  const refusedFirst = await runFlow(first.args);
  assert.equal(refusedFirst.ok, false);
  assert.match(refusedFirst.reason, /bootstrap 1: .*lies outside the window rectangle/);
  assert.deepEqual(refusedFirst.dispatched, ['getwindowgeometry', 'getwindowpid']);
  assert.equal(first.fixture.state.moves, 0, 'no warp was issued for the point that failed');

  const second = flowHarness({ window: { id: WINDOW.id, x: 60, y: 70, w: 800, h: 860 } });
  const refusedSecond = await runFlow(second.args);
  assert.equal(refusedSecond.ok, false);
  assert.match(refusedSecond.reason, /bootstrap 2: .*lies outside the window rectangle/);
  assert.deepEqual(refusedSecond.dispatched, ['getwindowgeometry', 'getwindowpid', 'mousemove', 'getmouselocation']);
  assert.equal(second.fixture.state.moves, 1, 'bootstrap 1 moved; bootstrap 2 did not');
  assert.equal(refusedSecond.dispatched.includes('click'), false);
});

test('F3-m the solve uses the measured native read-back, not the commanded point (ir6 F3)', async () => {
  const commanded = flowHarness({ readDelta: { x: 0, y: 0 } });
  const measured = flowHarness({ readDelta: { x: 1, y: 0 } });
  const a = await runFlow(commanded.args);
  const b = await runFlow(measured.args);
  assert.equal(a.ok, true, a.reason);
  assert.equal(b.ok, true, b.reason);
  // A 1 px read-back difference (inside tolerance) moves the solved target by
  // exactly 1 px: the read-back is what is solved, not the commanded point.
  assert.equal(measured.fixture.state.targetAsked.x - commanded.fixture.state.targetAsked.x, 1);
  assert.equal(measured.fixture.state.targetAsked.y, commanded.fixture.state.targetAsked.y);
});

test('F3-n asymmetric per-point native errors change the target prediction, and the witness validates first', async () => {
  for (const [kx, ky] of [[1, 1], [1.5, 1.5], [2, 2]]) {
    const h = flowHarness({ kx, ky, readDelta: { x: 1, y: -1 } });
    const result = await runFlow(h.args);
    assert.equal(result.ok, true, `${String(kx)}: ${result.reason}`);
    // The target asked for is exactly the measured solve's prediction, and the
    // flow only reached the click after the post-warp witness validated.
    assert.deepEqual(h.fixture.state.targetAsked, expectedMeasuredTarget({ kx, ky, ox: 26, oy: 31, readDelta: { x: 1, y: -1 } }), `${String(kx)}x${String(ky)}`);
    assert.equal(result.dispatched.includes('click'), true, `${String(kx)}x${String(ky)}`);
  }
});

test('F4 a pointermove that never reaches the page ends at the deadline with no click (ir6 F2)', async () => {
  const h = flowHarness({ deliver: () => false });
  const result = await runFlow(h.args);
  assert.equal(result.ok, false);
  assert.match(result.reason, /deadline expired/);
  assert.equal(result.dispatched.includes('click'), false);
});

test('F5 an undelivered pointermove on the target leaves every earlier move intact and ends at the deadline', async () => {
  const h = flowHarness({ deliver: (n) => n < 3 });
  const result = await runFlow(h.args);
  assert.equal(result.ok, false);
  assert.match(result.reason, /deadline expired/);
  assert.equal(h.fixture.state.moves, 3);
  assert.equal(result.dispatched.includes('click'), false);
});

test('F6 a degenerate calibration ends the row with no target warp and no click', async () => {
  // The page reports the same client x for both bootstrap moves: client x is
  // unidentifiable, so the solve is refused before any conversion.
  const h = flowHarness({ collapseX: true });
  const result = await runFlow(h.args);
  assert.equal(result.ok, false);
  assert.match(result.reason, /the calibration did not solve/);
  assert.equal(h.fixture.state.moves, 2, 'exactly the two bootstrap moves');
  assert.equal(result.dispatched.includes('click'), false);
  assert.deepEqual(result.dispatched, ['getwindowgeometry', 'getwindowpid', 'mousemove', 'getmouselocation', 'mousemove', 'getmouselocation']);
});

test('F7 a hung bootstrap move ends at the deadline with no click (ir5 B2)', async () => {
  const h = flowHarness({ hang: 'move' });
  const pending = runFlow(h.args);
  await pump(h.clock);
  assert.deepEqual(h.fixture.ops.nextFact()[POINTER.counter], '0');
  h.clock.advance(30_000);
  const result = await pending;
  assert.equal(result.ok, false);
  assert.match(result.reason, /deadline expired/);
  assert.deepEqual(result.dispatched, ['getwindowgeometry', 'getwindowpid', 'mousemove']);
  assert.equal(h.deadline.at, 30_000);
});

test('F8 the final step lands on scriptText, not on a rectangle change', async () => {
  const reader = createBatchReader();
  const row = { ...leaf(0, 'John Smith', 'span', 'patient-open'), x: 300, y: 400, w: 200, h: 28 };
  reader.observe(batchLine({ epoch: 1, batch: 0, total: 1, entries: [row] }));
  const h = flowHarness({ landing: 'script-text', frame: reader.frame(), expected: { kind: 'script-text' } });
  const result = await runFlow(h.args);
  assert.equal(result.ok, true, result.reason);
  assert.match(result.reason, /scriptText became true after the click/);
});

test('F9 the final step refuses a landing that never happens (ir6 F2: a bounded wait)', async () => {
  const reader = createBatchReader();
  const row = { ...leaf(0, 'John Smith', 'span', 'patient-open'), x: 300, y: 400, w: 200, h: 28 };
  reader.observe(batchLine({ epoch: 1, batch: 0, total: 1, entries: [row] }));
  const h = flowHarness({ landing: 'patient-href', frame: reader.frame(), expected: { kind: 'script-text' } });
  const result = await runFlow(h.args);
  assert.equal(result.ok, false);
  // The landing is a WAIT now: a scriptText that never becomes true ends at the
  // deadline rather than failing a healthy-but-not-yet-published landing.
  assert.match(result.reason, /deadline expired/);
  assert.equal(result.dispatched.includes('click'), true);
});

test('F10 an ambiguous label/tag pair ends the row before the target warp', async () => {
  const reader = createBatchReader();
  const entries = [
    { ...leaf(0, 'John Smith', 'span', 'patient-open'), x: 300, y: 400, w: 200, h: 28 },
    { ...leaf(1, 'John Smith', 'span', 'patient-open-2'), x: 700, y: 100, w: 180, h: 28 },
  ];
  reader.observe(batchLine({ epoch: 1, batch: 0, total: 2, entries }));
  const h = flowHarness({ frame: reader.frame() });
  const result = await runFlow(h.args);
  assert.equal(result.ok, false);
  assert.match(result.reason, /ambiguous: 2 rectangles at global indices 0, 1/);
  assert.equal(h.fixture.state.moves, 2, 'both bootstrap moves ran, the target warp did not');
  assert.equal(result.dispatched.includes('click'), false);
});

test('F11 a non-integer or absent geometry, pid or viewport ends the row before any move', async () => {
  const bad = [
    [{ code: 0, signal: null, stdout: '', stderr: '', id: WINDOW.id, x: 60, y: 70, w: 1280.5, h: 860, pid: APP_PID }, /non-integer WIDTH\/HEIGHT/],
    [{ code: 0, signal: null, stdout: '', stderr: '', id: WINDOW.id, x: 60, y: 70, w: 1280, h: 860, pid: 0 }, /not a positive integer/],
  ];
  for (const [geometry, pattern] of bad) {
    const h = flowHarness({ geometry });
    const result = await runFlow(h.args);
    assert.equal(result.ok, false, JSON.stringify(geometry));
    assert.match(result.reason, pattern);
    assert.deepEqual(result.dispatched, ['getwindowgeometry']);
    assert.equal(h.fixture.state.moves, 0);
  }
  const tiny = flowHarness({ vpW: 320, vpH: 240 });
  const small = await runFlow(tiny.args);
  assert.equal(small.ok, false);
  assert.match(small.reason, /below 400x300/);
  assert.equal(tiny.fixture.state.moves, 0);
});

test('F4-r a permuted identical duplicate is idempotent; a changed value still conflicts (ir6 F4)', () => {
  const first = `${MARKER_PATH}?rects=2&batch=0&epoch=2&i0_x=1&i0_y=2&i0_w=3&i0_h=4&i0_l=A&i0_t=span&i0_d=&i1_x=5&i1_y=6&i1_w=7&i1_h=8&i1_l=B&i1_t=a&i1_d=note`;
  // Same values, different parameter order AND different index order.
  const reordered = `${MARKER_PATH}?rects=2&batch=0&epoch=2&i1_l=B&i1_t=a&i1_d=note&i1_h=8&i1_w=7&i1_y=6&i1_x=5&i0_l=A&i0_t=span&i0_d=&i0_h=4&i0_w=3&i0_y=2&i0_x=1`;
  const r = createBatchReader();
  assert.equal(r.observe(first).kind, 'installed');
  assert.equal(r.observe(reordered).kind, 'idempotent-duplicate');
  assert.equal(r.conflict, null);
  assert.equal(r.frame().ok, true);
  // A changed field VALUE is still a conflict.
  const changed = `${MARKER_PATH}?rects=2&batch=0&epoch=2&i0_x=9&i0_y=2&i0_w=3&i0_h=4&i0_l=A&i0_t=span&i0_d=&i1_x=5&i1_y=6&i1_w=7&i1_h=8&i1_l=B&i1_t=a&i1_d=note`;
  assert.equal(r.observe(changed).kind, 'conflict');
  assert.match(r.conflict.reason, /two complete sightings of epoch 2 batch 0 differ/);
  assert.equal(r.frame().ok, false);
});