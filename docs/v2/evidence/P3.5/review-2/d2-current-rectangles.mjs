/**
 * Review-2, D2: adversarial probes of the current-rectangle reader.
 *
 * Every call runs the candidate's own `tidsFromNewestMarker`, `readReported`,
 * `rectOf` and `waitForPublished`, extracted verbatim from
 * `scripts/v2/tauri-audio.test.mjs` (see `extract.mjs`). The fixtures are
 * fabricated stderr exactly as the shell re-emits it
 * (`apunta: ignoring a bridge line (…)`), with the query strings the app's own
 * hook builds — `web/src/main.tsx:124-128` sets `x`, `y`, `w`, `h` in that
 * order, all four or none. No app, no display, no input is touched.
 */
import { loadFunctions, report, summary } from './extract.mjs';

const { tidsFromNewestMarker, readReported, rectOf, waitForPublished, latestMarker, constants } =
  loadFunctions([
    'tidsFromNewestMarker',
    'readReported',
    'rectOf',
    'latestMarker',
    'waitForPublished',
    'pass',
    'fail',
    'sleep',
  ]);

const marker = (params) => new URLSearchParams(params);
// The shell's own wrapper, `main.rs:321`: the rejection, then the raw server log
// line, whose query ends at the closing quote the harness splits on.
const bridge = (path, query) => `apunta: ignoring a bridge line (HttpRejection: Failed to fetch ${path}?${query}")`;
const audio = (params) => bridge(constants.MARKER_PATH, new URLSearchParams(params).toString());
const rectParams = (id, x, y, w, h) => ({
  [`tid_${id}_x`]: String(x),
  [`tid_${id}_y`]: String(y),
  [`tid_${id}_w`]: String(w),
  [`tid_${id}_h`]: String(h),
});

// --- the helper on its own --------------------------------------------------

{
  const tids = tidsFromNewestMarker([marker({ ...rectParams('record-start', 10, 20, 30, 40) })]);
  report(
    'D2 a complete newest marker installs the rectangle',
    tids.get('record-start')?.x === 10 && tids.get('record-start')?.h === 40,
    JSON.stringify(tids.get('record-start')),
  );
}
{
  const tids = tidsFromNewestMarker([]);
  report('D2 no markers installs nothing', tids.size === 0, `size=${String(tids.size)}`);
}
{
  // The exact defect review-1 reproduced: a newer marker that omits the element.
  const tids = tidsFromNewestMarker([
    marker({ ...rectParams('record-start', 100, 200, 80, 40), ...rectParams('home-search', 1, 2, 3, 4) }),
    marker({ ...rectParams('home-search', 1, 2, 3, 4) }),
  ]);
  report(
    'D2 a newer marker that omits the element removes its rectangle (no union of history)',
    tids.has('record-start') === false && tids.has('home-search') === true,
    [...tids.keys()].join(','),
  );
}
{
  // A partial newer marker: only `x` and `y` survive a truncated query string.
  const tids = tidsFromNewestMarker([
    marker(rectParams('record-start', 100, 200, 80, 40)),
    marker({ 'tid_record-start_x': '111', 'tid_record-start_y': '222' }),
  ]);
  report(
    'D2 a truncated newer marker installs no partial rectangle and does not merge',
    tids.size === 0,
    JSON.stringify([...tids.entries()]),
  );
}
{
  // The reverse truncation shape: `y`, `w`, `h` present, `x` absent. `Number(null)`
  // is 0, which is finite, so this shape installs a rectangle at x = 0.
  const tids = tidsFromNewestMarker([
    marker(rectParams('record-start', 100, 200, 80, 40)),
    marker({ 'tid_record-start_y': '222', 'tid_record-start_w': '80', 'tid_record-start_h': '40' }),
  ]);
  report(
    'D2 ADVERSARIAL: a newest marker missing only `_x` installs a rectangle at x=0 (Number(null)===0)',
    tids.size === 1 && tids.get('record-start')?.x === 0,
    JSON.stringify(tids.get('record-start')),
  );
}
{
  const tids = tidsFromNewestMarker([
    marker({ 'tid_record-start_x': '', 'tid_record-start_y': '', 'tid_record-start_w': '80', 'tid_record-start_h': '40' }),
  ]);
  report(
    'D2 ADVERSARIAL: empty coordinate values read as 0 and install a rectangle at the origin',
    tids.size === 1 && tids.get('record-start')?.x === 0 && tids.get('record-start')?.y === 0,
    JSON.stringify(tids.get('record-start')),
  );
}
for (const [label, params] of [
  ['NaN', { 'tid_record-start_x': 'NaN', 'tid_record-start_y': '0', 'tid_record-start_w': '80', 'tid_record-start_h': '40' }],
  ['Infinity', { 'tid_record-start_x': '0', 'tid_record-start_y': '0', 'tid_record-start_w': 'Infinity', 'tid_record-start_h': '40' }],
  ['zero width', { 'tid_record-start_x': '0', 'tid_record-start_y': '0', 'tid_record-start_w': '0', 'tid_record-start_h': '40' }],
  ['negative width', { 'tid_record-start_x': '0', 'tid_record-start_y': '0', 'tid_record-start_w': '-80', 'tid_record-start_h': '40' }],
  ['zero height', { 'tid_record-start_x': '0', 'tid_record-start_y': '0', 'tid_record-start_w': '80', 'tid_record-start_h': '0' }],
]) {
  const tids = tidsFromNewestMarker([marker(params)]);
  report(`D2 a ${label} coordinate installs nothing`, tids.size === 0, JSON.stringify([...tids.entries()]));
}
{
  const tids = tidsFromNewestMarker([marker({ 'tid_home-action-note_x': '1', 'tid_home-action-note_y': '2', 'tid_home-action-note_w': '3', 'tid_home-action-note_h': '4' })]);
  report(
    'D2 a dashed test id with all four fields installs',
    tids.has('home-action-note'),
    [...tids.keys()].join(','),
  );
}
{
  const tids = tidsFromNewestMarker([marker({ 'tid_a_b_x': '1', 'tid_a_b_y': '2', 'tid_a_b_w': '3', 'tid_a_b_h': '4' })]);
  report(
    'D2 a test id containing an underscore resolves too (field = last segment, id = the rest)',
    tids.size === 1 && tids.has('a_b'),
    JSON.stringify([...tids.keys()]),
  );
}

// --- the real reader, over fabricated shell stderr --------------------------

{
  const stderr = [
    audio({
      phase: 'record-start',
      timer: '00:00',
      level: '0',
      levelPeak: '0',
      ...rectParams('home-search', 500, 300, 120, 40),
      ...rectParams('record-start', 700, 400, 90, 36),
    }),
    audio({
      phase: 'record-stage',
      timer: '00:01',
      level: '0',
      levelPeak: '0',
      ...rectParams('home-search', 500, 300, 120, 40),
      ...rectParams('record-start', 700, 400, 90, 36),
    }),
    audio({
      phase: 'record-stop',
      timer: '00:02',
      level: '0',
      levelPeak: '0',
      ...rectParams('home-search', 500, 300, 120, 40),
    }),
  ].join('\n');
  const reported = readReported({ stderr });
  report(
    'D2 readReported: the newest marker is the last one, and it dropped record-start',
    latestMarker(reported).get('phase') === 'record-stop' &&
      reported.tids.has('record-start') === false &&
      reported.tids.has('home-search') === true,
    `markers=${String(reported.markers.length)} tids=${[...reported.tids.keys()].join(',')}`,
  );
}
{
  // The exact truncation the shell can produce: the bridge line is cut after
  // `_x`/`_y`, so the newest marker is partial. It must not fall back.
  const stderr = [
    audio({ phase: 'record-start', ...rectParams('record-start', 100, 200, 80, 40) }),
    `apunta: ignoring a bridge line (HttpRejection: Failed to fetch ${constants.MARKER_PATH}?phase=record-stop&timer=00%3A03&level=0&levelPeak=0&'tid_record-start_x=111&'tid_record-start_y=222)`,
  ].join('\n');
  const reported = readReported({ stderr });
  report(
    'D2 readReported: a truncated newer marker is present as a marker and wins',
    reported.markers.length === 2 && reported.tids.size === 0,
    `markers=${String(reported.markers.length)} tids=${JSON.stringify([...reported.tids.entries()])}`,
  );
  report(
    'D2 readReported: the truncated marker does not resurrect the older rectangle',
    rectOf(reported.tids.get('record-start'), 'record-start') === null,
  );
}
{
  // P3.4's inherited text-leaf seam, on the same stderr: it must be untouched.
  const stderr = [
    bridge(
      constants.OBSERVE_PATH,
      new URLSearchParams({ i0_x: '10', i0_y: '20', i0_w: '30', i0_h: '40', i0_l: 'Stop and create draft' }).toString(),
    ),
    audio({ phase: 'record-start', ...rectParams('record-start', 100, 200, 80, 40) }),
  ].join('\n');
  const reported = readReported({ stderr });
  report(
    'D2 readReported: P3.4 text leaves are still read from the observe marker',
    reported.leaves.get('Stop and create draft')?.w === 30,
    JSON.stringify([...reported.leaves.entries()]),
  );
  report(
    'D2 readReported: the own rectangles and the inherited leaves coexist',
    reported.tids.has('record-start') && reported.leaves.size === 1,
  );
}

// --- waitForPublished, over a growing stderr (the integration, not a helper) --

{
  // The click path's own first read, exactly as `runCapture` does it.
  const stderr = audio({ phase: 'record-start', timer: '00:00', ...rectParams('home-search', 500, 300, 120, 40) });
  const reported = readReported({ stderr });
  report(
    'D2 the snapshot reader answers the first read of the click path',
    rectOf(reported.tids.get('home-search'), 'home-search')?.cx === 560,
    JSON.stringify(rectOf(reported.tids.get('home-search'), 'home-search')),
  );
}
{
  // The removal case through the real poll loop: the element disappears after
  // the click, so the snapshot reader must stop answering for it. A short
  // timeout keeps this to ~1s; the shipped `fail()` records the timeout row.
  let stderr = audio({ phase: 'record-start', ...rectParams('record-start', 100, 200, 80, 40) });
  const run = { output: { stderr } };
  const found = [];
  const target = rectOf(readReported(run.output).tids.get('record-start'), 'record-start');
  found.push(target);
  // Now the newest marker no longer carries it — the state the app reaches after
  // the click lands, which is what the old union-of-history reader got wrong.
  run.output.stderr += '\n' + audio({ phase: 'record-stop', timer: '00:01' });
  found.push(rectOf(readReported(run.output).tids.get('record-start'), 'record-start'));
  report(
    'D2 the click target stops resolving the moment the element leaves the screen',
    found[0] !== null && found[1] === null,
    `before=${JSON.stringify(found[0]?.cx ?? null)} after=${JSON.stringify(found[1]?.cx ?? null)}`,
  );
}
{
  // waitForPublished itself, awaited, against a stderr that publishes late.
  const run = { output: { stderr: '' } };
  const timer = setTimeout(() => {
    run.output.stderr +=
      '\n' + audio({ phase: 'record-stop', ...rectParams('home-search', 500, 300, 120, 40) });
  }, 300);
  const target = await waitForPublished(
    run,
    5_000,
    'the home-search rectangle',
    (reported) => rectOf(reported.tids.get('home-search'), 'home-search'),
  );
  clearTimeout(timer);
  report(
    'D2 waitForPublished resolves a rectangle published after it started polling',
    target !== null && target.cx === 560 && target.cy === 320,
    JSON.stringify(target),
  );
}
{
  // And the negative: the element never appears, so the wait times out and the
  // shipped `fail()` records it (exit code 1 from `fail`, restored afterwards).
  const before = process.exitCode;
  const run = { output: { stderr: audio({ phase: 'record-start' }) } };
  const target = await waitForPublished(
    run,
    600,
    'the record-start rectangle',
    (reported) => rectOf(reported.tids.get('record-start'), 'record-start'),
  );
  process.exitCode = before;
  report(
    'D2 waitForPublished times out rather than reusing an older rectangle',
    target === null,
    JSON.stringify(target),
  );
}

process.exitCode = summary('D2 current-rectangle probes') === 0 ? 0 : 1;