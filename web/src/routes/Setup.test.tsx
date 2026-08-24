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
    expect(list.textContent).toContain('Ollama is running');
    expect(list.textContent).toContain('The writing model is downloaded');
    expect(list.textContent).toContain('whisper.cpp is installed');
    expect(list.textContent).toContain('The disk is encrypted');
    expect(list.textContent?.toLowerCase()).not.toContain('ffmpeg');
  });

  it('names the exact command for each missing piece', async () => {
    installFakeApi(
      {},
      {
        health: {
          ollama: { reachable: false, model: null, modelPresent: false },
          whisper: {
            binaryPresent: false,
            modelPresent: false,
            binary: '/opt/homebrew/bin/whisper-cli',
            model: '/data/models/ggml-large-v3-turbo-q5_0.bin',
          },
        },
      },
    );
    renderSetup();

    expect((await screen.findByTestId('setup-fix-ollama')).textContent).toBe('brew services start ollama');
    expect(screen.getByTestId('setup-fix-whisper').textContent).toBe('brew install whisper-cpp');
    // And the one-liner that does all of it, since something is actually broken.
    expect(screen.getByTestId('setup-script-command').textContent).toBe('bash scripts/setup-macos.sh');
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
            db: { path: '/data/apunta.db', migrationLevel: 2 },
            ollama: { reachable, model: 'gemma4:12b-it-qat', modelPresent: reachable },
            whisper: {
              binaryPresent: true,
              modelPresent: true,
              binary: '/opt/homebrew/bin/whisper-cli',
              model: '/data/models/ggml-large-v3-turbo-q5_0.bin',
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
    expect(screen.queryByTestId('setup-ready')).toBeNull();

    fireEvent.click(screen.getByTestId('setup-recheck'));

    await waitFor(() => {
      expect(screen.getByTestId('setup-detail-ollama').textContent).toContain('answering on');
    });
    expect(await screen.findByTestId('setup-ready')).toBeDefined();
  });

  /**
   * The sentence is a promise about the disk as much as the network, and it is
   * false while FileVault is off. Printing it anyway is the one failure this
   * screen must not have (`docs/research/data-at-rest-2026-08.md` §9).
   */
  it('will not say "nothing leaves this Mac" while the disk is unencrypted', async () => {
    installFakeApi({}, { health: { fileVault: { state: 'off', detail: 'FileVault is Off.' } } });
    renderSetup();

    await screen.findByTestId('setup-checklist');
    expect(screen.queryByTestId('setup-ready')).toBeNull();
    expect(screen.getByTestId('setup-detail-filevault').textContent).toContain('FileVault is OFF');
    expect(screen.getByTestId('setup-fix-filevault').textContent).toContain('System Settings');
  });

  it('says it plainly when every check passes', async () => {
    installFakeApi();
    renderSetup();

    expect((await screen.findByTestId('setup-ready')).textContent).toBe(
      "You're fully local — nothing leaves this Mac.",
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
    expect(screen.queryByTestId('setup-ready')).toBeNull();
  });

  it('names the screen in the browser tab', async () => {
    installFakeApi();
    renderSetup();
    await screen.findByTestId('setup-checklist');
    expect(document.title).toBe('Setup · Apunta');
  });
});
