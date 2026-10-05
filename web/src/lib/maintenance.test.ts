import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  isCleanToClose,
  isRecordingActive,
  maintenanceTabId,
  setEditorUnpersisted,
  setRecordingActive,
  startMaintenanceReporter,
  stopMaintenanceReporter,
} from './maintenance.js';

/**
 * The reporter's own lifecycle (FD2(f)).
 *
 * The transport is stubbed at `fetch`, because what is under test is the
 * reporter's behaviour and not the server's: exactly one poll open at a time,
 * the flush through the existing `__apuntaFlushBeforeRelease` hook when it is
 * there and `ok` when it is not, the three blockers, the per-tab identity, and
 * the teardown that aborts the poll in flight. The server's half of every one of
 * these is `server/src/maintenance.test.ts`.
 */

/** One stubbed poll, and the control the case needs to end it. */
interface Poll {
  readonly url: string;
  readonly signal: AbortSignal | undefined;
  resolve(body: unknown): void;
  reject(reason: unknown): void;
  aborted(): boolean;
}

let polls: Poll[] = [];
let open = 0;
let peak = 0;
/** What the server answered the last poll with; `null` keeps it hanging. */
let answer: unknown = null;
/** Every report the reporter sent. */
let reports: { url: string; body: { quiesceId: string; ok: boolean; blockers: string[] } }[] = [];
/** Every request the page made that is not the reporter's own channel. */
let others: { url: string; method: string }[] = [];
/** Every last word the page sent as it went (AM-215). */
let beacons: { url: string; clean: boolean; via: string }[] = [];
/** What the stubbed beacon answers, so the fallback path can be exercised. */
let beaconAccepted = true;

/** Record a beacon, or refuse it the way a full queue would. */
function stubBeacon(): void {
  Object.defineProperty(navigator, 'sendBeacon', {
    configurable: true,
    value: (url: string, body: Blob | string): boolean => {
      const record = { url, clean: false, via: 'beacon' };
      // The real send is given a `Blob`, so the body has to be read to be
      // inspected; the case settles its promises before it asserts.
      const read = typeof body === 'string' ? Promise.resolve(body) : (body as Blob).text();
      void read.then((text: string) => {
        record.clean = (JSON.parse(text) as { clean?: boolean }).clean === true;
      });
      beacons.push(record);
      return beaconAccepted;
    },
  });
}

function stubFetch(): void {
  vi.stubGlobal('fetch', (input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input.url ?? String(input));
    if (url.startsWith('/api/app/quiesce/report')) {
      reports.push({
        url,
        body: JSON.parse(String(init?.body ?? '{}')) as {
          quiesceId: string;
          ok: boolean;
          blockers: string[];
        },
      });
      return Promise.resolve(new Response('{}', { status: 200 }));
    }
    if (url.startsWith('/api/app/quiesce/close')) {
      beacons.push({
        url,
        clean: (JSON.parse(String(init?.body ?? '{}')) as { clean?: boolean }).clean === true,
        via: 'fetch',
      });
      return Promise.resolve(new Response('', { status: 204 }));
    }
    if (!url.startsWith('/api/app/quiesce/wait')) {
      others.push({ url, method: String(init?.method ?? 'GET') });
      return Promise.resolve(new Response('{}', { status: 200 }));
    }
    open += 1;
    peak = Math.max(peak, open);
    return new Promise<Response>((resolvePromise, rejectPromise) => {
      let settled = false;
      const record: Poll = {
        url,
        signal: init?.signal ?? undefined,
        resolve: (body) => {
          if (settled) return;
          settled = true;
          open -= 1;
          resolvePromise(new Response(JSON.stringify(body), { status: 200 }));
        },
        reject: (reason) => {
          if (settled) return;
          settled = true;
          open -= 1;
          rejectPromise(reason);
        },
        aborted: () => init?.signal?.aborted === true,
      };
      // An aborted poll really does go away, which is what `open` counts: a
      // reporter that leaves an aborted request hanging would look like a live
      // one here, and the case is about there being exactly one live poll.
      init?.signal?.addEventListener('abort', () => {
        record.reject(new Error('aborted'));
      });
      polls.push(record);
      // A poll the case has already answered resolves straight away, so the
      // reporter's own re-arm is what the next poll is.
      if (answer !== null) {
        const body = answer;
        answer = null;
        record.resolve(body);
      }
    });
  });
}

/** Let the reporter's promise chain settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
  await new Promise((done) => setTimeout(done, 0));
}

function lastPoll(): Poll | undefined {
  return polls.at(-1);
}

/**
 * The per-document nonce out of a URL this module built. Read rather than
 * imported, because it is module-private on purpose: a case that could name it
 * could also hard-code it, and the whole point is that no two documents in one
 * tab ever share one.
 */
function docOf(url: string): string {
  return new URL(url, 'http://127.0.0.1').searchParams.get('doc') ?? '';
}

const FLUSH = { request: 'flush', quiesceId: 'quiesce-1' } as const;
const EXPIRED = { request: 'expired', quiesceId: 'quiesce-1' } as const;

beforeEach(() => {
  polls = [];
  reports = [];
  others = [];
  beacons = [];
  beaconAccepted = true;
  answer = null;
  open = 0;
  peak = 0;
  window.sessionStorage.clear();
  stubFetch();
  stubBeacon();
});

afterEach(() => {
  stopMaintenanceReporter();
  setRecordingActive(false);
  setEditorUnpersisted(false);
  delete (window as unknown as { __apuntaFlushBeforeRelease?: unknown }).__apuntaFlushBeforeRelease;
  vi.unstubAllGlobals();
});

describe('the maintenance reporter', () => {
  it('registers on mount and re-arms after the server answers', async () => {
    answer = EXPIRED;
    startMaintenanceReporter();
    await settle();

    expect(lastPoll()?.url).toMatch(/^\/api\/app\/quiesce\/wait\?tab=/);
    await settle();
    // The answered poll is followed immediately by the next one: the reporter
    // never sits idle while a window is open.
    expect(polls.length).toBeGreaterThanOrEqual(2);
  });

  it('never leaves two polls open, however many times it is armed', async () => {
    startMaintenanceReporter();
    // `main.tsx` calls this once at module scope, and `<StrictMode>` renders
    // twice; arming again must not add a second long-poll.
    startMaintenanceReporter();
    startMaintenanceReporter();
    await settle();
    expect(polls).toHaveLength(1);

    startMaintenanceReporter();
    await settle();
    expect(polls).toHaveLength(1);
    expect(peak).toBe(1);
  });

  it('reports ok when there is no editor to flush', async () => {
    answer = FLUSH;
    startMaintenanceReporter();
    await settle();
    await settle();

    expect(reports).toHaveLength(1);
    expect(reports[0]?.body).toEqual({ quiesceId: 'quiesce-1', ok: true, blockers: [] });
    // The hook is deleted by its own owner's cleanup, so its absence is normal.
    expect(
      (window as unknown as { __apuntaFlushBeforeRelease?: unknown }).__apuntaFlushBeforeRelease,
    ).toBeUndefined();
  });

  it('flushes through the editor hook when there is one', async () => {
    const flushed: string[] = [];
    (window as unknown as { __apuntaFlushBeforeRelease?: unknown }).__apuntaFlushBeforeRelease =
      async (): Promise<void> => {
        flushed.push('flushed');
      };
    answer = FLUSH;
    startMaintenanceReporter();
    await settle();
    await settle();

    expect(flushed).toEqual(['flushed']);
    expect(reports[0]?.body).toMatchObject({ ok: true, blockers: [] });
  });

  it('reports a conflict when the flush lost a save to another window', async () => {
    const { t } = await import('@apunta/shared');
    (window as unknown as { __apuntaFlushBeforeRelease?: unknown }).__apuntaFlushBeforeRelease =
      async (): Promise<void> => {
        throw new Error(t('note.unsavedConflict', {}, 'en'));
      };
    answer = FLUSH;
    startMaintenanceReporter();
    await settle();
    await settle();

    expect(reports[0]?.body).toEqual({ quiesceId: 'quiesce-1', ok: false, blockers: ['conflict'] });
  });

  it('reports a save_error for the other failed flush', async () => {
    const { t } = await import('@apunta/shared');
    (window as unknown as { __apuntaFlushBeforeRelease?: unknown }).__apuntaFlushBeforeRelease =
      async (): Promise<void> => {
        // Recognised in Spanish too: the reporter holds no locale of its own, so it
        // reads the catalogue rather than the UI language.
        throw new Error(t('note.unsavedError', {}, 'es-MX'));
      };
    answer = FLUSH;
    startMaintenanceReporter();
    await settle();
    await settle();

    expect(reports[0]?.body).toEqual({ quiesceId: 'quiesce-1', ok: false, blockers: ['save_error'] });
  });

  it('fails closed on a flush failure nobody expected', async () => {
    (window as unknown as { __apuntaFlushBeforeRelease?: unknown }).__apuntaFlushBeforeRelease =
      async (): Promise<void> => {
        throw new Error('something nobody expected');
      };
    answer = FLUSH;
    startMaintenanceReporter();
    await settle();
    await settle();

    // An unrecognised failure is a save that did not land, and a quiesce is
    // refused rather than settled over text nobody can prove is on disk.
    expect(reports[0]?.body).toEqual({ quiesceId: 'quiesce-1', ok: false, blockers: ['save_error'] });
  });

  it('carries a recording blocker the server has no route to register', async () => {
    setRecordingActive(true);
    expect(isRecordingActive()).toBe(true);
    answer = FLUSH;
    startMaintenanceReporter();
    await settle();
    await settle();

    expect(reports[0]?.body).toEqual({ quiesceId: 'quiesce-1', ok: false, blockers: ['recording'] });
  });

  it("carries the quiesce and this tab's identity on the flush's own note save", async () => {
    const tab = maintenanceTabId() as string;
    (window as unknown as { __apuntaFlushBeforeRelease?: unknown }).__apuntaFlushBeforeRelease =
      async (): Promise<void> => {
        // What `NoteView.flush()` does through `web/src/api/notes.ts`: the editor's
        // save is a `PATCH /api/notes/:id`, and maintenance mode refuses every write.
        await fetch('/api/notes/note-1', { method: 'PATCH', body: '{}' });
      };
    answer = FLUSH;
    startMaintenanceReporter();
    await settle();
    await settle();

    const saved = others.find((call) => call.url.startsWith('/api/notes/'));
    expect(saved?.method).toBe('PATCH');
    const query = new URLSearchParams((saved?.url ?? '').split('?')[1] ?? '');
    expect(query.get('quiesce')).toBe('quiesce-1');
    expect(query.get('tab')).toBe(tab);
    // And the flush's own outcome is unchanged: the save landed, so `ok`.
    expect(reports[0]?.body).toEqual({ quiesceId: 'quiesce-1', ok: true, blockers: [] });
  });

  it('touches nothing but that save, and puts fetch back afterwards', async () => {
    (window as unknown as { __apuntaFlushBeforeRelease?: unknown }).__apuntaFlushBeforeRelease =
      async (): Promise<void> => {
        await fetch('/api/notes/note-1', { method: 'PATCH', body: '{}' });
        // The chat under the note is a different route, and a save is the only
        // write the exemption covers.
        await fetch('/api/notes/note-1/chat', { method: 'POST', body: '{}' });
        await fetch('/api/patients', { method: 'POST', body: '{}' });
        await fetch('/api/notes/note-1', { method: 'DELETE' });
      };
    answer = FLUSH;
    startMaintenanceReporter();
    await settle();
    await settle();

    const doc = docOf(polls[0]?.url ?? '');
    expect(others.map((call) => call.url)).toEqual([
      '/api/notes/note-1?quiesce=quiesce-1&tab=' +
        encodeURIComponent(maintenanceTabId() as string) +
        '&doc=' +
        doc,
      '/api/notes/note-1/chat',
      '/api/patients',
      '/api/notes/note-1',
    ]);

    // Outside the flush there is no exemption at all, and `fetch` is the window's
    // own again — a save the editor makes on its own is an ordinary one.
    await fetch('/api/notes/note-2', { method: 'PATCH', body: '{}' });
    expect(others.at(-1)?.url).toBe('/api/notes/note-2');
  });

  it('carries the exemption on a Request or a URL, not only on a string', async () => {
    const tab = maintenanceTabId() as string;
    (window as unknown as { __apuntaFlushBeforeRelease?: unknown }).__apuntaFlushBeforeRelease =
      async (): Promise<void> => {
        // The three shapes `fetch` accepts. Only the string one carried the
        // exemption before, so the other two silently lost it. A `Request` is
        // built from an absolute URL because that is the only shape its
        // constructor accepts — and the URL it carries is the same-origin
        // absolute form the string path becomes.
        const base = window.location.origin;
        await fetch(new Request(new URL('/api/notes/note-1', base), { method: 'PATCH', body: '{}' }));
        await fetch(new URL('/api/notes/note-2', base), { method: 'PATCH', body: '{}' });
        // And an absolute URL to somewhere else is never rewritten, whatever
        // shape it arrives in.
        await fetch(new Request('https://example.invalid/api/notes/note-3', { method: 'PATCH' }));
      };
    answer = FLUSH;
    startMaintenanceReporter();
    await settle();
    await settle();

    const carried = others
      .map((call) => call.url)
      .filter((url) => url.includes('quiesce=quiesce-1'))
      .map((url) => new URL(url, 'http://127.0.0.1').searchParams.get('tab'));
    expect(carried).toEqual([tab, tab]);
    expect(others.at(-1)?.url).toBe('https://example.invalid/api/notes/note-3');
  });

  it('aborts the poll in flight when it is stopped', async () => {
    startMaintenanceReporter();
    await settle();
    const poll = lastPoll();
    expect(poll?.aborted()).toBe(false);

    stopMaintenanceReporter();
    expect(poll?.aborted()).toBe(true);

    await settle();
    // And it stays stopped: no re-arm after a teardown.
    const before = polls.length;
    await settle();
    expect(polls).toHaveLength(before);
  });

  it('re-arms after an answer that is not a flush request', async () => {
    answer = EXPIRED;
    startMaintenanceReporter();
    await settle();
    await settle();
    expect(reports).toHaveLength(0);
    expect(polls.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps one identity per tab and sends it on every call', async () => {
    const first = maintenanceTabId();
    expect(first).not.toBeNull();
    expect(maintenanceTabId()).toBe(first);

    answer = FLUSH;
    startMaintenanceReporter();
    await settle();
    await settle();
    expect(lastPoll()?.url).toContain(encodeURIComponent(first as string));
    expect(reports[0]?.url).toContain(encodeURIComponent(first as string));
  });

  it('registers without an identity when sessionStorage cannot be read', async () => {
    // A browser with storage disabled throws on access. The window must still
    // register — "no editor" must not become "no window" — and it registers with
    // no `tab`, which is exactly why it can never supersede anyone's record.
    const real = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('storage is disabled');
      },
    });
    try {
      vi.resetModules();
      const storageLess = await import('./maintenance.js');
      expect(storageLess.maintenanceTabId()).not.toBeNull();
    } finally {
      if (real !== undefined) Object.defineProperty(window, 'sessionStorage', real);
    }
  });

  it('mints a new identity in a fresh tab, and reuses one across a same-tab reload', async () => {
    // A reload is a fresh module instance over the same `sessionStorage`, which
    // is the whole point of keeping the id there: the re-registering tab
    // supersedes its own retained record (FD13(c)) instead of leaving it counting
    // for ever.
    vi.resetModules();
    const fresh = await import('./maintenance.js');
    const inAnotherTab = fresh.maintenanceTabId();
    expect(inAnotherTab).not.toBeNull();
    // Distinct across tabs, so no tab can supersede another tab's record.
    expect(inAnotherTab).not.toBe(maintenanceTabId());
  });

  it('carries one document nonce on the registration, the report and the beacon', async () => {
    // The per-document nonce (Defect D). The tab id names a *slot* — it survives
    // a same-tab reload and Chromium's *Duplicate Tab* copies it — so the server
    // cannot use it to tell a live document from the one that replaced it, and a
    // clean claim from the outgoing page would bank itself on the incoming
    // page's record. This is the value that says which page is speaking.
    answer = FLUSH;
    startMaintenanceReporter();
    await settle();

    const doc = docOf(lastPoll()?.url ?? '');
    expect(doc).not.toBe('');
    expect(doc).not.toBe(maintenanceTabId());
    // The same nonce on the report…
    expect(docOf(reports[0]?.url ?? '')).toBe(doc);
    // …and on the beacon, which is the one that has to be right.
    window.dispatchEvent(new Event('pagehide'));
    await settle();
    expect(docOf(beacons[0]?.url ?? '')).toBe(doc);
  });

  it('mints a new document nonce for a new page load, in the same tab', async () => {
    // The same-tab reload from the nonce's side. `vi.resetModules()` is what a
    // page load is to this module: the tab id comes back out of `sessionStorage`
    // unchanged, which is what makes the reloaded tab supersede its own record
    // (FD13(c)) — and the nonce has to differ, because that difference is the
    // whole of Defect D's guard: a claim from the page that just went away must
    // not be able to speak for the page that replaced it.
    answer = FLUSH;
    startMaintenanceReporter();
    await settle();
    const before = docOf(lastPoll()?.url ?? '');
    stopMaintenanceReporter();
    // The tab id in storage, which is what a reload reads back. Written here
    // rather than leaned on from an earlier case, so this case says what it means
    // on its own.
    window.sessionStorage.setItem('apunta-quiesce-tab', maintenanceTabId() as string);
    vi.resetModules();
    const reloaded = await import('./maintenance.js');
    expect(reloaded.maintenanceTabId()).toBe(maintenanceTabId());
    reloaded.startMaintenanceReporter();
    await settle();
    expect(docOf(lastPoll()?.url ?? '')).not.toBe(before);
    reloaded.stopMaintenanceReporter();
  });

  it('leaves one poll open across a hot reload, not two', async () => {
    startMaintenanceReporter();
    await settle();
    expect(polls).toHaveLength(1);

    // The reload: a second evaluation of this module over the same page, which is
    // what `main.tsx` gets on a hot reload. Its own `running` was false, so it
    // arms — and it takes over the poll the first instance left behind.
    vi.resetModules();
    const reloaded = await import('./maintenance.js');
    reloaded.startMaintenanceReporter();
    await settle();

    // The old instance must not re-arm behind it: its request was aborted, and
    // only the instance the window still points at re-arms.
    await settle();
    expect(polls).toHaveLength(2);
    expect(open).toBe(1);
    expect(peak).toBe(1);
    reloaded.stopMaintenanceReporter();
  });
});

describe("the window's last word (AM-215)", () => {
  it('says clean on pagehide when the editor holds nothing and no recording runs', async () => {
    const tab = maintenanceTabId() as string;
    startMaintenanceReporter();
    await settle();
    expect(isCleanToClose()).toBe(true);

    window.dispatchEvent(new Event('pagehide'));
    await settle();

    // The identity rides the query string, beside the registration and the
    // report, because that is where this channel already carries it — and the
    // per-document nonce rides with it, so the server can tell this document
    // from the one that would replace it in this same tab.
    expect(beacons).toHaveLength(1);
    expect(beacons[0]?.url).toBe(
      `/api/app/quiesce/close?tab=${encodeURIComponent(tab)}&doc=${docOf(polls[0]?.url ?? '')}`,
    );
    expect(beacons[0]?.clean).toBe(true);
    expect(beacons[0]?.via).toBe('beacon');
    // And the poll really is stopped: the page is going away.
    expect(polls.every((poll) => poll.aborted() || poll.signal?.aborted === true)).toBe(true);
  });

  it('says dirty when the editor holds text the server never acknowledged', async () => {
    startMaintenanceReporter();
    await settle();
    // What `NoteView`'s `beforeunload` guard publishes as it fires.
    setEditorUnpersisted(true);
    expect(isCleanToClose()).toBe(false);

    window.dispatchEvent(new Event('pagehide'));
    await settle();
    expect(beacons[0]?.clean).toBe(false);
  });

  it('says clean again once the editor that published the warning has gone', async () => {
    // The module half of Defect E. The ordinary sequence is: type, try to leave,
    // dismiss the dialog the guard raised, navigate away from the note in-app, and
    // close the tab later. The guard publishes `true` as it fires, and
    // `NoteView`'s effect cleanup withdraws it when the editor unmounts (the line
    // this module has no other way to get); what this asserts is the contract the
    // two halves make between them — a withdrawn warning really does make the
    // window clean again, so the later close says `clean` over nothing rather than
    // `dirty`, which is what would leave every subsequent quiesce refused until
    // Apunta restarted. The end-to-end proof is in the e2e: a row that is refused
    // a close, leaves the note screen and then has to settle a quiesce `ok:true`
    // fails without that line.
    startMaintenanceReporter();
    await settle();
    setEditorUnpersisted(true);
    expect(isCleanToClose()).toBe(false);

    setEditorUnpersisted(false);
    expect(isCleanToClose()).toBe(true);

    window.dispatchEvent(new Event('pagehide'));
    await settle();
    expect(beacons[0]?.clean).toBe(true);
  });

  it('says dirty while a recording is running, even with an empty editor', async () => {
    setRecordingActive(true);
    startMaintenanceReporter();
    await settle();
    expect(isCleanToClose()).toBe(false);

    window.dispatchEvent(new Event('pagehide'));
    await settle();
    expect(beacons[0]?.clean).toBe(false);
  });

  it('falls back to a keepalive fetch when the beacon is refused', async () => {
    // A browser with a full queue answers `false`, and the window still has to
    // say its word: the same body, through the transport the report already uses.
    beaconAccepted = false;
    const tab = maintenanceTabId() as string;

    startMaintenanceReporter();
    await settle();
    window.dispatchEvent(new Event('pagehide'));
    await settle();

    expect(beacons.filter((beacon) => beacon.via === 'fetch')).toHaveLength(1);
    expect(beacons.at(-1)?.url).toBe(
      `/api/app/quiesce/close?tab=${encodeURIComponent(tab)}&doc=${docOf(polls[0]?.url ?? '')}`,
    );
    expect(beacons.at(-1)?.clean).toBe(true);
    const kept = others.filter((call) => call.url.startsWith('/api/app/quiesce/close'));
    expect(kept).toEqual([]);
  });

  it('still says its word when the tab could not keep an identity across a reload', async () => {
    // A window with storage disabled cannot be recognised again after a reload, so
    // its id is fresh each time (FD1) — but it is still the id it registered
    // under, and the word has to reach the server under exactly that one.
    const real = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('storage is disabled');
      },
    });
    try {
      vi.resetModules();
      const storageLess = await import('./maintenance.js');
      storageLess.startMaintenanceReporter();
      await settle();
      const registered = polls.at(-1)?.url ?? '';
      window.dispatchEvent(new Event('pagehide'));
      await settle();

      expect(beacons).toHaveLength(1);
      const tab = new URLSearchParams((beacons[0]?.url ?? '').split('?')[1] ?? '').get('tab');
      expect(tab).not.toBe('');
      expect(registered).toContain(encodeURIComponent(tab as string));
      storageLess.stopMaintenanceReporter();
    } finally {
      if (real !== undefined) Object.defineProperty(window, 'sessionStorage', real);
    }
  });

  it('stopping the reporter on its own says nothing, which is a silent close', async () => {
    startMaintenanceReporter();
    await settle();
    stopMaintenanceReporter();
    await settle();
    // Deliberate: the teardown a hot reload gets is not a window saying goodbye,
    // and the server cannot tell the two apart from silence either way.
    expect(beacons).toHaveLength(0);
  });
});

/**
 * The back/forward cache, and why a persisted hide is not a close.
 *
 * `event.persisted` is the platform saying the document is being cached, not
 * discarded: it comes back on `pageshow` with its editor state — and its text —
 * intact. Chromium in this run never puts the app in the cache, so these cases
 * dispatch the events themselves; what is under test is the branch, not the
 * engine's willingness to take it.
 */
describe('a back/forward-cache hide is not a close', () => {
  /** `pagehide`/`pageshow` carrying the flag the platform sets on both. */
  function transition(type: 'pagehide' | 'pageshow', persisted: boolean): void {
    window.dispatchEvent(Object.assign(new Event(type), { persisted }));
  }

  it('says nothing on a persisted hide and keeps polling', async () => {
    startMaintenanceReporter();
    await settle();
    expect(polls).toHaveLength(1);

    transition('pagehide', true);
    await settle();

    // A document that is merely hidden has not closed, and saying `clean` for it
    // would discharge a record for a window that still holds its text — and is
    // coming back.
    expect(beacons).toHaveLength(0);
    // Nor is the registration given up: the wait stays open.
    expect(polls[0]?.signal?.aborted).not.toBe(true);
    expect(open).toBe(1);
  });

  it('re-arms the registration on the way back out of the cache', async () => {
    startMaintenanceReporter();
    await settle();
    transition('pagehide', true);
    await settle();
    const before = polls.length;

    transition('pageshow', true);
    // The re-arm goes through the reporter's own loop, which waits its interval
    // after an ended poll — a real wait here, not a mocked clock.
    await new Promise((done) => setTimeout(done, 700));
    await settle();

    expect(polls.length).toBeGreaterThan(before);
    // And it is a registration again, under the same tab identity.
    expect(polls.at(-1)?.url).toContain(encodeURIComponent(maintenanceTabId() as string));
  });
});
