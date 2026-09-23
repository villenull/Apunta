import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Setup } from './Setup.js';
import { installFakeApi } from '../test/fakeApi.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderSetup(): void {
  render(
    <MemoryRouter>
      <Setup />
    </MemoryRouter>,
  );
}

describe('the setup screen', () => {
  it('lists every local dependency and no ffmpeg row', async () => {
    installFakeApi();
    renderSetup();

    const list = await screen.findByTestId('setup-checklist');
    expect(list.textContent).toContain('Ollama');
    expect(list.textContent).toContain('Writing model');
    expect(list.textContent).toContain('whisper.cpp');
    expect(list.textContent).toContain('Disk encryption');
    expect(list.textContent?.toLowerCase()).not.toContain('ffmpeg');
    expect(list.textContent).toContain('Not checked');
  });
  it('names an OS-neutral action for missing local pieces', async () => {
    installFakeApi(
      {},
      {
        health: {
          ollama: { reachable: false, model: null, modelPresent: false },
          whisper: {
            binaryPresent: false,
            modelPresent: false,
            binary: '/usr/local/bin/whisper-cli',
            model: '/data/models/ggml-tiny.en.bin',
          },
        },
      },
    );
    renderSetup();

    expect((await screen.findByTestId('setup-fix-ollama')).textContent).toContain('operating system');
    expect(screen.getByTestId('setup-fix-whisper').textContent).toContain('operating system');
    expect(screen.queryByTestId('setup-script-command')).toBeNull();
  });

  it('offers no Terminal command inside the packaged app, where there is none to run', async () => {
    installFakeApi(
      {},
      {
        health: {
          bundled: true,
          ollama: { reachable: true, model: 'qwen3.5:4b-q4_K_M', modelPresent: false },
        },
      },
    );
    renderSetup();

    // The fix is a sentence she can act on from the Dock, not a command.
    expect((await screen.findByTestId('setup-fix-model')).textContent).toContain(
      'Quit Apunta and open it again',
    );
    expect(screen.queryByTestId('setup-script-command')).toBeNull();
  });

  it('recovers on re-check when the machine is fixed underneath it', async () => {
    // The wizard's whole job: she starts Ollama in another window and presses
    // the button, and the screen has to notice.
    let reachable = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) => {
        if (path === '/api/health') {
          const payload = {
            ok: true,
            version: '0.0.0',
            fakeAi: false,
            bundled: false,
            db: { path: '/data/apunta.db', migrationLevel: 2 },
            ollama: { reachable, model: 'gemma4:12b-it-qat', modelPresent: reachable },
            whisper: {
              binaryPresent: true,
              modelPresent: true,
              binary: '/opt/homebrew/bin/whisper-cli',
              model: '/data/models/ggml-tiny.en.bin',
            },
            fileVault: { state: 'on', detail: 'FileVault is On.' },
          };
          reachable = true;
          return new Response(JSON.stringify(payload), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
      }),
    );

    renderSetup();
    expect((await screen.findByTestId('setup-detail-ollama')).textContent).toContain('nothing is answering');
    expect(screen.getByTestId('setup-local')).toBeDefined();

    fireEvent.click(screen.getByTestId('setup-recheck'));

    await waitFor(() => {
      expect(screen.getByTestId('setup-detail-ollama').textContent).toContain('answering on');
    });
    expect(screen.getByTestId('setup-local')).toBeDefined();
  });

  /**
   * Network locality is not a claim about disk encryption. The checklist
   * reports the disk state separately and does not hide the local-runtime copy.
   */
  it('reports disk encryption separately from network locality', async () => {
    installFakeApi({}, { health: { fileVault: { state: 'off', detail: 'FileVault is Off.' } } });
    renderSetup();

    await screen.findByTestId('setup-checklist');
    expect(screen.getByTestId('setup-local').textContent).toContain('not sent over the network');
    expect(screen.getByTestId('setup-detail-filevault').textContent).toContain('FileVault is OFF');
    expect(screen.getByTestId('setup-fix-filevault').textContent).toContain('System Settings');
  });

  it('states network locality when every check is ready', async () => {
    installFakeApi();
    renderSetup();

    expect((await screen.findByTestId('setup-local')).textContent).toBe(
      'Apunta runs on this computer — notes are not sent over the network.',
    );
  });

  it('withdraws the claim when backups are going into a synced folder', async () => {
    installFakeApi(
      {},
      {
        backup: {
          destination: {
            risk: 'sync',
            path: '/Users/her/Documents',
            warning: 'Documents is synced to the cloud on a typical Mac',
          },
        },
      },
    );
    renderSetup();

    await screen.findByTestId('setup-checklist');
    await waitFor(() => {
      expect(screen.getByTestId('setup-row-backup-destination')).toBeDefined();
    });
    expect(screen.getByTestId('setup-local')).toBeDefined();
  });

  it('names the screen in the browser tab', async () => {
    installFakeApi();
    renderSetup();
    await screen.findByTestId('setup-checklist');
    expect(document.title).toBe('Setup · Apunta');
  });
});
