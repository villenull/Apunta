// F4 (DEFECT, minor model logic): the conflict comparison is key-order
// sensitive. Two COMPLETE sightings of the same (epoch, batch) with identical
// field values but a different query-parameter order are reported as a
// conflicting duplicate and fail the frame closed, where the contract makes an
// identical duplicate idempotent.
//
// Root (P3.4-committee-resolution.md): "identical duplicate batches are
// idempotent, conflicting duplicate batches fail closed."
//
// The hook's own sendRects uses a fixed field order, so this is unlikely in
// production; it is still a genuine logic gap and it is untested.
//
// Every execution here is synthetic. Imports the repaired model read-only.
import { fileURLToPath } from 'node:url';
import { format } from 'node:util';

const modelPath =
  process.env.APUNTA_P34_MODEL ??
  fileURLToPath(new URL('../../../../../build/p3.4-spec-v5-repair/model.mjs', import.meta.url));
const { createBatchReader, MARKER_PATH } = await import(modelPath);

const first = `${MARKER_PATH}?rects=1&batch=0&epoch=2&i0_x=1&i0_y=2&i0_w=3&i0_h=4&i0_l=A&i0_t=span&i0_d=`;
const reordered = `${MARKER_PATH}?rects=1&batch=0&epoch=2&i0_l=A&i0_t=span&i0_d=&i0_w=3&i0_h=4&i0_x=1&i0_y=2`;

const r = createBatchReader();
r.observe(first);
const outcome = r.observe(reordered);
process.stdout.write(format(`reordered identical duplicate: kind=${outcome.kind} conflict=${r.conflict === null ? 'null' : 'SET'} frame.ok=${r.frame().ok} reason=${r.frame().reason}`) + '\n');
process.exit(0);
