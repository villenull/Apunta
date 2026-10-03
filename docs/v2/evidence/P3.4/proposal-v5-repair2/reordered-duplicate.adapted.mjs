// F4 AFTER — an adapted copy of docs/v2/evidence/P3.4/proposal-ir6/reordered-duplicate.mjs.
//
// The original shows a key-order-permuted identical duplicate. This adapted copy
// adds an index-order permutation (i1 before i0) and a changed-value case, so
// the comparison is shown to be over the named seven fields and the index set,
// not over a serialized object. Every execution is synthetic.
import { fileURLToPath } from 'node:url';

const modelPath =
  process.env.APUNTA_P34_MODEL ??
  fileURLToPath(new URL('../../../../../build/p3.4-spec-v5-repair2/model.mjs', import.meta.url));
const { createBatchReader, MARKER_PATH } = await import(modelPath);

const first = `${MARKER_PATH}?rects=2&batch=0&epoch=2&i0_x=1&i0_y=2&i0_w=3&i0_h=4&i0_l=A&i0_t=span&i0_d=&i1_x=5&i1_y=6&i1_w=7&i1_h=8&i1_l=B&i1_t=a&i1_d=note`;
const reordered = `${MARKER_PATH}?rects=2&batch=0&epoch=2&i1_l=B&i1_t=a&i1_d=note&i1_h=8&i1_w=7&i1_y=6&i1_x=5&i0_l=A&i0_t=span&i0_d=&i0_h=4&i0_w=3&i0_y=2&i0_x=1`;
const changed = `${MARKER_PATH}?rects=2&batch=0&epoch=2&i0_x=9&i0_y=2&i0_w=3&i0_h=4&i0_l=A&i0_t=span&i0_d=&i1_x=5&i1_y=6&i1_w=7&i1_h=8&i1_l=B&i1_t=a&i1_d=note`;

const r = createBatchReader();
r.observe(first);
const permuted = r.observe(reordered);
process.stdout.write(`permuted identical duplicate: kind=${permuted.kind} conflict=${r.conflict === null ? 'null' : 'SET'} frame.ok=${r.frame().ok}\n`);
const conflict = r.observe(changed);
process.stdout.write(`changed value: kind=${conflict.kind} frame.ok=${r.frame().ok} reason=${r.frame().reason}\n`);
process.exit(0);
