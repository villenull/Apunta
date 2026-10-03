// ir5 reproduction — reader/epoch findings against the author's pure model.
//
// P1: G4's "truncated" fixture is malformed for an unrelated reason.
// P2: a newer malformed header does not raise the epoch, so the reader falls
//     back to an older complete frame (root: "a valid header identifying a
//     newer epoch still prevents fallback ... while that publication remains
//     incomplete").
//
// Pure synthetic strings only. Imports the author's model read-only.
import { fileURLToPath } from 'node:url';

const modelPath =
  process.env.APUNTA_P34_MODEL ??
  fileURLToPath(new URL('../../../../../build/p3.4-spec-v5/model.mjs', import.meta.url));
const { MARKER_PATH, createBatchReader } = await import(modelPath);

const leaf = (index, label, tag = 'span', testId = '') => ({
  index, label, tag, testId,
  x: 100 + index * 30, y: 200 + index * 12, w: 120, h: 24,
});
function batchLine({ epoch, batch, total, entries }) {
  const q = new URLSearchParams();
  q.set('rects', String(total)); q.set('batch', String(batch)); q.set('epoch', String(epoch));
  for (const { index, label, tag, testId, x, y, w, h } of entries) {
    q.set(`i${String(index)}_x`, String(x)); q.set(`i${String(index)}_y`, String(y));
    q.set(`i${String(index)}_w`, String(w)); q.set(`i${String(index)}_h`, String(h));
    q.set(`i${String(index)}_l`, label); q.set(`i${String(index)}_t`, tag);
    q.set(`i${String(index)}_d`, testId);
  }
  return `${MARKER_PATH}?${q.toString()}`;
}

// ---- P1 -------------------------------------------------------------------
{
  const good = Array.from({ length: 3 }, (_, i) => leaf(i, `Row ${String(i)}`));
  const full = batchLine({ epoch: 7, batch: 1, total: 6, entries: good });
  const truncated = full.slice(0, 120);
  const untruncated = createBatchReader().observe(full);
  const cut = createBatchReader().observe(truncated);
  console.log(`P1 full length=${full.length} truncated length=${truncated.length}`);
  console.log(`P1 untruncated line -> kind=${untruncated.kind} reason=${untruncated.reason}`);
  console.log(`P1 truncated line   -> kind=${cut.kind} reason=${cut.reason}`);
}

// ---- P2 -------------------------------------------------------------------
{
  const reader = createBatchReader();
  reader.observe(batchLine({ epoch: 5, batch: 0, total: 1, entries: [leaf(0, 'A')] }));
  console.log(`P2 before: frame.ok=${reader.frame().ok} epoch=${reader.frame().epoch} highestSeen=${reader.highestSeenEpoch}`);
  const newerMalformed = `${MARKER_PATH}?rects=1&batch=0&epoch=6&i0_x=1&i0_y=2`;
  const outcome = reader.observe(newerMalformed);
  const after = reader.frame();
  console.log(`P2 newer header (epoch=6) truncated -> kind=${outcome.kind} highestSeenAfter=${reader.highestSeenEpoch}`);
  console.log(`P2 after: frame.ok=${after.ok} epoch=${after.epoch} reason=${after.reason}`);
}
