import { expect, test } from '../support/fixtures';

/** Narrow an API response body to its synthetic record id. */
function idOf(payload: unknown, label: string): string {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('id' in payload) ||
    typeof payload.id !== 'string'
  ) {
    throw new Error(`E2E ${label} response missing id`);
  }
  return payload.id;
}

/** Whether the app content behind the fullscreen prompt is marked inert. */
function contentInertScript(): string {
  return `(() => {
    const node = document.getElementById('apunta-content');
    if (node === null) return false;
    return node.hasAttribute('inert') || ('inert' in node && node.inert === true);
  })()`;
}

test('a primary handoff flushes the pending edit and blocks the old window', async ({
  browser,
  request,
  tr,
  checkScreen,
}) => {
  const formatId = idOf(
    await (
      await request.post('/api/formats', {
        data: { name: `E2E handoff format ${String(Date.now())}`, sections: ['Subjective', 'Plan'] },
      })
    ).json(),
    'format',
  );
  const patientId = idOf(
    await (
      await request.post('/api/patients', {
        data: { name: `E2E handoff patient ${String(Date.now())}` },
      })
    ).json(),
    'patient',
  );
  const noteId = idOf(
    await (
      await request.post('/api/notes', {
        data: {
          patient_id: patientId,
          format_id: formatId,
          content: 'Subjective: Original body.\n\nPlan: Continue weekly.',
        },
      })
    ).json(),
    'note',
  );

  // One shared BrowserContext: separate storage contexts do not share Web
  // Locks, so two tabs only contend for the primary lock in the same context.
  const context = await browser.newContext();
  const pageA = await context.newPage();
  const pageB = await context.newPage();
  let releasePatch: () => void = () => undefined;
  try {
    const url = `/?patient=${patientId}&note=${noteId}`;
    await pageA.goto(url);
    await expect(pageA.getByTestId('note-body')).toBeVisible();
    // A wins the Web Lock and edits alone: no blocker.
    await expect(pageA.getByTestId('primary-blocker')).toHaveCount(0);

    await pageB.goto(url);
    // B probes the held lock and stays covered by the takeover prompt.
    await expect(pageB.getByTestId('primary-blocker')).toBeVisible();
    await expect(pageB.getByRole('button', { name: tr('app.primary.takeover') })).toBeVisible();
    // Exactly one primary: A still edits while B is covered.
    await expect(pageA.getByTestId('primary-blocker')).toHaveCount(0);
    // The app behind B's prompt is inert and the prompt holds focus.
    expect(await pageB.evaluate(contentInertScript())).toBe(true);
    await expect(pageB.getByRole('button', { name: tr('app.primary.takeover') })).toBeFocused();
    await checkScreen(pageB, 'the blocked second window');

    // An explicit decline leaves ownership untouched: B stays blocked.
    await pageB.getByTestId('primary-decline').click();
    await expect(pageB.getByTestId('primary-blocker')).toBeVisible();
    expect(await pageB.evaluate(contentInertScript())).toBe(true);

    // Hold A's save PATCH in flight so the takeover must wait for the flush:
    // no reliance on beating the save debounce with fast clicks.
    const flushed = 'Subjective: Pending edit flushed on handoff.\n\nPlan: Continue weekly.';
    const patchGate = new Promise<void>((resolve) => {
      releasePatch = resolve;
    });
    let patchObserved: (() => void) | null = null;
    const patchInFlight = new Promise<void>((resolve) => {
      patchObserved = resolve;
    });
    await pageA.route('**/api/notes/*', async (route) => {
      const req = route.request();
      if (req.method() !== 'PATCH' || !req.url().includes(`/api/notes/${noteId}`)) {
        await route.continue();
        return;
      }
      patchObserved?.();
      await patchGate;
      await route.continue();
    });
    await pageA.getByTestId('note-body').fill(flushed);
    // The debounced save is genuinely in flight before B asks for the lock.
    await patchInFlight;
    await expect(pageA.getByTestId('note-save-status')).toHaveText(tr('note.saveSaving'));
    await pageB.getByRole('button', { name: tr('app.primary.takeover') }).click();

    // The handoff waits on the flush: B sits pending behind its prompt while
    // A is still the unblocked primary with its save outstanding.
    await expect(pageB.getByRole('heading', { name: tr('app.primary.takingOver') })).toBeVisible();
    await expect(pageB.getByTestId('primary-blocker')).toBeVisible();
    await expect(pageA.getByTestId('primary-blocker')).toHaveCount(0);
    await expect(pageA.getByTestId('note-save-status')).toHaveText(tr('note.saveSaving'));

    // Let the held save land; the ordered handoff follows.
    releasePatch();

    // Ordered handoff: A paints itself blocked before B unlocks.
    await expect(pageA.getByTestId('primary-blocker')).toBeVisible();
    await expect(pageB.getByTestId('primary-blocker')).toHaveCount(0);
    // B reloads onto the flushed revision with no visibilitychange involved.
    await expect(pageB.getByTestId('note-body')).toHaveValue(flushed);
    await expect(pageB.getByTestId('note-save-status')).toHaveText(tr('note.saveSaved'));

    const finalResponse = await request.get(`/api/notes/${noteId}`);
    const finalNote: unknown = await finalResponse.json();
    if (
      typeof finalNote !== 'object' ||
      finalNote === null ||
      !('content' in finalNote) ||
      typeof finalNote.content !== 'string'
    ) {
      throw new Error('E2E note response missing content');
    }
    expect(finalNote.content).toBe(flushed);
  } finally {
    // Never strand the held PATCH on failure: an unreleased gate would hang
    // the in-flight save and the teardown below it.
    releasePatch();
    await pageA.unroute('**/api/notes/*').catch(() => undefined);
    // Closing the new owner releases the Web Lock; the context closes the rest.
    await pageB.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
});

test('a failed flush keeps the old primary and leaves takeover blocked', async ({ browser, request, tr }) => {
  const original = 'Subjective: Original body.\n\nPlan: Continue weekly.';
  const unsaved = 'Subjective: Unsaved edit blocked on handoff.\n\nPlan: Continue weekly.';
  const formatId = idOf(
    await (
      await request.post('/api/formats', {
        data: { name: `E2E failed-handoff format ${String(Date.now())}`, sections: ['Subjective', 'Plan'] },
      })
    ).json(),
    'format',
  );
  const patientId = idOf(
    await (
      await request.post('/api/patients', {
        data: { name: `E2E failed-handoff patient ${String(Date.now())}` },
      })
    ).json(),
    'patient',
  );
  const noteId = idOf(
    await (
      await request.post('/api/notes', {
        data: { patient_id: patientId, format_id: formatId, content: original },
      })
    ).json(),
    'note',
  );

  // Same shared-context topology as the success path: separate storage
  // contexts do not share Web Locks.
  const context = await browser.newContext();
  const pageA = await context.newPage();
  const pageB = await context.newPage();
  try {
    const url = `/?patient=${patientId}&note=${noteId}`;
    await pageA.goto(url);
    await expect(pageA.getByTestId('note-body')).toBeVisible();
    await expect(pageA.getByTestId('primary-blocker')).toHaveCount(0);

    await pageB.goto(url);
    await expect(pageB.getByTestId('primary-blocker')).toBeVisible();
    await expect(pageB.getByRole('button', { name: tr('app.primary.takeover') })).toBeVisible();
    await expect(pageA.getByTestId('primary-blocker')).toHaveCount(0);

    // Every save PATCH for this note fails, so both the debounced save and
    // the handoff flush reject.
    await pageA.route('**/api/notes/*', async (route) => {
      const req = route.request();
      if (req.method() !== 'PATCH' || !req.url().includes(`/api/notes/${noteId}`)) {
        await route.continue();
        return;
      }
      await route.abort('failed');
    });
    await pageA.getByTestId('note-body').fill(unsaved);
    // The debounced save genuinely failed before B asks for the lock.
    await expect(pageA.getByTestId('note-save-status')).toHaveText(tr('note.saveError'));
    await pageB.getByRole('button', { name: tr('app.primary.takeover') }).click();

    // The handoff waits on the flush, which rejects: B sits pending behind
    // its prompt while A stays the unblocked, editable primary.
    await expect(pageB.getByRole('heading', { name: tr('app.primary.takingOver') })).toBeVisible();
    await expect(pageB.getByTestId('primary-blocker')).toBeVisible();
    await expect(pageA.getByTestId('primary-blocker')).toHaveCount(0);
    await expect(pageA.getByTestId('note-body')).toBeEditable();
    await expect(pageA.getByTestId('note-body')).toHaveValue(unsaved);
    await expect(pageA.getByTestId('note-save-status')).toHaveText(tr('note.saveError'));

    // B's existing request timeout unwinds the takeover: the prompt returns
    // to its decision state, still blocked, with ownership untouched.
    await expect(pageB.getByRole('button', { name: tr('app.primary.takeover') })).toBeVisible({
      timeout: 15000,
    });
    await expect(pageB.getByTestId('primary-blocker')).toBeVisible();
    await expect(pageA.getByTestId('primary-blocker')).toHaveCount(0);
    await expect(pageA.getByTestId('note-body')).toBeEditable();
    await expect(pageA.getByTestId('note-body')).toHaveValue(unsaved);

    const finalResponse = await request.get(`/api/notes/${noteId}`);
    const finalNote: unknown = await finalResponse.json();
    if (
      typeof finalNote !== 'object' ||
      finalNote === null ||
      !('content' in finalNote) ||
      typeof finalNote.content !== 'string'
    ) {
      throw new Error('E2E note response missing content');
    }
    expect(finalNote.content).toBe(original);
  } finally {
    await pageA.unroute('**/api/notes/*').catch(() => undefined);
    await pageB.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
});
