#!/usr/bin/env node
import { format } from 'node:util';
/**
 * P3.5 attempt-1 independent review — synthetic proof that the harness keeps a
 * stale rectangle for a `data-testid` after a newer marker no longer carries it.
 *
 * Pure fabricated test: no app, no server, no microphone, no network. It
 * reproduces the exact tid-union loop from `readReported`
 * (`scripts/v2/tauri-audio.test.mjs:977-989`), where `state.tids` is a Map that
 * is only ever written to, never cleared per marker.
 */

// Exact loop copied from readReported, operating on an ordered marker list.
function unionTids(markers) {
  const state = { tids: new Map() };
  for (const marker of markers) {
    for (const [key, value] of marker.entries()) {
      if (!key.startsWith('tid_')) continue;
      const [, testId, field] = key.split('_');
      const rect = state.tids.get(testId) ?? {};
      rect[field] = Number(value);
      state.tids.set(testId, rect);
    }
  }
  return state.tids;
}

// Marker 1: the capture screen, `record-start` present at (100,200,80,40).
const m1 = new Map([
  ['phase', 'record-start'],
  ['tid_record-start_x', '100'],
  ['tid_record-start_y', '200'],
  ['tid_record-start_w', '80'],
  ['tid_record-start_h', '40'],
]);
// Marker 2: after the app moved on, `record-start` is gone; the marker carries
// no `tid_record-start_*` keys at all.
const m2 = new Map([
  ['phase', 'capture-error'],
  ['tid_home-search_x', '10'],
  ['tid_home-search_y', '20'],
  ['tid_home-search_w', '300'],
  ['tid_home-search_h', '30'],
]);

const tids = unionTids([m1, m2]);
const stale = tids.get('record-start');

let failures = 0;
function check(name, ok, detail) {
  process.stdout.write(format(`${ok ? 'PASS' : 'FAIL'} ${name}${detail === undefined ? '' : `: ${detail}`}`) + '\n');
  if (!ok) failures += 1;
}

process.stdout.write(format('tids map after both markers:', JSON.stringify([...tids.entries()])) + '\n');
process.stdout.write(format('') + '\n');
check(
  'the newest marker no longer carries record-start',
  ![...m2.keys()].some((k) => k.startsWith('tid_record-start')),
);
check(
  'the harness still reports a record-start rectangle from the older marker',
  stale !== undefined && stale.x === 100 && stale.y === 200,
  JSON.stringify(stale),
);
check(
  'rectOf would therefore accept it as a live target (w,h > 0 and finite)',
  stale !== undefined && stale.w > 0 && stale.h > 0,
  JSON.stringify(stale),
);

process.stdout.write(format('') + '\n');
process.stdout.write(format(
  `Verdict: ${failures === 0 ? 'stale rectangle reproduced (defect)' : 'unexpected: some expectation did not hold'}`,
) + '\n');
process.exit(failures === 0 ? 0 : 1);
