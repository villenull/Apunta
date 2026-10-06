import { t } from '@apunta/shared';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StrictMode, createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installFakeApi, makeFormat } from '../test/fakeApi.js';
import {
  FormatDraftEditor,
  type FormatDraftEditorHandle,
  type FormatDraftEditorProps,
} from './FormatDraftEditor.js';
import type { FormatDraft } from './formatDraft.js';

/**
 * The autosave boundaries of the format editor (owner, 2026-10-05): a format
 * that exists has no save button, so what must hold is that an edit reaches the
 * server, that an invalid one does not, that an edit made while a save is in
 * flight is not swallowed, and that `Saved` means it landed.
 *
 * These read the requests the component actually sent rather than the rows it
 * left behind, because a screen showing a saved name it never wrote is the
 * failure worth catching.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const stored = makeFormat('Progress note', ['Subjective', 'Plan'], {
  instructions: 'Use "client", not "patient".',
});

const EDITING: FormatDraft = {
  name: stored.name,
  sections: stored.sections,
  formatId: stored.id,
};

/**
 * A promise the test settles by hand, so a save can be held open while a
 * second edit is made. Written out rather than `Promise.withResolvers`, which
 * the target library does not have yet.
 */
function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

/**
 * A PATCH that landed, answered with the format the server now holds.
 * `updateFormat` parses the reply against `NoteFormatSchema`, so an empty body
 * is not a save that landed but a malformed response — which the editor
 * rightly refuses. Every hand-released write must answer with this.
 */
function landed(name = stored.name, sections = stored.sections): Response {
  return new Response(JSON.stringify({ ...stored, name, sections }), {
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Every `PATCH /api/formats/:id` body, in order.
 *
 * Recorded by the `fetch` wrapper below rather than read back off a mock's
 * `.mock.calls`: a test that holds or refuses a write needs `fetch` replaced
 * by a plain function, and a plain function records no calls to read. One
 * list, filled the same way for every test, so what a test asserts is what the
 * component actually sent.
 */
const sent: Array<Record<string, unknown>> = [];

/**
 * Render the editor over the fake API. `answer` replaces what a PATCH does —
 * held open, so a second edit can be made while the first is still in flight,
 * or refused, so a failed save can be told from a saved one. `strict` mounts
 * it the way `main.tsx` does, which is the only place the mount/unmount/mount
 * cycle shows up.
 */
function renderEditor(
  overrides: Partial<FormatDraftEditorProps> = {},
  answer?: () => Promise<Response>,
  strict = false,
): FormatDraftEditorHandle | null {
  installFakeApi({ formats: [stored] });
  const fake = globalThis.fetch;
  sent.length = 0;
  vi.stubGlobal('fetch', (path: string, init: RequestInit = {}): Promise<Response> => {
    if ((init.method ?? 'GET') === 'PATCH' && path.startsWith('/api/formats/')) {
      sent.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      if (answer !== undefined) return answer();
    }
    return fake(path, init);
  });
  const ref = createRef<FormatDraftEditorHandle>();
  const element = (
    <FormatDraftEditor ref={ref} draft={EDITING} onSaved={vi.fn()} onCancel={vi.fn()} {...overrides} />
  );
  render(strict ? <StrictMode>{element}</StrictMode> : element);
  return ref.current;
}

describe('editing a format that already exists', () => {
  it('edits the name in the heading, with no save button and no Cancel', () => {
    renderEditor();

    const name = screen.getByLabelText(t('format.nameLabel')) as HTMLInputElement;
    expect(name.value).toBe('Progress note');
    expect(screen.queryByTestId('save-format')).toBeNull();
    expect(screen.queryByRole('button', { name: t('common.cancel') })).toBeNull();
  });

  it('writes a renamed section by itself, and says Saved only once it landed', async () => {
    const saved: boolean[] = [];
    renderEditor({ onSavedStateChange: (value) => saved.push(value) });

    const chips = screen.getByTestId('section-chips');
    fireEvent.click(
      within(chips).getByRole('button', { name: t('format.renameAction', { section: 'Plan' }) }),
    );
    const field = within(chips).getByLabelText(t('format.renameLabel', { section: 'Plan' }));
    fireEvent.change(field, { target: { value: 'Out of session actions' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    // The indicator went off with the edit, not after the save.
    expect(saved).toEqual([false]);

    await waitFor(() => {
      expect(sent.at(-1)).toEqual({
        name: 'Progress note',
        sections: ['Subjective', 'Out of session actions'],
      });
    });
    await waitFor(() => {
      expect(saved.at(-1)).toBe(true);
    });
  });

  it('sends no instructions, so the ones the format carries are left alone', async () => {
    renderEditor();

    fireEvent.click(
      within(screen.getByTestId('section-chips')).getByRole('button', {
        name: t('format.moveUp', { section: 'Plan' }),
      }),
    );

    await waitFor(() => {
      expect(sent.length).toBe(1);
    });
    expect(sent[0]).not.toHaveProperty('instructions');
  });

  it('refuses an empty name, says why, and writes nothing', async () => {
    renderEditor();

    fireEvent.change(screen.getByLabelText(t('format.nameLabel')), { target: { value: '' } });

    await waitFor(() => {
      expect(screen.getByTestId('format-error').textContent).toBe(t('format.errorName'));
    });
    expect(sent).toHaveLength(0);
  });

  /**
   * The ack of an *older* save must not read as "saved" while a newer edit is
   * still unsaved. Deterministic: the first PATCH is released by hand, after
   * the second edit has already been made and is waiting on its own debounce.
   */
  it('does not claim Saved when an older save lands after a newer edit', async () => {
    const saved: boolean[] = [];
    const first = deferred<Response>();
    const second = deferred<Response>();
    let seen = 0;
    renderEditor({ onSavedStateChange: (value) => saved.push(value) }, () => {
      seen += 1;
      return seen === 1 ? first.promise : second.promise;
    });

    fireEvent.click(
      within(screen.getByTestId('section-chips')).getByRole('button', {
        name: t('format.removeSection', { section: 'Subjective' }),
      }),
    );
    await waitFor(() => {
      expect(sent.length).toBe(1);
    });

    // A newer edit, inside its debounce, so the older save has not come back
    // for it yet.
    fireEvent.change(screen.getByLabelText(t('format.nameLabel')), { target: { value: 'Progress' } });

    await act(async () => {
      first.resolve(landed('Progress note', ['Plan']));
      await first.promise;
    });
    // The second request is the newer save asking to go, which is proof the
    // older ack was processed and did not pass for the whole screen.
    await waitFor(() => {
      expect(sent.length).toBe(2);
    });
    expect(saved.filter((value) => value)).toHaveLength(0);

    await act(async () => {
      second.resolve(landed('Progress', ['Plan']));
      await second.promise;
    });
    await waitFor(() => {
      expect(saved.at(-1)).toBe(true);
    });
    expect(sent.at(-1)).toEqual({ name: 'Progress', sections: ['Plan'] });
  });

  it('writes an added section without waiting to be asked', async () => {
    renderEditor();

    fireEvent.click(screen.getByTestId('add-section'));
    fireEvent.change(screen.getByLabelText(t('format.sectionNamePlaceholder')), {
      target: { value: 'Assessment' },
    });
    fireEvent.click(screen.getByRole('button', { name: t('common.add') }));

    await waitFor(() => {
      expect(sent.at(-1)).toEqual({
        name: 'Progress note',
        sections: ['Subjective', 'Plan', 'Assessment'],
      });
    });
  });

  it('does not claim a save the server refused', async () => {
    const saved: boolean[] = [];
    renderEditor({ onSavedStateChange: (value) => saved.push(value) }, () =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'conflict', message: 'Not today.' }), {
          status: 409,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    fireEvent.click(
      within(screen.getByTestId('section-chips')).getByRole('button', {
        name: t('format.removeSection', { section: 'Subjective' }),
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('format-error').textContent).toBe('Not today.');
    });
    expect(saved).not.toContain(true);
  });

  /**
   * `main.tsx` mounts the app inside `<StrictMode>`, which runs mount → cleanup →
   * mount on one fiber with its refs intact. A flag the effect only ever clears
   * is then false for the rest of the session, and every `Saved`, every error and
   * every indicator in this file is behind it — with no failing test otherwise
   * to notice, because none of them render once the flag is down.
   */
  it('still reports a save and its errors under the StrictMode double mount', async () => {
    const saved: boolean[] = [];
    renderEditor({ onSavedStateChange: (value) => saved.push(value) }, undefined, true);

    fireEvent.click(
      within(screen.getByTestId('section-chips')).getByRole('button', {
        name: t('format.removeSection', { section: 'Subjective' }),
      }),
    );

    await waitFor(() => {
      expect(saved.at(-1)).toBe(true);
    });

    fireEvent.change(screen.getByLabelText(t('format.nameLabel')), { target: { value: '' } });
    await waitFor(() => {
      expect(screen.getByTestId('format-error').textContent).toBe(t('format.errorName'));
    });
  });

  it('holds a refused write open for the host, and says why', async () => {
    const handle = renderEditor({}, () =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'conflict', message: 'Not today.' }), {
          status: 409,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    fireEvent.change(screen.getByLabelText(t('format.nameLabel')), {
      target: { value: 'Progress note v2' },
    });

    // `flush` reports the outcome by setting state, so its promise resolving is
    // not by itself the render that shows it. Awaiting it inside `act` is what
    // makes the assertions below read a settled screen rather than one render
    // behind the answer.
    let went = true;
    await act(async () => {
      went = await (handle?.flush() ?? Promise.resolve(true));
    });
    expect(went).toBe(false);
    // The host is still looking at an editor, and the editor says what happened,
    // so a write that did not happen cannot pass as one that did.
    expect(screen.getByLabelText(t('format.nameLabel'))).not.toBeNull();
    await waitFor(() => {
      expect(screen.getByTestId('format-error').textContent).toBe('Not today.');
    });
    // One attempt, not a retry: the host decides whether to ask again.
    expect(sent).toHaveLength(1);
  });

  it('refuses to write an invalid name at all, and tells the host it may not go', async () => {
    const handle = renderEditor();

    fireEvent.change(screen.getByLabelText(t('format.nameLabel')), { target: { value: '  ' } });

    let went = true;
    await act(async () => {
      went = await (handle?.flush() ?? Promise.resolve(true));
    });
    expect(went).toBe(false);
    expect(sent).toHaveLength(0);
    expect(screen.getByTestId('format-error').textContent).toBe(t('format.errorName'));
  });

  /**
   * The whole point of awaiting: she typed again while the first write was out,
   * and the host must not go on the first write's word alone. Both writes settle
   * by hand, so `true` cannot arrive before the second one has been answered.
   */
  it('waits out a write in flight and the edit made while it was out', async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    let seen = 0;
    const handle = renderEditor({}, () => {
      seen += 1;
      return seen === 1 ? first.promise : second.promise;
    });

    fireEvent.change(screen.getByLabelText(t('format.nameLabel')), {
      target: { value: 'Progress note v2' },
    });
    const settled = handle?.flush() ?? Promise.resolve(false);
    fireEvent.change(screen.getByLabelText(t('format.nameLabel')), {
      target: { value: 'Progress note v3' },
    });

    await act(async () => {
      first.resolve(landed('Progress note v2', EDITING.sections));
      await first.promise;
    });
    await waitFor(() => {
      expect(sent.length).toBe(2);
    });
    expect(sent.at(-1)).toEqual({ name: 'Progress note v3', sections: EDITING.sections });

    let left = false;
    void settled.then((value) => {
      left = value;
    });
    await Promise.resolve();
    expect(left).toBe(false);

    await act(async () => {
      second.resolve(landed('Progress note v3', EDITING.sections));
      await settled;
    });
    expect(await settled).toBe(true);
  });

  it('resolves true without a request when the server already holds the screen', async () => {
    const handle = renderEditor();

    expect(await (handle?.flush() ?? Promise.resolve(false))).toBe(true);
    expect(sent).toHaveLength(0);
  });
});

describe('creating a format that does not exist yet', () => {
  it('offers one save, and one press makes one format', async () => {
    const api = installFakeApi({ formats: [] });
    const onSaved = vi.fn();
    render(
      <FormatDraftEditor
        draft={{ name: 'Detected note', sections: ['Subjective', 'Plan'] }}
        onSaved={onSaved}
        onCancel={vi.fn()}
      />,
    );

    // A name that does not exist yet is not written anywhere: editing it would
    // otherwise leave half a format in her list with nothing to confirm.
    fireEvent.change(screen.getByLabelText(t('format.nameLabel')), {
      target: { value: 'Detected note, renamed' },
    });
    const { promise, resolve } = deferred<void>();
    setTimeout(resolve, 700);
    await promise;
    expect(api.state.formats).toHaveLength(0);

    const button = screen.getByTestId('save-format');
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledTimes(1);
    });
    expect(api.state.formats).toHaveLength(1);
    expect(api.state.formats[0]?.name).toBe('Detected note, renamed');
  });
});
