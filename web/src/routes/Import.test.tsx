import type { ClaudeImportPreview } from '@apunta/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Import } from './Import.js';
import { installFakeApi } from '../test/fakeApi.js';

/**
 * The review is the product: what the screen writes is exactly what she
 * assigned to a person, in her own words, and nothing for a conversation she
 * skipped. The fixture is fabricated with the prototype's names.
 */
const PREVIEW: ClaudeImportPreview = {
  conversations: [
    {
      id: 'c-0001',
      title: 'John session notes',
      recorded_at: '2026-03-04T18:12:00.000Z',
      human_text: 'Session with John Smith today. He reports sleeping about six hours most nights.',
      assistant_text: 'Subjective: John reports improved sleep.',
      people: ['John Smith'],
      turns: 2,
    },
    {
      id: 'c-0004',
      title: 'Recipe ideas',
      recorded_at: '2026-03-20T20:00:00.000Z',
      human_text: 'What can I cook with chickpeas and spinach?',
      assistant_text: 'A quick curry works well.',
      people: [],
      turns: 2,
    },
  ],
  candidates: [{ name: 'John Smith', conversations: 1, patient_id: null }],
  totals: { conversations: 3, messages: 5, skipped: 1 },
  date_range: { from: '2026-03-04T18:12:00.000Z', to: '2026-03-20T20:00:00.000Z' },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderImport(): void {
  render(
    <MemoryRouter initialEntries={['/import']}>
      <Import />
    </MemoryRouter>,
  );
}

async function chooseExport(): Promise<void> {
  const input = await screen.findByTestId('import-file');
  fireEvent.change(input, {
    target: { files: [new File(['zip bytes'], 'data.zip', { type: 'application/zip' })] },
  });
  await screen.findByTestId('import-summary');
}

describe('the import screen', () => {
  it('shows the proposals with her words, and what Claude said only on request', async () => {
    installFakeApi({}, { importPreview: PREVIEW });
    renderImport();
    await chooseExport();

    expect(screen.getByTestId('import-summary').textContent).toContain('3 conversations');
    expect(screen.getByTestId('import-summary').textContent).toContain('1 with nothing to read');
    const proposals = screen.getAllByTestId('import-proposal');
    expect(proposals).toHaveLength(2);
    expect(proposals[0]?.textContent).toContain('Session with John Smith today');
    // The assistant's words are behind a fold, marked as not imported.
    expect(proposals[0]?.textContent).toContain('never imported');
  });

  it('imports only what she assigned to a person, in the words she left', async () => {
    const api = installFakeApi({}, { importPreview: PREVIEW });
    renderImport();
    await chooseExport();

    // The recipe defaults to nobody, so only one note is offered.
    const button = screen.getByTestId('import-accept');
    expect(button.textContent).toBe('Import 1 note');

    // She trims the John note before accepting it.
    const textareas = screen.getAllByLabelText('Your words, as the note will read');
    fireEvent.change(textareas[0] as HTMLTextAreaElement, {
      target: { value: 'Session with John Smith today.' },
    });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByTestId('import-done').textContent).toContain('1 note for 1 patient');
    });
    expect(api.state.imports).toHaveLength(1);
    expect(api.state.imports[0]?.items).toEqual([
      {
        conversation_id: 'c-0001',
        patient_id: null,
        patient_name: 'John Smith',
        title: 'John session notes',
        recorded_at: '2026-03-04T18:12:00.000Z',
        text: 'Session with John Smith today.',
      },
    ]);
  });

  it('writes nothing for a person she unticks', async () => {
    const api = installFakeApi({}, { importPreview: PREVIEW });
    renderImport();
    await chooseExport();

    fireEvent.click(screen.getByLabelText('Import John Smith as a patient'));

    expect(screen.getByTestId('import-accept')).toHaveProperty('disabled', true);
    expect(api.state.imports).toHaveLength(0);
  });

  it('says what went wrong with a file that is not an export', async () => {
    installFakeApi();
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', (path: string, init?: RequestInit) =>
      path === '/api/import/claude'
        ? Promise.resolve(
            new Response(
              JSON.stringify({ error: 'bad_request', message: 'That file is not a Claude export.' }),
              {
                status: 400,
                headers: { 'content-type': 'application/json' },
              },
            ),
          )
        : realFetch(path, init),
    );
    renderImport();

    fireEvent.change(await screen.findByTestId('import-file'), {
      target: { files: [new File(['nope'], 'notes.txt', { type: 'text/plain' })] },
    });

    expect((await screen.findByTestId('import-error')).textContent).toContain('not a Claude export');
  });
});
