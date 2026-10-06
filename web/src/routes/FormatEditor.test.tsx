import { STANDARD_PROGRESS_FORMAT, t } from '@apunta/shared';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';

import { installFakeApi } from '../test/fakeApi.js';
import { FormatEditor, type FormatEditorProps } from './FormatEditor.js';

/**
 * What the format chooser promises a host (owner, 2026-10-05): the standard
 * format is created by the click and reported as saved only once the server has
 * said so. The other three choices hand a draft on and create nothing here.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * A promise the test settles by hand, so a create can be held open while the
 * screen is inspected. Written out rather than `Promise.withResolvers`, which
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

interface Chooser {
  readonly onPreview: Mock;
  readonly onSaved: Mock;
}

function renderChooser(overrides: Partial<FormatEditorProps> = {}): Chooser {
  installFakeApi({ formats: [] });
  const onPreview = vi.fn();
  const onSaved = vi.fn();
  render(<FormatEditor initialChoice={null} onPreview={onPreview} onSaved={onSaved} {...overrides} />);
  return { onPreview, onSaved };
}

describe('choosing how to define a format', () => {
  it('creates the standard format and says saved only once it landed', async () => {
    const saved: boolean[] = [];
    const api = installFakeApi({ formats: [] });
    const real = globalThis.fetch;
    const gate = deferred<void>();
    const posts: number[] = [];
    vi.stubGlobal('fetch', async (path: string, init: RequestInit = {}): Promise<Response> => {
      if (String(path).endsWith('/api/formats/standard') && (init.method ?? 'GET') === 'POST') {
        posts.push(posts.length);
        // Hold the create open, then let the fake API answer it for real, so
        // what lands on the screen is the format the server actually stored.
        await gate.promise;
      }
      return real(path, init);
    });
    const onSaved = vi.fn();
    render(
      <FormatEditor
        onPreview={vi.fn()}
        onSaved={onSaved}
        onSavedStateChange={(value) => saved.push(value)}
      />,
    );

    // Both clicks land in the same tick, before React has re-rendered the
    // button as busy: the guard has to hold on its own, not on the disabled
    // attribute.
    act(() => {
      fireEvent.click(screen.getByTestId('option-standard'));
      fireEvent.click(screen.getByTestId('format-continue'));
      fireEvent.click(screen.getByTestId('format-continue'));
    });
    await waitFor(() => {
      expect(posts).toHaveLength(1);
    });
    // Still in flight: nothing stored, and the indicator not yet true.
    expect(api.state.formats).toHaveLength(0);
    expect(saved).not.toContain(true);

    gate.resolve();
    await waitFor(() => {
      expect(saved.at(-1)).toBe(true);
    });
    expect(api.state.formats).toHaveLength(1);
    expect(api.state.formats[0]?.sections).toEqual(STANDARD_PROGRESS_FORMAT.sections);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(posts).toHaveLength(1);
  });

  it('hands a typed format on as a draft rather than creating it here', () => {
    const { onPreview, onSaved } = renderChooser();

    fireEvent.click(screen.getByText(t('format.manualTitle')));
    fireEvent.change(screen.getByLabelText(t('format.nameLabel')), { target: { value: 'Intake note' } });
    fireEvent.change(screen.getByLabelText(t('format.sectionsLabel')), {
      target: { value: 'Reason for visit, History, Plan' },
    });
    fireEvent.click(screen.getByTestId('format-continue'));

    expect(onPreview).toHaveBeenCalledWith({
      name: 'Intake note',
      sections: ['Reason for visit', 'History', 'Plan'],
    });
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('will not continue on a repeated section name, and says which one', () => {
    const { onPreview } = renderChooser();

    fireEvent.click(screen.getByText(t('format.manualTitle')));
    fireEvent.change(screen.getByLabelText(t('format.nameLabel')), { target: { value: 'Intake note' } });
    fireEvent.change(screen.getByLabelText(t('format.sectionsLabel')), {
      target: { value: 'History, History' },
    });
    fireEvent.click(screen.getByTestId('format-continue'));

    expect(onPreview).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('History');
  });
});
