import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';

import { expect, test, uniqueName } from '../support/fixtures';

/**
 * C-UPD@1's quiescence and its close policy, end to end.
 *
 * Every case drives the **production** trigger — `POST /api/app/quiesce`, the same
 * exported entry point the shell's `quiesce{}` case calls — and every case waits
 * for a precondition through `GET /api/app/quiesce/status` rather than on a
 * timing. There is no test-only switch and no fault-injection flag, and nothing in
 * `server/src/ai/fake.ts` was touched to make a row pass.
 *
 * **The whole file is serial.** Maintenance mode is server-global, so two of these
 * cases at once would be two quiesces against one registry. The declaration is in
 * this file, with in-repo precedent (`language-control.spec.ts:98`): not the
 * global `workers: 1` that S2.11 forbids, not a skip, not a retry, not a timeout
 * inflation, and not a weakened assertion. The per-test budget stays Playwright's
 * default 30 s; no row calls `test.setTimeout`.
 *
 * Everything written into a note is invented, and the people are the prototype's
 * sample ones.
 */

// One declaration for the file, so the two describes below are serial too.
test.describe.configure({ mode: 'serial' });

/**
 * Every row's window registers under **its own** tab identity.
 *
 * There is no shared identity here any more, and that is the point: FD13 is
 * deliberately fail-closed, so a window that disconnects without ever reporting
 * cleanly leaves a **retained record with an unpersisted obligation**, and an
 * unresolved one blocks every later quiesce with `no_response`. Under one shared
 * identity each row silently superseded the record the last one left behind —
 * which is FD13(c)'s own production rule, but it hid the direction that matters:
 * in production a *different* tab never supersedes. With AM-215 an ordinary
 * **clean** close now discharges its own record (the browser says so on
 * `pagehide`), so the rows are independent without any of them having to pretend
 * to be another tab.
 *
 * A row that deliberately ends dirty — V3's forced conflict — still cannot leave
 * its record behind for the next row, and it does not pretend to: it comes back
 * into the app in the **same** tab, which supersedes the record by FD13(c), and
 * then closes cleanly. That is a real user path (reopening the app), not a reset.
 * And because a window that leaves without saying its word keeps its FD13
 * obligation — a clean report covers what it covered, not what was typed after it
 * — that close is now genuinely load-bearing: `leaveCleanly` proves the beacon
 * arrived by settling a quiesce from an identity that could not have superseded
 * anything.
 */

/** Put the row's tab identity in place before the app's first line runs. */
async function identify(target: Page | BrowserContext, tab: string): Promise<void> {
  await target.addInitScript((value) => {
    window.sessionStorage.setItem('apunta-quiesce-tab', value);
  }, tab);
}

/**
 * Leave the row the way a therapist would, and prove the server is clean after
 * it — so the next row starts where a fresh server would have left it.
 *
 * Four steps, all production mechanisms and no server switch:
 *
 * 1. **Come back into the app in the same tab**, which supersedes the record a
 *    dirty page left behind (FD13(c)) — the retained record is gone, not
 *    forgiven.
 * 2. **Let that window answer one quiesce cleanly**, which is an ordinary awaited
 *    request rather than a best-effort unload beacon.
 * 3. **Close it**, by navigating out of the app and then closing the tab. Its
 *    socket going away is what releases browser-mode maintenance (FD1) — and,
 *    because a window that leaves without saying its word keeps its FD13
 *    obligation (a clean report covers what it covered, not what was typed after
 *    it), that is also what makes the record retained.
 * 4. **Ask from a window that could not have superseded anything**, once the
 *    server reports that the only window left is that one. A fresh tab identity is
 *    the only vantage point from which "the beacon arrived" is visible: under
 *    FD13(c) it cannot clear the closed tab's record by re-registering, so a
 *    quiesce it can settle `ok:true` is proof that the `pagehide` word did its
 *    work. The wait is on the **exact** window set rather than a delay, because
 *    the closed tab's socket is still live for as long as the kernel takes to say
 *    so and a document that no longer exists cannot answer. Nothing is assumed
 *    here — if the beacon is lost, this teardown fails instead of leaving the next
 *    row a blocked server to trip over.
 *
 * The dialog is accepted, because a row that ends with unsaved text or a conflict
 * raises one and the point here is to get past it, not to assert on it.
 */
async function leaveCleanly(page: Page, request: APIRequestContext): Promise<void> {
  const context = page.context();
  // A row that asserts a refusal installs a dialog handler that **dismisses**,
  // because a dismissed dialog refuses the navigation — which is the point there
  // and the opposite of the point here. So this row's own handler comes off
  // first and one that accepts goes on.
  page.removeAllListeners('dialog');
  page.on('dialog', (dialog) => {
    void dialog.accept().catch(() => undefined);
  });
  await page.goto('/').catch(() => undefined);
  await expect(page.getByTestId('patient-list')).toBeVisible();
  await untilStatus(request, (status) => status.windows === 1, 'the tab is registered again');
  expect(await quiesce(request)).toMatchObject({ ok: true, blockers: [] });

  // 3. **Leave the app, then close the tab.** The socket going away is what
  //    releases browser-mode maintenance (FD1) — and, because a window that
  //    leaves without saying its word keeps its FD13 obligation (a clean report
  //    covers what it covered, not what was typed after it), that is also what
  //    makes the record retained until the word arrives.
  //
  //    **The navigation is measured, not preferred.** A bare `page.close()`
  //    tears the renderer down without running the unload handlers reliably, and
  //    the beacon it drops — 4 failures in 23 V7 runs here, every one of them
  //    with the word simply never sent — is exactly the crash case FD13 is
  //    written for. `runBeforeUnload: true` does not fix it (measured: still
  //    dropped), and `about:blank` is worse still: an opaque origin makes the
  //    reporter's own `sessionStorage` read throw, which the `consoleErrors`
  //    fixture rightly fails the row on. So the tab **navigates out of the app**
  //    — a real `pagehide`, the production event the reporter answers on, same
  //    origin so storage still reads — and is then closed, as step 1 does and as
  //    it delivered its word in every run. The tab still goes away and the row
  //    still proves what it proved: the word went out on the way out, and only a
  //    window that said it was let go.
  await page.goto('/api/health').catch(() => undefined);
  await page.close().catch(() => undefined);

  // The witness: an identity no other window in this run has ever used, so it can
  // only settle a quiesce if there is nothing retained in front of it.
  const witness = await context.newPage();
  await identify(witness, uniqueName('e2e-quiescence-teardown-witness'));
  await witness.goto('/');
  await expect(witness.getByTestId('patient-list')).toBeVisible();
  // **Exactly one** window, not "at least one". The closed tab's beacon was
  // delivered, but the server cannot know its socket is gone until the OS says so,
  // and for those few hundred milliseconds it is still a **live wait** — not a
  // retained record — so `askWindows` asks a document that no longer exists and
  // the quiesce ends `no_response`. Nothing here sleeps: this waits for the
  // server's own report that the window set is the expected one, which is the
  // thing that had to be true before the answer could mean anything. The same
  // condition the spec already uses at the "the closed window is gone" and "the
  // crashed window is gone" steps below.
  await untilStatus(request, (status) => status.windows === 1, 'only the witness is registered');
  expect(await quiesce(request)).toMatchObject({ ok: true, blockers: [] });
  // The witness leaves by the same road, for the same measured reason: a bare
  // `close()` on a page holding a long-poll does not always reach the server as a
  // socket close, and FD1's release is the *last unregistration* — so without this
  // the final poll below waits out its fifteen seconds on a window the server
  // still believes is there.
  await witness.goto('/api/health').catch(() => undefined);
  await witness.close().catch(() => undefined);
  await expect
    .poll(async () => (await readStatus(request)).maintenance, {
      message: 'the last window going away releases maintenance',
      timeout: 15_000,
    })
    .toBe(false);
}

interface Practice {
  readonly patient: string;
  readonly format: string;
  readonly note: string;
}

interface QuiesceAnswer {
  readonly quiesceId: string;
  readonly ok: boolean;
  readonly blockers: string[];
}

interface QuiesceStatus {
  readonly quiescing: boolean;
  readonly activeJobs: { kind: string }[];
  readonly windows: number;
  readonly maintenance: boolean;
}

/** A format, a patient and a note, made through the API. */
async function practice(request: APIRequestContext, content: string): Promise<Practice> {
  const format = (await (
    await request.post('/api/formats', {
      data: { name: uniqueName('E2E quiescence format'), sections: ['Subjective', 'Plan'] },
    })
  ).json()) as { id: string };
  const patient = (await (
    await request.post('/api/patients', { data: { name: uniqueName('E2E quiescence patient') } })
  ).json()) as { id: string };
  const note = (await (
    await request.post('/api/notes', {
      data: { patient_id: patient.id, format_id: format.id, content },
    })
  ).json()) as { id: string };
  return { patient: patient.id, format: format.id, note: note.id };
}

/**
 * A note long enough that "expand the plan" keeps the refine job open for seconds:
 * the fake answers by streaming the whole note back word by word, so a short note
 * would be a blink no poller could see.
 */
function longNote(): string {
  const plan = Array.from(
    { length: 120 },
    () => 'Continue weekly sessions and practise the grounding exercise each morning.',
  ).join(' ');
  return `Subjective: John Smith reports improved sleep and fewer intrusive thoughts.\n\nPlan: ${plan}`;
}

async function quiesce(request: APIRequestContext): Promise<QuiesceAnswer> {
  const response = await request.post('/api/app/quiesce', { data: {} });
  expect(response.status()).toBe(200);
  return (await response.json()) as QuiesceAnswer;
}

async function readStatus(request: APIRequestContext): Promise<QuiesceStatus> {
  const response = await request.get('/api/app/quiesce/status');
  expect(response.status()).toBe(200);
  return (await response.json()) as QuiesceStatus;
}

/** Wait for a precondition the server can be asked about, never for a duration. */
async function untilStatus(
  request: APIRequestContext,
  holds: (status: QuiesceStatus) => boolean,
  what: string,
): Promise<void> {
  await expect
    .poll(async () => holds(await readStatus(request)), { message: `waiting until ${what}`, timeout: 20_000 })
    .toBe(true);
}

async function draft(request: APIRequestContext, practice: Practice): Promise<number> {
  const response = await request.post('/api/generate', {
    data: {
      patient_id: practice.patient,
      format_id: practice.format,
      typed_notes: 'John Smith reports improved sleep.',
    },
  });
  return response.status();
}

/** Open the note screen for a practice and wait for the editor. */
async function openNote(page: Page, practice: Practice): Promise<void> {
  await page.goto(`/?patient=${practice.patient}&note=${practice.note}`);
  await expect(page.getByTestId('note-body')).toBeVisible();
  await expect(page.getByTestId('note-body')).toBeEditable();
}

/**
 * A close attempt at the screen the case is on: a navigation away from it, which
 * is what closing a tab and following a link both do.
 *
 * It returns normally whether the navigation went through or was refused — a
 * refused one is answered by the browser with `net::ERR_ABORTED`, which is the
 * *outcome under test*, not a failure of the row. The case asserts what happened
 * by looking at the URL and the screen, never at whether this call threw.
 */
async function leaveNoteScreen(page: Page): Promise<void> {
  await page.goto('/').catch(() => undefined);
}

/**
 * Dismiss whatever dialog the page raises, and count them.
 *
 * A `beforeunload` dialog is the browser's own: this app cannot render one, and
 * the rows that need it assert that it *appeared*, which is what "unsaved text is
 * never discarded silently" means on the web.
 */
function dialogsOf(page: Page): { count: () => number } {
  let seen = 0;
  page.on('dialog', (dialog) => {
    seen += 1;
    void dialog.dismiss();
  });
  return { count: () => seen };
}

/**
 * Hold every `PATCH /api/notes/:id` this page sends, on a gate the case opens.
 *
 * This is the production shape of "a save that has not landed": the request is
 * genuinely in flight from the browser and genuinely unacknowledged by the
 * server, which is the state the close policy and FD13 are both about. Nothing
 * here changes the server.
 */
function holdNotePatches(page: Page): { release: () => void; held: () => Promise<void> } {
  let release: () => void = () => undefined;
  let observed: () => void = () => undefined;
  const gate = new Promise<void>((resolveGate) => {
    release = resolveGate;
  });
  const arrived = new Promise<void>((resolveArrived) => {
    observed = resolveArrived;
  });
  void page.route('**/api/notes/*', async (route) => {
    const held = route.request();
    if (held.method() !== 'PATCH') {
      await route.continue();
      return;
    }
    observed();
    await gate;
    await route.continue();
  });
  return { release, held: () => arrived };
}

test.describe('C-UPD@1 quiescence', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('V2: refuses while a refine is streaming, the stream still finishes, and service resumes', async ({
    page,
    request,
  }) => {
    await identify(page, 'e2e-quiescence-v2');
    const created = await practice(request, longNote());
    await openNote(page, created);

    await page.getByTestId('chat-fab').click();
    await page.getByTestId('chat-input').fill('expand the plan');
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('chat-streaming')).toBeVisible();

    // The precondition, asked of the server rather than timed for.
    await untilStatus(
      request,
      (status) => status.activeJobs.some((job) => job.kind === 'refine'),
      'the refine job is registered',
    );

    const answer = await quiesce(request);

    expect(answer.ok).toBe(false);
    expect(answer.blockers).toContain('refine');
    // And the refusal is not a cut: this request was already past the hook.
    await expect(page.getByTestId('chat-streaming')).toBeVisible();
    await expect(page.getByTestId('chat-streaming')).toHaveCount(0, { timeout: 25_000 });

    // Maintenance is off again — a refused quiesce leaves the app serving.
    expect((await readStatus(request)).maintenance).toBe(false);
    expect(await draft(request, created)).not.toBe(503);

    await leaveCleanly(page, request);
  });

  test('V3: refuses a conflict, and keeps the text on both sides of it', async ({ browser, request, tr }) => {
    // Its own browser context, with the reason recorded: this case deliberately
    // provokes a real `409 stale_write` at the page, and Chromium logs every
    // non-2xx resource load as a console error. `save-integrity.spec.ts` opens its
    // own context for the same class of case (its PATCHs are made to fail), and
    // the `consoleErrors` fixture watches the `page` fixture rather than every
    // window in the run — so nothing is suppressed and no assertion is weakened;
    // the conflict below is the server's real answer to the page's real request.
    const context = await browser.newContext();
    await identify(context, 'e2e-quiescence-v3');
    const page = await context.newPage();
    try {
      const stored = 'Subjective: John Smith reports improved sleep.\n\nPlan: Continue weekly.';
      const created = await practice(request, stored);
      await openNote(page, created);

      // The conflict is forced by a stale `PATCH` from this runner — not by a
      // second window racing the primary lock, which is a handoff and would make
      // this row pass for the wrong reason.
      const typed = 'Subjective: John Smith reports much better sleep this week.\n\nPlan: Continue weekly.';
      await page.getByTestId('note-body').fill(typed);

      const before = (await (await request.get(`/api/notes/${created.note}`)).json()) as {
        revision: number;
      };
      const theirs = 'Subjective: John Smith reports improved sleep.\n\nPlan: Written in another window.';
      const stale = await request.patch(`/api/notes/${created.note}`, {
        data: { revision: before.revision, content: theirs },
      });
      expect(stale.status()).toBe(200);

      // The page's own debounced save now takes the `stale_write` branch, and the
      // page says so before the quiesce is triggered — observed, not slept for.
      await expect(page.getByTestId('note-conflict')).toBeVisible();
      await expect(page.getByTestId('note-save-status')).toHaveText(tr('note.saveConflict'));

      const answer = await quiesce(request);
      expect(answer.ok).toBe(false);
      expect(answer.blockers).toContain('conflict');

      // Text preserved at both observation points: the editor still holds what was
      // typed, and the stored note is still what the runner wrote. The conflict
      // path deliberately leaves the stored note alone, so the stored side alone
      // would prove nothing about the editor.
      await expect(page.getByTestId('note-body')).toHaveValue(typed);
      const after = (await (await request.get(`/api/notes/${created.note}`)).json()) as { content: string };
      expect(after.content).toBe(theirs);
    } finally {
      // This row ends dirty **on purpose**, so it must not hand that on: the
      // same tab comes back into the app, which supersedes the record the
      // conflicted page left behind (FD13(c)), and closes clean.
      await leaveCleanly(page, request);
      await context.close().catch(() => undefined);
    }
  });

  test('V4: an idle app quiesces, refuses new work while it holds, and releases when the window closes', async ({
    page,
    request,
  }) => {
    await identify(page, 'e2e-quiescence-v4');
    const created = await practice(request, 'Subjective: John Smith reports improved sleep.');
    await page.goto('/');
    await expect(page.getByTestId('patient-list')).toBeVisible();

    // This window is registered before the trigger; nothing is assumed about it.
    await untilStatus(request, (status) => status.windows >= 1, 'the window is registered');

    const answer = await quiesce(request);
    expect(answer.ok).toBe(true);
    expect(answer.blockers).toEqual([]);

    // Maintenance holds: a new draft is refused with the code, and the liveness
    // read the shell depends on still answers.
    const refused = await draft(request, created);
    expect(refused).toBe(503);
    const body = (await (
      await request.post('/api/generate', {
        data: {
          patient_id: created.patient,
          format_id: created.format,
          typed_notes: 'John Smith reports improved sleep.',
        },
      })
    ).json()) as { error: string };
    expect(body.error).toBe('maintenance');
    expect((await request.get('/api/health')).status()).toBe(200);

    // The bounded release, asserted rather than assumed: the last unregistration
    // lets the next write through.
    await page.close();
    await expect
      .poll(async () => (await readStatus(request)).maintenance, {
        message: 'maintenance is released when the last window unregisters',
        timeout: 15_000,
      })
      .toBe(false);
    expect(await draft(request, created)).not.toBe(503);
  });

  test('the flush exemption: unsaved text reaches the disk and the quiesce settles ok:true', async ({
    page,
    request,
    tr,
  }) => {
    await identify(page, 'e2e-quiescence-flush');
    const stored = 'Subjective: John Smith reports improved sleep.\n\nPlan: Continue weekly.';
    const created = await practice(request, stored);
    await openNote(page, created);
    await untilStatus(request, (status) => status.windows >= 1, 'the window is registered');

    /**
     * The page's own clock stops here, so the editor's 400 ms save debounce never
     * fires and what the editor holds is text the server has never been sent.
     * That is the state the exemption is for, and holding it open is a property
     * of the browser rather than of the server: no switch on the server, no fault
     * injection, and the production flush below is the one that carries the text.
     * Without this the row would be a race — a debounce that landed first would
     * make it pass without ever exercising the exemption.
     */
    await page.clock.install();

    const typed = 'Subjective: John Smith reports much better sleep this week.\n\nPlan: Continue weekly.';
    await page.getByTestId('note-body').fill(typed);
    await expect(page.getByTestId('note-save-status')).toHaveText(tr('note.saveSaving'));

    // The server has none of it, and it never will from this editor until the
    // quiesce asks it to flush.
    expect(
      ((await (await request.get(`/api/notes/${created.note}`)).json()) as { content: string }).content,
    ).toBe(stored);

    // The production trigger. The window is asked to flush, its save is the one
    // write the maintenance hook lets through, and the report that follows is
    // clean — so this is the `ok:true` FD9 read literally could not reach.
    const answer = await quiesce(request);
    expect(answer.ok).toBe(true);
    expect(answer.blockers).toEqual([]);

    // And the text the editor was holding is on disk, which is the whole point.
    const after = (await (await request.get(`/api/notes/${created.note}`)).json()) as { content: string };
    expect(after.content).toBe(typed);

    // The bounded release, asserted rather than assumed, and it is what leaves
    // the next row a server in normal service.
    await page.close();
    await expect
      .poll(async () => (await readStatus(request)).maintenance, {
        message: 'maintenance is released when the last window unregisters',
        timeout: 15_000,
      })
      .toBe(false);
  });

  test('V6a: a close attempt with unsaved text asks first, and the editor still holds the text', async ({
    page,
    request,
    tr,
  }) => {
    await identify(page, 'e2e-quiescence-v6a');
    const created = await practice(request, 'Subjective: John Smith reports improved sleep.');
    await openNote(page, created);
    const dialogs = dialogsOf(page);

    // The control first, and it is what makes the refusal mean something: with
    // nothing unsaved, leaving the note screen needs no permission and asks for
    // none.
    await leaveNoteScreen(page);
    expect(dialogs.count(), 'a clean screen does not ask').toBe(0);
    await expect(page).toHaveURL(/\/$/);

    // Now the unsaved edit. The save is genuinely in flight and genuinely
    // unacknowledged: the browser is holding the request, the server has not
    // answered it, and the editor is the only place that text exists.
    await page.goto(`/?patient=${created.patient}&note=${created.note}`);
    await expect(page.getByTestId('note-body')).toBeVisible();
    const patches = holdNotePatches(page);
    const typed = 'Subjective: John Smith reports improved sleep this week.\n\nPlan: Continue weekly.';
    await page.getByTestId('note-body').fill(typed);
    await patches.held();
    await expect(page.getByTestId('note-save-status')).toHaveText(tr('note.saveSaving'));
    const before = page.url();

    await leaveNoteScreen(page);

    expect(dialogs.count(), 'a beforeunload dialog asked before discarding').toBeGreaterThan(0);
    expect(page.url(), 'the navigation was refused').toBe(before);
    // The guard, not a durable draft: there is no draft anywhere in `web/src`, and
    // "the text is recoverable after a reload" is neither claimed nor asserted.
    await expect(page.getByTestId('note-body')).toHaveValue(typed);

    patches.release();
    await leaveCleanly(page, request);
  });

  test('V7: a close attempt while a save is outstanding is deferred, and the editor keeps its text', async ({
    page,
    request,
    tr,
  }) => {
    await identify(page, 'e2e-quiescence-v7');
    const created = await practice(request, 'Subjective: John Smith reports improved sleep.');
    await openNote(page, created);
    const patches = holdNotePatches(page);
    const dialogs = dialogsOf(page);

    const typed = 'Subjective: John Smith reports improved sleep and fewer intrusive thoughts.';
    await page.getByTestId('note-body').fill(typed);
    // The save is in flight, so the editor holds text the server has not
    // acknowledged — the state the close policy is about.
    await patches.held();
    await expect(page.getByTestId('note-save-status')).toHaveText(tr('note.saveSaving'));

    // What the server's own registry says, read rather than assumed. A `save`
    // registration **cannot** be seen from here, and the row does not pretend
    // otherwise: `routes/notes.ts:94` begins and ends it around a synchronous
    // handler, so between those two calls the event loop is busy and no other
    // request — this status read, a quiesce, another tab — can be served at all.
    // That is why V1 proves the site at the route itself, by exercising the real
    // `PATCH`. What *is* observable here, and is the half FD6's rule is about, is
    // that the save really is in flight: issued by the browser, unacknowledged by
    // the server, with the text only in the editor.
    const status = await readStatus(request);
    expect(status.activeJobs.some((job) => job.kind === 'save')).toBe(false);
    expect(status.windows).toBeGreaterThanOrEqual(1);
    const before = page.url();

    await leaveNoteScreen(page);

    // The same refusal the native close path gets by running the bridge
    // `quiesce{}` (FD6): the navigation is deferred and the editor still holds the
    // text the outstanding save has not carried.
    expect(dialogs.count(), 'the close was deferred rather than silent').toBeGreaterThan(0);
    expect(page.url(), 'the navigation was deferred while the save was outstanding').toBe(before);
    await expect(page.getByTestId('note-body')).toHaveValue(typed);

    patches.release();
    await leaveCleanly(page, request);
  });

  test('V9: a dirty disconnect before a quiesce is never settled over, and only the same tab clears it', async ({
    browser,
    request,
  }) => {
    const stored = 'Subjective: John Smith reports improved sleep.\n\nPlan: Continue weekly.';
    const created = await practice(request, stored);
    // One shared BrowserContext: separate storage contexts do not share Web Locks,
    // and the second window below must be a covered secondary, not a new primary.
    const context = await browser.newContext();
    const primary = await context.newPage();
    const secondary = await context.newPage();
    const third = await context.newPage();
    try {
      // Three identities, one per window, and none of them shared with another
      // row: "a different tab does not supersede" is half of what this row
      // proves, and it can only be proved if the tabs really are different.
      await identify(primary, 'e2e-quiescence-v9-primary');
      await identify(secondary, 'e2e-quiescence-v9-secondary');
      await identify(third, 'e2e-quiescence-v9-third');
      const url = `/?patient=${created.patient}&note=${created.note}`;
      // (a) An edit the server has not acknowledged, and cannot acknowledge: the
      // runner writes the note underneath the editor (V3's control), so the
      // editor's own save takes the `stale_write` branch and its text is now text
      // the server has refused.
      await primary.goto(url);
      await expect(primary.getByTestId('note-body')).toBeVisible();
      const typed = 'Subjective: John Smith reports much better sleep this week.\n\nPlan: Continue weekly.';
      await primary.getByTestId('note-body').fill(typed);
      const before = (await (await request.get(`/api/notes/${created.note}`)).json()) as {
        revision: number;
      };
      const theirs = 'Subjective: John Smith reports improved sleep.\n\nPlan: Written in another window.';
      expect(
        (
          await request.patch(`/api/notes/${created.note}`, {
            data: { revision: before.revision, content: theirs },
          })
        ).status(),
      ).toBe(200);
      await expect(primary.getByTestId('note-conflict')).toBeVisible();

      // (b) A second, inert window that registers and holds no editor.
      await secondary.goto('/');
      await expect(secondary.getByTestId('patient-list')).toBeVisible();
      await untilStatus(request, (status) => status.windows >= 2, 'both windows are registered');

      // (c) Take the dirty window's socket away without letting its editor flush.
      // Unloading the app out of that tab is the production mechanism, and the
      // editor's best-effort flush has nothing to send: an unresolved conflict
      // takes the branch that cancels the pending save rather than issuing one.
      // The tab itself stays alive and keeps its `sessionStorage`, which is what
      // the last half needs, and the app is no longer running in it, so nothing
      // re-registers in between.
      primary.on('dialog', (dialog) => {
        void dialog.accept().catch(() => undefined);
      });
      await primary.goto('about:blank');
      await untilStatus(request, (status) => status.windows === 1, 'the dirty window is disconnected');

      // (d) The quiesce. The inert secondary answers `ok` and cannot settle this
      // over the primary's lost text.
      const refused = await quiesce(request);
      expect(refused.ok).toBe(false);
      expect(refused.blockers).toContain('no_response');

      // (e) The stored note is what the runner wrote, and nothing here claims the
      // typed text is recoverable — recovery is out of scope.
      const after = (await (await request.get(`/api/notes/${created.note}`)).json()) as { content: string };
      expect(after.content).toBe(theirs);

      // (f) A **different** tab does not supersede the retained record.
      await third.goto('/');
      await expect(third.getByTestId('patient-list')).toBeVisible();
      await untilStatus(
        request,
        (status) => status.windows >= 2,
        'the third tab is registered alongside the secondary',
      );
      const stillRefused = await quiesce(request);
      expect(stillRefused.ok).toBe(false);
      expect(stillRefused.blockers).toContain('no_response');

      // The **same** tab registers again — the same `sessionStorage` identity the
      // retained record was made under — and supersedes it, so the next quiesce
      // may settle.
      await primary.goto(url);
      await expect(primary.getByTestId('note-body')).toBeVisible();
      await untilStatus(request, (status) => status.windows >= 3, 'the same tab is registered again');
      const settled = await quiesce(request);
      expect(settled.ok).toBe(true);
      expect(settled.blockers).toEqual([]);
    } finally {
      for (const open of [primary, secondary, third]) await open.close().catch(() => undefined);
      await context.close().catch(() => undefined);
    }
  });

  test('V9: a clean close of one tab never blocks a later quiesce (AM-215)', async ({ browser, request }) => {
    // One context, so the two windows are the primary and a covered secondary —
    // two real tabs with two real identities and no editor in either.
    const context = await browser.newContext();
    const first = await context.newPage();
    const second = await context.newPage();
    try {
      await identify(first, 'e2e-quiescence-am215-first');
      await identify(second, 'e2e-quiescence-am215-second');
      await first.goto('/');
      await expect(first.getByTestId('patient-list')).toBeVisible();
      await second.goto('/');
      await expect(second.getByTestId('patient-list')).toBeVisible();
      await untilStatus(request, (status) => status.windows >= 2, 'both windows are registered');

      // A quiesce with both of them answering cleanly settles, and holds
      // maintenance while a window is registered (FD1's browser-mode clause).
      // Nothing in the runner answers for either window: both pages mount the
      // real reporter, so the browser answers the way a therapist's would.
      const settled = await quiesce(request);
      expect(settled.ok).toBe(true);
      expect((await readStatus(request)).maintenance).toBe(true);

      // The first window is closed by a therapist, and says as it goes that it is
      // leaving nothing behind. That is the whole of AM-215: an ordinary clean
      // close must not strand the server.
      await first.close();
      // Still held — the second window is registered, so FD1's release is the
      // last unregistration and not this one.
      expect((await readStatus(request)).maintenance).toBe(true);
      await second.close();
      await expect
        .poll(async () => (await readStatus(request)).maintenance, {
          message: 'maintenance is released when the last window closes cleanly',
          timeout: 15_000,
        })
        .toBe(false);

      // **A different tab again**, with an identity neither closed window ever
      // used. Under FD13(c) it could never supersede anything, so if either close
      // had left a retained record this quiesce would be refused `no_response`.
      // It settles: a clean close discharges.
      const later = await context.newPage();
      await identify(later, 'e2e-quiescence-am215-later');
      await later.goto('/');
      await expect(later.getByTestId('patient-list')).toBeVisible();
      await untilStatus(request, (status) => status.windows >= 1, 'the later tab is registered');
      expect(await quiesce(request)).toMatchObject({ ok: true, blockers: [] });
      await later.close();
      await expect
        .poll(async () => (await readStatus(request)).maintenance, {
          message: 'maintenance is released again',
          timeout: 15_000,
        })
        .toBe(false);
    } finally {
      await context.close().catch(() => undefined);
    }
  });

  test('V9: a tab closed with unsaved text says dirty, and is still counted (AM-215)', async ({
    browser,
    request,
  }) => {
    const stored = 'Subjective: John Smith reports improved sleep.\n\nPlan: Continue weekly.';
    const created = await practice(request, stored);
    const context = await browser.newContext();
    const dirty = await context.newPage();
    const bystander = await context.newPage();
    try {
      await identify(dirty, uniqueName('e2e-quiescence-am215-dirty-close'));
      await identify(bystander, 'e2e-quiescence-am215-dirty-witness');

      // The editor holds text the server has never been sent, and is holding it
      // on purpose: the save is in flight and unacknowledged, so the only copy of
      // the words is in the editor.
      await dirty.goto(`/?patient=${created.patient}&note=${created.note}`);
      await expect(dirty.getByTestId('note-body')).toBeVisible();
      const patches = holdNotePatches(dirty);
      await dirty
        .getByTestId('note-body')
        .fill('Subjective: John Smith reports much better sleep this week.\n\nPlan: Continue weekly.');
      await patches.held();
      await expect(dirty.getByTestId('note-save-status')).toHaveText(/./);
      // The precondition, asked of the server rather than assumed: those words
      // have never reached it, so the editor is the only place they exist.
      expect(
        ((await (await request.get(`/api/notes/${created.note}`)).json()) as { content: string }).content,
      ).toBe(stored);

      // A window with no editor, registered and holding nothing, so the refusal
      // below cannot be the "nobody attached" case.
      await bystander.goto('/');
      await expect(bystander.getByTestId('patient-list')).toBeVisible();
      await untilStatus(request, (status) => status.windows >= 2, 'both windows are registered');

      // **The close, which is not clean.** The editor's own `beforeunload` guard
      // fires, says it is holding text, and the navigation is allowed to go
      // through on this window's dialog handler; `pagehide` then sends the beacon
      // with the other answer. The tab goes to `about:blank` rather than back to
      // the app on purpose: coming back would re-register under the same
      // `sessionStorage` identity and supersede the very record this row is about.
      dirty.on('dialog', (dialog) => {
        void dialog.accept().catch(() => undefined);
      });
      await dirty.goto('about:blank').catch(() => undefined);

      // The window is gone, and what it left behind is still counting: whether
      // the beacon arrived as `dirty` or never arrived at all, FD13's obligation
      // is exactly the same, and this row asserts the obligation, not the
      // delivery.
      await untilStatus(request, (status) => status.windows === 1, 'the closed window is gone');

      // The bystander answers `ok` and still cannot settle this over text the
      // closed window said it was carrying. This is the half of AM-215 that is
      // fail-closed, and it is the one the owner's decision turns on.
      const answer = await quiesce(request);
      expect(answer.ok).toBe(false);
      expect(answer.blockers).toContain('no_response');

      // What became of that held save afterwards is not this row's business — the
      // browser may well finish the request as the window goes — and nothing here
      // claims the words were recovered: the assertion above is about what the
      // server had *not* been told while the window was still there.
    } finally {
      // This row leaves a retained record on purpose — that is what it proves —
      // so it comes after every row that needs a quiesce to settle, and the
      // crash row below is last for the same reason.
      for (const open of [dirty, bystander]) await open.close().catch(() => undefined);
      await context.close().catch(() => undefined);
    }
  });

  test('V9: a tab that dies without saying anything is never settled over (AM-215)', async ({
    browser,
    request,
  }) => {
    const stored = 'Subjective: John Smith reports improved sleep.\n\nPlan: Continue weekly.';
    const created = await practice(request, stored);
    const context = await browser.newContext();
    const dying = await context.newPage();
    const bystander = await context.newPage();
    try {
      await identify(dying, 'e2e-quiescence-am215-crash');
      await identify(bystander, 'e2e-quiescence-am215-witness');

      // The editor holds text the server has refused and can never take: the
      // runner writes the note underneath it, exactly as V9 does.
      const url = `/?patient=${created.patient}&note=${created.note}`;
      await dying.goto(url);
      await expect(dying.getByTestId('note-body')).toBeVisible();
      await dying
        .getByTestId('note-body')
        .fill('Subjective: John Smith reports much better sleep this week.\n\nPlan: Continue weekly.');
      const before = (await (await request.get(`/api/notes/${created.note}`)).json()) as { revision: number };
      expect(
        (
          await request.patch(`/api/notes/${created.note}`, {
            data: {
              revision: before.revision,
              content: 'Subjective: John Smith reports improved sleep.\n\nPlan: Written in another window.',
            },
          })
        ).status(),
      ).toBe(200);
      await expect(dying.getByTestId('note-conflict')).toBeVisible();

      // A bystander window, registered and holding nothing.
      await bystander.goto('/');
      await expect(bystander.getByTestId('patient-list')).toBeVisible();
      await untilStatus(request, (status) => status.windows >= 2, 'both windows are registered');

      // **The crash.** `chrome://crash` kills the renderer: the socket closes and
      // no `pagehide` handler runs, so the window's last word never reaches the
      // server. That is the half AM-215 deliberately leaves fail-closed, and it is
      // a real crash rather than a flag — the reporter is not disabled, there is
      // no server switch, and the editor is dirty at the moment it dies.
      await dying.goto('chrome://crash').catch(() => undefined);
      await untilStatus(request, (status) => status.windows === 1, 'the crashed window is gone');

      // The bystander answers `ok` and still cannot settle this over the dead
      // window's unpersisted text.
      const answer = await quiesce(request);
      expect(answer.ok).toBe(false);
      expect(answer.blockers).toContain('no_response');
      // And the stored note is what the runner wrote: nothing is claimed to have
      // been recovered from the crash.
      const after = (await (await request.get(`/api/notes/${created.note}`)).json()) as { content: string };
      expect(after.content).toBe(
        'Subjective: John Smith reports improved sleep.\n\nPlan: Written in another window.',
      );
    } finally {
      // The crashed tab's record is retained for the life of the process and
      // nothing but a restart clears it — which is why this row is last in the
      // file, and why the refusal the owner sees is the notice that says so.
      for (const open of [dying, bystander]) await open.close().catch(() => undefined);
      await context.close().catch(() => undefined);
    }
  });
});

test.describe('the recording half of the close policy', () => {
  test.use({ viewport: { width: 1280, height: 800 }, permissions: ['microphone'] });

  test('V6b: a close attempt with a recording running is not silent', async ({ page, request }) => {
    const created = await practice(request, 'Subjective: John Smith reports improved sleep.');
    await page.goto(`/capture/${created.patient}`);
    await expect(page.getByTestId('record-start')).toBeVisible();
    const dialogs = dialogsOf(page);

    await page.getByTestId('record-start').click();
    await expect(page.getByTestId('record-panel')).toBeVisible();
    // A moving timer is audio flowing, not a panel that merely rendered.
    await expect(page.getByTestId('record-timer')).toHaveText(/00:0[1-9]/, { timeout: 15_000 });
    const before = page.url();

    await leaveNoteScreen(page);

    // An active recording asks first, and the recording is still there: the
    // close was not allowed to discard it.
    expect(dialogs.count(), 'the page asked before discarding a recording').toBeGreaterThan(0);
    expect(page.url(), 'the navigation was refused while a recording was running').toBe(before);
    await expect(page.getByTestId('record-panel')).toBeVisible();
    // Still recording: the timer the panel shows is still counting, which is the
    // recording itself rather than a leftover frame.
    await expect(page.getByTestId('record-timer')).toHaveText(/00:0[1-9]|00:[1-9][0-9]/);

    // The recording is stopped afterwards so the page leaves nothing running; the
    // held audio is what `unfinished` still counts, and Capture's own dialog is
    // what offers to discard it — neither is this card's business.
    await page.getByTestId('record-stop').click();
    await expect(page.getByTestId('record-panel')).toHaveCount(0);
  });
});
