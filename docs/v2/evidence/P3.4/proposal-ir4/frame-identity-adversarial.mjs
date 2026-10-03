// Adversarial check of §E's readObservations frame-identity rule.
// Scenario A: hover that inserts and removes a text leaf (total unchanged) --
//   the mixture D1 names. Scenario B: the count crosses a batch boundary.
const complete = (batches, total, frame) => {
  const need = Math.ceil(total / 40);
  const seen = [];
  for (let i = 0; i < need; i += 1) {
    const e = batches.get(i);
    if (!e || e.total !== total || e.frame !== frame) return { ok: false, why: `batch ${i} missing/stale (total=${e?.total} frame=${e?.frame})` };
    seen.push(i);
  }
  return { ok: true, why: `${seen.length}/${need} batches, all frame ${frame}` };
};

const read = (lines, asWritten) => {
  const batches = new Map();
  for (const q of lines) {
    const params = new URLSearchParams(q);
    const batch = Number(params.get('batch'));
    const total = Number(params.get('rects'));
    const frame = params.get('frame') ?? '';
    if (asWritten) {
      const entry = batches.get(batch) ?? { batch, total, frame, rects: new Map() };
      entry.rects.set(0, {});
      batches.set(batch, entry);
    } else {
      const entry = batches.get(batch) ?? { batch, rects: new Map() };
      entry.total = total; entry.frame = frame;
      entry.rects.set(0, {});
      batches.set(batch, entry);
    }
  }
  return batches;
};

const pub = (frame, n, batchStart = 0, count = 5) => {
  const out = [];
  for (let b = batchStart; b < batchStart + count; b += 1) {
    out.push(`rects=${n}&batch=${b}&frame=${frame}&i0_l=x`);
  }
  return out;
};

// Scenario A: publication f1 (5 batches, total 200), then a hover publication f2
// that is read mid-arrival (batch 3 of f2 has not landed yet).
const linesA = [...pub('f1', 200), ...pub('f2', 200).slice(0, 4)];
console.log('A) mixed publication read mid-arrival, total unchanged');
for (const asWritten of [true, false]) {
  const b = read(linesA, asWritten);
  const frames = [...b.values()].map((e) => `${e.batch}:${e.frame}`);
  console.log(`   ${asWritten ? 'as written (?? create-once)' : 'refresh on sight   '} ->`,
    complete(b, 200, 'f2').ok ? 'f2 selected (mixture NOT detected)' : `refused: ${complete(b,200,'f2').why}`,
    '| labels:', frames.join(' '));
}

// Scenario B: the count grows so a sixth batch appears.
const linesB = [...pub('f1', 200), ...pub('f2', 220, 0, 6)];
console.log('B) count crosses a batch boundary (200 -> 220, six batches)');
for (const asWritten of [true, false]) {
  const b = read(linesB, asWritten);
  console.log(`   ${asWritten ? 'as written (?? create-once)' : 'refresh on sight   '} ->`,
    complete(b, 220, 'f2').why, '| labels:', [...b.values()].map((e) => `${e.batch}:${e.frame}`).join(' '));
}

// Scenario C: the very first publication, as a control.
console.log('C) control: one complete publication f1');
const b = read(pub('f1', 200), true);
console.log('   as written ->', complete(b, 200, 'f1').why);

console.log('D) the same mixture, judged against the only frame label that exists');
const b2 = read(linesA, true);
console.log('   as written, ask for frame f1 ->', complete(b2, 200, 'f1').why, '(batches 0-3 actually hold f2 values)');
const b3 = read(linesA, false);
console.log('   refresh,   ask for frame f2 ->', complete(b3, 200, 'f2').why);
