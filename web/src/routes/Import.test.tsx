import { t, type ClaudeImportReport } from '@apunta/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HalaxyImport } from './HalaxyImport.js';
import { Import } from './Import.js';
import { installFakeApi } from '../test/fakeApi.js';

/**
 * The automatic import screen: settings, a glance at who would be imported,
 * one button, a report with an undo. Names come from the prototype's sample
 * practice.
 */
const REPORT: ClaudeImportReport = {
  batch_id: null,
  source: 'assistant',
  cutoff: '2026-07-01',
  patients: [
    {
      key: 'list:john smith',
      name: 'John Smith',
      source: 'list',
      patient_id: null,
      name_guessed: false,
      conversations: 1,
      notes: 3,
    },
    {
      key: 'title:conv-maria-a',
      name: 'Maria',
      source: 'title',
      patient_id: null,
      name_guessed: true,
      conversations: 1,
      notes: 2,
    },
  ],
  patients_to_create: 2,
  notes: 5,
  unmatched_names: ['Ana Torres'],
  already_imported: 0,
  sessions_without_body: 0,
  skipped: [
    { reason: 'ambiguous', recorded_at: '2026-07-02T10:00:00.000Z', last_at: null, messages: 4, sessions: 2 },
    {
      reason: 'not_clinical',
      recorded_at: '2026-07-05T09:00:00.000Z',
      last_at: null,
      messages: 6,
      sessions: 3,
    },
  ],
  totals: { conversations: 7, messages: 30, unreadable: 0, abandoned: 1, attachments: 1 },
  date_range: { from: '2026-03-11T09:40:00.000Z', to: '2026-08-01T09:01:00.000Z' },
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

async function chooseAndCheck(names = ''): Promise<void> {
  fireEvent.change(await screen.findByTestId('import-file'), {
    target: { files: [new File(['zip bytes'], 'data.zip', { type: 'application/zip' })] },
  });
  if (names !== '') fireEvent.change(screen.getByTestId('import-names'), { target: { value: names } });
  fireEvent.click(screen.getByTestId('import-check'));
  await screen.findByTestId('import-summary');
}

describe('the import screen', () => {
  it("starts from July 2026 and Claude's reply, with the list optional", async () => {
    installFakeApi();
    renderImport();

    expect((await screen.findByTestId<HTMLInputElement>('import-cutoff')).value).toBe('2026-07-01');
    expect(screen.getByLabelText(/Claude’s last reply/)).toHaveProperty('checked', true);
    // She can check without a list; only the file is required.
    expect(screen.getByTestId('import-check')).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByTestId('import-file'), {
      target: { files: [new File(['x'], 'data.zip')] },
    });
    expect(screen.getByTestId('import-check')).toHaveProperty('disabled', false);
  });

  it('summarises before the one button: who, how many notes, how many skipped — no note text', async () => {
    installFakeApi({}, { importReport: REPORT });
    renderImport();
    await chooseAndCheck();

    const summary = screen.getByTestId('import-summary').textContent;
    expect(summary).toContain('2 patients to create, 5 notes across 2 patients');
    expect(summary).toContain('2 conversations skipped, 1 of them as ambiguous');
    const rows = screen.getAllByTestId('import-patient').map((row) => row.textContent);
    expect(rows[0]).toContain('John Smith');
    expect(rows[0]).toContain('from your list');
    expect(rows[1]).toContain('name guessed from the chat title — check');
    expect(screen.getByTestId('import-unmatched').textContent).toContain('Ana Torres');
    expect(screen.getByTestId('import-run').textContent).toBe('Import 5 notes');
  });

  /**
   * S2.4: the summary is one key with three already-rendered count phrases and
   * the conditional ambiguity clause, so this pins the whole line to the
   * catalogue's English rather than to fragments of it. The counts are
   * `count.*` keys in their own right, so the singular/plural form is `Intl`'s
   * to pick in each locale.
   */
  it('builds the summary from the catalogue, counts and all', async () => {
    installFakeApi({}, { importReport: REPORT });
    renderImport();
    await chooseAndCheck();

    expect(screen.getByTestId('import-summary').textContent).toBe(
      t('import.summaryLine', {
        toCreate: t('count.patient', { count: 2 }),
        notes: t('count.note', { count: 5 }),
        patients: t('count.patient', { count: 2 }),
        skipped: t('count.conversation', { count: 2 }),
        ambiguous: t('import.summaryAmbiguous', { count: 1 }),
      }),
    );
    expect(t('count.patient', { count: 1 }, 'en')).toBe('1 patient');
    expect(t('count.patient', { count: 1 }, 'es-MX')).toBe('1 paciente');
    expect(screen.getByTestId('import-run').textContent).toBe(
      t('import.runLabel', { notes: t('count.note', { count: 5 }) }),
    );
  });

  /**
   * S2.4: the muted fallback for a name that is not in the practice reads
   * "Create new patient" and nothing else, so it is its own key rather than
   * `patients.new` ("New patient") or `import.createNew` ("Create new"). Fixed
   * decision 7 pins the English to the base commit, and both rows of `REPORT`
   * have no `patient_id`, so both render the span.
   */
  it('keeps "Create new patient" whole on the row, and translates it', async () => {
    installFakeApi({}, { importReport: REPORT });
    renderImport();
    await chooseAndCheck();

    const rows = screen.getAllByTestId('import-patient');
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.textContent).toContain('Create new patient');
    expect(t('import.createNewPatient', {}, 'en')).toBe('Create new patient');
    expect(t('import.createNewPatient', {}, 'es-MX')).toBe('Crear un paciente nuevo');
    expect(t('import.createNewPatient', {}, 'es-MX')).not.toBe(t('import.createNewPatient', {}, 'en'));
  });

  /**
   * `Mac` is a keep-as-is token inside a translatable sentence, so it appears
   * verbatim in both catalogue values and never in the allowlist.
   */
  it('keeps Mac verbatim in the export help, and the file name with it', () => {
    const english = t('import.exportHelp', {}, 'en');
    expect(english).toContain('conversations.json');
    expect(english).toContain('read on this Mac and kept nowhere');
    const spanish = t('import.exportHelp', {}, 'es-MX');
    expect(spanish).toContain('conversations.json');
    expect(spanish).toContain('esta Mac');
    expect(spanish).not.toBe(english);
  });

  it('leaves out a patient she unticks, and sends the settings she chose', async () => {
    const api = installFakeApi({}, { importReport: REPORT });
    renderImport();
    fireEvent.change(await screen.findByTestId('import-cutoff'), { target: { value: '2026-06-01' } });
    fireEvent.click(screen.getByLabelText(/Your own messages/));
    await chooseAndCheck('John Smith');

    fireEvent.click(screen.getByLabelText('Import Maria'));
    expect(screen.getByTestId('import-run').textContent).toBe('Import 3 notes');
    fireEvent.click(screen.getByTestId('import-run'));

    await waitFor(() => {
      expect(screen.getByTestId('import-done').textContent).toContain('3 notes for 1 patient (1 new)');
    });
    expect(api.state.imports).toEqual([
      { names: 'John Smith', cutoff: '2026-06-01', source: 'human', exclude: '["title:conv-maria-a"]' },
    ]);
  });

  it('reports skipped conversations by reason, date and count, and undoes the run in one click', async () => {
    const api = installFakeApi({}, { importReport: REPORT });
    renderImport();
    await chooseAndCheck();
    fireEvent.click(screen.getByTestId('import-run'));
    await screen.findByTestId('import-done');

    const skipped = screen.getByTestId('import-skipped').textContent;
    expect(skipped).toContain('1 more than one name from your list');
    expect(skipped).toContain('2026-07-05');
    expect(api.state.batches).toHaveLength(1);

    fireEvent.click(screen.getByTestId('import-undo'));
    await waitFor(() => {
      expect(screen.getByTestId('import-undone').textContent).toContain('5 notes and 2 patients removed');
    });
    expect(api.state.batches).toHaveLength(0);
  });

  it('says what went wrong with a file that is not an export', async () => {
    installFakeApi();
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', (path: string, init?: RequestInit) =>
      path === '/api/import/claude/preview'
        ? Promise.resolve(
            new Response(
              JSON.stringify({ error: 'bad_request', message: 'That file is not a Claude export.' }),
              { status: 400, headers: { 'content-type': 'application/json' } },
            ),
          )
        : realFetch(path, init),
    );
    renderImport();

    fireEvent.change(await screen.findByTestId('import-file'), {
      target: { files: [new File(['nope'], 'notes.txt', { type: 'text/plain' })] },
    });
    fireEvent.click(screen.getByTestId('import-check'));

    expect((await screen.findByTestId('import-error')).textContent).toContain('not a Claude export');
  });
});

/**
 * Import is a first-level row in the workspace's "More" menu now (owner,
 * 2026-09-27) rather than a section of Settings, and that move left Halaxy with
 * no link to it anywhere: a route with no way in, reached by nothing. This is
 * the regression that cost the e2e suite a green run, and it is invisible in a
 * unit test of either screen alone — each renders fine, and the gap is between
 * them.
 */
describe('the other importer is still reachable', () => {
  it('offers Halaxy from the Claude import screen, and back again', async () => {
    installFakeApi();
    render(
      <MemoryRouter>
        <Import />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('import-switch-halaxy')).toBeDefined();
    });
    const link = screen.getByTestId('import-switch-halaxy');
    expect(link.getAttribute('href')).toBe('/import/halaxy');
    expect(link.textContent).toBe(t('import.switchToHalaxy'));
  });

  it('offers Claude from the Halaxy screen, so neither is a dead end', async () => {
    installFakeApi();
    render(
      <MemoryRouter>
        <HalaxyImport />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('import-switch-claude')).toBeDefined();
    });
    const link = screen.getByTestId('import-switch-claude');
    expect(link.getAttribute('href')).toBe('/import');
    expect(link.textContent).toBe(t('import.switchToClaude'));
  });
});
