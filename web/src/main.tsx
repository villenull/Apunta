import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { App } from './App.js';
import { applyAnimations, applyTheme, readBootTheme } from './lib/appearance.js';
import { installAutoHideScrollbars } from './lib/scrollbars.js';
import './styles/tokens.css';
import './styles/app.css';
import './styles/motion.css';
import './styles/choreography.css';

// The system's reduced-motion preference and the dark default apply before
// the first frame; her own choices, if she has made them, arrive with the
// settings. A theme this browser has already painted is applied ahead of the
// default, so a `system` user on a light desktop never sees dark first.
applyAnimations(undefined);
applyTheme(readBootTheme());
installAutoHideScrollbars();

// ---------------------------------------------------------------- the hook --

/**
 * P3.4's one test-only observation hook (C-BRIDGE@1 rules 4, 5 and 6), and the
 * place P3.5's own facts and its own marker path `/p3.5-marker` go **inside
 * this same block** — one hook, one gate, one poll, never two of any of them.
 *
 * It is reached only from the `import.meta.env.VITE_APUNTA_TEST_IDENTITY === '1'`
 * branch below, which is a build-time substitution: with the variable absent the
 * expression is `undefined === '1'`, the branch is dead, and the minifier drops
 * the block and every string in it. V0 asserts the marker path is absent from
 * `web/dist/assets/*.js`, and the flagged bundle is built outside `web/dist`
 * precisely so that a shippable bundle can never carry it.
 *
 * Nothing here asserts anything about the shell's guards. The hook only *does*
 * what a page does and *reports* what happened; (b) and (c) attempt a
 * navigation and a new window, and every assertion about whether they were
 * refused is made from outside the page.
 */
function installObservationHook(): void {
  const markerPath = '/api/p3.4-observe';
  const pollMs = 250;
  const rectCap = 200;
  const batchSize = 40;

  /**
   * RFC 2606 reserves `.invalid`, so this origin can never resolve: an attempt
   * to navigate or open it is provably a refusal attempt and never a request
   * (HS-6, and the card's own reason for choosing it). It is written plainly:
   * P3.4 permits exactly this one non-loopback literal, for this one
   * navigation-refusal assertion, on the line below, under one line-scoped
   * suppression of the privacy rule `eslint.config.js` installs for the tree.
   * The rule itself is untouched, and the origin is not assembled from parts —
   * a decomposition would route around the rule rather than satisfy it.
   */
  // eslint-disable-next-line no-restricted-syntax
  const externalUrl = 'https://example.invalid/';

  let attempt = '';
  let scriptTruePolls = 0;
  let stage = 0;
  let lastFacts = '';
  let lastRects = '';

  // ---------------------------------------------------------------- AM-188 --
  //
  // The owner-approved assertion and measurement package (AM-188): the fact
  // line gains the IPC probe, the viewport, the pointer and the click
  // descriptor, and the rectangle publication gains a run-local epoch, global
  // indices and the tag/test-id descriptor fields. All of it is read by the
  // existing 250 ms change-only poll — there is no second hook, no second gate
  // and no second interval, and none of P3.5's parts below move.
  let epoch = 0;
  let ipcProbe = 'pending';
  let ipcProbeMsg = '';
  let ptrN = 0;
  let ptrCX = 0;
  let ptrCY = 0;
  let clickN = 0;
  let clickCX = 0;
  let clickCY = 0;
  let clickTag = '';
  let clickTestId = '';
  let clickText = '';

  /** The exact rejection message, whether the rejection is an Error, a string or a plain object. */
  const ipcErrorMessage = (error: unknown): string => {
    if (typeof error === 'string') return error;
    if (error !== null && typeof error === 'object' && 'message' in error) {
      return String((error as { message: unknown }).message ?? '');
    }
    return String(error ?? '');
  };

  /**
   * The one-shot IPC probe (AM-188): a known-existing built-in command that the
   * ACL must deny. `invoke('plugin:event|listen')` reaches the live internals
   * door and must come back rejected with the exact ACL string; a resolution
   * means the command was reached, which is a failure. The outcome is published
   * on the fact line as `ipcProbe`/`ipcProbeMsg` — presence only, settling is
   * the assertion's job.
   */
  const runIpcProbe = (): void => {
    try {
      const internals = Reflect.get(window, '__TAURI_INTERNALS__');
      const invoke = internals?.invoke;
      if (typeof invoke !== 'function') {
        ipcProbe = 'rejected';
        ipcProbeMsg = 'the internals object carries no invoke function';
        return;
      }
      Promise.resolve()
        .then(() => invoke('plugin:event|listen', { event: 'apunta-ipc-probe' }))
        .then(
          () => {
            ipcProbe = 'resolved';
            ipcProbeMsg = '';
          },
          (error) => {
            ipcProbe = 'rejected';
            ipcProbeMsg = ipcErrorMessage(error);
          },
        );
    } catch (error) {
      ipcProbe = 'rejected';
      ipcProbeMsg = ipcErrorMessage(error);
    }
  };

  /**
   * The pointer and click listeners (AM-188): one `pointermove` listener and one
   * capture-phase `click` listener, both inside the existing hook and both read
   * by the existing poll. They only record what the page did; the harness reads
   * the published facts and never the DOM.
   */
  window.addEventListener('pointermove', (event) => {
    ptrN += 1;
    ptrCX = event.clientX;
    ptrCY = event.clientY;
  });
  document.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      clickN += 1;
      clickCX = event.clientX;
      clickCY = event.clientY;
      clickTag = target instanceof HTMLElement ? target.tagName : '';
      clickTestId = target instanceof HTMLElement ? (target.getAttribute('data-testid') ?? '') : '';
      clickText = (target instanceof HTMLElement ? (target.innerText ?? '') : '').trim();
    },
    true,
  );

  runIpcProbe();

  // ---------------------------------------------------------------- P3.5 --
  //
  // P3.5's own half of this one hook: its own marker path, its own capture
  // facts and its own three `data-testid` rectangles. Everything below is inside
  // this function, inside the same gated `if`, and runs on P3.4's poll — there is
  // no second gate, no second interval and no second `if` (owner decision
  // 2026-10-02, AM-124, AM-138).
  const audioMarkerPath = '/p3.5-marker';

  /**
   * The three rectangles P3.4's text-leaf rule cannot publish: `home-search` is
   * an `<input>` (no `innerText`, no children) and the other two are buttons with
   * element children, which is exactly what that rule skips. Each is keyed by
   * its `data-testid` and by nothing else, and carries four numbers — never the
   * input's value, the typed text, a patient name or a transcript (HS-8).
   */
  const audioTestIds = ['home-action-note', 'home-search', 'record-start'];

  /** The phase, read out of the DOM the app already renders (`Capture.tsx`). */
  const capturePhases = ['record-start', 'record-stop', 'record-stage', 'record-done', 'capture-error'];

  let levelPeak = 0;
  let lastAudioSnapshot = '';

  const present = (testId: string): boolean => document.querySelector(`[data-testid="${testId}"]`) !== null;

  const readPhase = (): string => {
    const shown = capturePhases.filter((testId) => present(testId));
    return shown.length === 0 ? 'none' : shown.join('+');
  };

  /**
   * `--level` on `record-dot`, the app's own level and nothing else. It is
   * `presenceOf(smoothed)`, so it is quantised to `0` or to `[0.55, 1.00]`.
   */
  const readLevel = (): number => {
    const dot = document.querySelector<HTMLElement>('[data-testid="record-dot"]');
    if (dot === null) return 0;
    const value = Number.parseFloat(getComputedStyle(dot).getPropertyValue('--level').trim());
    return Number.isFinite(value) ? value : 0;
  };

  const readAudioFacts = (): URLSearchParams => {
    const query = new URLSearchParams();
    const phase = readPhase();
    const level = readLevel();
    // A running maximum over every value this poll reads, not a per-sample one:
    // "never rose above the threshold for the whole recording" cannot be decided
    // from a change-only publish, so the maximum is kept here and reset on each
    // `record-start`.
    if (present('record-start')) levelPeak = 0;
    else if (level > levelPeak) levelPeak = level;
    const timer = document.querySelector('[data-testid="record-timer"]');
    query.set('phase', phase);
    query.set('timer', (timer?.textContent ?? '').trim());
    query.set('level', String(level));
    query.set('levelPeak', String(levelPeak));
    for (const testId of audioTestIds) {
      const element = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
      if (element === null) continue;
      const rect = element.getBoundingClientRect();
      query.set(`tid_${testId}_x`, String(Math.round(rect.x)));
      query.set(`tid_${testId}_y`, String(Math.round(rect.y)));
      query.set(`tid_${testId}_w`, String(Math.round(rect.width)));
      query.set(`tid_${testId}_h`, String(Math.round(rect.height)));
    }
    return query;
  };

  /**
   * The same-origin `fetch` is the channel the harness requires: Fastify's
   * request logger writes the URL to the bundled server's stdout, which the shell
   * drains and re-emits to stderr as `apunta: ignoring a bridge line (…)`. The
   * same origin means no new network access (HS-6).
   */
  const publishAudioFacts = (force: boolean): void => {
    const facts = readAudioFacts();
    const signature = facts.toString();
    if (!force && signature === lastAudioSnapshot) return;
    lastAudioSnapshot = signature;
    void fetch(`${audioMarkerPath}?${signature}`, { credentials: 'same-origin' }).catch(() => undefined);
  };

  const send = (query: URLSearchParams): void => {
    void fetch(`${markerPath}?${query.toString()}`, { credentials: 'same-origin' }).catch(() => undefined);
  };

  /** The fact set. One line carries all of it, so a line is a whole snapshot. */
  const readFacts = (): URLSearchParams => {
    const query = new URLSearchParams();
    query.set('href', location.href);
    query.set('title', document.title);
    query.set('tauri', typeof Reflect.get(window, '__TAURI__'));
    query.set('tauriInternals', typeof Reflect.get(window, '__TAURI_INTERNALS__'));
    const internals = Reflect.get(window, '__TAURI_INTERNALS__');
    query.set('ipc', typeof internals);
    query.set('ipcInvoke', typeof internals?.invoke);
    query.set('ipcProbe', ipcProbe);
    query.set('ipcProbeMsg', ipcProbeMsg);
    query.set('probe', typeof Reflect.get(window, '__APUNTA_CSP_PROBE__'));
    const body = document.body;
    const scriptText = body !== null && body.innerText.includes('<script>');
    query.set('scriptText', scriptText ? 'true' : 'false');
    const styled = Array.from(document.querySelectorAll<HTMLElement>('[style]')).find(
      (element) => (element.getAttribute('style') ?? '') !== '',
    );
    const declared = styled?.getAttribute('style') ?? '';
    const property = declared.split(':')[0] ?? '';
    query.set('styleAttr', declared);
    query.set(
      'styleComputed',
      styled === undefined || property.trim() === ''
        ? ''
        : getComputedStyle(styled).getPropertyValue(property.trim()).trim(),
    );
    query.set('vpW', String(window.innerWidth));
    query.set('vpH', String(window.innerHeight));
    query.set('ptrN', String(ptrN));
    query.set('ptrCX', String(ptrCX));
    query.set('ptrCY', String(ptrCY));
    query.set('clickN', String(clickN));
    query.set('clickCX', String(clickCX));
    query.set('clickCY', String(clickCY));
    query.set('clickTag', clickTag);
    query.set('clickTestId', clickTestId);
    query.set('clickText', clickText);
    query.set('attempt', attempt);
    return query;
  };

  /** Text leaves — what "located by their visible text" means, so a harness
   * clicks a real label and never a class name or a selector of its own. */
  const readRects = (): {
    label: string;
    tag: string;
    testId: string;
    x: number;
    y: number;
    w: number;
    h: number;
  }[] => {
    const found: {
      label: string;
      tag: string;
      testId: string;
      x: number;
      y: number;
      w: number;
      h: number;
    }[] = [];
    for (const element of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
      if (element.children.length > 0) continue;
      const label = (element.innerText ?? '').trim();
      if (label.length < 1 || label.length > 64) continue;
      const rect = element.getBoundingClientRect();
      found.push({
        label,
        tag: element.tagName,
        testId: element.getAttribute('data-testid') ?? '',
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      });
      if (found.length >= rectCap) break;
    }
    return found;
  };

  /** Batched, so no single request approaches Node's 16 KB header limit. */
  const sendRects = (rects: ReturnType<typeof readRects>): void => {
    epoch += 1;
    for (let index = 0; index * batchSize < rects.length; index += 1) {
      const query = new URLSearchParams();
      query.set('rects', String(rects.length));
      query.set('batch', String(index));
      query.set('epoch', String(epoch));
      rects.slice(index * batchSize, (index + 1) * batchSize).forEach((rect, at) => {
        const global = index * batchSize + at;
        query.set(`i${String(global)}_x`, String(rect.x));
        query.set(`i${String(global)}_y`, String(rect.y));
        query.set(`i${String(global)}_w`, String(rect.w));
        query.set(`i${String(global)}_h`, String(rect.h));
        query.set(`i${String(global)}_l`, rect.label);
        query.set(`i${String(global)}_t`, rect.tag);
        query.set(`i${String(global)}_d`, rect.testId);
      });
      send(query);
    }
  };

  const publishFacts = (force: boolean): void => {
    const facts = readFacts();
    const signature = facts.toString();
    if (force || signature !== lastFacts) {
      lastFacts = signature;
      send(facts);
    }
  };

  /**
   * The two attempts, once each and in this fixed order, and only once the
   * fact set has shown `scriptText` true on two consecutive polls — that is,
   * only once the probe note is open. Stage 0 waits, stage 1 is (b)'s
   * navigation, stage 2 is (c)'s new window; they are a poll apart so the
   * refusal of the first cannot race the second.
   */
  const maybeActuate = (): void => {
    if (stage === 0) {
      if (readFacts().get('scriptText') === 'true') scriptTruePolls += 1;
      else scriptTruePolls = 0;
      if (scriptTruePolls < 2) return;
      attempt = 'b:assign-location-href';
      publishFacts(true);
      location.href = externalUrl;
      stage = 1;
      return;
    }
    if (stage === 1) {
      attempt = 'c:window-open-external';
      publishFacts(true);
      window.open(externalUrl, '_blank');
      attempt = 'c:window-open-same-origin';
      publishFacts(true);
      window.open(`${location.origin}/patients`, '_blank');
      stage = 2;
    }
  };

  const poll = (): void => {
    publishFacts(false);
    publishAudioFacts(false);
    const rects = readRects();
    const signature = JSON.stringify(rects);
    if (signature !== lastRects) {
      lastRects = signature;
      sendRects(rects);
    }
    maybeActuate();
  };

  poll();
  window.setInterval(poll, pollMs);
}

if (import.meta.env.VITE_APUNTA_TEST_IDENTITY === '1') {
  installObservationHook();
}

const container = document.getElementById('root');
if (!container) throw new Error('#root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={createBrowserRouter([{ path: '*', element: <App /> }])} />
  </StrictMode>,
);
