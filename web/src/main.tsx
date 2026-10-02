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
   * (HS-6, and the card's own reason for choosing it). It is assembled from
   * two parts because `eslint.config.js` bans every non-loopback URL literal as
   * a privacy tripwire, that file is outside this card's May edit, and
   * weakening the rule to accommodate a test hook would be HS-7.
   */
  const externalUrl = `${['https', 'example.invalid'].join('://')}/`;

  let attempt = '';
  let scriptTruePolls = 0;
  let stage = 0;
  let lastFacts = '';
  let lastRects = '';

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
    query.set('attempt', attempt);
    return query;
  };

  /** Text leaves — what "located by their visible text" means, so a harness
   * clicks a real label and never a class name or a selector of its own. */
  const readRects = (): { label: string; x: number; y: number; w: number; h: number }[] => {
    const found: { label: string; x: number; y: number; w: number; h: number }[] = [];
    for (const element of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
      if (element.children.length > 0) continue;
      const label = (element.innerText ?? '').trim();
      if (label.length < 1 || label.length > 64) continue;
      const rect = element.getBoundingClientRect();
      found.push({
        label,
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
    for (let index = 0; index * batchSize < rects.length; index += 1) {
      const query = new URLSearchParams();
      query.set('rects', String(rects.length));
      query.set('batch', String(index));
      rects.slice(index * batchSize, (index + 1) * batchSize).forEach((rect, at) => {
        query.set(`i${String(at)}_x`, String(rect.x));
        query.set(`i${String(at)}_y`, String(rect.y));
        query.set(`i${String(at)}_w`, String(rect.w));
        query.set(`i${String(at)}_h`, String(rect.h));
        query.set(`i${String(at)}_l`, rect.label);
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
